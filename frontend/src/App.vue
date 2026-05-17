<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { systemApi, settingsApi, chatApi, deepSeekApi, imageApi, ttsApi, type LogEntry, type ProviderMessage } from "./utils/api";
import { resolveApiUrl } from "./utils/urlUtils";
import { Terminal, Send, Trash2, Cpu, Settings, Image as ImageIcon, Volume2, FileText, RefreshCw, History, BookOpen, Activity, FolderOpen, Star, Wrench, Download, Home, Bell, X } from "lucide-vue-next";

type MediaItem = { type: "image" | "audio"; url: string };
type ChatMessage = { role: "user" | "assistant"; content: string; media?: MediaItem[] };
type ChatProvider = "minimax" | "deepseek";
type MainView = "home" | "chat" | "speech" | "imageHistory" | "ttsHistory" | "sessions" | "tasks" | "notifications" | "prompts" | "assets" | "favorites" | "diagnostics" | "exports" | "apiStatus" | "logs" | "settings";
type PromptTemplate = { id: string; title: string; content: string; provider: "通用" | "MiniMax" | "DeepSeek" };
type FavoriteItem = { id: string; type: "text" | "image" | "audio"; title: string; subtitle: string; content?: string; url?: string };
type SessionRecord = { id: string; provider: ChatProvider; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[] };
type TaskRecord = { id: string; title: string; provider: ChatProvider | "system"; status: "pending" | "running" | "success" | "failed"; createdAt: string; detail: string };
type NotificationItem = { id: string; level: "success" | "warning" | "error" | "info"; title: string; message: string; createdAt: string; read: boolean };
type AssetItem = { id: string; type: "image" | "audio"; title: string; subtitle: string; url: string };

const logs = ref<string[]>([]);
const logEntries = ref<LogEntry[]>([]);
const logLevel = ref("");
const logQuery = ref("");
const logLoading = ref(false);
const logContainer = ref<HTMLElement | null>(null);
const activeProvider = ref<ChatProvider>("minimax");
const activeView = ref<MainView>("home");
const minimaxMessages = ref<ChatMessage[]>([]);
const deepSeekMessages = ref<ChatMessage[]>([]);
const chatSessions = ref<SessionRecord[]>([]);
const activeSessionIds = ref<Record<ChatProvider, string>>({ minimax: "", deepseek: "" });
const taskQueue = ref<TaskRecord[]>([]);
const notifications = ref<NotificationItem[]>([]);
const inputText = ref("");
const isThinking = ref(false);
const chatContainer = ref<HTMLElement | null>(null);

const imageHistories = ref<Array<Record<string, any>>>([]);
const ttsHistories = ref<Array<Record<string, any>>>([]);
const voices = ref<Array<{ voiceId: string; name: string }>>([]);

const previewText = ref("你好，我是 Weizhi Agent。");
const previewVoiceId = ref("male-qn-qingse");
const previewFormat = ref("mp3");
const previewSpeed = ref(1);
const previewVol = ref(1);
const previewPitch = ref(0);
const previewSampleRate = ref(32000);
const previewBitrate = ref(128000);
const previewAudioUrl = ref("");
const generateAudioUrl = ref("");
const previewLoading = ref(false);
const generateLoading = ref(false);
const deepSeekBalance = ref<Record<string, any> | null>(null);
const deepSeekUsage = ref<Record<string, any> | null>(null);
const accountLoading = ref(false);
const settingsLoading = ref(false);
const settingsState = ref<Record<string, any>>({});
const settingsDraft = ref({
  minimax: { apiKey: "", model: "" },
  deepseek: { apiKey: "", model: "" }
});
const sidebarWidth = ref(248);
const systemHealth = ref("未知");
const promptTemplates = ref<PromptTemplate[]>([
  { id: "image-detail", title: "图片生成细化", provider: "MiniMax", content: "请帮我生成一张图片：主体是……，风格是……，画面比例是……，细节包括……" },
  { id: "tts-polish", title: "语音文案润色", provider: "MiniMax", content: "请把下面这段话改成适合语音播报的口吻，要求自然、清晰、有节奏：" },
  { id: "reasoning", title: "深度分析", provider: "DeepSeek", content: "请分步骤分析这个问题，先列出关键假设，再给出结论和风险：" }
]);
const promptDraft = ref({ title: "", content: "", provider: "通用" as PromptTemplate["provider"] });
const favorites = ref<FavoriteItem[]>([]);
const selectedAsset = ref<AssetItem | null>(null);

let logEventSource: EventSource | null = null;
let resizing: "sidebar" | null = null;

const providerMeta = {
  minimax: {
    label: "MiniMax",
    subtitle: "图像 / 语音 / 通用会话",
    accent: "red",
    emptyTitle: "MiniMax 创作会话",
    emptyDesc: "红色通道：适合图片、语音和多媒体工作流"
  },
  deepseek: {
    label: "DeepSeek",
    subtitle: "deepseek-v4-flash / API 计费",
    accent: "blue",
    emptyTitle: "DeepSeek 专属会话",
    emptyDesc: "蓝色通道：DeepSeek API 会话，按 token 计费"
  }
} as const;

const messages = computed(() => activeProvider.value === "minimax" ? minimaxMessages.value : deepSeekMessages.value);
const activeMeta = computed(() => providerMeta[activeProvider.value]);
const minimaxModels = computed(() => settingsState.value?.minimax?.models || []);
const deepSeekModels = computed(() => settingsState.value?.deepseek?.models || []);
const minimaxSubViews: MainView[] = ["speech", "imageHistory", "ttsHistory"];
const showMiniMaxSubnav = computed(() => activeProvider.value === "minimax" && (activeView.value === "chat" || minimaxSubViews.includes(activeView.value)));
const providerSessions = computed(() => chatSessions.value.filter(session => session.provider === activeProvider.value));
const sessionSummaries = computed(() => chatSessions.value
  .slice()
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  .map(session => ({
    ...session,
    subtitle: providerMeta[session.provider].subtitle,
    count: session.messages.length,
    last: session.messages.at(-1)?.content || "暂无对话"
  })));
const dashboardStats = computed(() => [
  { label: "会话", value: chatSessions.value.length, detail: "本地保存的对话" },
  { label: "任务", value: taskQueue.value.length, detail: `${taskQueue.value.filter(task => task.status === "running").length} 个运行中` },
  { label: "素材", value: assetItems.value.length, detail: "图片与语音" },
  { label: "收藏", value: favorites.value.length, detail: "精选内容" }
]);
const apiStatusCards = computed(() => [
  {
    name: "Backend",
    status: systemHealth.value === "ok" ? "正常" : "待确认",
    detail: `健康检查：${systemHealth.value}`
  },
  {
    name: "MiniMax",
    status: settingsState.value?.minimax?.apiKeyConfigured ? "已配置" : "未配置",
    detail: `${settingsState.value?.minimax?.model || "未选择模型"} · ${settingsState.value?.minimax?.apiKeyMasked || "无 Key"}`
  },
  {
    name: "DeepSeek",
    status: settingsState.value?.deepseek?.apiKeyConfigured ? "已配置" : "未配置",
    detail: `${settingsState.value?.deepseek?.model || "未选择模型"} · ${deepSeekBalance.value?.isAvailable ? "余额可用" : "余额待确认"}`
  }
]);
const assetItems = computed<AssetItem[]>(() => [
  ...imageHistories.value.map(item => ({
    id: String(item.id),
    type: "image" as const,
    title: item.prompt || "历史图片",
    subtitle: item.createdAt || "",
    url: String(item.url || "")
  })),
  ...ttsHistories.value.map(item => ({
    id: String(item.id),
    type: "audio" as const,
    title: item.text || "历史语音",
    subtitle: `${item.voiceId || "voice"} · ${item.format || "audio"} · ${item.preview ? "preview" : "tts"}`,
    url: String(item.audioUrl || "")
  }))
]);
const diagnosticCards = computed(() => [
  { name: "后端健康", value: systemHealth.value, detail: "来自 /api/system/health" },
  { name: "会话数量", value: `${chatSessions.value.length} 个`, detail: "本地持久化会话" },
  { name: "任务队列", value: `${taskQueue.value.length} 个`, detail: `${taskQueue.value.filter(task => task.status === "running").length} 个运行中` },
  { name: "日志缓存", value: `${logEntries.value.length} 条`, detail: "当前前端已加载的结构化日志" },
  { name: "图片素材", value: `${imageHistories.value.length} 个`, detail: "MiniMax 图片历史扫描结果" },
  { name: "语音素材", value: `${ttsHistories.value.length} 个`, detail: "MiniMax 语音历史扫描结果" },
  { name: "模板数量", value: `${promptTemplates.value.length} 个`, detail: "本地 Prompt 模板库" },
  { name: "收藏数量", value: `${favorites.value.length} 个`, detail: "本地收藏夹" }
]);
const unreadNotificationCount = computed(() => notifications.value.filter(item => !item.read).length);
const recentNotifications = computed(() => notifications.value.slice(0, 3));

const addLog = (msg: string) => {
  logs.value.push(msg);
  if (logs.value.length > 200) logs.value.shift();
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight;
  });
};

const saveNotifications = () => {
  localStorage.setItem("weizhi.notifications", JSON.stringify(notifications.value));
};

