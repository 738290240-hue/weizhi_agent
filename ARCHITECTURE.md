# Weizhi Agent 架构文档

> 项目版本：1.0.0 | 最后更新：2026-05-13

---

## 1. 项目概述

Weizhi Agent 是一个本地 AI 工作台桌面应用，核心功能：

- **MiniMax 通道**：图片生成（image-01）、语音合成（TTS speech-2.8-hd）、通用对话（minimax2.7）
- **DeepSeek 通道**：对话推理（deepseek-v4-flash），支持用量统计
- **工作台能力**：会话管理、Prompt 模板库、素材库、收藏夹、日志模块、任务队列、通知中心
- **数据持久化**：本地 JSON 文件存储（会话、素材历史、AI 设置）
- **打包形式**：Electron 桌面应用（启动时自动启动 Spring Boot 后端）

---

## 2. 技术栈

| 层级 | 技术 | 说明 |
|---|---|---|
| 后端框架 | Spring Boot 3.3.4 + Java 21 | REST API 服务器 |
| AI 集成 | Spring AI 1.0.0-M2 | 尚未真正使用（代码直接调用 HTTP） |
| HTTP 客户端 | OkHttp 4.12 | 所有外部 API 调用 |
| 前端框架 | Vue 3 + TypeScript | Vite 构建 |
| 桌面打包 | Electron 29 | main.js 启动后端 + 加载前端 |
| 前端 UI | 原生 CSS（无框架）| 深色主题，自定义 CSS 变量 |

---

## 3. 目录结构

```
weizhi_agent/
├── backend/                        # Spring Boot 后端
│   ├── src/main/java/com/weizhi/agent/
│   │   ├── WeizhiAgentApplication.java   # 启动入口，加载 .env 文件
│   │   ├── StartupConfigLogger.java       # 启动时打印 AI 配置日志
│   │   ├── config/
│   │   │   ├── StorageProperties.java    # 存储路径配置（图片/语音/历史文件）
│   │   │   └── LogAppenderConfig.java     # 自定义 Logback Appender，SSE 广播日志
│   │   ├── controller/                    # 7 个 Controller
│   │   │   ├── ChatController.java        # MiniMax 对话 + 图片生成检测
│   │   │   ├── DeepSeekChatController.java
│   │   │   ├── DeepSeekAccountController.java
│   │   │   ├── ImageController.java
│   │   │   ├── TtsController.java
│   │   │   ├── SettingsController.java
│   │   │   └── SystemController.java      # 健康检查 + 日志 SSE
│   │   ├── service/
│   │   │   ├── AiSettingsService.java      # AI Key/模型配置读写（JSON 文件）
│   │   │   ├── DeepSeekUsageService.java   # DeepSeek token 用量累计统计
│   │   │   └── HistoryService.java        # 图片/语音历史管理（JSON 文件）
│   │   ├── tools/
│   │   │   ├── FileUtils.java              # 文件操作工具（保存、UUID、路径安全、Magic Bytes）
│   │   │   ├── ImageTools.java             # Spring AI Function Bean（generateImage）
│   │   │   └── TtsTools.java               # Spring AI Function Bean（ttsSynthesize / listVoices）
│   │   ├── model/
│   │   │   ├── ChatRequest.java
│   │   │   ├── ChatResponse.java
│   │   │   ├── ChatMedia.java
│   │   │   ├── ImageGenerationRequest.java
│   │   │   └── TtsRequest.java
│   │   └── logging/
│   │       ├── LogEntry.java               # 日志数据结构
│   │       └── LogStreamService.java       # SSE 实时日志广播服务
│   └── src/main/resources/application.yml  # Spring 配置（端口 3007）
├── frontend/                       # Vue 3 前端
│   ├── src/
│   │   ├── main.ts                     # 入口文件
│   │   ├── App.vue                     # 整个 SPA（~1700 行，UI + 逻辑全在一起）
│   │   ├── utils/
│   │   │   ├── api.ts                  # axios 封装，所有后端 API 调用
│   │   │   └── urlUtils.ts             # API URL 解析（开发环境补全 localhost:3007）
│   │   └── styles/main.css            # （未详细审阅）
│   ├── vite.config.ts                 # dev server 端口 5181，代理 /api 到 3007
│   └── dist/                          # 构建产物（Electron 加载此目录）
├── desktop/
│   ├── main.js                        # Electron 主进程：启动 Spring Boot JAR、创建窗口
│   └── package.json
├── .idea/                             # IntelliJ IDEA 配置
└── ARCHITECTURE.md                    # 本文档
```

