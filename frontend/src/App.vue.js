/// <reference types="../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { systemApi, settingsApi, chatApi, deepSeekApi, imageApi, ttsApi } from "./utils/api";
import { resolveApiUrl } from "./utils/urlUtils";
import { Terminal, Send, Trash2, Cpu, Settings, Image as ImageIcon, Volume2, FileText, RefreshCw, History, BookOpen, Activity, FolderOpen, Star, Wrench, Download, Home, Bell, X } from "lucide-vue-next";
const logs = ref([]);
const logEntries = ref([]);
const logLevel = ref("");
const logQuery = ref("");
const logLoading = ref(false);
const logContainer = ref(null);
const activeProvider = ref("minimax");
const activeView = ref("home");
const minimaxMessages = ref([]);
const deepSeekMessages = ref([]);
const chatSessions = ref([]);
const activeSessionIds = ref({ minimax: "", deepseek: "" });
const taskQueue = ref([]);
const notifications = ref([]);
const inputText = ref("");
const isThinking = ref(false);
const chatContainer = ref(null);
const imageHistories = ref([]);
const ttsHistories = ref([]);
const voices = ref([]);
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
const deepSeekBalance = ref(null);
const deepSeekUsage = ref(null);
const accountLoading = ref(false);
const settingsLoading = ref(false);
const settingsState = ref({});
const settingsDraft = ref({
    minimax: { apiKey: "", model: "" },
    deepseek: { apiKey: "", model: "" }
});
const sidebarWidth = ref(248);
const systemHealth = ref("未知");
const promptTemplates = ref([
    { id: "image-detail", title: "图片生成细化", provider: "MiniMax", content: "请帮我生成一张图片：主体是……，风格是……，画面比例是……，细节包括……" },
    { id: "tts-polish", title: "语音文案润色", provider: "MiniMax", content: "请把下面这段话改成适合语音播报的口吻，要求自然、清晰、有节奏：" },
    { id: "reasoning", title: "深度分析", provider: "DeepSeek", content: "请分步骤分析这个问题，先列出关键假设，再给出结论和风险：" }
]);
const promptDraft = ref({ title: "", content: "", provider: "通用" });
const favorites = ref([]);
const selectedAsset = ref(null);
let logEventSource = null;
let resizing = null;
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
};
const messages = computed(() => activeProvider.value === "minimax" ? minimaxMessages.value : deepSeekMessages.value);
const activeMeta = computed(() => providerMeta[activeProvider.value]);
const minimaxModels = computed(() => settingsState.value?.minimax?.models || []);
const deepSeekModels = computed(() => settingsState.value?.deepseek?.models || []);
const minimaxSubViews = ["speech", "imageHistory", "ttsHistory"];
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
const assetItems = computed(() => [
    ...imageHistories.value.map(item => ({
        id: String(item.id),
        type: "image",
        title: item.prompt || "历史图片",
        subtitle: item.createdAt || "",
        url: String(item.url || "")
    })),
    ...ttsHistories.value.map(item => ({
        id: String(item.id),
        type: "audio",
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
const addLog = (msg) => {
    logs.value.push(msg);
    if (logs.value.length > 200)
        logs.value.shift();
    nextTick(() => {
        if (logContainer.value)
            logContainer.value.scrollTop = logContainer.value.scrollHeight;
    });
};
const saveNotifications = () => {
    localStorage.setItem("weizhi.notifications", JSON.stringify(notifications.value));
};
const addNotification = (level, title, message) => {
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
const removeNotification = (id) => {
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
    }
    catch (err) {
        addLog("Log history load failed: " + (err?.message || "unknown error"));
    }
    finally {
        logLoading.value = false;
    }
};
const clearLogEntries = async () => {
    try {
        await systemApi.clearLogs();
        logs.value = [];
        logEntries.value = [];
    }
    catch (err) {
        addLog("Log clear failed: " + (err?.message || "unknown error"));
    }
};
const formatLogTime = (value) => {
    if (!value)
        return "--";
    return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
};
const logLevelClass = (level) => `level-${String(level || "info").toLowerCase()}`;
const mediaUrl = (url) => resolveApiUrl(url);
const loadHistories = async () => {
    const [imageRes, ttsRes] = await Promise.all([imageApi.history(), ttsApi.history()]);
    imageHistories.value = imageRes.data?.histories || [];
    ttsHistories.value = ttsRes.data?.histories || [];
};
const scrollChatToBottom = () => {
    nextTick(() => {
        if (chatContainer.value)
            chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
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
    }
    catch (err) {
        addLog("DeepSeek account load failed: " + (err?.message || "unknown error"));
    }
    finally {
        accountLoading.value = false;
    }
};
const defaultSession = (provider) => {
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
const syncMessagesFromSession = (provider) => {
    const session = chatSessions.value.find(item => item.id === activeSessionIds.value[provider]);
    if (provider === "minimax")
        minimaxMessages.value = session ? [...session.messages] : [];
    else
        deepSeekMessages.value = session ? [...session.messages] : [];
};
const saveActiveSession = (provider) => {
    const session = chatSessions.value.find(item => item.id === activeSessionIds.value[provider]);
    if (!session)
        return;
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
    ["minimax", "deepseek"].forEach(provider => {
        if (!chatSessions.value.find(session => session.id === activeSessionIds.value[provider])) {
            activeSessionIds.value[provider] = chatSessions.value.find(session => session.provider === provider)?.id || "";
        }
        syncMessagesFromSession(provider);
    });
    saveSessions();
};
const createSession = (provider = activeProvider.value) => {
    const session = defaultSession(provider);
    session.title = provider === "minimax" ? "新的 MiniMax 会话" : "新的 DeepSeek 会话";
    chatSessions.value.unshift(session);
    activeSessionIds.value[provider] = session.id;
    activeProvider.value = provider;
    activeView.value = "chat";
    syncMessagesFromSession(provider);
    saveSessions();
};
const openSession = (session) => {
    activeSessionIds.value[session.provider] = session.id;
    activeProvider.value = session.provider;
    activeView.value = "chat";
    syncMessagesFromSession(session.provider);
    saveSessions();
    scrollChatToBottom();
};
const renameSession = (session) => {
    const title = window.prompt("会话名称", session.title);
    if (!title?.trim())
        return;
    session.title = title.trim();
    session.updatedAt = new Date().toISOString();
    saveSessions();
};
const deleteSession = (session) => {
    chatSessions.value = chatSessions.value.filter(item => item.id !== session.id);
    if (activeSessionIds.value[session.provider] === session.id) {
        const next = chatSessions.value.find(item => item.provider === session.provider) || defaultSession(session.provider);
        if (!chatSessions.value.find(item => item.id === next.id))
            chatSessions.value.push(next);
        activeSessionIds.value[session.provider] = next.id;
        syncMessagesFromSession(session.provider);
    }
    saveSessions();
};
const saveTasks = () => {
    localStorage.setItem("weizhi.taskQueue", JSON.stringify(taskQueue.value));
};
const createTask = (title, provider, detail) => {
    const task = {
        id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        provider,
        status: "running",
        createdAt: new Date().toISOString(),
        detail
    };
    taskQueue.value.unshift(task);
    saveTasks();
    return task;
};
const finishTask = (task, status, detail) => {
    task.status = status;
    if (detail)
        task.detail = detail;
    if (status === "success")
        addNotification("success", task.title, detail || "任务已完成");
    if (status === "failed")
        addNotification("error", task.title, detail || "任务失败");
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
    }
    catch (err) {
        addLog("Settings load failed: " + (err?.message || "unknown error"));
    }
    finally {
        settingsLoading.value = false;
    }
};
const refreshProviderModels = async (provider) => {
    const res = await settingsApi.models(provider);
    settingsState.value = {
        ...settingsState.value,
        [provider]: {
            ...(settingsState.value?.[provider] || {}),
            models: res.data || []
        }
    };
};
const saveProviderSettings = async (provider) => {
    settingsLoading.value = true;
    try {
        const draft = settingsDraft.value[provider];
        const payload = { model: draft.model };
        if (draft.apiKey.trim())
            payload.apiKey = draft.apiKey.trim();
        const res = await settingsApi.update(provider, payload);
        settingsState.value = { ...settingsState.value, [provider]: res.data };
        draft.apiKey = "";
        addLog(`${provider} settings saved.`);
        addNotification("success", "模型设置已保存", `${providerMeta[provider].label} 设置已更新`);
        if (provider === "deepseek")
            await loadDeepSeekAccount();
    }
    catch (err) {
        addNotification("error", "设置保存失败", err?.message || "unknown error");
        addLog("Settings save failed: " + (err?.message || "unknown error"));
    }
    finally {
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
    }
    catch {
        systemHealth.value = "异常";
    }
    await Promise.all([loadSettings(), loadDeepSeekAccount()]);
};
const handlePreview = async () => {
    if (!previewText.value.trim())
        return;
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
    }
    catch (err) {
        finishTask(task, "failed", err?.message || "Preview 失败");
        addLog("TTS preview failed: " + (err?.message || "unknown error"));
    }
    finally {
        previewLoading.value = false;
    }
};
const handleGenerateTts = async () => {
    if (!previewText.value.trim())
        return;
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
    }
    catch (err) {
        finishTask(task, "failed", err?.message || "语音生成失败");
        addLog("TTS generate failed: " + (err?.message || "unknown error"));
    }
    finally {
        generateLoading.value = false;
    }
};
const deleteImageHistory = async (id) => {
    await imageApi.deleteHistory(id);
    await loadHistories();
};
const clearImageHistory = async () => {
    await imageApi.clearHistory();
    await loadHistories();
};
const deleteTtsHistory = async (id) => {
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
const isFavorite = (id) => favorites.value.some(item => item.id === id);
const addFavorite = (item) => {
    if (isFavorite(item.id))
        return;
    favorites.value.unshift(item);
    saveFavorites();
    addNotification("success", "已加入收藏", item.title);
};
const removeFavorite = (id) => {
    favorites.value = favorites.value.filter(item => item.id !== id);
    saveFavorites();
};
const favoriteMessage = (message, index) => {
    addFavorite({
        id: `${activeProvider.value}-message-${index}`,
        type: "text",
        title: `${activeMeta.value.label} ${message.role === "user" ? "用户消息" : "AI 回复"}`,
        subtitle: new Date().toLocaleString("zh-CN", { hour12: false }),
        content: message.content
    });
};
const favoriteAsset = (asset) => {
    addFavorite({
        id: `${asset.type}-${asset.id}`,
        type: asset.type,
        title: asset.title,
        subtitle: asset.subtitle,
        url: asset.url
    });
};
const openAssetDetail = (asset) => {
    selectedAsset.value = asset;
};
const closeAssetDetail = () => {
    selectedAsset.value = null;
};
const downloadTextFile = (filename, content, type = "application/json") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    addNotification("success", "导出完成", filename);
};
const exportJson = (scope) => {
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
        if (!raw)
            return;
        const data = JSON.parse(raw);
        if (typeof data.sidebarWidth === "number")
            sidebarWidth.value = Math.min(420, Math.max(180, data.sidebarWidth));
    }
    catch {
        // Ignore invalid local storage state.
    }
};
const startResize = (target, event) => {
    resizing = target;
    event.preventDefault();
    document.body.classList.add("is-resizing");
    window.addEventListener("mousemove", resizeLayout);
    window.addEventListener("mouseup", stopResize);
};
const resizeLayout = (event) => {
    if (!resizing)
        return;
    if (resizing === "sidebar") {
        sidebarWidth.value = Math.min(420, Math.max(180, event.clientX));
    }
};
const stopResize = () => {
    if (resizing)
        persistLayout();
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
        if (storedSessions)
            chatSessions.value = JSON.parse(storedSessions);
        const storedActive = localStorage.getItem("weizhi.activeSessionIds");
        if (storedActive)
            activeSessionIds.value = { ...activeSessionIds.value, ...JSON.parse(storedActive) };
    }
    catch {
        // Fall back to default local sessions.
    }
    ensureSessions();
    try {
        const storedTasks = localStorage.getItem("weizhi.taskQueue");
        if (storedTasks)
            taskQueue.value = JSON.parse(storedTasks);
    }
    catch {
        // Keep task queue empty if local storage is invalid.
    }
    try {
        const storedNotifications = localStorage.getItem("weizhi.notifications");
        if (storedNotifications)
            notifications.value = JSON.parse(storedNotifications);
    }
    catch {
        // Keep notifications empty if local storage is invalid.
    }
    try {
        const storedPrompts = localStorage.getItem("weizhi.promptTemplates");
        if (storedPrompts)
            promptTemplates.value = JSON.parse(storedPrompts);
    }
    catch {
        // Keep built-in templates if local prompt storage is invalid.
    }
    try {
        const storedFavorites = localStorage.getItem("weizhi.favorites");
        if (storedFavorites)
            favorites.value = JSON.parse(storedFavorites);
    }
    catch {
        // Keep favorites empty if local storage is invalid.
    }
});
onBeforeUnmount(() => {
    if (logEventSource)
        logEventSource.close();
    stopResize();
});
const handleSend = () => {
    if (!inputText.value.trim() || isThinking.value)
        return;
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
        ? deepSeekApi.ask(userMsg, targetMessages.map((message) => ({ role: message.role, content: message.content })))
        : chatApi.ask(userMsg);
    request.then(async (res) => {
        const payload = res.data;
        const content = typeof payload?.text === "string" ? payload.text : (typeof payload === "string" ? payload : JSON.stringify(payload));
        const media = Array.isArray(payload?.media) ? payload.media : [];
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
const switchProvider = (provider) => {
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
const openMiniMaxHistory = async (view) => {
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
    if (activeProvider.value === "minimax")
        minimaxMessages.value = [];
    else
        deepSeekMessages.value = [];
    saveActiveSession(activeProvider.value);
};
const clearSession = (provider) => {
    const session = chatSessions.value.find(item => item.id === activeSessionIds.value[provider]);
    if (session) {
        session.messages = [];
        session.updatedAt = new Date().toISOString();
    }
    if (provider === "minimax")
        minimaxMessages.value = [];
    else
        deepSeekMessages.value = [];
    saveSessions();
};
const savePromptTemplates = () => {
    localStorage.setItem("weizhi.promptTemplates", JSON.stringify(promptTemplates.value));
};
const addPromptTemplate = () => {
    if (!promptDraft.value.title.trim() || !promptDraft.value.content.trim())
        return;
    promptTemplates.value.unshift({
        id: String(Date.now()),
        title: promptDraft.value.title.trim(),
        content: promptDraft.value.content.trim(),
        provider: promptDraft.value.provider
    });
    promptDraft.value = { title: "", content: "", provider: "通用" };
    savePromptTemplates();
};
const deletePromptTemplate = (id) => {
    promptTemplates.value = promptTemplates.value.filter(item => item.id !== id);
    savePromptTemplates();
};
const usePromptTemplate = (template) => {
    activeView.value = "chat";
    if (template.provider === "MiniMax")
        activeProvider.value = "minimax";
    if (template.provider === "DeepSeek")
        activeProvider.value = "deepseek";
    let content = template.content;
    const variables = Array.from(new Set([...content.matchAll(/\{([^{}]+)\}/g)].map(match => match[1].trim()).filter(Boolean)));
    for (const variable of variables) {
        const value = window.prompt(`填写变量：${variable}`, "");
        if (value === null)
            return;
        const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        content = content.replace(new RegExp(`\\{${escaped}\\}`, "g"), value);
    }
    inputText.value = content;
    addNotification("info", "已套用 Prompt 模板", template.title);
    scrollChatToBottom();
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "app-container" },
    ...{ class: (__VLS_ctx.activeView === 'home' ? 'provider-home' : `provider-${__VLS_ctx.activeProvider}`) },
    ...{ style: ({
            '--sidebar-width': `${__VLS_ctx.sidebarWidth}px`
        }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "sidebar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "brand" },
});
const __VLS_0 = {}.Cpu;
/** @type {[typeof __VLS_components.Cpu, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "icon-accent" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "icon-accent" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "nav-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openHome) },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'home' }) },
});
const __VLS_4 = {}.Home;
/** @type {[typeof __VLS_components.Home, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    size: (16),
}));
const __VLS_6 = __VLS_5({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.switchProvider('minimax');
        } },
    ...{ class: "nav-item provider-entry minimax-entry" },
    ...{ class: ({ active: __VLS_ctx.activeProvider === 'minimax' }) },
});
const __VLS_8 = {}.Terminal;
/** @type {[typeof __VLS_components.Terminal, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    size: (16),
}));
const __VLS_10 = __VLS_9({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
if (__VLS_ctx.showMiniMaxSubnav) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "nav-subgroup" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openSpeech) },
        ...{ class: "nav-subitem" },
        ...{ class: ({ active: __VLS_ctx.activeView === 'speech' }) },
    });
    const __VLS_12 = {}.Volume2;
    /** @type {[typeof __VLS_components.Volume2, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        size: (14),
    }));
    const __VLS_14 = __VLS_13({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showMiniMaxSubnav))
                    return;
                __VLS_ctx.openMiniMaxHistory('imageHistory');
            } },
        ...{ class: "nav-subitem" },
        ...{ class: ({ active: __VLS_ctx.activeView === 'imageHistory' }) },
    });
    const __VLS_16 = {}.ImageIcon;
    /** @type {[typeof __VLS_components.ImageIcon, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        size: (14),
    }));
    const __VLS_18 = __VLS_17({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.showMiniMaxSubnav))
                    return;
                __VLS_ctx.openMiniMaxHistory('ttsHistory');
            } },
        ...{ class: "nav-subitem" },
        ...{ class: ({ active: __VLS_ctx.activeView === 'ttsHistory' }) },
    });
    const __VLS_20 = {}.Volume2;
    /** @type {[typeof __VLS_components.Volume2, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        size: (14),
    }));
    const __VLS_22 = __VLS_21({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.switchProvider('deepseek');
        } },
    ...{ class: "nav-item provider-entry deepseek-entry" },
    ...{ class: ({ active: __VLS_ctx.activeProvider === 'deepseek' }) },
});
const __VLS_24 = {}.Terminal;
/** @type {[typeof __VLS_components.Terminal, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    size: (16),
}));
const __VLS_26 = __VLS_25({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeView = 'sessions';
        } },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'sessions' }) },
});
const __VLS_28 = {}.History;
/** @type {[typeof __VLS_components.History, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    size: (16),
}));
const __VLS_30 = __VLS_29({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeView = 'tasks';
        } },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'tasks' }) },
});
const __VLS_32 = {}.Activity;
/** @type {[typeof __VLS_components.Activity, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    size: (16),
}));
const __VLS_34 = __VLS_33({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeView = 'notifications';
            __VLS_ctx.markNotificationsRead();
        } },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'notifications' }) },
});
const __VLS_36 = {}.Bell;
/** @type {[typeof __VLS_components.Bell, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    size: (16),
}));
const __VLS_38 = __VLS_37({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
if (__VLS_ctx.unreadNotificationCount) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
        ...{ class: "nav-badge" },
    });
    (__VLS_ctx.unreadNotificationCount);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeView = 'prompts';
        } },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'prompts' }) },
});
const __VLS_40 = {}.BookOpen;
/** @type {[typeof __VLS_components.BookOpen, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    size: (16),
}));
const __VLS_42 = __VLS_41({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openAssets) },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'assets' }) },
});
const __VLS_44 = {}.FolderOpen;
/** @type {[typeof __VLS_components.FolderOpen, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    size: (16),
}));
const __VLS_46 = __VLS_45({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeView = 'favorites';
        } },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'favorites' }) },
});
const __VLS_48 = {}.Star;
/** @type {[typeof __VLS_components.Star, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    size: (16),
}));
const __VLS_50 = __VLS_49({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openDiagnostics) },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'diagnostics' }) },
});
const __VLS_52 = {}.Wrench;
/** @type {[typeof __VLS_components.Wrench, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    size: (16),
}));
const __VLS_54 = __VLS_53({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openExports) },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'exports' }) },
});
const __VLS_56 = {}.Download;
/** @type {[typeof __VLS_components.Download, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    size: (16),
}));
const __VLS_58 = __VLS_57({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openApiStatus) },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'apiStatus' }) },
});
const __VLS_60 = {}.Activity;
/** @type {[typeof __VLS_components.Activity, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    size: (16),
}));
const __VLS_62 = __VLS_61({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openLogs) },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'logs' }) },
});
const __VLS_64 = {}.FileText;
/** @type {[typeof __VLS_components.FileText, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    size: (16),
}));
const __VLS_66 = __VLS_65({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openSettings) },
    ...{ class: "nav-item" },
    ...{ class: ({ active: __VLS_ctx.activeView === 'settings' }) },
});
const __VLS_68 = {}.Settings;
/** @type {[typeof __VLS_components.Settings, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    size: (16),
}));
const __VLS_70 = __VLS_69({
    size: (16),
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.clearCurrentConversation) },
    ...{ class: "btn-clear" },
});
const __VLS_72 = {}.Trash2;
/** @type {[typeof __VLS_components.Trash2, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    size: (14),
}));
const __VLS_74 = __VLS_73({
    size: (14),
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onMousedown: (...[$event]) => {
            __VLS_ctx.startResize('sidebar', $event);
        } },
    ...{ class: "vertical-resizer sidebar-resizer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "main-content" },
});
if (__VLS_ctx.activeView === 'home') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "home-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-hero" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeView === 'home'))
                    return;
                __VLS_ctx.switchProvider('minimax');
            } },
        ...{ class: "preview-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeView === 'home'))
                    return;
                __VLS_ctx.switchProvider('deepseek');
            } },
        ...{ class: "preview-btn secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openAssets) },
        ...{ class: "preview-btn secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "home-overview" },
    });
    for (const [stat] of __VLS_getVForSourceType((__VLS_ctx.dashboardStats))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeView === 'home'))
                        return;
                    stat.label === '任务' ? __VLS_ctx.activeView = 'tasks' : stat.label === '会话' ? __VLS_ctx.activeView = 'sessions' : stat.label === '素材' ? __VLS_ctx.openAssets() : __VLS_ctx.activeView = 'favorites';
                } },
            key: (stat.label),
            ...{ class: "home-tile" },
        });
        const __VLS_76 = {}.Activity;
        /** @type {[typeof __VLS_components.Activity, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            size: (18),
        }));
        const __VLS_78 = __VLS_77({
            size: (18),
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (stat.value);
        (stat.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (stat.detail);
    }
    if (__VLS_ctx.recentNotifications.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "home-notices" },
        });
        for (const [notice] of __VLS_getVForSourceType((__VLS_ctx.recentNotifications))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (notice.id),
                ...{ class: "home-notice" },
                ...{ class: (`notice-${notice.level}`) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (notice.title);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (notice.message);
        }
    }
}
else if (__VLS_ctx.activeView === 'settings') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-view" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadSettings) },
        ...{ class: "icon-btn" },
        title: "刷新设置",
        disabled: (__VLS_ctx.settingsLoading),
    });
    const __VLS_80 = {}.RefreshCw;
    /** @type {[typeof __VLS_components.RefreshCw, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        size: (15),
    }));
    const __VLS_82 = __VLS_81({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-card minimax-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-card-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.settingsState?.minimax?.apiKeyConfigured ? __VLS_ctx.settingsState?.minimax?.apiKeyMasked : "未配置");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "password",
        placeholder: "留空则不修改当前 Key",
    });
    (__VLS_ctx.settingsDraft.minimax.apiKey);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.settingsDraft.minimax.model),
    });
    for (const [model] of __VLS_getVForSourceType((__VLS_ctx.minimaxModels))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (model.id),
            value: (model.id),
        });
        (model.name || model.id);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!(__VLS_ctx.activeView === 'settings'))
                    return;
                __VLS_ctx.refreshProviderModels('minimax');
            } },
        ...{ class: "preview-btn secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!(__VLS_ctx.activeView === 'settings'))
                    return;
                __VLS_ctx.saveProviderSettings('minimax');
            } },
        ...{ class: "save-settings-btn" },
        disabled: (__VLS_ctx.settingsLoading),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-card deepseek-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-card-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.settingsState?.deepseek?.apiKeyConfigured ? __VLS_ctx.settingsState?.deepseek?.apiKeyMasked : "未配置");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "password",
        placeholder: "留空则不修改当前 Key",
    });
    (__VLS_ctx.settingsDraft.deepseek.apiKey);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "settings-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.settingsDraft.deepseek.model),
    });
    for (const [model] of __VLS_getVForSourceType((__VLS_ctx.deepSeekModels))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (model.id),
            value: (model.id),
        });
        (model.name || model.id);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!(__VLS_ctx.activeView === 'settings'))
                    return;
                __VLS_ctx.refreshProviderModels('deepseek');
            } },
        ...{ class: "preview-btn secondary" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!(__VLS_ctx.activeView === 'settings'))
                    return;
                __VLS_ctx.saveProviderSettings('deepseek');
            } },
        ...{ class: "save-settings-btn deepseek-save" },
        disabled: (__VLS_ctx.settingsLoading),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "settings-hint" },
    });
}
else if (__VLS_ctx.activeView === 'logs') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page logs-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "log-controls page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (__VLS_ctx.loadLogEntries) },
        value: (__VLS_ctx.logLevel),
        ...{ class: "log-level-select" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "ERROR",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "WARN",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "INFO",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "DEBUG",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onKeydown: (__VLS_ctx.loadLogEntries) },
        ...{ class: "log-search" },
        placeholder: "搜索日志、线程、类名",
    });
    (__VLS_ctx.logQuery);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadLogEntries) },
        ...{ class: "log-action" },
        disabled: (__VLS_ctx.logLoading),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearLogEntries) },
        ...{ class: "log-action danger" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body log-body-page" },
        ref: "logContainer",
    });
    /** @type {typeof __VLS_ctx.logContainer} */ ;
    if (__VLS_ctx.logEntries.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "structured-log-list" },
        });
        for (const [entry] of __VLS_getVForSourceType((__VLS_ctx.logEntries))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (entry.id),
                ...{ class: "structured-log" },
                ...{ class: (__VLS_ctx.logLevelClass(entry.level)) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-time" },
            });
            (__VLS_ctx.formatLogTime(entry.timestamp));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-level" },
            });
            (entry.level);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-thread" },
            });
            (entry.thread);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-logger" },
                title: (entry.logger),
            });
            (entry.logger);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-message" },
            });
            (entry.message);
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "log-empty" },
        });
    }
}
else if (__VLS_ctx.activeView === 'speech') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadVoices) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!(__VLS_ctx.activeView === 'speech'))
                    return;
                __VLS_ctx.openMiniMaxHistory('ttsHistory');
            } },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body speech-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "speech-composer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.previewText),
        ...{ class: "tts-preview-input speech-textarea" },
        placeholder: "输入试听文本（preview）",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "speech-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.previewVoiceId),
    });
    for (const [v] of __VLS_getVForSourceType((__VLS_ctx.voices))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (v.voiceId),
            value: (v.voiceId),
        });
        (v.name);
        (v.voiceId);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.previewFormat),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "mp3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "wav",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: "flac",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        step: "0.1",
        min: "0.5",
        max: "2",
    });
    (__VLS_ctx.previewSpeed);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        step: "0.1",
        min: "0.1",
        max: "2",
    });
    (__VLS_ctx.previewVol);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        step: "1",
        min: "-12",
        max: "12",
    });
    (__VLS_ctx.previewPitch);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        step: "1000",
    });
    (__VLS_ctx.previewSampleRate);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "number",
        step: "1000",
    });
    (__VLS_ctx.previewBitrate);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "speech-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handlePreview) },
        ...{ class: "preview-btn" },
        disabled: (__VLS_ctx.previewLoading),
    });
    (__VLS_ctx.previewLoading ? "生成中..." : "Preview 试听");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleGenerateTts) },
        ...{ class: "preview-btn secondary" },
        disabled: (__VLS_ctx.generateLoading),
    });
    (__VLS_ctx.generateLoading ? "生成中..." : "完整生成");
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "speech-result" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    if (__VLS_ctx.previewAudioUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.audio)({
            src: (__VLS_ctx.previewAudioUrl),
            controls: true,
            ...{ class: "audio-preview" },
        });
    }
    if (__VLS_ctx.generateAudioUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.audio)({
            src: (__VLS_ctx.generateAudioUrl),
            controls: true,
            ...{ class: "audio-preview" },
        });
    }
    if (!__VLS_ctx.previewAudioUrl && !__VLS_ctx.generateAudioUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-module" },
        });
    }
}
else if (__VLS_ctx.activeView === 'sessions') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!(__VLS_ctx.activeView === 'sessions'))
                    return;
                __VLS_ctx.createSession('minimax');
            } },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!(__VLS_ctx.activeView === 'sessions'))
                    return;
                __VLS_ctx.createSession('deepseek');
            } },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body session-grid" },
    });
    for (const [session] of __VLS_getVForSourceType((__VLS_ctx.sessionSummaries))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (session.id),
            ...{ class: "session-card" },
            ...{ class: (`${session.provider}-session-card`) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (session.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.providerMeta[session.provider].label);
        (session.subtitle);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (session.last);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "session-card-footer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
        (session.count);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    __VLS_ctx.openSession(session);
                } },
            ...{ class: "log-action" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    __VLS_ctx.renameSession(session);
                } },
            ...{ class: "log-action" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    __VLS_ctx.deleteSession(session);
                } },
            ...{ class: "log-action danger" },
        });
    }
}
else if (__VLS_ctx.activeView === 'tasks') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearFinishedTasks) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body task-list" },
    });
    for (const [task] of __VLS_getVForSourceType((__VLS_ctx.taskQueue))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (task.id),
            ...{ class: "task-card" },
            ...{ class: (`task-${task.status}`) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "task-status" },
        });
        (task.status);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (task.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (task.detail);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (task.provider);
        (new Date(task.createdAt).toLocaleString("zh-CN", { hour12: false }));
    }
    if (!__VLS_ctx.taskQueue.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-module" },
        });
    }
}
else if (__VLS_ctx.activeView === 'notifications') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.markNotificationsRead) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!(__VLS_ctx.activeView === 'notifications'))
                    return;
                __VLS_ctx.notifications = [];
                __VLS_ctx.saveNotifications();
            } },
        ...{ class: "log-action danger" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body notification-list" },
    });
    for (const [notice] of __VLS_getVForSourceType((__VLS_ctx.notifications))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (notice.id),
            ...{ class: "notification-card" },
            ...{ class: ([`notice-${notice.level}`, { unread: !notice.read }]) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (notice.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (notice.message);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (new Date(notice.createdAt).toLocaleString("zh-CN", { hour12: false }));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    __VLS_ctx.removeNotification(notice.id);
                } },
            ...{ class: "icon-btn" },
        });
        const __VLS_84 = {}.X;
        /** @type {[typeof __VLS_components.X, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            size: (14),
        }));
        const __VLS_86 = __VLS_85({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    }
    if (!__VLS_ctx.notifications.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-module" },
        });
    }
}
else if (__VLS_ctx.activeView === 'prompts') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body prompt-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "prompt-editor" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        placeholder: "模板名称",
    });
    (__VLS_ctx.promptDraft.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        value: (__VLS_ctx.promptDraft.provider),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.promptDraft.content),
        placeholder: "模板内容，可使用 {主题}、{风格} 这样的变量",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.addPromptTemplate) },
        ...{ class: "preview-btn" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "prompt-list" },
    });
    for (const [template] of __VLS_getVForSourceType((__VLS_ctx.promptTemplates))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (template.id),
            ...{ class: "prompt-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "prompt-card-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (template.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (template.provider);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (template.content);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-controls" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    __VLS_ctx.usePromptTemplate(template);
                } },
            ...{ class: "log-action" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    __VLS_ctx.deletePromptTemplate(template.id);
                } },
            ...{ class: "log-action danger" },
        });
    }
}
else if (__VLS_ctx.activeView === 'apiStatus') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadApiStatus) },
        ...{ class: "log-action" },
        disabled: (__VLS_ctx.settingsLoading || __VLS_ctx.accountLoading),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openSettings) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body status-layout" },
    });
    for (const [card] of __VLS_getVForSourceType((__VLS_ctx.apiStatusCards))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (card.name),
            ...{ class: "status-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (card.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (card.status);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (card.detail);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        ...{ class: "status-card wide-status" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "usage-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.deepSeekUsage?.requests || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.deepSeekUsage?.promptTokens || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.deepSeekUsage?.completionTokens || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.deepSeekUsage?.totalTokens || 0);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openDeepSeekUsage) },
        ...{ class: "open-usage-btn" },
    });
}
else if (__VLS_ctx.activeView === 'assets') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadHistories) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!(__VLS_ctx.activeView === 'assets'))
                    return;
                __VLS_ctx.exportJson('media');
            } },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body asset-grid" },
    });
    for (const [asset] of __VLS_getVForSourceType((__VLS_ctx.assetItems))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (`${asset.type}-${asset.id}`),
            ...{ class: "asset-card" },
        });
        if (asset.type === 'image') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                src: (__VLS_ctx.mediaUrl(asset.url)),
                alt: "asset image",
                ...{ class: "history-card-image" },
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "asset-audio-box" },
            });
            const __VLS_88 = {}.Volume2;
            /** @type {[typeof __VLS_components.Volume2, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                size: (30),
            }));
            const __VLS_90 = __VLS_89({
                size: (30),
            }, ...__VLS_functionalComponentArgsRest(__VLS_89));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.audio)({
                src: (__VLS_ctx.mediaUrl(asset.url)),
                controls: true,
                ...{ class: "audio-preview" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "history-card-meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (asset.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (asset.subtitle);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-controls" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'apiStatus'))
                        return;
                    if (!(__VLS_ctx.activeView === 'assets'))
                        return;
                    __VLS_ctx.openAssetDetail(asset);
                } },
            ...{ class: "log-action" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'apiStatus'))
                        return;
                    if (!(__VLS_ctx.activeView === 'assets'))
                        return;
                    __VLS_ctx.favoriteAsset(asset);
                } },
            ...{ class: "log-action" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            ...{ class: "log-action asset-link" },
            href: (__VLS_ctx.mediaUrl(asset.url)),
            target: "_blank",
        });
    }
    if (!__VLS_ctx.assetItems.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-module" },
        });
    }
}
else if (__VLS_ctx.activeView === 'favorites') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!!(__VLS_ctx.activeView === 'assets'))
                    return;
                if (!(__VLS_ctx.activeView === 'favorites'))
                    return;
                __VLS_ctx.exportJson('favorites');
            } },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body favorite-list" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.favorites))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (item.id),
            ...{ class: "favorite-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "prompt-card-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.type);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (item.subtitle);
        if (item.content) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            (item.content);
        }
        if (item.type === 'image' && item.url) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                src: (__VLS_ctx.mediaUrl(item.url)),
                alt: "favorite image",
                ...{ class: "favorite-image" },
            });
        }
        if (item.type === 'audio' && item.url) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.audio)({
                src: (__VLS_ctx.mediaUrl(item.url)),
                controls: true,
                ...{ class: "audio-preview" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'apiStatus'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'assets'))
                        return;
                    if (!(__VLS_ctx.activeView === 'favorites'))
                        return;
                    __VLS_ctx.removeFavorite(item.id);
                } },
            ...{ class: "log-action danger" },
        });
    }
    if (!__VLS_ctx.favorites.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-module" },
        });
    }
}
else if (__VLS_ctx.activeView === 'diagnostics') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openDiagnostics) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openLogs) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body status-layout" },
    });
    for (const [card] of __VLS_getVForSourceType((__VLS_ctx.diagnosticCards))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (card.name),
            ...{ class: "status-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (card.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (card.value);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (card.detail);
    }
}
else if (__VLS_ctx.activeView === 'exports') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body export-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!!(__VLS_ctx.activeView === 'assets'))
                    return;
                if (!!(__VLS_ctx.activeView === 'favorites'))
                    return;
                if (!!(__VLS_ctx.activeView === 'diagnostics'))
                    return;
                if (!(__VLS_ctx.activeView === 'exports'))
                    return;
                __VLS_ctx.exportJson('all');
            } },
        ...{ class: "export-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.exportMarkdown) },
        ...{ class: "export-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!!(__VLS_ctx.activeView === 'assets'))
                    return;
                if (!!(__VLS_ctx.activeView === 'favorites'))
                    return;
                if (!!(__VLS_ctx.activeView === 'diagnostics'))
                    return;
                if (!(__VLS_ctx.activeView === 'exports'))
                    return;
                __VLS_ctx.exportJson('chat');
            } },
        ...{ class: "export-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!!(__VLS_ctx.activeView === 'assets'))
                    return;
                if (!!(__VLS_ctx.activeView === 'favorites'))
                    return;
                if (!!(__VLS_ctx.activeView === 'diagnostics'))
                    return;
                if (!(__VLS_ctx.activeView === 'exports'))
                    return;
                __VLS_ctx.exportJson('media');
            } },
        ...{ class: "export-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!!(__VLS_ctx.activeView === 'assets'))
                    return;
                if (!!(__VLS_ctx.activeView === 'favorites'))
                    return;
                if (!!(__VLS_ctx.activeView === 'diagnostics'))
                    return;
                if (!(__VLS_ctx.activeView === 'exports'))
                    return;
                __VLS_ctx.exportJson('logs');
            } },
        ...{ class: "export-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!!(__VLS_ctx.activeView === 'assets'))
                    return;
                if (!!(__VLS_ctx.activeView === 'favorites'))
                    return;
                if (!!(__VLS_ctx.activeView === 'diagnostics'))
                    return;
                if (!(__VLS_ctx.activeView === 'exports'))
                    return;
                __VLS_ctx.exportJson('prompts');
            } },
        ...{ class: "export-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
else if (__VLS_ctx.activeView === 'imageHistory') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadHistories) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearImageHistory) },
        ...{ class: "log-action danger" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body history-page-grid" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.imageHistories))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (String(item.id)),
            ...{ class: "history-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (__VLS_ctx.mediaUrl(String(item.url || ''))),
            alt: "history image",
            ...{ class: "history-card-image" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "history-card-meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.prompt || "未命名提示词");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.createdAt);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "page-controls" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'apiStatus'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'assets'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'favorites'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'diagnostics'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'exports'))
                        return;
                    if (!(__VLS_ctx.activeView === 'imageHistory'))
                        return;
                    __VLS_ctx.favoriteAsset({ id: String(item.id), type: 'image', title: String(item.prompt || '历史图片'), subtitle: String(item.createdAt || ''), url: String(item.url || '') });
                } },
            ...{ class: "item-action-btn" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'apiStatus'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'assets'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'favorites'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'diagnostics'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'exports'))
                        return;
                    if (!(__VLS_ctx.activeView === 'imageHistory'))
                        return;
                    __VLS_ctx.deleteImageHistory(String(item.id));
                } },
            ...{ class: "item-action-btn" },
        });
    }
    if (!__VLS_ctx.imageHistories.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-module" },
        });
    }
}
else if (__VLS_ctx.activeView === 'ttsHistory') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "module-page" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-controls" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadHistories) },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.clearTtsHistory) },
        ...{ class: "log-action danger" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "module-body voice-history-list" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.ttsHistories))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (String(item.id)),
            ...{ class: "voice-history-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "history-card-meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.text || "空文本");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.voiceId);
        (item.format);
        (item.preview ? "preview" : "tts");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.audio)({
            src: (__VLS_ctx.mediaUrl(String(item.audioUrl || ''))),
            controls: true,
            ...{ class: "audio-preview" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'apiStatus'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'assets'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'favorites'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'diagnostics'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'exports'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'imageHistory'))
                        return;
                    if (!(__VLS_ctx.activeView === 'ttsHistory'))
                        return;
                    __VLS_ctx.favoriteAsset({ id: String(item.id), type: 'audio', title: String(item.text || '历史语音'), subtitle: `${item.voiceId || 'voice'} · ${item.format || 'audio'} · ${item.preview ? 'preview' : 'tts'}`, url: String(item.audioUrl || '') });
                } },
            ...{ class: "item-action-btn" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'apiStatus'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'assets'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'favorites'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'diagnostics'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'exports'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'imageHistory'))
                        return;
                    if (!(__VLS_ctx.activeView === 'ttsHistory'))
                        return;
                    __VLS_ctx.deleteTtsHistory(String(item.id));
                } },
            ...{ class: "item-action-btn" },
        });
    }
    if (!__VLS_ctx.ttsHistories.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-module" },
        });
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "workbench-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-column" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-toolbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar-title" },
    });
    const __VLS_92 = {}.Terminal;
    /** @type {[typeof __VLS_components.Terminal, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        size: (15),
    }));
    const __VLS_94 = __VLS_93({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.activeMeta.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
    (__VLS_ctx.chatSessions.find(session => session.id === __VLS_ctx.activeSessionIds[__VLS_ctx.activeProvider])?.title || __VLS_ctx.activeMeta.subtitle);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "toolbar-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!!(__VLS_ctx.activeView === 'assets'))
                    return;
                if (!!(__VLS_ctx.activeView === 'favorites'))
                    return;
                if (!!(__VLS_ctx.activeView === 'diagnostics'))
                    return;
                if (!!(__VLS_ctx.activeView === 'exports'))
                    return;
                if (!!(__VLS_ctx.activeView === 'imageHistory'))
                    return;
                if (!!(__VLS_ctx.activeView === 'ttsHistory'))
                    return;
                __VLS_ctx.openSession(__VLS_ctx.chatSessions.find(session => session.id === $event.target.value));
            } },
        ...{ class: "session-picker" },
        value: (__VLS_ctx.activeSessionIds[__VLS_ctx.activeProvider]),
    });
    for (const [session] of __VLS_getVForSourceType((__VLS_ctx.providerSessions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (session.id),
            value: (session.id),
        });
        (session.title);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.activeView === 'home'))
                    return;
                if (!!(__VLS_ctx.activeView === 'settings'))
                    return;
                if (!!(__VLS_ctx.activeView === 'logs'))
                    return;
                if (!!(__VLS_ctx.activeView === 'speech'))
                    return;
                if (!!(__VLS_ctx.activeView === 'sessions'))
                    return;
                if (!!(__VLS_ctx.activeView === 'tasks'))
                    return;
                if (!!(__VLS_ctx.activeView === 'notifications'))
                    return;
                if (!!(__VLS_ctx.activeView === 'prompts'))
                    return;
                if (!!(__VLS_ctx.activeView === 'apiStatus'))
                    return;
                if (!!(__VLS_ctx.activeView === 'assets'))
                    return;
                if (!!(__VLS_ctx.activeView === 'favorites'))
                    return;
                if (!!(__VLS_ctx.activeView === 'diagnostics'))
                    return;
                if (!!(__VLS_ctx.activeView === 'exports'))
                    return;
                if (!!(__VLS_ctx.activeView === 'imageHistory'))
                    return;
                if (!!(__VLS_ctx.activeView === 'ttsHistory'))
                    return;
                __VLS_ctx.createSession(__VLS_ctx.activeProvider);
            } },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.loadHistories) },
        ...{ class: "icon-btn" },
        title: "刷新历史",
    });
    const __VLS_96 = {}.RefreshCw;
    /** @type {[typeof __VLS_components.RefreshCw, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        size: (15),
    }));
    const __VLS_98 = __VLS_97({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-viewport" },
        ref: "chatContainer",
    });
    /** @type {typeof __VLS_ctx.chatContainer} */ ;
    if (__VLS_ctx.messages.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-state" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        (__VLS_ctx.activeMeta.emptyTitle);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.activeMeta.emptyDesc);
    }
    for (const [msg, i] of __VLS_getVForSourceType((__VLS_ctx.messages))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (i),
            ...{ class: "message-row" },
            ...{ class: (msg.role) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "message-avatar" },
        });
        (msg.role === "user" ? "U" : "AI");
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "message-content" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.activeView === 'home'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'settings'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'logs'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'speech'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'sessions'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'tasks'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'notifications'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'prompts'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'apiStatus'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'assets'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'favorites'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'diagnostics'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'exports'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'imageHistory'))
                        return;
                    if (!!(__VLS_ctx.activeView === 'ttsHistory'))
                        return;
                    __VLS_ctx.favoriteMessage(msg, i);
                } },
            ...{ class: "message-favorite" },
            title: "收藏消息",
        });
        const __VLS_100 = {}.Star;
        /** @type {[typeof __VLS_components.Star, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            size: (13),
        }));
        const __VLS_102 = __VLS_101({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (msg.content);
        for (const [m, j] of __VLS_getVForSourceType(((msg.media || []).filter(x => x.type === 'image')))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
                key: (`img-${j}`),
                src: (__VLS_ctx.mediaUrl(m.url)),
                ...{ class: "media-preview image-preview" },
                alt: "generated image",
            });
        }
        for (const [m, j] of __VLS_getVForSourceType(((msg.media || []).filter(x => x.type === 'audio')))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.audio)({
                key: (`audio-${j}`),
                src: (__VLS_ctx.mediaUrl(m.url)),
                ...{ class: "media-preview audio-preview" },
                controls: true,
            });
        }
    }
    if (__VLS_ctx.isThinking) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "message-row assistant" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "message-avatar" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "thinking-dots" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "input-container" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "input-wrapper" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        ...{ onKeydown: (__VLS_ctx.handleSend) },
        value: (__VLS_ctx.inputText),
        placeholder: "问问 Agent 任何事...",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.handleSend) },
        ...{ class: "send-btn" },
        disabled: (__VLS_ctx.isThinking),
    });
    const __VLS_104 = {}.Send;
    /** @type {[typeof __VLS_components.Send, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        size: (18),
    }));
    const __VLS_106 = __VLS_105({
        size: (18),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
}
if (__VLS_ctx.selectedAsset) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.closeAssetDetail) },
        ...{ class: "asset-modal-backdrop" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "asset-modal" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "asset-modal-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.selectedAsset.title);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.selectedAsset.subtitle);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.closeAssetDetail) },
        ...{ class: "icon-btn" },
    });
    const __VLS_108 = {}.X;
    /** @type {[typeof __VLS_components.X, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        size: (15),
    }));
    const __VLS_110 = __VLS_109({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "asset-modal-body" },
    });
    if (__VLS_ctx.selectedAsset.type === 'image') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (__VLS_ctx.mediaUrl(__VLS_ctx.selectedAsset.url)),
            alt: "asset detail",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.audio)({
            src: (__VLS_ctx.mediaUrl(__VLS_ctx.selectedAsset.url)),
            controls: true,
            ...{ class: "audio-preview" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "asset-modal-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedAsset))
                    return;
                __VLS_ctx.favoriteAsset(__VLS_ctx.selectedAsset);
            } },
        ...{ class: "log-action" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
        ...{ class: "log-action asset-link" },
        href: (__VLS_ctx.mediaUrl(__VLS_ctx.selectedAsset.url)),
        target: "_blank",
    });
}
/** @type {__VLS_StyleScopedClasses['app-container']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['brand']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-accent']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-group']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['provider-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['minimax-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-subgroup']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-subitem']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-subitem']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-subitem']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['provider-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['deepseek-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-clear']} */ ;
/** @type {__VLS_StyleScopedClasses['vertical-resizer']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar-resizer']} */ ;
/** @type {__VLS_StyleScopedClasses['main-content']} */ ;
/** @type {__VLS_StyleScopedClasses['home-page']} */ ;
/** @type {__VLS_StyleScopedClasses['home-hero']} */ ;
/** @type {__VLS_StyleScopedClasses['home-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['home-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['home-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['home-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['home-notices']} */ ;
/** @type {__VLS_StyleScopedClasses['home-notice']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-view']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['minimax-card']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-row']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['save-settings-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['deepseek-card']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-row']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['save-settings-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['deepseek-save']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['logs-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['log-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-level-select']} */ ;
/** @type {__VLS_StyleScopedClasses['log-search']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['log-body-page']} */ ;
/** @type {__VLS_StyleScopedClasses['structured-log-list']} */ ;
/** @type {__VLS_StyleScopedClasses['structured-log']} */ ;
/** @type {__VLS_StyleScopedClasses['log-time']} */ ;
/** @type {__VLS_StyleScopedClasses['log-level']} */ ;
/** @type {__VLS_StyleScopedClasses['log-thread']} */ ;
/** @type {__VLS_StyleScopedClasses['log-logger']} */ ;
/** @type {__VLS_StyleScopedClasses['log-message']} */ ;
/** @type {__VLS_StyleScopedClasses['log-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['speech-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['speech-composer']} */ ;
/** @type {__VLS_StyleScopedClasses['tts-preview-input']} */ ;
/** @type {__VLS_StyleScopedClasses['speech-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['speech-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['speech-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['speech-result']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-module']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['session-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['session-card']} */ ;
/** @type {__VLS_StyleScopedClasses['session-card-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['task-list']} */ ;
/** @type {__VLS_StyleScopedClasses['task-card']} */ ;
/** @type {__VLS_StyleScopedClasses['task-status']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-module']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-list']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-card']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-module']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-list']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-card']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['status-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['status-card']} */ ;
/** @type {__VLS_StyleScopedClasses['status-card']} */ ;
/** @type {__VLS_StyleScopedClasses['wide-status']} */ ;
/** @type {__VLS_StyleScopedClasses['usage-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['open-usage-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-card']} */ ;
/** @type {__VLS_StyleScopedClasses['history-card-image']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-audio-box']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['history-card-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-link']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-module']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['favorite-list']} */ ;
/** @type {__VLS_StyleScopedClasses['favorite-card']} */ ;
/** @type {__VLS_StyleScopedClasses['prompt-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['favorite-image']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-module']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['status-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['status-card']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['export-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['export-card']} */ ;
/** @type {__VLS_StyleScopedClasses['export-card']} */ ;
/** @type {__VLS_StyleScopedClasses['export-card']} */ ;
/** @type {__VLS_StyleScopedClasses['export-card']} */ ;
/** @type {__VLS_StyleScopedClasses['export-card']} */ ;
/** @type {__VLS_StyleScopedClasses['export-card']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['history-page-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['history-card']} */ ;
/** @type {__VLS_StyleScopedClasses['history-card-image']} */ ;
/** @type {__VLS_StyleScopedClasses['history-card-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['item-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['item-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-module']} */ ;
/** @type {__VLS_StyleScopedClasses['module-page']} */ ;
/** @type {__VLS_StyleScopedClasses['module-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['module-body']} */ ;
/** @type {__VLS_StyleScopedClasses['voice-history-list']} */ ;
/** @type {__VLS_StyleScopedClasses['voice-history-card']} */ ;
/** @type {__VLS_StyleScopedClasses['history-card-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['item-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['item-action-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-module']} */ ;
/** @type {__VLS_StyleScopedClasses['workbench-body']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-column']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['session-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['message-row']} */ ;
/** @type {__VLS_StyleScopedClasses['message-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['message-content']} */ ;
/** @type {__VLS_StyleScopedClasses['message-favorite']} */ ;
/** @type {__VLS_StyleScopedClasses['media-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['image-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['media-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['message-row']} */ ;
/** @type {__VLS_StyleScopedClasses['assistant']} */ ;
/** @type {__VLS_StyleScopedClasses['message-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['thinking-dots']} */ ;
/** @type {__VLS_StyleScopedClasses['input-container']} */ ;
/** @type {__VLS_StyleScopedClasses['input-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['send-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-modal-backdrop']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-modal-head']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-modal-body']} */ ;
/** @type {__VLS_StyleScopedClasses['audio-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-modal-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['log-action']} */ ;
/** @type {__VLS_StyleScopedClasses['asset-link']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Terminal: Terminal,
            Send: Send,
            Trash2: Trash2,
            Cpu: Cpu,
            Settings: Settings,
            ImageIcon: ImageIcon,
            Volume2: Volume2,
            FileText: FileText,
            RefreshCw: RefreshCw,
            History: History,
            BookOpen: BookOpen,
            Activity: Activity,
            FolderOpen: FolderOpen,
            Star: Star,
            Wrench: Wrench,
            Download: Download,
            Home: Home,
            Bell: Bell,
            X: X,
            logEntries: logEntries,
            logLevel: logLevel,
            logQuery: logQuery,
            logLoading: logLoading,
            logContainer: logContainer,
            activeProvider: activeProvider,
            activeView: activeView,
            chatSessions: chatSessions,
            activeSessionIds: activeSessionIds,
            taskQueue: taskQueue,
            notifications: notifications,
            inputText: inputText,
            isThinking: isThinking,
            chatContainer: chatContainer,
            imageHistories: imageHistories,
            ttsHistories: ttsHistories,
            voices: voices,
            previewText: previewText,
            previewVoiceId: previewVoiceId,
            previewFormat: previewFormat,
            previewSpeed: previewSpeed,
            previewVol: previewVol,
            previewPitch: previewPitch,
            previewSampleRate: previewSampleRate,
            previewBitrate: previewBitrate,
            previewAudioUrl: previewAudioUrl,
            generateAudioUrl: generateAudioUrl,
            previewLoading: previewLoading,
            generateLoading: generateLoading,
            deepSeekUsage: deepSeekUsage,
            accountLoading: accountLoading,
            settingsLoading: settingsLoading,
            settingsState: settingsState,
            settingsDraft: settingsDraft,
            sidebarWidth: sidebarWidth,
            promptTemplates: promptTemplates,
            promptDraft: promptDraft,
            favorites: favorites,
            selectedAsset: selectedAsset,
            providerMeta: providerMeta,
            messages: messages,
            activeMeta: activeMeta,
            minimaxModels: minimaxModels,
            deepSeekModels: deepSeekModels,
            showMiniMaxSubnav: showMiniMaxSubnav,
            providerSessions: providerSessions,
            sessionSummaries: sessionSummaries,
            dashboardStats: dashboardStats,
            apiStatusCards: apiStatusCards,
            assetItems: assetItems,
            diagnosticCards: diagnosticCards,
            unreadNotificationCount: unreadNotificationCount,
            recentNotifications: recentNotifications,
            saveNotifications: saveNotifications,
            markNotificationsRead: markNotificationsRead,
            removeNotification: removeNotification,
            loadLogEntries: loadLogEntries,
            clearLogEntries: clearLogEntries,
            formatLogTime: formatLogTime,
            logLevelClass: logLevelClass,
            mediaUrl: mediaUrl,
            loadHistories: loadHistories,
            loadVoices: loadVoices,
            createSession: createSession,
            openSession: openSession,
            renameSession: renameSession,
            deleteSession: deleteSession,
            clearFinishedTasks: clearFinishedTasks,
            loadSettings: loadSettings,
            refreshProviderModels: refreshProviderModels,
            saveProviderSettings: saveProviderSettings,
            openDeepSeekUsage: openDeepSeekUsage,
            loadApiStatus: loadApiStatus,
            handlePreview: handlePreview,
            handleGenerateTts: handleGenerateTts,
            deleteImageHistory: deleteImageHistory,
            clearImageHistory: clearImageHistory,
            deleteTtsHistory: deleteTtsHistory,
            clearTtsHistory: clearTtsHistory,
            removeFavorite: removeFavorite,
            favoriteMessage: favoriteMessage,
            favoriteAsset: favoriteAsset,
            openAssetDetail: openAssetDetail,
            closeAssetDetail: closeAssetDetail,
            exportJson: exportJson,
            exportMarkdown: exportMarkdown,
            startResize: startResize,
            handleSend: handleSend,
            switchProvider: switchProvider,
            openHome: openHome,
            openSpeech: openSpeech,
            openMiniMaxHistory: openMiniMaxHistory,
            openLogs: openLogs,
            openApiStatus: openApiStatus,
            openDiagnostics: openDiagnostics,
            openAssets: openAssets,
            openExports: openExports,
            openSettings: openSettings,
            clearCurrentConversation: clearCurrentConversation,
            addPromptTemplate: addPromptTemplate,
            deletePromptTemplate: deletePromptTemplate,
            usePromptTemplate: usePromptTemplate,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