const addNotification = (level: NotificationItem["level"], title: string, message: string) => {
  notifications.value.unshift({
    id: `notice-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    title,
    message,
    createdAt: new Date().toISOString(),
    read: false
  });
  notifications.value = notifications.value.slice(0, 80);
  saveNotifications();
};

const markNotificationsRead = () => {
  notifications.value.forEach(item => item.read = true);
  saveNotifications();
};

const removeNotification = (id: string) => {
  notifications.value = notifications.value.filter(item => item.id !== id);
  saveNotifications();
};

const loadLogEntries = async () => {
  logLoading.value = true;
  try {
    const res = await systemApi.logs({
      level: logLevel.value || undefined,
      query: logQuery.value.trim() || undefined,
      limit: 300
    });
    logEntries.value = res.data?.logs || [];
  } catch (err: any) {
    addLog("Log history load failed: " + (err?.message || "unknown error"));
  } finally {
    logLoading.value = false;
  }
};

const clearLogEntries = async () => {
  try {
    await systemApi.clearLogs();
    logs.value = [];
    logEntries.value = [];
  } catch (err: any) {
    addLog("Log clear failed: " + (err?.message || "unknown error"));
  }
};

const formatLogTime = (value: string) => {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
};

const logLevelClass = (level: string) => `level-${String(level || "info").toLowerCase()}`;

const mediaUrl = (url: string) => resolveApiUrl(url);

const loadHistories = async () => {
  const [imageRes, ttsRes] = await Promise.all([imageApi.history(), ttsApi.history()]);
  imageHistories.value = imageRes.data?.histories || [];
  ttsHistories.value = ttsRes.data?.histories || [];
};

const scrollChatToBottom = () => {
  nextTick(() => {
    if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  });
};

const loadVoices = async () => {
  const res = await ttsApi.voices();
  voices.value = res.data?.voices || [];
  if (!voices.value.find(v => v.voiceId === previewVoiceId.value) && voices.value[0]) {
    previewVoiceId.value = voices.value[0].voiceId;
  }
};

const loadDeepSeekAccount = async () => {
  accountLoading.value = true;
  try {
    const [balanceRes, usageRes] = await Promise.all([deepSeekApi.balance(), deepSeekApi.usage()]);
    deepSeekBalance.value = balanceRes.data;
    deepSeekUsage.value = usageRes.data?.usage || null;
  } catch (err: any) {
    addLog("DeepSeek account load failed: " + (err?.message || "unknown error"));
  } finally {
    accountLoading.value = false;
  }
};

const defaultSession = (provider: ChatProvider): SessionRecord => {
  const now = new Date().toISOString();
  return {
    id: `${provider}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    provider,
    title: provider === "minimax" ? "MiniMax 默认会话" : "DeepSeek 默认会话",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
};

const saveSessions = () => {
  localStorage.setItem("weizhi.chatSessions", JSON.stringify(chatSessions.value));
  localStorage.setItem("weizhi.activeSessionIds", JSON.stringify(activeSessionIds.value));
};

const syncMessagesFromSession = (provider: ChatProvider) => {
  const session = chatSessions.value.find(item => item.id === activeSessionIds.value[provider]);
  if (provider === "minimax") minimaxMessages.value = session ? [...session.messages] : [];
  else deepSeekMessages.value = session ? [...session.messages] : [];
};

const saveActiveSession = (provider: ChatProvider) => {
  const session = chatSessions.value.find(item => item.id === activeSessionIds.value[provider]);
  if (!session) return;
  session.messages = provider === "minimax" ? [...minimaxMessages.value] : [...deepSeekMessages.value];
  session.updatedAt = new Date().toISOString();
  const firstUserMessage = session.messages.find(item => item.role === "user")?.content;
  if (firstUserMessage && session.title.endsWith("默认会话")) {
    session.title = firstUserMessage.slice(0, 18);
  }
  saveSessions();
};

const ensureSessions = () => {
  if (!chatSessions.value.some(session => session.provider === "minimax")) {
    const session = defaultSession("minimax");
    chatSessions.value.push(session);
    activeSessionIds.value.minimax = session.id;
  }
  if (!chatSessions.value.some(session => session.provider === "deepseek")) {
    const session = defaultSession("deepseek");
    chatSessions.value.push(session);
    activeSessionIds.value.deepseek = session.id;
  }
  (["minimax", "deepseek"] as ChatProvider[]).forEach(provider => {
    if (!chatSessions.value.find(session => session.id === activeSessionIds.value[provider])) {
      activeSessionIds.value[provider] = chatSessions.value.find(session => session.provider === provider)?.id || "";
    }
    syncMessagesFromSession(provider);
  });
  saveSessions();
};

const createSession = (provider: ChatProvider = activeProvider.value) => {
  const session = defaultSession(provider);
  session.title = provider === "minimax" ? "新的 MiniMax 会话" : "新的 DeepSeek 会话";
  chatSessions.value.unshift(session);
  activeSessionIds.value[provider] = session.id;
  activeProvider.value = provider;
  activeView.value = "chat";
  syncMessagesFromSession(provider);
  saveSessions();
};

const openSession = (session: SessionRecord) => {
  activeSessionIds.value[session.provider] = session.id;
  activeProvider.value = session.provider;
  activeView.value = "chat";
  syncMessagesFromSession(session.provider);
  saveSessions();
  scrollChatToBottom();
};

const renameSession = (session: SessionRecord) => {
  const title = window.prompt("会话名称", session.title);
  if (!title?.trim()) return;
  session.title = title.trim();
  session.updatedAt = new Date().toISOString();
  saveSessions();
};

const deleteSession = (session: SessionRecord) => {
  chatSessions.value = chatSessions.value.filter(item => item.id !== session.id);
  if (activeSessionIds.value[session.provider] === session.id) {
    const next = chatSessions.value.find(item => item.provider === session.provider) || defaultSession(session.provider);
    if (!chatSessions.value.find(item => item.id === next.id)) chatSessions.value.push(next);
    activeSessionIds.value[session.provider] = next.id;
    syncMessagesFromSession(session.provider);
  }
  saveSessions();
};

const saveTasks = () => {
  localStorage.setItem("weizhi.taskQueue", JSON.stringify(taskQueue.value));
};

const createTask = (title: string, provider: TaskRecord["provider"], detail: string): TaskRecord => {
  const task = {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    provider,
    status: "running" as const,
    createdAt: new Date().toISOString(),
    detail
  };
  taskQueue.value.unshift(task);
  saveTasks();
  return task;
};

const finishTask = (task: TaskRecord, status: TaskRecord["status"], detail?: string) => {
  task.status = status;
  if (detail) task.detail = detail;
  if (status === "success") addNotification("success", task.title, detail || "任务已完成");
  if (status === "failed") addNotification("error", task.title, detail || "任务失败");
  saveTasks();
};

const clearFinishedTasks = () => {
  taskQueue.value = taskQueue.value.filter(task => task.status === "running" || task.status === "pending");
  saveTasks();
};

const loadSettings = async () => {
  settingsLoading.value = true;
  try {
    const res = await settingsApi.get();
    settingsState.value = res.data || {};
    settingsDraft.value.minimax.model = settingsState.value?.minimax?.model || "";
    settingsDraft.value.deepseek.model = settingsState.value?.deepseek?.model || "";
    settingsDraft.value.minimax.apiKey = "";
    settingsDraft.value.deepseek.apiKey = "";
  } catch (err: any) {
    addLog("Settings load failed: " + (err?.message || "unknown error"));
  } finally {
    settingsLoading.value = false;
  }
};

const refreshProviderModels = async (provider: ChatProvider) => {
  const res = await settingsApi.models(provider);
  settingsState.value = {
    ...settingsState.value,
    [provider]: {
      ...(settingsState.value?.[provider] || {}),
      models: res.data || []
    }
  };
};

const saveProviderSettings = async (provider: ChatProvider) => {
  settingsLoading.value = true;
  try {
    const draft = settingsDraft.value[provider];
    const payload: { apiKey?: string; model?: string } = { model: draft.model };
    if (draft.apiKey.trim()) payload.apiKey = draft.apiKey.trim();
    const res = await settingsApi.update(provider, payload);
    settingsState.value = { ...settingsState.value, [provider]: res.data };
    draft.apiKey = "";
    addLog(`${provider} settings saved.`);
    addNotification("success", "模型设置已保存", `${providerMeta[provider].label} 设置已更新`);
    if (provider === "deepseek") await loadDeepSeekAccount();
  } catch (err: any) {
    addNotification("error", "设置保存失败", err?.message || "unknown error");
    addLog("Settings save failed: " + (err?.message || "unknown error"));
  } finally {
    settingsLoading.value = false;
  }
};

const openDeepSeekUsage = () => {
  window.open("https://platform.deepseek.com/usage", "_blank");
};

const loadApiStatus = async () => {
  try {
    const healthRes = await systemApi.getHealth();
    systemHealth.value = String(healthRes.data || "unknown");
  } catch {
    systemHealth.value = "异常";
  }
  await Promise.all([loadSettings(), loadDeepSeekAccount()]);
};

const handlePreview = async () => {
  if (!previewText.value.trim()) return;
  const task = createTask("语音 Preview", "minimax", previewText.value.trim().slice(0, 80));
  previewLoading.value = true;
  try {
    const res = await ttsApi.preview({
      text: previewText.value.trim(),
      voiceId: previewVoiceId.value,
      model: "speech-2.8-hd",
      format: previewFormat.value,
      speed: previewSpeed.value,
      vol: previewVol.value,
      pitch: previewPitch.value,
      sampleRate: previewSampleRate.value,
      bitrate: previewBitrate.value
    });
    if (res.data?.audioUrl) {
      const raw = mediaUrl(res.data.audioUrl);
      previewAudioUrl.value = `${raw}${raw.includes("?") ? "&" : "?"}t=${Date.now()}`;
    }
    await loadHistories();
    finishTask(task, "success", "Preview 音频生成完成");
  } catch (err: any) {
    finishTask(task, "failed", err?.message || "Preview 失败");
    addLog("TTS preview failed: " + (err?.message || "unknown error"));
  } finally {
    previewLoading.value = false;
  }
};

const handleGenerateTts = async () => {
  if (!previewText.value.trim()) return;
  const task = createTask("完整语音生成", "minimax", previewText.value.trim().slice(0, 80));
  generateLoading.value = true;
  try {
    const res = await ttsApi.generate({
      text: previewText.value.trim(),
      voiceId: previewVoiceId.value,
      model: "speech-2.8-hd",
      format: previewFormat.value,
      speed: previewSpeed.value,
      vol: previewVol.value,
      pitch: previewPitch.value,
      sampleRate: previewSampleRate.value,
      bitrate: previewBitrate.value
    });
    if (res.data?.audioUrl) {
      const raw = mediaUrl(res.data.audioUrl);
      generateAudioUrl.value = `${raw}${raw.includes("?") ? "&" : "?"}t=${Date.now()}`;
    }
    await loadHistories();
    finishTask(task, "success", "完整语音生成完成");
  } catch (err: any) {
    finishTask(task, "failed", err?.message || "语音生成失败");
    addLog("TTS generate failed: " + (err?.message || "unknown error"));
  } finally {
    generateLoading.value = false;
  }
};

const deleteImageHistory = async (id: string) => {
  await imageApi.deleteHistory(id);
  await loadHistories();
};

const clearImageHistory = async () => {
  await imageApi.clearHistory();
  await loadHistories();
};

const deleteTtsHistory = async (id: string) => {
  await ttsApi.deleteHistory(id);
  await loadHistories();
};

const clearTtsHistory = async () => {
  await ttsApi.clearHistory();
  await loadHistories();
};

const saveFavorites = () => {
  localStorage.setItem("weizhi.favorites", JSON.stringify(favorites.value));
};

const isFavorite = (id: string) => favorites.value.some(item => item.id === id);

const addFavorite = (item: FavoriteItem) => {
  if (isFavorite(item.id)) return;
  favorites.value.unshift(item);
  saveFavorites();
  addNotification("success", "已加入收藏", item.title);
};

const removeFavorite = (id: string) => {
  favorites.value = favorites.value.filter(item => item.id !== id);
  saveFavorites();
};

const favoriteMessage = (message: ChatMessage, index: number) => {
  addFavorite({
    id: `${activeProvider.value}-message-${index}`,
    type: "text",
    title: `${activeMeta.value.label} ${message.role === "user" ? "用户消息" : "AI 回复"}`,
    subtitle: new Date().toLocaleString("zh-CN", { hour12: false }),
    content: message.content
  });
};

const favoriteAsset = (asset: { id: string; type: "image" | "audio"; title: string; subtitle: string; url: string }) => {
  addFavorite({
    id: `${asset.type}-${asset.id}`,
    type: asset.type,
    title: asset.title,
    subtitle: asset.subtitle,
    url: asset.url
  });
};

const openAssetDetail = (asset: AssetItem) => {
  selectedAsset.value = asset;
};

const closeAssetDetail = () => {
  selectedAsset.value = null;
};

const downloadTextFile = (filename: string, content: string, type = "application/json") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  addNotification("success", "导出完成", filename);
};

const exportJson = (scope: "all" | "chat" | "media" | "logs" | "favorites" | "prompts") => {
  const data = {
    exportedAt: new Date().toISOString(),
    scope,
    chats: scope === "all" || scope === "chat" ? chatSessions.value : undefined,
    media: scope === "all" || scope === "media" ? { images: imageHistories.value, audios: ttsHistories.value } : undefined,
    logs: scope === "all" || scope === "logs" ? logEntries.value : undefined,
    favorites: scope === "all" || scope === "favorites" ? favorites.value : undefined,
    prompts: scope === "all" || scope === "prompts" ? promptTemplates.value : undefined
  };
  downloadTextFile(`weizhi-${scope}-${Date.now()}.json`, JSON.stringify(data, null, 2));
};

const exportMarkdown = () => {
  const lines = [
    "# Weizhi Agent Export",
    "",
    `Exported at: ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    "",
    "## MiniMax 会话",
    ...chatSessions.value.filter(item => item.provider === "minimax").flatMap(session => [`### ${session.title}`, ...session.messages.map(item => `- **${item.role}**: ${item.content}`)]),
    "",
    "## DeepSeek 会话",
    ...chatSessions.value.filter(item => item.provider === "deepseek").flatMap(session => [`### ${session.title}`, ...session.messages.map(item => `- **${item.role}**: ${item.content}`)]),
    "",
    "## 收藏夹",
    ...favorites.value.map(item => `- **${item.title}** (${item.type}) ${item.content || item.url || ""}`)
  ];
  downloadTextFile(`weizhi-export-${Date.now()}.md`, lines.join("\n"), "text/markdown");
};

const persistLayout = () => {
  localStorage.setItem("weizhi.layout", JSON.stringify({
    sidebarWidth: sidebarWidth.value
  }));
};

const restoreLayout = () => {
  try {
    const raw = localStorage.getItem("weizhi.layout");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (typeof data.sidebarWidth === "number") sidebarWidth.value = Math.min(420, Math.max(180, data.sidebarWidth));
  } catch {
    // Ignore invalid local storage state.
  }
};

const startResize = (target: "sidebar", event: MouseEvent) => {
  resizing = target;
  event.preventDefault();
  document.body.classList.add("is-resizing");
  window.addEventListener("mousemove", resizeLayout);
  window.addEventListener("mouseup", stopResize);
};

const resizeLayout = (event: MouseEvent) => {
  if (!resizing) return;
  if (resizing === "sidebar") {
    sidebarWidth.value = Math.min(420, Math.max(180, event.clientX));
  }
};

const stopResize = () => {
  if (resizing) persistLayout();
  resizing = null;
  document.body.classList.remove("is-resizing");
  window.removeEventListener("mousemove", resizeLayout);
  window.removeEventListener("mouseup", stopResize);
};

onMounted(async () => {
  restoreLayout();
  logEventSource = systemApi.streamLogs();
  logEventSource.onmessage = async (event) => {
    addLog(event.data);
    await loadLogEntries();
  };
  logEventSource.onerror = () => addLog("Log stream disconnected or encountered an error.");
  addLog("System Initialized. Log stream connected.");
  await loadLogEntries();
  await Promise.all([loadHistories(), loadVoices()]);
  await Promise.all([loadDeepSeekAccount(), loadSettings()]);
  try {
    const storedSessions = localStorage.getItem("weizhi.chatSessions");
    if (storedSessions) chatSessions.value = JSON.parse(storedSessions);
    const storedActive = localStorage.getItem("weizhi.activeSessionIds");
    if (storedActive) activeSessionIds.value = { ...activeSessionIds.value, ...JSON.parse(storedActive) };
  } catch {
    // Fall back to default local sessions.
  }
  ensureSessions();
  try {
    const storedTasks = localStorage.getItem("weizhi.taskQueue");
    if (storedTasks) taskQueue.value = JSON.parse(storedTasks);
  } catch {
    // Keep task queue empty if local storage is invalid.
  }
  try {
    const storedNotifications = localStorage.getItem("weizhi.notifications");
    if (storedNotifications) notifications.value = JSON.parse(storedNotifications);
  } catch {
    // Keep notifications empty if local storage is invalid.
  }
  try {
    const storedPrompts = localStorage.getItem("weizhi.promptTemplates");
    if (storedPrompts) promptTemplates.value = JSON.parse(storedPrompts);
  } catch {
    // Keep built-in templates if local prompt storage is invalid.
  }
  try {
    const storedFavorites = localStorage.getItem("weizhi.favorites");
    if (storedFavorites) favorites.value = JSON.parse(storedFavorites);
  } catch {
    // Keep favorites empty if local storage is invalid.
  }
});

onBeforeUnmount(() => {
  if (logEventSource) logEventSource.close();
  stopResize();
});

const handleSend = () => {
  if (!inputText.value.trim() || isThinking.value) return;
  const userMsg = inputText.value.trim();
  const provider = activeProvider.value;
  const task = createTask(`${providerMeta[provider].label} 问答`, provider, userMsg.slice(0, 80));
  const targetMessages = provider === "minimax" ? minimaxMessages.value : deepSeekMessages.value;
  targetMessages.push({ role: "user", content: userMsg });
  saveActiveSession(provider);
  scrollChatToBottom();
  inputText.value = "";
  isThinking.value = true;
  const request = provider === "deepseek"
    ? deepSeekApi.ask(userMsg, targetMessages.map((message): ProviderMessage => ({ role: message.role, content: message.content })))
    : chatApi.ask(userMsg);

  request.then(async (res) => {
    const payload = res.data;
    const content = typeof payload?.text === "string" ? payload.text : (typeof payload === "string" ? payload : JSON.stringify(payload));
    const media: MediaItem[] = Array.isArray(payload?.media) ? payload.media : [];
    targetMessages.push({ role: "assistant", content, media });
    if (provider === "deepseek" && payload?.metadata?.localUsage) {
      deepSeekUsage.value = payload.metadata.localUsage;
    }
    scrollChatToBottom();
    await loadHistories();
    saveActiveSession(provider);
    finishTask(task, "success", "问答完成");
  }).catch(err => {
    finishTask(task, "failed", err?.message || "问答失败");
    addLog("Error calling AI: " + err.message);
  }).finally(() => {
    isThinking.value = false;
  });
};

const switchProvider = (provider: ChatProvider) => {
  activeView.value = "chat";
  activeProvider.value = provider;
  syncMessagesFromSession(provider);
  scrollChatToBottom();
};

const openHome = () => {
  activeView.value = "home";
};

const openSpeech = async () => {
  activeProvider.value = "minimax";
  activeView.value = "speech";
  await loadVoices();
};

const openMiniMaxHistory = async (view: "imageHistory" | "ttsHistory") => {
  activeProvider.value = "minimax";
  activeView.value = view;
  await loadHistories();
};

const openLogs = async () => {
  activeView.value = "logs";
  await loadLogEntries();
};

const openApiStatus = async () => {
  activeView.value = "apiStatus";
  await loadApiStatus();
};

const openDiagnostics = async () => {
  activeView.value = "diagnostics";
  await Promise.all([loadApiStatus(), loadHistories(), loadLogEntries()]);
};

const openAssets = async () => {
  activeView.value = "assets";
  await loadHistories();
};

const openExports = async () => {
  activeView.value = "exports";
  await Promise.all([loadHistories(), loadLogEntries()]);
};

const openSettings = () => {
  activeView.value = "settings";
  loadSettings();
};

const clearCurrentConversation = () => {
  if (activeProvider.value === "minimax") minimaxMessages.value = [];
  else deepSeekMessages.value = [];
  saveActiveSession(activeProvider.value);
};

const clearSession = (provider: ChatProvider) => {
  const session = chatSessions.value.find(item => item.id === activeSessionIds.value[provider]);
  if (session) {
    session.messages = [];
    session.updatedAt = new Date().toISOString();
  }
  if (provider === "minimax") minimaxMessages.value = [];
  else deepSeekMessages.value = [];
  saveSessions();
};

const savePromptTemplates = () => {
  localStorage.setItem("weizhi.promptTemplates", JSON.stringify(promptTemplates.value));
};

const addPromptTemplate = () => {
  if (!promptDraft.value.title.trim() || !promptDraft.value.content.trim()) return;
  promptTemplates.value.unshift({
    id: String(Date.now()),
    title: promptDraft.value.title.trim(),
    content: promptDraft.value.content.trim(),
    provider: promptDraft.value.provider
  });
  promptDraft.value = { title: "", content: "", provider: "通用" };
  savePromptTemplates();
};

const deletePromptTemplate = (id: string) => {
  promptTemplates.value = promptTemplates.value.filter(item => item.id !== id);
  savePromptTemplates();
};

const usePromptTemplate = (template: PromptTemplate) => {
  activeView.value = "chat";
  if (template.provider === "MiniMax") activeProvider.value = "minimax";
  if (template.provider === "DeepSeek") activeProvider.value = "deepseek";
  let content = template.content;
  const variables = Array.from(new Set([...content.matchAll(/\{([^{}]+)\}/g)].map(match => match[1].trim()).filter(Boolean)));
  for (const variable of variables) {
    const value = window.prompt(`填写变量：${variable}`, "");
    if (value === null) return;
    const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    content = content.replace(new RegExp(`\\{${escaped}\\}`, "g"), value);
  }
  inputText.value = content;
  addNotification("info", "已套用 Prompt 模板", template.title);
  scrollChatToBottom();
};
</script>

<template>
  <div
    class="app-container"
    :class="activeView === 'home' ? 'provider-home' : `provider-${activeProvider}`"
    :style="{
      '--sidebar-width': `${sidebarWidth}px`
    }"
  >
    <aside class="sidebar">
      <div class="brand"><Cpu class="icon-accent" /><span>WEIZHI AGENT</span></div>
      <div class="nav-group">
        <button class="nav-item" :class="{ active: activeView === 'home' }" @click="openHome"><Home :size="16" /> 首页</button>
        <button class="nav-item provider-entry minimax-entry" :class="{ active: activeProvider === 'minimax' }" @click="switchProvider('minimax')">
          <Terminal :size="16" />
          <span>
            <strong>MiniMax 会话</strong>
            <small>红色创作通道</small>
          </span>
        </button>
        <div v-if="showMiniMaxSubnav" class="nav-subgroup">
          <button class="nav-subitem" :class="{ active: activeView === 'speech' }" @click="openSpeech">
            <Volume2 :size="14" /> 语音合成
          </button>
          <button class="nav-subitem" :class="{ active: activeView === 'imageHistory' }" @click="openMiniMaxHistory('imageHistory')">
            <ImageIcon :size="14" /> 图片历史
          </button>
          <button class="nav-subitem" :class="{ active: activeView === 'ttsHistory' }" @click="openMiniMaxHistory('ttsHistory')">
            <Volume2 :size="14" /> 语音历史
          </button>
        </div>
        <button class="nav-item provider-entry deepseek-entry" :class="{ active: activeProvider === 'deepseek' }" @click="switchProvider('deepseek')">
          <Terminal :size="16" />
          <span>
            <strong>DeepSeek 会话</strong>
            <small>蓝色推理通道</small>
          </span>
        </button>
        <button class="nav-item" :class="{ active: activeView === 'sessions' }" @click="activeView = 'sessions'"><History :size="16" /> 会话历史</button>
        <button class="nav-item" :class="{ active: activeView === 'tasks' }" @click="activeView = 'tasks'"><Activity :size="16" /> 任务队列</button>
        <button class="nav-item" :class="{ active: activeView === 'notifications' }" @click="activeView = 'notifications'; markNotificationsRead()">
          <Bell :size="16" /> 通知中心 <small v-if="unreadNotificationCount" class="nav-badge">{{ unreadNotificationCount }}</small>
        </button>
        <button class="nav-item" :class="{ active: activeView === 'prompts' }" @click="activeView = 'prompts'"><BookOpen :size="16" /> Prompt 模板库</button>
        <button class="nav-item" :class="{ active: activeView === 'assets' }" @click="openAssets"><FolderOpen :size="16" /> 文件/素材库</button>
        <button class="nav-item" :class="{ active: activeView === 'favorites' }" @click="activeView = 'favorites'"><Star :size="16" /> 收藏夹</button>
        <button class="nav-item" :class="{ active: activeView === 'diagnostics' }" @click="openDiagnostics"><Wrench :size="16" /> 系统诊断</button>
        <button class="nav-item" :class="{ active: activeView === 'exports' }" @click="openExports"><Download :size="16" /> 导出中心</button>
        <button class="nav-item" :class="{ active: activeView === 'apiStatus' }" @click="openApiStatus"><Activity :size="16" /> API 状态面板</button>
        <button class="nav-item" :class="{ active: activeView === 'logs' }" @click="openLogs"><FileText :size="16" /> 日志模块</button>
        <button class="nav-item" :class="{ active: activeView === 'settings' }" @click="openSettings"><Settings :size="16" /> 模型设置</button>
      </div>
      <button class="btn-clear" @click="clearCurrentConversation"><Trash2 :size="14" /> 清除当前会话</button>
    </aside>
    <div class="vertical-resizer sidebar-resizer" @mousedown="startResize('sidebar', $event)"></div>
    <main class="main-content">
      <section v-if="activeView === 'home'" class="home-page">
        <div class="home-hero">
          <div class="home-copy">
            <span>WEIZHI AGENT WORKSPACE</span>
            <h1>把模型、素材、日志和创作流程放在一个工作台里。</h1>
            <p>MiniMax 负责图片与语音创作，DeepSeek 负责推理问答，所有历史、收藏、诊断和导出都从左侧进入。</p>
            <div class="home-actions">
              <button class="preview-btn" @click="switchProvider('minimax')">进入 MiniMax</button>
              <button class="preview-btn secondary" @click="switchProvider('deepseek')">进入 DeepSeek</button>
              <button class="preview-btn secondary" @click="openAssets">查看素材库</button>
            </div>
          </div>
        </div>
        <div class="home-overview">
          <button v-for="stat in dashboardStats" :key="stat.label" class="home-tile" @click="stat.label === '任务' ? activeView = 'tasks' : stat.label === '会话' ? activeView = 'sessions' : stat.label === '素材' ? openAssets() : activeView = 'favorites'">
            <Activity :size="18" />
            <strong>{{ stat.value }} {{ stat.label }}</strong>
            <span>{{ stat.detail }}</span>
          </button>
        </div>
        <div class="home-notices" v-if="recentNotifications.length">
          <div v-for="notice in recentNotifications" :key="notice.id" class="home-notice" :class="`notice-${notice.level}`">
            <strong>{{ notice.title }}</strong>
            <span>{{ notice.message }}</span>
          </div>
        </div>
      </section>

      <section v-else-if="activeView === 'settings'" class="settings-view">
        <div class="settings-header">
          <div>
            <h2>模型设置</h2>
            <p>配置本地 API Key，选择当前会话使用的模型。</p>
          </div>
          <button class="icon-btn" title="刷新设置" :disabled="settingsLoading" @click="loadSettings"><RefreshCw :size="15" /></button>
        </div>

        <div class="settings-grid">
          <section class="settings-card minimax-card">
            <div class="settings-card-head">
              <strong>MiniMax</strong>
              <span>{{ settingsState?.minimax?.apiKeyConfigured ? settingsState?.minimax?.apiKeyMasked : "未配置" }}</span>
            </div>
            <label>API Key</label>
            <input v-model="settingsDraft.minimax.apiKey" type="password" placeholder="留空则不修改当前 Key" />
            <label>模型</label>
            <div class="settings-row">
              <select v-model="settingsDraft.minimax.model">
                <option v-for="model in minimaxModels" :key="model.id" :value="model.id">{{ model.name || model.id }}</option>
              </select>
              <button class="preview-btn secondary" @click="refreshProviderModels('minimax')">刷新模型</button>
            </div>
            <button class="save-settings-btn" :disabled="settingsLoading" @click="saveProviderSettings('minimax')">保存 MiniMax 设置</button>
          </section>

          <section class="settings-card deepseek-card">
            <div class="settings-card-head">
              <strong>DeepSeek</strong>
              <span>{{ settingsState?.deepseek?.apiKeyConfigured ? settingsState?.deepseek?.apiKeyMasked : "未配置" }}</span>
            </div>
            <label>API Key</label>
            <input v-model="settingsDraft.deepseek.apiKey" type="password" placeholder="留空则不修改当前 Key" />
            <label>模型</label>
            <div class="settings-row">
              <select v-model="settingsDraft.deepseek.model">
                <option v-for="model in deepSeekModels" :key="model.id" :value="model.id">{{ model.name || model.id }}</option>
              </select>
              <button class="preview-btn secondary" @click="refreshProviderModels('deepseek')">刷新模型</button>
            </div>
            <button class="save-settings-btn deepseek-save" :disabled="settingsLoading" @click="saveProviderSettings('deepseek')">保存 DeepSeek 设置</button>
            <p class="settings-hint">DeepSeek 模型会优先通过当前 Key 调用官方 /models 获取，失败时显示默认候选。</p>
          </section>
        </div>
      </section>

      <section v-else-if="activeView === 'logs'" class="module-page logs-page">
        <div class="module-header">
          <div>
            <h2>日志模块</h2>
            <p>查看运行日志，按等级和关键词定位接口、模型调用与系统状态。</p>
          </div>
          <div class="log-controls page-controls">
            <select v-model="logLevel" class="log-level-select" @change="loadLogEntries">
              <option value="">全部等级</option>
              <option value="ERROR">ERROR</option>
              <option value="WARN">WARN</option>
              <option value="INFO">INFO</option>
              <option value="DEBUG">DEBUG</option>
            </select>
            <input v-model="logQuery" class="log-search" placeholder="搜索日志、线程、类名" @keydown.enter.prevent="loadLogEntries" />
            <button class="log-action" :disabled="logLoading" @click="loadLogEntries">刷新</button>
            <button class="log-action danger" @click="clearLogEntries">清空</button>
          </div>
        </div>
        <div class="module-body log-body-page" ref="logContainer">
          <div v-if="logEntries.length" class="structured-log-list">
            <div v-for="entry in logEntries" :key="entry.id" class="structured-log" :class="logLevelClass(entry.level)">
              <span class="log-time">{{ formatLogTime(entry.timestamp) }}</span>
              <span class="log-level">{{ entry.level }}</span>
              <span class="log-thread">{{ entry.thread }}</span>
              <span class="log-logger" :title="entry.logger">{{ entry.logger }}</span>
              <span class="log-message">{{ entry.message }}</span>
            </div>
          </div>
          <div v-else class="log-empty">暂无日志</div>
        </div>
      </section>

      <section v-else-if="activeView === 'speech'" class="module-page">
        <div class="module-header">
          <div>
            <h2>语音合成</h2>
            <p>MiniMax 语音通道，支持 preview、speed、vol、pitch、format 等参数。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="loadVoices">刷新音色</button>
            <button class="log-action" @click="openMiniMaxHistory('ttsHistory')">查看语音历史</button>
          </div>
        </div>
        <div class="module-body speech-layout">
          <section class="speech-composer">
            <label>合成文本</label>
            <textarea v-model="previewText" class="tts-preview-input speech-textarea" placeholder="输入试听文本（preview）" />
            <div class="speech-grid">
              <label>音色<select v-model="previewVoiceId"><option v-for="v in voices" :key="v.voiceId" :value="v.voiceId">{{ v.name }}（{{ v.voiceId }}）</option></select></label>
              <label>格式<select v-model="previewFormat"><option value="mp3">mp3</option><option value="wav">wav</option><option value="flac">flac</option></select></label>
              <label>Speed<input v-model.number="previewSpeed" type="number" step="0.1" min="0.5" max="2" /></label>
              <label>Vol<input v-model.number="previewVol" type="number" step="0.1" min="0.1" max="2" /></label>
              <label>Pitch<input v-model.number="previewPitch" type="number" step="1" min="-12" max="12" /></label>
              <label>Sample Rate<input v-model.number="previewSampleRate" type="number" step="1000" /></label>
              <label>Bitrate<input v-model.number="previewBitrate" type="number" step="1000" /></label>
            </div>
            <div class="speech-actions">
              <button class="preview-btn" :disabled="previewLoading" @click="handlePreview">{{ previewLoading ? "生成中..." : "Preview 试听" }}</button>
              <button class="preview-btn secondary" :disabled="generateLoading" @click="handleGenerateTts">{{ generateLoading ? "生成中..." : "完整生成" }}</button>
            </div>
          </section>
          <section class="speech-result">
            <strong>输出预览</strong>
            <audio v-if="previewAudioUrl" :src="previewAudioUrl" controls class="audio-preview" />
            <audio v-if="generateAudioUrl" :src="generateAudioUrl" controls class="audio-preview" />
            <div v-if="!previewAudioUrl && !generateAudioUrl" class="empty-module">生成后会在这里播放音频</div>
          </section>
        </div>
      </section>

      <section v-else-if="activeView === 'sessions'" class="module-page">
        <div class="module-header">
          <div>
            <h2>会话历史</h2>
            <p>管理 MiniMax 与 DeepSeek 的本地持久化会话。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="createSession('minimax')">新建 MiniMax</button>
            <button class="log-action" @click="createSession('deepseek')">新建 DeepSeek</button>
          </div>
        </div>
        <div class="module-body session-grid">
          <article v-for="session in sessionSummaries" :key="session.id" class="session-card" :class="`${session.provider}-session-card`">
            <div>
              <strong>{{ session.title }}</strong>
              <span>{{ providerMeta[session.provider].label }} · {{ session.subtitle }}</span>
            </div>
            <p>{{ session.last }}</p>
            <div class="session-card-footer">
              <small>{{ session.count }} 条消息</small>
              <button class="log-action" @click="openSession(session)">继续</button>
              <button class="log-action" @click="renameSession(session)">重命名</button>
              <button class="log-action danger" @click="deleteSession(session)">删除</button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeView === 'tasks'" class="module-page">
        <div class="module-header">
          <div>
            <h2>任务队列</h2>
            <p>跟踪聊天、语音合成等异步任务的运行状态。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="clearFinishedTasks">清理已完成</button>
          </div>
        </div>
        <div class="module-body task-list">
          <article v-for="task in taskQueue" :key="task.id" class="task-card" :class="`task-${task.status}`">
            <div class="task-status">{{ task.status }}</div>
            <div>
              <strong>{{ task.title }}</strong>
              <p>{{ task.detail }}</p>
              <span>{{ task.provider }} · {{ new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false }) }}</span>
            </div>
          </article>
          <div v-if="!taskQueue.length" class="empty-module">暂无任务，问答和语音生成会自动进入这里</div>
        </div>
      </section>

      <section v-else-if="activeView === 'notifications'" class="module-page">
        <div class="module-header">
          <div>
            <h2>通知中心</h2>
            <p>集中查看任务完成、失败、设置保存和导出反馈。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="markNotificationsRead">全部已读</button>
            <button class="log-action danger" @click="notifications = []; saveNotifications()">清空通知</button>
          </div>
        </div>
        <div class="module-body notification-list">
          <article v-for="notice in notifications" :key="notice.id" class="notification-card" :class="[`notice-${notice.level}`, { unread: !notice.read }]">
            <div>
              <strong>{{ notice.title }}</strong>
              <p>{{ notice.message }}</p>
              <span>{{ new Date(notice.createdAt).toLocaleString("zh-CN", { hour12: false }) }}</span>
            </div>
            <button class="icon-btn" @click="removeNotification(notice.id)"><X :size="14" /></button>
          </article>
          <div v-if="!notifications.length" class="empty-module">暂无通知</div>
        </div>
      </section>

      <section v-else-if="activeView === 'prompts'" class="module-page">
        <div class="module-header">
          <div>
            <h2>Prompt 模板库</h2>
            <p>沉淀常用提示词，一键带回对应会话。</p>
          </div>
        </div>
        <div class="module-body prompt-layout">
          <section class="prompt-editor">
            <input v-model="promptDraft.title" placeholder="模板名称" />
            <select v-model="promptDraft.provider"><option>通用</option><option>MiniMax</option><option>DeepSeek</option></select>
            <textarea v-model="promptDraft.content" placeholder="模板内容，可使用 {主题}、{风格} 这样的变量" />
            <button class="preview-btn" @click="addPromptTemplate">添加模板</button>
          </section>
          <section class="prompt-list">
            <article v-for="template in promptTemplates" :key="template.id" class="prompt-card">
              <div class="prompt-card-head">
                <strong>{{ template.title }}</strong>
                <span>{{ template.provider }}</span>
              </div>
              <p>{{ template.content }}</p>
              <div class="page-controls">
                <button class="log-action" @click="usePromptTemplate(template)">使用</button>
                <button class="log-action danger" @click="deletePromptTemplate(template.id)">删除</button>
              </div>
            </article>
          </section>
        </div>
      </section>

      <section v-else-if="activeView === 'apiStatus'" class="module-page">
        <div class="module-header">
          <div>
            <h2>API 状态面板</h2>
            <p>统一查看后端健康、Key 配置、模型和 DeepSeek 余额用量。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" :disabled="settingsLoading || accountLoading" @click="loadApiStatus">刷新状态</button>
            <button class="log-action" @click="openSettings">模型设置</button>
          </div>
        </div>
        <div class="module-body status-layout">
          <article v-for="card in apiStatusCards" :key="card.name" class="status-card">
            <span>{{ card.name }}</span>
            <strong>{{ card.status }}</strong>
            <p>{{ card.detail }}</p>
          </article>
          <article class="status-card wide-status">
            <span>DeepSeek 本地累计</span>
            <div class="usage-grid">
              <div><span>请求</span><strong>{{ deepSeekUsage?.requests || 0 }}</strong></div>
              <div><span>输入</span><strong>{{ deepSeekUsage?.promptTokens || 0 }}</strong></div>
              <div><span>输出</span><strong>{{ deepSeekUsage?.completionTokens || 0 }}</strong></div>
              <div><span>总计</span><strong>{{ deepSeekUsage?.totalTokens || 0 }}</strong></div>
            </div>
            <button class="open-usage-btn" @click="openDeepSeekUsage">打开官方 Usage 页面</button>
          </article>
        </div>
      </section>

      <section v-else-if="activeView === 'assets'" class="module-page">
        <div class="module-header">
          <div>
            <h2>文件/素材库</h2>
            <p>统一浏览 MiniMax 生成的图片和语音素材。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="loadHistories">刷新素材</button>
            <button class="log-action" @click="exportJson('media')">导出素材索引</button>
          </div>
        </div>
        <div class="module-body asset-grid">
          <article v-for="asset in assetItems" :key="`${asset.type}-${asset.id}`" class="asset-card">
            <img v-if="asset.type === 'image'" :src="mediaUrl(asset.url)" alt="asset image" class="history-card-image" />
            <div v-else class="asset-audio-box"><Volume2 :size="30" /><audio :src="mediaUrl(asset.url)" controls class="audio-preview" /></div>
            <div class="history-card-meta">
              <strong>{{ asset.title }}</strong>
              <span>{{ asset.subtitle }}</span>
              <div class="page-controls">
                <button class="log-action" @click="openAssetDetail(asset)">详情</button>
                <button class="log-action" @click="favoriteAsset(asset)">收藏</button>
                <a class="log-action asset-link" :href="mediaUrl(asset.url)" target="_blank">打开</a>
              </div>
            </div>
          </article>
          <div v-if="!assetItems.length" class="empty-module">暂无素材</div>
        </div>
      </section>

      <section v-else-if="activeView === 'favorites'" class="module-page">
        <div class="module-header">
          <div>
            <h2>收藏夹</h2>
            <p>收纳重要回复、图片、语音素材。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="exportJson('favorites')">导出收藏</button>
          </div>
        </div>
        <div class="module-body favorite-list">
          <article v-for="item in favorites" :key="item.id" class="favorite-card">
            <div class="prompt-card-head">
              <strong>{{ item.title }}</strong>
              <span>{{ item.type }}</span>
            </div>
            <p>{{ item.subtitle }}</p>
            <p v-if="item.content">{{ item.content }}</p>
            <img v-if="item.type === 'image' && item.url" :src="mediaUrl(item.url)" alt="favorite image" class="favorite-image" />
            <audio v-if="item.type === 'audio' && item.url" :src="mediaUrl(item.url)" controls class="audio-preview" />
            <button class="log-action danger" @click="removeFavorite(item.id)">移除</button>
          </article>
          <div v-if="!favorites.length" class="empty-module">暂无收藏，可以从聊天消息或素材库收藏内容</div>
        </div>
      </section>

      <section v-else-if="activeView === 'diagnostics'" class="module-page">
        <div class="module-header">
          <div>
            <h2>系统诊断</h2>
            <p>检查健康状态、缓存数量和本地工作台数据。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="openDiagnostics">重新诊断</button>
            <button class="log-action" @click="openLogs">查看日志</button>
          </div>
        </div>
        <div class="module-body status-layout">
          <article v-for="card in diagnosticCards" :key="card.name" class="status-card">
            <span>{{ card.name }}</span>
            <strong>{{ card.value }}</strong>
            <p>{{ card.detail }}</p>
          </article>
        </div>
      </section>

      <section v-else-if="activeView === 'exports'" class="module-page">
        <div class="module-header">
          <div>
            <h2>导出中心</h2>
            <p>导出聊天、媒体索引、日志、收藏和 Prompt 模板。</p>
          </div>
        </div>
        <div class="module-body export-grid">
          <button class="export-card" @click="exportJson('all')"><strong>完整 JSON</strong><span>会话、素材、日志、收藏、模板</span></button>
          <button class="export-card" @click="exportMarkdown"><strong>Markdown 摘要</strong><span>适合阅读和归档的文本摘要</span></button>
          <button class="export-card" @click="exportJson('chat')"><strong>会话 JSON</strong><span>MiniMax 与 DeepSeek 当前会话</span></button>
          <button class="export-card" @click="exportJson('media')"><strong>素材索引 JSON</strong><span>图片和语音历史记录</span></button>
          <button class="export-card" @click="exportJson('logs')"><strong>日志 JSON</strong><span>结构化运行日志</span></button>
          <button class="export-card" @click="exportJson('prompts')"><strong>模板 JSON</strong><span>Prompt 模板库</span></button>
        </div>
      </section>

      <section v-else-if="activeView === 'imageHistory'" class="module-page">
        <div class="module-header">
          <div>
            <h2>MiniMax 图片历史</h2>
            <p>所有通过 MiniMax 图片能力生成的历史记录。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="loadHistories">刷新</button>
            <button class="log-action danger" @click="clearImageHistory">清空图片历史</button>
          </div>
        </div>
        <div class="module-body history-page-grid">
          <article v-for="item in imageHistories" :key="String(item.id)" class="history-card">
            <img :src="mediaUrl(String(item.url || ''))" alt="history image" class="history-card-image" />
            <div class="history-card-meta">
              <strong>{{ item.prompt || "未命名提示词" }}</strong>
              <span>{{ item.createdAt }}</span>
              <div class="page-controls">
                <button class="item-action-btn" @click="favoriteAsset({ id: String(item.id), type: 'image', title: String(item.prompt || '历史图片'), subtitle: String(item.createdAt || ''), url: String(item.url || '') })">收藏</button>
                <button class="item-action-btn" @click="deleteImageHistory(String(item.id))">删除</button>
              </div>
            </div>
          </article>
          <div v-if="!imageHistories.length" class="empty-module">暂无图片历史</div>
        </div>
      </section>

      <section v-else-if="activeView === 'ttsHistory'" class="module-page">
        <div class="module-header">
          <div>
            <h2>MiniMax 语音历史</h2>
            <p>试听和完整生成的语音文件都会进入这里。</p>
          </div>
          <div class="page-controls">
            <button class="log-action" @click="loadHistories">刷新</button>
            <button class="log-action danger" @click="clearTtsHistory">清空语音历史</button>
          </div>
        </div>
        <div class="module-body voice-history-list">
          <article v-for="item in ttsHistories" :key="String(item.id)" class="voice-history-card">
            <div class="history-card-meta">
              <strong>{{ item.text || "空文本" }}</strong>
              <span>{{ item.voiceId }} · {{ item.format }} · {{ item.preview ? "preview" : "tts" }}</span>
            </div>
            <audio :src="mediaUrl(String(item.audioUrl || ''))" controls class="audio-preview" />
            <button class="item-action-btn" @click="favoriteAsset({ id: String(item.id), type: 'audio', title: String(item.text || '历史语音'), subtitle: `${item.voiceId || 'voice'} · ${item.format || 'audio'} · ${item.preview ? 'preview' : 'tts'}`, url: String(item.audioUrl || '') })">收藏</button>
            <button class="item-action-btn" @click="deleteTtsHistory(String(item.id))">删除</button>
          </article>
          <div v-if="!ttsHistories.length" class="empty-module">暂无语音历史</div>
        </div>
      </section>

      <section v-else class="workbench-body">
        <div class="chat-column">
          <div class="workspace-toolbar">
            <div class="toolbar-title">
              <Terminal :size="15" />
              <span>{{ activeMeta.label }} Session</span>
              <em>{{ chatSessions.find(session => session.id === activeSessionIds[activeProvider])?.title || activeMeta.subtitle }}</em>
            </div>
            <div class="toolbar-actions">
              <select class="session-picker" :value="activeSessionIds[activeProvider]" @change="openSession(chatSessions.find(session => session.id === ($event.target as HTMLSelectElement).value)!)">
                <option v-for="session in providerSessions" :key="session.id" :value="session.id">{{ session.title }}</option>
              </select>
              <button class="log-action" @click="createSession(activeProvider)">新会话</button>
              <button class="icon-btn" title="刷新历史" @click="loadHistories"><RefreshCw :size="15" /></button>
            </div>
          </div>

          <div class="chat-viewport" ref="chatContainer">
            <div v-if="messages.length === 0" class="empty-state">
              <h2>{{ activeMeta.emptyTitle }}</h2>
              <p>{{ activeMeta.emptyDesc }}</p>
            </div>
            <div v-for="(msg, i) in messages" :key="i" class="message-row" :class="msg.role">
              <div class="message-avatar">{{ msg.role === "user" ? "U" : "AI" }}</div>
              <div class="message-content">
                <button class="message-favorite" title="收藏消息" @click="favoriteMessage(msg, i)"><Star :size="13" /></button>
                <div>{{ msg.content }}</div>
                <img v-for="(m, j) in (msg.media || []).filter(x => x.type === 'image')" :key="`img-${j}`" :src="mediaUrl(m.url)" class="media-preview image-preview" alt="generated image" />
                <audio v-for="(m, j) in (msg.media || []).filter(x => x.type === 'audio')" :key="`audio-${j}`" :src="mediaUrl(m.url)" class="media-preview audio-preview" controls />
              </div>
            </div>
            <div v-if="isThinking" class="message-row assistant"><div class="message-avatar">AI</div><div class="thinking-dots"><span>.</span><span>.</span><span>.</span></div></div>
          </div>

          <div class="input-container">
            <div class="input-wrapper">
              <textarea v-model="inputText" placeholder="问问 Agent 任何事..." @keydown.enter.prevent="handleSend" />
              <button class="send-btn" @click="handleSend" :disabled="isThinking"><Send :size="18" /></button>
            </div>
          </div>
        </div>
      </section>
    </main>
    <div v-if="selectedAsset" class="asset-modal-backdrop" @click.self="closeAssetDetail">
      <section class="asset-modal">
        <div class="asset-modal-head">
          <div>
            <strong>{{ selectedAsset.title }}</strong>
            <span>{{ selectedAsset.subtitle }}</span>
          </div>
          <button class="icon-btn" @click="closeAssetDetail"><X :size="15" /></button>
        </div>
        <div class="asset-modal-body">
          <img v-if="selectedAsset.type === 'image'" :src="mediaUrl(selectedAsset.url)" alt="asset detail" />
          <audio v-else :src="mediaUrl(selectedAsset.url)" controls class="audio-preview" />
        </div>
        <div class="asset-modal-actions">
          <button class="log-action" @click="favoriteAsset(selectedAsset)">收藏</button>
          <a class="log-action asset-link" :href="mediaUrl(selectedAsset.url)" target="_blank">打开原文件</a>
        </div>
      </section>
    </div>
  </div>