---

## 4. 后端架构

### 4.1 启动流程

```
WeizhiAgentApplication.main()
  → loadEnv(".")           # 尝试加载项目根目录 .env
  → loadEnv("backend")     # 尝试加载 backend/ .env
  → SpringApplication.run()
  → StartupConfigLogger.run()   # 打印 AI 配置到控制台
  → LogAppenderConfig.init()    # 注册自定义 Logback → LogStreamService
```

### 4.2 配置文件优先级

配置来源（优先级从高到低）：
1. 命令行参数 `--spring.ai.openai.api-key=xxx`
2. 环境变量 `MINIMAX_API_KEY`、`DEEPSEEK_API_KEY`
3. `.env` 文件（Dotenv 加载到 System Properties）
4. `application.yml` 的默认值

### 4.3 API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/system/health` | 健康检查 |
| GET | `/api/system/logs` | SSE 实时日志流 |
| GET | `/api/system/logs/history` | 查询历史日志 |
| DELETE | `/api/system/logs` | 清空日志 |
| GET | `/api/settings` | 获取 AI 设置（Key 是否配置、当前模型） |
| GET | `/api/settings/{provider}/models` | 获取可用模型列表 |
| POST | `/api/settings/{provider}` | 更新 API Key 或模型 |
| POST | `/api/chat/ask` | MiniMax 对话（自动检测图片生成意图） |
| POST | `/api/chat/stream` | MiniMax 对话（SSE，代码中实际未使用流式） |
| POST | `/api/deepseek/chat/ask` | DeepSeek 对话（支持多轮消息） |
| GET | `/api/deepseek/account/balance` | 查询 DeepSeek 余额 |
| GET | `/api/deepseek/account/usage` | DeepSeek 本地累计用量 |
| POST | `/api/images/generate` | MiniMax 图片生成 |
| GET | `/api/images/history` | 图片历史 |
| DELETE | `/api/images/history/{id}` | 删除单条历史 |
| DELETE | `/api/images/history` | 清空图片历史 |
| GET | `/api/images/files/{filename}` | 读取生成的图片文件 |
| POST | `/api/tts/tts` | 完整 TTS 生成 |
| POST | `/api/tts/preview` | TTS 预览（文本截断 120 字符） |
| GET | `/api/tts/voices` | 可用音色列表 |
| GET | `/api/tts/history` | 语音历史 |
| DELETE | `/api/tts/history/{id}` | 删除单条历史 |
| DELETE | `/api/tts/history` | 清空语音历史 |
| GET | `/api/tts/audio/{filename}` | 读取生成的音频文件 |

### 4.4 Service 层

#### AiSettingsService
- 读取/写入 `data/ai-settings.json`
- 支持 `minimax` 和 `deepseek` 两个 provider
- 每个 provider 独立存储 `apiKey` 和 `model`
- Key 读取优先级：JSON 文件 > 环境变量 > `application.yml` 默认值
- `models("deepseek")` 会调用 DeepSeek `/models` API 动态获取，失败时返回 hardcoded fallback 列表

#### DeepSeekUsageService
- 内存中累计记录（AtomicLong）：请求数、prompt tokens、completion tokens、total tokens、cache hit/miss tokens
- 随每次 DeepSeek 对话响应中的 `usage` 字段更新
- 重启后清零

#### HistoryService
- 图片历史文件：`data/image-history.json`
- 语音历史文件：`data/tts-history.json`
- 每条历史最多保留 200 条（`append` 时 trim）
- `mergeImageFiles`：启动时扫描 `generated_images/` 目录，将不在 JSON 中的本地图片文件合并进来（标记为 `legacy`）

### 4.5 日志系统

```
LogAppenderConfig.init()
  → 注册自定义 Logback Appender
  → 每条日志 → LogStreamService.capture()
    → 存入 LinkedList（上限 1000 条）
    → SSE 广播给所有连接的客户端
```

SSE 端点：`/api/system/logs`，前端 `EventSource` 实时接收并刷新日志列表。

### 4.6 存储路径

所有路径可通过 `application.yml` 或命令行参数覆盖：

| 配置项 | 默认值 |
|---|---|
| `app.generated-images-path` | `generated_images` |
| `storage.image-dir` | `generated_images` |
| `storage.audio-dir` | `generated_audio` |
| `storage.image-history-file` | `data/image-history.json` |
| `storage.tts-history-file` | `data/tts-history.json` |
| `settings.file` | `data/ai-settings.json` |

Electron 启动时通过命令行参数将路径重定向到 `~/.weizhi-agent/storage/`。

---

## 5. 前端架构

### 5.1 技术特点

- **单文件组件**：`App.vue` 约 1700 行，包含所有业务逻辑、状态管理、UI 模板和 CSS
- **无状态管理库**：使用 Vue 3 `ref`/`computed`，所有状态定义在组件顶层
- **样式**：纯 CSS，大量 CSS 变量（`--provider-accent`、`--provider-soft` 等）实现多主题切换
- **图标**：`lucide-vue-next`
- **构建**：Vite dev server（5181），生产构建到 `frontend/dist/`

### 5.2 状态数据结构

```typescript
// Provider
activeProvider: "minimax" | "deepseek"
activeView: MainView          // "home" | "chat" | "speech" | "imageHistory" | ...

// 消息
minimaxMessages: ChatMessage[]
deepSeekMessages: ChatMessage[]

// 会话
chatSessions: SessionRecord[]           // localStorage 持久化
activeSessionIds: { minimax: string, deepseek: string }

// 素材
imageHistories: ImageHistory[]
ttsHistories: TtsHistory[]

// 任务
taskQueue: TaskRecord[]                  // localStorage 持久化

// 通知
notifications: NotificationItem[]        // localStorage 持久化，最多 80 条

// 收藏
favorites: FavoriteItem[]                // localStorage 持久化

// Prompt 模板
promptTemplates: PromptTemplate[]        // localStorage 持久化，内置 3 个

// 设置
settingsState: AiSettingsState           // 从后端拉取

// 日志
logEntries: LogEntry[]
```

### 5.3 路由/视图

左侧 16 个导航项（部分条件显示），对应不同的 `activeView`：

| 视图 | 说明 |
|---|---|
| home | 仪表盘，统计概览 + 快捷入口 |
| chat | 主聊天界面（默认视图） |
| speech | MiniMax TTS 合成面板 |
| imageHistory | MiniMax 图片历史 |
| ttsHistory | MiniMax 语音历史 |
| sessions | 会话历史管理 |
| tasks | 任务队列（问答/TTS 任务状态） |
| notifications | 通知中心 |
| prompts | Prompt 模板库 |
| assets | 统一素材库（图片+语音混合列表） |
| favorites | 收藏夹 |
| diagnostics | 系统诊断（各模块缓存数量） |
| exports | 导出中心（JSON/Markdown 多种范围） |
| apiStatus | API 状态面板（健康、Key、模型、DeepSeek 余额） |
| logs | 日志模块（实时 SSE + 历史查询） |
| settings | 模型设置（Key 和模型选择） |

### 5.4 主题色

CSS 变量随 `activeProvider` 切换：

```
--provider-accent:  #ef4444 (minimax) | #2f7df6 (deepseek) | #38bdf8 (home)
--provider-soft:   rgba(红/蓝/青, 0.16~0.18)
--provider-border: rgba(红/蓝/青, 0.35~0.42)
```

### 5.5 关键实现细节

- **图片检测**：`ChatController.looksLikeImageRequest()` 用中文关键词（"生成"/"画"/"图片"）判断是否触发图片生成
- **媒体提取**：`ChatController.extractMedia()` 用正则从文本中提取 `/api/images/files/xxx` 和 `/api/tts/audio/xxx` URL
- **DeepSeek 多轮**：前端 `handleSend` 每次把 `targetMessages`（含历史）一起发往后端
- **Prompt 模板变量**：`usePromptTemplate` 支持 `{变量名}` 占位，弹出 `window.prompt` 逐一填写
- **SSE 日志**：`onMounted` 时建立 `EventSource`，每次消息触发 `loadLogEntries()` 刷新

---