</template>

<style>
.brand { display: flex; align-items: center; gap: 10px; font-weight: 900; letter-spacing: 1px; margin-bottom: 30px; }
.icon-accent { color: var(--accent); }
.nav-group { display: flex; flex-direction: column; gap: 8px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-muted); border: 1px solid transparent; background: transparent; text-align: left; }
.nav-item.active { background: var(--border); color: #fff; }
.nav-badge { margin-left: auto; min-width: 18px; height: 18px; border-radius: 999px; background: #ef4444; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; }
.nav-subgroup { display: flex; flex-direction: column; gap: 4px; margin: -3px 0 4px 26px; padding-left: 10px; border-left: 1px solid #252525; }
.nav-subitem { height: 30px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #8a8a8a; padding: 0 9px; cursor: pointer; font-size: 12px; text-align: left; }
.nav-subitem:hover { color: #f0f0f0; background: rgba(255,255,255,0.04); }
.nav-subitem.active { color: #fecaca; background: rgba(239, 68, 68, 0.12); border-color: rgba(248, 113, 113, 0.28); }
.provider-entry span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.provider-entry strong { font-size: 13px; color: inherit; }
.provider-entry small { font-size: 11px; color: #777; font-weight: 500; }
.minimax-entry.active { background: rgba(185, 28, 28, 0.18); border-color: rgba(248, 113, 113, 0.35); }
.deepseek-entry.active { background: rgba(37, 99, 235, 0.18); border-color: rgba(96, 165, 250, 0.38); }
.provider-minimax {
  --provider-accent: #ef4444;
  --provider-soft: rgba(239, 68, 68, 0.16);
  --provider-border: rgba(248, 113, 113, 0.38);
}
.provider-deepseek {
  --provider-accent: #2f7df6;
  --provider-soft: rgba(47, 125, 246, 0.17);
  --provider-border: rgba(96, 165, 250, 0.42);
}
.provider-home {
  --provider-accent: #38bdf8;
  --provider-soft: rgba(56, 189, 248, 0.13);
  --provider-border: rgba(125, 211, 252, 0.38);
}
.provider-minimax .icon-accent { color: #ef4444; }
.provider-deepseek .icon-accent { color: #2f7df6; }
.provider-home .icon-accent { color: #38bdf8; }
.app-container { grid-template-columns: var(--sidebar-width) 6px minmax(0, 1fr); }
.vertical-resizer { width: 6px; min-width: 6px; background: #0b0b0b; cursor: col-resize; user-select: none; position: relative; z-index: 3; }
.vertical-resizer::after { content: ""; position: absolute; top: 0; bottom: 0; left: 2px; width: 1px; background: #242424; }
.vertical-resizer:hover::after { background: var(--provider-accent); }
.sidebar-resizer { border-right: 1px solid #151515; }
.main-content {
  display: block;
  min-height: 0;
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255,255,255,0.02) 1px, transparent 1px),
    #080808;
  background-size: 48px 48px, 48px 48px, auto;
}
.settings-view { height: 100%; min-height: 0; overflow-y: auto; padding: 28px; border-bottom: 1px solid var(--border); }
.home-page { height: 100%; min-height: 0; display: grid; grid-template-rows: minmax(420px, 68%) minmax(132px, 1fr); overflow: hidden; }
.home-hero {
  position: relative;
  min-height: 0;
  display: flex;
  align-items: center;
  padding: 42px clamp(28px, 6vw, 86px);
  background:
    linear-gradient(90deg, rgba(3, 7, 18, 0.92) 0%, rgba(3, 7, 18, 0.68) 42%, rgba(3, 7, 18, 0.2) 100%),
    url("https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1800&q=85") center / cover no-repeat;
  border-bottom: 1px solid var(--border);
}
.home-hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 62%, rgba(8,8,8,0.9)); pointer-events: none; }
.home-copy { position: relative; z-index: 1; width: min(720px, 100%); display: flex; flex-direction: column; gap: 16px; }
.home-copy span { color: #7dd3fc; font-size: 12px; font-weight: 900; letter-spacing: 2px; }
.home-copy h1 { margin: 0; color: #f8fafc; font-size: clamp(34px, 5vw, 68px); line-height: 1.02; max-width: 820px; }
.home-copy p { margin: 0; max-width: 620px; color: #cbd5e1; font-size: 15px; line-height: 1.7; }
.home-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.home-overview { min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 1px; background: #222; border-top: 1px solid #202020; }
.home-tile { border: 0; background: rgba(14, 14, 14, 0.96); color: #e5e7eb; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 7px; padding: 18px 22px; text-align: left; cursor: pointer; min-width: 0; }
.home-tile:hover { background: rgba(20, 30, 42, 0.98); }
.home-tile svg { color: #7dd3fc; }
.home-tile strong { font-size: 14px; }
.home-tile span { color: #8b97a8; font-size: 12px; line-height: 1.35; }
.home-notices { position: absolute; right: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 8px; width: min(360px, 34vw); z-index: 2; }
.home-notice { border: 1px solid #263345; border-radius: 8px; background: rgba(8, 13, 22, 0.86); padding: 10px; display: flex; flex-direction: column; gap: 4px; }
.home-notice strong { color: #f8fafc; font-size: 12px; }
.home-notice span { color: #a7b4c8; font-size: 11px; line-height: 1.35; }
.settings-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.settings-header h2 { margin: 0 0 6px; font-size: 22px; }
.settings-header p { margin: 0; color: #929292; font-size: 13px; }
.settings-grid { display: grid; grid-template-columns: repeat(2, minmax(320px, 1fr)); gap: 16px; max-width: 1120px; }
.settings-card { border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.86); padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.settings-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.settings-card-head strong { font-size: 15px; }
.settings-card-head span { color: #9ca3af; font-family: var(--font-mono); font-size: 11px; }
.settings-card label { color: #aaa; font-size: 12px; font-weight: 700; }
.settings-card input, .settings-card select { height: 34px; border: 1px solid #2d2d2d; border-radius: 6px; background: #111; color: #fff; padding: 0 10px; min-width: 0; }
.settings-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.save-settings-btn { height: 34px; border: 1px solid rgba(248,113,113,0.38); border-radius: 6px; background: rgba(239,68,68,0.16); color: #fecaca; cursor: pointer; margin-top: 4px; }
.save-settings-btn.deepseek-save { border-color: rgba(96,165,250,0.42); background: rgba(47,125,246,0.17); color: #dbeafe; }
.settings-hint { margin: 4px 0 0; color: #8b8b8b; font-size: 11px; line-height: 1.4; }
.minimax-card { box-shadow: inset 0 1px 0 rgba(248,113,113,0.18); }
.deepseek-card { box-shadow: inset 0 1px 0 rgba(96,165,250,0.18); }
.workbench-body {
  height: 100%;
  min-height: 0;
  display: block;
  border-bottom: 1px solid var(--border);
}
.module-page { height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
.module-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 22px 26px 16px; border-bottom: 1px solid var(--border); background: linear-gradient(90deg, var(--provider-soft), rgba(12,12,12,0.96) 36%); box-shadow: inset 0 -1px 0 var(--provider-border); }
.module-header h2 { margin: 0 0 6px; font-size: 21px; color: #f3f3f3; }
.module-header p { margin: 0; color: #8e8e8e; font-size: 13px; }
.module-body { min-height: 0; overflow-y: auto; padding: 18px 26px 28px; }
.page-controls { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.history-page-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; align-content: start; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; align-content: start; }
.history-card { min-width: 0; border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.88); overflow: hidden; }
.asset-card { min-width: 0; border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.88); overflow: hidden; }
.history-card-image { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: #050505; border-bottom: 1px solid var(--border); }
.asset-audio-box { min-height: 120px; display: flex; flex-direction: column; justify-content: center; gap: 12px; padding: 18px; color: #dbeafe; background: rgba(37,99,235,0.09); border-bottom: 1px solid var(--border); }
.asset-link { display: inline-flex; align-items: center; text-decoration: none; }
.history-card-meta { min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px; }
.history-card-meta strong { color: #f1f1f1; font-size: 13px; line-height: 1.35; word-break: break-word; }
.history-card-meta span { color: #858585; font-size: 11px; word-break: break-word; }
.voice-history-list { display: flex; flex-direction: column; gap: 12px; }
.voice-history-card { display: grid; grid-template-columns: minmax(220px, 1fr) minmax(260px, 480px) auto; align-items: center; gap: 12px; border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.88); padding: 10px; }
.favorite-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; align-content: start; }
.favorite-card { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.88); padding: 12px; min-width: 0; }
.favorite-card p { margin: 0; color: #cfcfcf; font-size: 13px; line-height: 1.5; word-break: break-word; }
.favorite-image { width: 100%; max-height: 260px; object-fit: contain; border: 1px solid var(--border); border-radius: 8px; background: #050505; }
.export-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; align-content: start; }
.export-card { min-height: 110px; border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.88); color: #f3f3f3; text-align: left; padding: 14px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; }
.export-card:hover { border-color: var(--provider-border); background: var(--provider-soft); }
.export-card strong { font-size: 16px; }
.export-card span { color: #969696; font-size: 12px; line-height: 1.4; }
.empty-module { color: #666; font-size: 13px; padding: 26px 4px; }
.log-body-page { font-family: var(--font-mono); }
.speech-layout { display: grid; grid-template-columns: minmax(360px, 680px) minmax(280px, 1fr); gap: 16px; align-content: start; }
.speech-composer,
.speech-result,
.prompt-editor,
.prompt-card,
.session-card,
.status-card { border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.88); padding: 14px; min-width: 0; }
.speech-composer { display: flex; flex-direction: column; gap: 10px; }
.speech-composer label,
.prompt-editor label { color: #aaa; font-size: 12px; font-weight: 800; }
.speech-textarea { min-height: 140px; resize: vertical; padding: 10px; }
.speech-grid { display: grid; grid-template-columns: repeat(2, minmax(160px, 1fr)); gap: 10px; }
.speech-grid label { display: flex; flex-direction: column; gap: 6px; }
.speech-grid select,
.speech-grid input,
.prompt-editor input,
.prompt-editor select,
.prompt-editor textarea { background: #111; color: #fff; border: 1px solid #2d2d2d; border-radius: 6px; min-height: 32px; padding: 0 9px; min-width: 0; }
.prompt-editor textarea { min-height: 150px; padding: 10px; resize: vertical; }
.speech-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.speech-result { display: flex; flex-direction: column; gap: 12px; }
.speech-result strong { color: #f2f2f2; font-size: 14px; }
.session-grid,
.status-layout { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; align-content: start; }
.session-card { display: flex; flex-direction: column; gap: 12px; }
.task-list { display: flex; flex-direction: column; gap: 10px; }
.task-card { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; align-items: center; border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.88); padding: 12px; }
.task-status { height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; background: #202020; color: #cfcfcf; font-size: 11px; font-weight: 900; text-transform: uppercase; }
.task-card strong { color: #f2f2f2; font-size: 14px; }
.task-card p { margin: 3px 0; color: #c9c9c9; font-size: 13px; line-height: 1.4; }
.task-card span { color: #777; font-size: 11px; }
.task-running .task-status { color: #bfdbfe; background: rgba(37,99,235,0.24); }
.task-success .task-status { color: #bbf7d0; background: rgba(22,101,52,0.24); }
.task-failed .task-status { color: #fecaca; background: rgba(127,29,29,0.28); }
.notification-list { display: flex; flex-direction: column; gap: 10px; }
.notification-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1px solid var(--border); border-radius: 8px; background: rgba(18,18,18,0.88); padding: 12px; }
.notification-card.unread { border-color: var(--provider-border); background: var(--provider-soft); }
.notification-card strong { color: #f3f3f3; font-size: 14px; }
.notification-card p { margin: 4px 0; color: #cfcfcf; font-size: 13px; line-height: 1.45; }
.notification-card span { color: #777; font-size: 11px; }
.notice-success { border-color: rgba(74, 222, 128, 0.28); }
.notice-error { border-color: rgba(248, 113, 113, 0.32); }
.notice-warning { border-color: rgba(251, 191, 36, 0.32); }
.notice-info { border-color: rgba(96, 165, 250, 0.32); }
.session-card strong,
.status-card strong { display: block; color: #f5f5f5; font-size: 17px; margin-bottom: 4px; }
.session-card span,
.session-card small,
.status-card span { color: #8f8f8f; font-size: 12px; }
.session-card p,
.status-card p,
.prompt-card p { color: #cfcfcf; font-size: 13px; line-height: 1.5; margin: 0; word-break: break-word; }
.session-card-footer { display: flex; align-items: center; gap: 8px; margin-top: auto; }
.minimax-session-card { border-color: rgba(248,113,113,0.28); }
.deepseek-session-card { border-color: rgba(96,165,250,0.3); }
.prompt-layout { display: grid; grid-template-columns: minmax(300px, 360px) minmax(0, 1fr); gap: 16px; align-items: start; }
.prompt-editor { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 18px; }
.prompt-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.prompt-card { display: flex; flex-direction: column; gap: 10px; }
.prompt-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.prompt-card-head strong { color: #f1f1f1; font-size: 14px; }
.prompt-card-head span { color: #9fb8ff; border: 1px solid #263345; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
.status-card { display: flex; flex-direction: column; gap: 8px; }
.status-card > span { color: #8aa4c7; font-size: 12px; }
.wide-status { grid-column: 1 / -1; }
.chat-column {
  min-width: 0;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: 42px minmax(0, 1fr) auto;
}
.workspace-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid var(--border); background: linear-gradient(90deg, var(--provider-soft), rgba(13, 13, 13, 0.96) 34%); box-shadow: inset 0 -1px 0 var(--provider-border); }
.toolbar-title { display: inline-flex; align-items: center; gap: 8px; color: #d7d7d7; font-size: 12px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; }
.toolbar-title em { color: #8d8d8d; font-style: normal; font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0; }
.toolbar-actions { display: flex; align-items: center; gap: 6px; }
.session-picker { height: 30px; max-width: 220px; border: 1px solid var(--border); border-radius: 6px; background: #111; color: #d8d8d8; padding: 0 8px; font-size: 12px; }
.icon-btn { width: 30px; height: 30px; border: 1px solid var(--border); border-radius: 6px; background: #121212; color: #cfcfcf; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.icon-btn:hover { border-color: var(--provider-border); color: #fff; background: var(--provider-soft); }
.chat-viewport { min-height: 0; overflow-y: auto; padding: 24px clamp(18px, 5vw, 78px); display: flex; flex-direction: column; gap: 18px; scrollbar-gutter: stable; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; opacity: 0.5; }
.message-row { display: flex; gap: 14px; max-width: 960px; width: 100%; }
.message-row.user { align-self: flex-end; flex-direction: row-reverse; max-width: 760px; }
.message-avatar { width: 32px; height: 32px; border-radius: 4px; background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; flex-shrink: 0; }
.user .message-avatar { background: var(--provider-accent); }
.message-content { position: relative; line-height: 1.6; font-size: 14px; white-space: pre-wrap; background: rgba(18,18,18,0.86); border: 1px solid #252525; border-radius: 8px; padding: 12px 14px; min-width: 0; max-width: 100%; box-shadow: 0 8px 30px rgba(0,0,0,0.18); }
.message-favorite { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border: 1px solid #303030; border-radius: 6px; background: #111; color: #8d8d8d; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; }
.message-content:hover .message-favorite { opacity: 1; }
.message-favorite:hover { color: #facc15; border-color: #5c4b1b; }
.asset-modal-backdrop { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,0.68); display: flex; align-items: center; justify-content: center; padding: 24px; }
.asset-modal { width: min(840px, 92vw); max-height: 88vh; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; border: 1px solid var(--border); border-radius: 8px; background: #101010; box-shadow: 0 24px 80px rgba(0,0,0,0.44); overflow: hidden; }
.asset-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border); padding: 12px 14px; }
.asset-modal-head div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.asset-modal-head strong { color: #fff; font-size: 15px; }
.asset-modal-head span { color: #888; font-size: 12px; }
.asset-modal-body { min-height: 0; overflow: auto; padding: 14px; display: flex; justify-content: center; align-items: center; background: #070707; }
.asset-modal-body img { max-width: 100%; max-height: 62vh; object-fit: contain; border-radius: 8px; }
.asset-modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--border); }
.user .message-content { background: var(--provider-soft); border-color: var(--provider-border); }
.assistant .message-content { color: #f0f0f0; }
.assistant .message-content div:first-child { word-break: break-word; }
.media-preview { margin-top: 10px; display: block; }
.image-preview { width: min(420px, 100%); max-height: 420px; object-fit: contain; border-radius: 8px; border: 1px solid var(--border); background: #050505; }
.audio-preview { width: min(420px, 100%); }

.input-container { padding: 10px clamp(18px, 5vw, 78px); border-top: 1px solid var(--border); background: rgba(12, 12, 12, 0.98); }
.input-wrapper { background: var(--bg-card); border: 1px solid #303030; border-radius: 8px; display: flex; padding: 8px 10px 8px 14px; align-items: flex-end; max-width: 960px; margin: 0 auto; box-shadow: 0 12px 42px rgba(0,0,0,0.26); }
.input-wrapper:focus-within { border-color: var(--provider-accent); box-shadow: 0 0 0 1px var(--provider-border), 0 12px 42px rgba(0,0,0,0.26); }
.input-wrapper textarea { flex: 1; background: transparent; border: none; color: #fff; resize: vertical; padding: 8px 0; outline: none; font-family: inherit; font-size: 14px; min-height: 38px; max-height: 130px; }
.send-btn { background: var(--provider-accent); border: none; color: #fff; width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.send-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.usage-grid span { display: block; color: #8aa4c7; font-size: 11px; margin-bottom: 3px; }
.usage-grid strong { display: block; color: #eff6ff; font-size: 15px; }
.usage-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 8px; }
.usage-grid div { border: 1px solid #263345; border-radius: 7px; padding: 7px; background: rgba(18,18,18,0.72); }
.open-usage-btn { width: 100%; height: 30px; border: 1px solid rgba(96,165,250,0.38); background: rgba(37,99,235,0.18); color: #dbeafe; border-radius: 6px; cursor: pointer; }

.tts-preview-tools { min-width: 0; width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 8px; background: #121212; }
.tts-preview-input { width: 100%; background: #1a1a1a; color: #fff; border: 1px solid #2a2a2a; border-radius: 6px; min-height: 46px; margin-bottom: 8px; }
.tts-grid { display: grid; grid-template-columns: 1fr 82px; gap: 6px; align-items: center; }
.tts-grid select, .tts-grid input { background: #1a1a1a; color: #fff; border: 1px solid #2a2a2a; border-radius: 6px; height: 30px; padding: 0 6px; }
.preview-btn { background: var(--accent); color: #fff; border: none; border-radius: 6px; height: 30px; padding: 0 10px; cursor: pointer; }
.preview-btn.secondary { background: #3a3a3a; }
.item-action-btn { margin-top: auto; width: 64px; background: #2a1717; color: #ff8d8d; border: 1px solid #4a2a2a; border-radius: 6px; height: 24px; cursor: pointer; font-size: 11px; }

.log-controls { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; flex: 1; }
.log-level-select,
.log-search { height: 28px; border: 1px solid #2d2d2d; border-radius: 6px; background: #101010; color: #d5d5d5; padding: 0 8px; font-size: 12px; outline: none; }
.log-level-select { width: 102px; }
.log-search { width: min(280px, 34vw); min-width: 120px; }
.log-level-select:focus,
.log-search:focus { border-color: var(--provider-accent); }
.log-action { height: 28px; border: 1px solid #303030; border-radius: 6px; background: #151515; color: #c9c9c9; cursor: pointer; padding: 0 10px; font-size: 12px; }
.log-action:hover { border-color: var(--provider-border); color: #fff; background: var(--provider-soft); }
.log-action.danger { color: #ff8b8b; border-color: #4a2a2a; background: #1f1111; }
.log-body { min-height: 0; overflow-y: auto; padding: 6px 8px 10px; font-family: var(--font-mono); }
.structured-log-list,
.legacy-log-list { display: flex; flex-direction: column; gap: 3px; }
.structured-log { display: grid; grid-template-columns: 72px 58px 120px minmax(160px, 260px) minmax(220px, 1fr); gap: 8px; align-items: start; min-width: 0; border: 1px solid transparent; border-radius: 6px; padding: 5px 8px; color: #a9d8ff; background: rgba(255,255,255,0.015); font-size: 11px; line-height: 1.45; }
.structured-log:hover { border-color: #262626; background: rgba(255,255,255,0.035); }
.log-time,
.log-thread,
.log-logger { color: #6f7884; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.log-level { font-weight: 900; color: #9ac7ff; }
.log-message { color: #c8e6ff; white-space: pre-wrap; word-break: break-word; }
.structured-log.level-error { background: rgba(127, 29, 29, 0.16); }
.structured-log.level-error .log-level,
.structured-log.level-error .log-message { color: #ffb4b4; }
.structured-log.level-warn { background: rgba(120, 68, 10, 0.16); }
.structured-log.level-warn .log-level,
.structured-log.level-warn .log-message { color: #ffd48a; }
.structured-log.level-debug .log-level,
.structured-log.level-debug .log-message { color: #b9b9b9; }
.log-line { color: #a9d8ff; font-family: var(--font-mono); font-size: 12px; padding: 2px 4px; white-space: pre-wrap; word-break: break-word; }
.log-empty { color: #555; font-size: 12px; padding: 18px 4px; }
.btn-clear { margin-top: auto; display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid var(--border); color: #ff5555; padding: 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.thinking-dots span { animation: dots 1.5s infinite; opacity: 0; }
.thinking-dots span:nth-child(2) { animation-delay: 0.5s; }
.thinking-dots span:nth-child(3) { animation-delay: 1s; }
@keyframes dots { 0% { opacity: 0; } 50% { opacity: 1; } 100% { opacity: 0; } }
@media (max-width: 1200px) {
  .chat-viewport, .input-container { padding-left: 16px; padding-right: 16px; }
  .speech-layout, .prompt-layout { grid-template-columns: 1fr; }
  .speech-grid { grid-template-columns: 1fr 1fr; }
  .voice-history-card { grid-template-columns: 1fr; }
  .home-overview { grid-template-columns: repeat(2, minmax(160px, 1fr)); }
  .preview-btn { min-width: 86px; }
  .settings-grid { grid-template-columns: 1fr; }
}
</style>