## 6. Electron 桌面端

### 6.1 启动流程

```
app.on("ready")
  → startBackend()       # kill 旧进程 → spawn java -jar backend.jar
  → waitAndLaunch()      # 轮询 /api/health → 200 后 createWindow()
```

### 6.2 存储目录

```
~/.weizhi-agent/
├── storage/
│   ├── data/
│   │   ├── ai-settings.json
│   │   ├── image-history.json
│   │   └── tts-history.json
│   ├── generated_images/
│   └── generated_audio/
```

### 6.3 生产路径

- JAR 路径：`resources/bin/backend.jar`
- 前端路径：`frontend-dist/index.html`

---

## 7. 安全设计

### 路径穿越防护
`ImageController.getImage()` 和 `TtsController.getAudio()` 使用 `FileUtils.isPathSafe()` 验证：
```
isPathSafe(resolvedPath, basePath) → 规范化后必须以 basePath 为前缀
```

### Key 脱敏
`AiSettingsService.mask()` 只显示前 6 位和后 4 位：`sk-abc1...xyz9`

---

## 8. 已知问题与改进建议

### 8.1 代码质量问题

1. **`ChatController` 职责过重**：聊天逻辑 + 图片生成 + 媒体提取全在一个类，建议拆分
2. **`ImageTools` 未被使用**：`application.yml` 声明了 `generateImage` 和 `ttsSynthesize` function，但实际 Chat 对话走的是 `ChatController` 直接调用，没有通过 Spring AI function calling 机制
3. **重复代码**：`ImageTools` 和 `ChatController` 的图片生成逻辑几乎相同（同样的 API URL、同样参数），`TtsTools` 和 `TtsController` 的 TTS 逻辑也高度重合，应抽取为共用 service
4. **`HistoryService` 同时操作两个 JSON 文件**：`mergeImageFiles` 存在竞争风险（`getImageHistory` 读 + 写），且 `read/write` 方法异常全部静默吞掉，调试困难
5. **`deepseekModels()` 每次打开设置都重新请求**：`models("deepseek")` 每次都发 HTTP 请求，建议加缓存

### 8.2 Spring AI 集成问题

`application.yml` 配置了 `spring.ai.openai.chat.options.functions` 激活 `generateImage` 和 `ttsSynthesize`，但代码里 ChatController 完全绕过了 Spring AI ChatClient，直接用 OkHttp 发 HTTP。这意味着：
- Spring AI function calling 配置实际上未生效
- 如果要实现真正的 Agent（带工具调用），需要重构对话逻辑

### 8.3 前端问题

1. **App.vue 过大**：1700 行单文件，建议按功能拆分成独立组件
2. **localStorage 无校验**：`JSON.parse` 异常全部静默忽略，状态损坏时无感知
3. **SSE 重连**：`EventSource.onerror` 只打印日志，没有自动重连逻辑

### 8.4 配置问题

1. **`misc.xml` 中的 JDK 版本写死**：`openjdk-ea-27` 是无效值，应使用机器上实际存在的 JDK 名称（如 `jdk-21.0.11.10-hotspot`），本次修复已在 `.gitignore` 中排除 `misc.xml`，建议迁移到 `pom.xml` 的 `maven-compiler-plugin` 或统一 IDEA 项目 SDK
2. **`pom.xml` 使用 Spring Milestones 仓库**：`spring-ai-bom 1.0.0-M2` 是预览版，生产环境建议使用稳定版

---

## 9. 环境变量参考

| 变量名 | 说明 |
|---|---|
| `MINIMAX_API_KEY` | MiniMax API Key |
| `MINIMAX_OPENAI_BASE_URL` | MiniMax OpenAI 兼容端点（默认 `https://api.minimax.chat/v1`）|
| `MINIMAX_REVIEW_ENDPOINT` | Chat 对话端点（默认 `https://api.minimax.chat/v1/text/chatcompletion_v2`）|
| `MINIMAX_REVIEW_MODEL` | Chat 模型（默认 `MiniMax-M2.7`）|
| `DEEPSEEK_API_KEY` | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | DeepSeek API Base（默认 `https://api.deepseek.com`）|
| `DEEPSEEK_MODEL` | DeepSeek 模型（默认 `deepseek-v4-flash`）|
