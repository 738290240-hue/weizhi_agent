# Weizhi Agent V2 — Spring AI 重构实现计划

> **For implementer:** 功能完全对标原项目（Weizhi Agent V1），但所有 AI 调用必须通过 Spring AI ChatClient + Tool Calling机制实现

**Goal:** 用 Spring AI 完整重写 Weizhi Agent，保留所有现有功能，引入真正的 Agent Function Calling

**Architecture:** Spring Boot 3 + Spring AI 1.0.x + Vue 3 + Electron。AI 对话统一通过 ChatClient，图片生成和 TTS 改造为 @Tool 注册的 Function Bean，由 LLM 自主判断何时调用

**Tech Stack:** Spring Boot 3.3.x, Spring AI 1.0.x (stable), Java 21, Vue 3 + TypeScript, Vite, Electron 29, H2, JSON File Storage

---

## 0. 项目结构

```
weizhi-agent-v2/
├── backend/
│   └── src/main/java/com/weizhi/agent/
│       ├── WeizhiAgentV2Application.java       # 启动入口
│       ├── config/
│       │   ├── AppConfig.java                 # 通用配置（跨域、Jackson）
│       │   ├── StorageConfig.java            # 存储路径（@ConfigurationProperties）
│       │   ├── SpringAiConfig.java            # Spring AI 全局配置（base-url, api-key 默认值）
│       │   └── LogAppenderConfig.java        # SSE 日志广播
│       ├── model/                             # DTO（请求/响应）
│       │   ├── ChatRequest.java
│       │   ├── ChatResponse.java
│       │   ├── ImageGenRequest.java
│       │   └── TtsRequest.java
│       ├── service/                           # 业务逻辑
│       │   ├── AiSettingsService.java         # AI Key/模型管理（JSON文件）
│       │   ├── HistoryService.java            # 图片/语音历史（JSON文件）
│       │   ├── DeepSeekUsageService.java      # Token 用量统计
│       │   └── LogStreamService.java          # SSE 日志推送
│       ├── tools/                             # Spring AI @Tool（LLM可自主调用）
│       │   ├── ImageGenerationTool.java        # @Tool 图片生成
│       │   ├── TtsSynthesizeTool.java         # @Tool TTS语音合成
│       │   └── ListVoicesTool.java           # @Tool 音色列表
│       ├── agent/                             # Agent 核心（ChatClient 封装）
│       │   ├── MiniMaxAgent.java              # MiniMax 对话 Agent（带 Tool Calling）
│       │   └── DeepSeekAgent.java             # DeepSeek 对话 Agent（纯对话）
│       ├── controller/                        # REST API
│       │   ├── ChatController.java            # 统一对话入口（兼容原有API）
│       │   ├── ImageController.java           # 图片（保留，非AI调用）
│       │   ├── TtsController.java            # TTS（保留，非AI调用）
│       │   ├── SettingsController.java        # AI设置
│       │   ├── SystemController.java          # 健康/日志
│       │   └── DeepSeekAccountController.java # 账户查询
│       └── logging/
│           └── LogEntry.java
├── frontend/                                  # 与原项目完全相同（Vue 3 SPA）
├── desktop/                                   # Electron（main.js 不变）
└── docs/plans/                               # 本计划
```

---

## 1. 第一阶段：项目脚手架

### 1.1 创建 Maven 项目结构

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/resources/application-dev.yml`
- Create: `backend/src/main/resources/application-prod.yml`

**Step 1: 创建 pom.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.4</version>
        <relativePath/>
    </parent>

    <groupId>com.weizhi</groupId>
    <artifactId>weizhi-agent-v2</artifactId>
    <version>1.0.0</version>
    <name>Weizhi Agent V2</name>

    <properties>
        <java.version>21</java.version>
        <spring-ai.version>1.0.4</spring-ai.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.ai</groupId>
                <artifactId>spring-ai-bom</artifactId>
                <version>${spring-ai.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>

    <dependencies>
        <!-- Spring Boot -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>

        <!-- Spring AI OpenAI（支持 MiniMax/DeepSeek 的 OpenAI 兼容端点）-->
        <dependency>
            <groupId>org.springframework.ai</groupId>
            <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
        </dependency>

        <!-- 工具库 -->
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
        </dependency>
        <dependency>
            <groupId>com.fasterxml.jackson.dataformat</groupId>
            <artifactId>jackson-dataformat-yaml</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-configuration-processor</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

**Step 2: 创建 application.yml**

```yaml
server:
  port: 3007

spring:
  application:
    name: weizhi-agent-v2
  jackson:
    default-property-inclusion: non_null

# MiniMax（OpenAI 兼容端点）
spring.ai.openai:
  base-url: ${MINIMAX_BASE_URL:https://api.minimax.chat/v1}
  api-key: ${MINIMAX_API_KEY:}
  chat:
    options:
      model: ${MINIMAX_MODEL:MiniMax-M2.7}
      temperature: 0.7
      max-tokens: 2048

# DeepSeek
spring.ai.deepseek:
  base-url: ${DEEPSEEK_BASE_URL:https://api.deepseek.com}
  api-key: ${DEEPSEEK_API_KEY:}
  chat:
    options:
      model: ${DEEPSEEK_MODEL:deepseek-v4-flash}

# 本应用配置
app:
  storage:
    root: ${APP_STORAGE_ROOT:${user.home}/.weizhi-agent-v2}
    images: generated_images
    audio: generated_audio
    data: data
  settings:
    file: ${app.storage.root}/${app.storage.data}/ai-settings.json
  history:
    image-file: ${app.storage.root}/${app.storage.data}/image-history.json
    tts-file: ${app.storage.root}/${app.storage.data}/tts-history.json

logging:
  level:
    com.weizhi.agent: DEBUG
    org.springframework.ai: INFO
```

**Step 3: 验证项目编译**
Command: `cd backend && mvn compile -q`
Expected: BUILD SUCCESS

---

### 1.2 启动入口

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/WeizhiAgentV2Application.java`
- Create: `backend/src/main/java/com/weizhi/agent/config/AppConfig.java`

**Step 1: 创建启动类**

```java
package com.weizhi.agent;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class WeizhiAgentV2Application {
    public static void main(String[] args) {
        SpringApplication.run(WeizhiAgentV2Application.class, args);
    }
}
```

**Step 2: 创建存储配置**

```java
package com.weizhi.agent.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.nio.file.Path;

@ConfigurationProperties(prefix = "app.storage")
public record StorageConfig(
    Path root,
    Path images,
    Path audio,
    Path data
) {
    public Path imagesDir() { return root.resolve(images); }
    public Path audioDir()   { return root.resolve(audio); }
    public Path dataDir()    { return root.resolve(data); }
}
```

**Step 3: 验证启动**
Command: `cd backend && mvn spring-boot:run -q`
Expected: 启动成功，无报错（暂时没有 Controller 不会 crash）

---

## 2. 第二阶段：配置层（Spring AI 多端点）

### 2.1 Spring AI 多模型配置

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/config/MiniMaxChatModelFactory.java`
- Create: `backend/src/main/java/com/weizhi/agent/config/DeepSeekChatModelFactory.java`
- Modify: `backend/src/main/java/com/weizhi/agent/config/SpringAiConfig.java`

**Key Architecture Decision:**

Spring AI 的 `spring-ai-openai-spring-boot-starter` 默认只支持配置一个 OpenAI 兼容端点。但我们需要同时支持 MiniMax 和 DeepSeek，方案：

```java
// MiniMax：通过 spring.ai.openai.* 配置（默认的 OpenAiChatModel）
// DeepSeek：手动创建一个新的 OpenAiChatModel bean，指向 DeepSeek 端点
@Configuration
public class SpringAiConfig {

    @Bean
    @Primary  // MiniMax 作为默认
    public ChatModel miniMaxChatModel(OpenAiApi openAiApi) {
        return new OpenAiChatModel(openAiApi);
    }

    @Bean
    public ChatModel deepSeekChatModel(
            @Value("${spring.ai.deepseek.base-url}") String baseUrl,
            @Value("${spring.ai.deepseek.api-key}") String apiKey) {
        OpenAiApi api = new OpenAiApi(baseUrl, apiKey);
        return new OpenAiChatModel(api);
    }
}
```

**Step 1: 创建 SpringAiConfig**

```java
package com.weizhi.agent.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiApi;
import org.springframework.ai.openai.chat.OpenAiChatModel;
import org.springframework.ai.chat.client.ChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class SpringAiConfig {

    // MiniMax（通过 spring.ai.openai.* 配置，自动注入）
    @Bean @Primary
    public ChatModel miniMaxChatModel(OpenAiApi api) {
        return new OpenAiChatModel(api);
    }

    @Bean @Primary
    public ChatClient miniMaxChatClient(ChatClient.Builder builder) {
        return builder.defaultModel("miniMax").build();
    }

    // DeepSeek（手动创建，指向 DeepSeek 端点）
    @Bean
    public ChatModel deepSeekChatModel(
            @Value("${spring.ai.deepseek.base-url}") String baseUrl,
            @Value("${spring.ai.deepseek.api-key}") String apiKey) {
        OpenAiApi api = OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(apiKey)
                .build();
        return new OpenAiChatModel(api);
    }

    @Bean
    public ChatClient deepSeekChatClient(ChatClient.Builder builder) {
        return builder.defaultModel("deepSeek").build();
    }
}
```

> **注意**：Spring AI 1.0.4 的 API 中，`ChatClient.Builder.defaultModel("name")` 引用的是 `ChatModel` bean 的名字。需要确认具体版本的实际 API，可能需要用 `ChatClient.of(chatModel)` 直接创建。实现时根据实际编译错误调整。

---

## 3. 第三阶段：Service 层

### 3.1 AiSettingsService

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/service/AiSettingsService.java`

**Step 1: Write the test**

```java
// test/java/com/weizhi/agent/service/AiSettingsServiceTest.java
package com.weizhi.agent.service;

import org.junit.jupiter.api.*;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class AiSettingsServiceTest {

    Path tempDir;
    AiSettingsService svc;

    @BeforeEach
    void setUp() throws Exception {
        tempDir = Files.createTempDirectory("weizhi-test");
        Path settingsFile = tempDir.resolve("ai-settings.json");
        svc = new AiSettingsService(settingsFile);
    }

    @AfterEach
    void tearDown() throws Exception {
        Files.walk(tempDir).sorted((a,b) -> -a.compareTo(b)).forEach(p -> p.toFile().delete());
    }

    @Test
    void saveAndLoadSettings() {
        svc.saveApiKey("minimax", "sk-test-minimax123");
        svc.saveModel("minimax", "MiniMax-M2.7");

        assertEquals("sk-test-minimax123", svc.getApiKey("minimax"));
        assertEquals("MiniMax-M2.7", svc.getModel("minimax"));
    }

    @Test
    void maskKey() {
        svc.saveApiKey("minimax", "sk-abcdefghij123456");
        String masked = svc.mask("sk-abcdefghij123456");
        assertTrue(masked.startsWith("sk-abc"));
        assertTrue(masked.endsWith("3456"));
        assertTrue(masked.contains("..."));
    }

    @Test
    void providerNotConfigured() {
        assertFalse(svc.isConfigured("minimax"));
        svc.saveApiKey("minimax", "sk-real");
        assertTrue(svc.isConfigured("minimax"));
    }
}
```

Command: `cd backend && mvn test -Dtest=AiSettingsServiceTest -q`
Expected: COMPILATION ERROR（类不存在）

**Step 2: Write implementation**

```java
package com.weizhi.agent.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.nio.file.*;

@Service
public class AiSettingsService {

    private static final Logger log = LoggerFactory.getLogger(AiSettingsService.class);

    private final Path settingsFile;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private ObjectNode root;

    public AiSettingsService(
            @Value("${app.settings.file}") Path settingsFile) throws Exception {
        this.settingsFile = settingsFile;
    }

    @PostConstruct
    public void init() throws Exception {
        if (!Files.exists(settingsFile)) {
            Files.createDirectories(settingsFile.getParent());
            root = objectMapper.createObjectNode();
            objectMapper.writeValue(settingsFile.toFile(), root);
        } else {
            root = (ObjectNode) objectMapper.readTree(settingsFile.toFile());
        }
        log.info("AI Settings loaded from {}", settingsFile);
    }

    public String getApiKey(String provider) {
        return root.path(provider).path("apiKey").asText(null);
    }

    public void saveApiKey(String provider, String apiKey) {
        root.putObject(provider).put("apiKey", apiKey);
        save();
    }

    public String getModel(String provider) {
        return root.path(provider).path("model").asText(null);
    }

    public void saveModel(String provider, String model) {
        root.putObject(provider).put("model", model);
        save();
    }

    public boolean isConfigured(String provider) {
        String key = getApiKey(provider);
        return key != null && !key.isBlank();
    }

    public String mask(String key) {
        if (key == null || key.length() < 10) return "****";
        return key.substring(0, 6) + "..." + key.substring(key.length() - 4);
    }

    private void save() {
        try {
            objectMapper.writeValue(settingsFile.toFile(), root);
        } catch (Exception e) {
            log.error("Failed to save settings", e);
        }
    }
}
```

Command: `cd backend && mvn test -Dtest=AiSettingsServiceTest -q`
Expected: PASS

---

### 3.2 HistoryService

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/service/HistoryService.java`

**Step 1: Write the test**

```java
// test/java/com/weizhi/agent/service/HistoryServiceTest.java
package com.weizhi.agent.service;

import org.junit.jupiter.api.*;
import java.nio.file.*;
import static org.junit.jupiter.api.Assertions.*;

class HistoryServiceTest {

    Path tempDir;
    HistoryService svc;

    @BeforeEach
    void setUp() throws Exception {
        tempDir = Files.createTempDirectory("weizhi-hist-test");
        svc = new HistoryService(
            tempDir.resolve("images.json"),
            tempDir.resolve("tts.json")
        );
        svc.init();
    }

    @AfterEach
    void tearDown() throws Exception {
        Files.walk(tempDir).sorted((a,b) -> -a.compareTo(b)).forEach(p -> p.toFile().delete());
    }

    @Test
    void appendAndListImageHistory() throws Exception {
        svc.appendImageHistory("prompt1", "http://example.com/1.jpg");
        svc.appendImageHistory("prompt2", "http://example.com/2.jpg");

        var history = svc.getImageHistory();
        assertEquals(2, history.size());
        assertEquals("prompt1", history.get(0).get("prompt").asText());
    }

    @Test
    void ttsHistory() throws Exception {
        svc.appendTtsHistory("hello", "voice1", "mp3", "http://example.com/hello.mp3", false);

        var history = svc.getTtsHistory();
        assertEquals(1, history.size());
        assertEquals("hello", history.get(0).get("text").asText());
    }

    @Test
    void trimTo200() throws Exception {
        for (int i = 0; i < 210; i++) {
            svc.appendImageHistory("prompt" + i, "http://example.com/" + i + ".jpg");
        }
        var history = svc.getImageHistory();
        assertEquals(200, history.size());
        assertEquals("prompt209", history.get(0).get("prompt").asText()); // 最新在前
    }

    @Test
    void deleteHistory() throws Exception {
        svc.appendImageHistory("to-delete", "http://example.com/del.jpg");
        var history = svc.getImageHistory();
        String id = history.get(0).get("id").asText();

        svc.deleteImageHistory(id);
        assertEquals(0, svc.getImageHistory().size());
    }
}
```

Command: `cd backend && mvn test -Dtest=HistoryServiceTest -q`
Expected: COMPILATION ERROR

**Step 2: Write implementation**

```java
package com.weizhi.agent.service;

import com.fasterxml.jackson.databind.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class HistoryService {

    private static final Logger log = LoggerFactory.getLogger(HistoryService.class);
    private static final int MAX_HISTORY = 200;

    private final Path imageHistoryFile;
    private final Path ttsHistoryFile;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicLong idCounter = new AtomicLong(System.currentTimeMillis());

    private ArrayNode imageHistory;
    private ArrayNode ttsHistory;

    public HistoryService(Path imageHistoryFile, Path ttsHistoryFile) {
        this.imageHistoryFile = imageHistoryFile;
        this.ttsHistoryFile = ttsHistoryFile;
    }

    @PostConstruct
    public void init() throws Exception {
        this.imageHistory = loadOrCreate(imageHistoryFile);
        this.ttsHistory = loadOrCreate(ttsHistoryFile);
    }

    private ArrayNode loadOrCreate(Path file) throws Exception {
        if (!Files.exists(file)) {
            Files.createDirectories(file.getParent());
            ArrayNode arr = objectMapper.createArrayNode();
            objectMapper.writeValue(file.toFile(), arr);
            return arr;
        }
        return (ArrayNode) objectMapper.readTree(file.toFile());
    }

    // --- Image History ---

    public List<JsonNode> getImageHistory() {
        return imageHistory.elements().toList();
    }

    public void appendImageHistory(String prompt, String url) throws Exception {
        ObjectNode entry = objectMapper.createObjectNode();
        entry.put("id", String.valueOf(idCounter.incrementAndGet()));
        entry.put("prompt", prompt);
        entry.put("url", url);
        entry.put("createdAt", java.time.Instant.now().toString());

        imageHistory.insert(0, entry);
        trim(imageHistory, imageHistoryFile);
    }

    public void deleteImageHistory(String id) throws Exception {
        for (int i = 0; i < imageHistory.size(); i++) {
            if (imageHistory.get(i).get("id").asText().equals(id)) {
                imageHistory.remove(i);
                break;
            }
        }
        objectMapper.writeValue(imageHistoryFile.toFile(), imageHistory);
    }

    public void clearImageHistory() throws Exception {
        imageHistory.removeAll();
        objectMapper.writeValue(imageHistoryFile.toFile(), imageHistory);
    }

    // --- TTS History ---

    public List<JsonNode> getTtsHistory() {
        return ttsHistory.elements().toList();
    }

    public void appendTtsHistory(String text, String voiceId, String format,
                                 String audioUrl, boolean preview) throws Exception {
        ObjectNode entry = objectMapper.createObjectNode();
        entry.put("id", String.valueOf(idCounter.incrementAndGet()));
        entry.put("text", text);
        entry.put("voiceId", voiceId);
        entry.put("format", format);
        entry.put("audioUrl", audioUrl);
        entry.put("preview", preview);
        entry.put("createdAt", java.time.Instant.now().toString());

        ttsHistory.insert(0, entry);
        trim(ttsHistory, ttsHistoryFile);
    }

    public void deleteTtsHistory(String id) throws Exception {
        for (int i = 0; i < ttsHistory.size(); i++) {
            if (ttsHistory.get(i).get("id").asText().equals(id)) {
                ttsHistory.remove(i);
                break;
            }
        }
        objectMapper.writeValue(ttsHistoryFile.toFile(), ttsHistory);
    }

    public void clearTtsHistory() throws Exception {
        ttsHistory.removeAll();
        objectMapper.writeValue(ttsHistoryFile.toFile(), ttsHistory);
    }

    // --- Internal ---

    private void trim(ArrayNode arr, Path file) throws Exception {
        while (arr.size() > MAX_HISTORY) {
            arr.remove(arr.size() - 1);
        }
        objectMapper.writeValue(file.toFile(), arr);
    }
}
```

Command: `cd backend && mvn test -Dtest=HistoryServiceTest -q`
Expected: PASS

---

### 3.3 DeepSeekUsageService

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/service/DeepSeekUsageService.java`

```java
package com.weizhi.agent.service;

import org.springframework.stereotype.Service;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class DeepSeekUsageService {

    private final AtomicLong requests = new AtomicLong(0);
    private final AtomicLong promptTokens = new AtomicLong(0);
    private final AtomicLong completionTokens = new AtomicLong(0);
    private final AtomicLong totalTokens = new AtomicLong(0);

    public void recordUsage(long prompt, long completion) {
        requests.incrementAndGet();
        promptTokens.addAndGet(prompt);
        completionTokens.addAndGet(completion);
        totalTokens.addAndGet(prompt + completion);
    }

    public UsageSnapshot snapshot() {
        return new UsageSnapshot(
            requests.get(),
            promptTokens.get(),
            completionTokens.get(),
            totalTokens.get()
        );
    }

    public record UsageSnapshot(
        long requests,
        long promptTokens,
        long completionTokens,
        long totalTokens
    ) {}
}
```

Command: `cd backend && mvn test -Dtest=DeepSeekUsageServiceTest -q`
（测试省略，可自行补全）

---

## 4. 第四阶段：Spring AI Tools（核心创新点）

### 4.1 ImageGenerationTool

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/tools/ImageGenerationTool.java`

**Step 1: Write the test**

```java
// test/java/com/weizhi/agent/tools/ImageGenerationToolTest.java
package com.weizhi.agent.tools;

import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

class ImageGenerationToolTest {

    ImageGenerationTool tool;

    @BeforeEach
    void setUp() {
        tool = new ImageGenerationTool(null); // 需要 mock AiSettingsService
    }

    @Test
    void toolHasCorrectDescription() throws Exception {
        var desc = tool.getDescription();
        assertTrue(desc.contains("image"));
        assertTrue(desc.contains("aspect_ratio"));
    }
}
```

**Step 2: Write implementation — 核心 @Tool**

```java
package com.weizhi.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.weizhi.agent.service.AiSettingsService;
import com.weizhi.agent.service.HistoryService;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

import java.nio.file.*;
import java.util.*;

@Component
public class ImageGenerationTool {

    private final AiSettingsService settingsService;
    private final HistoryService historyService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final okio.OkHttpClient httpClient = new okio.OkHttpClient.Builder()
            .connectTimeout(java.util.concurrent.TimeUnit.SECONDS, 10)
            .writeTimeout(java.util.concurrent.TimeUnit.SECONDS, 60)
            .readTimeout(java.util.concurrent.TimeUnit.SECONDS, 120)
            .build();

    public ImageGenerationTool(AiSettingsService settingsService, HistoryService historyService) {
        this.settingsService = settingsService;
        this.historyService = historyService;
    }

    /**
     * 根据文本提示词生成图片。
     * 当用户要求生成、画、创建图片时，AI 会自动调用此工具。
     *
     * @param prompt 图片描述（必填），越详细越好
     * @param aspectRatio 宽高比，如 "1:1", "16:9", "9:16"（可选，默认 1:1）
     */
    @Tool(name = "generate_image", description =
        "根据文本提示词生成图片。当用户说「生成图片」「画一张图」「创建图片」或类似意图时调用。\n" +
        "参数：\n" +
        "  - prompt (必填): 图片的详细描述，支持中文，建议包含主体、风格、光线等细节\n" +
        "  - aspect_ratio (可选): 宽高比，默认 1:1，支持 1:1 / 16:9 / 9:16 / 4:3 等"
    )
    public String generateImage(
            @ToolParam(description = "图片的详细描述，支持中文，建议包含主体、风格、光线等细节") String prompt,
            @ToolParam(description = "宽高比，默认 1:1", required = false) String aspectRatio
    ) {
        try {
            String apiKey = settingsService.getApiKey("minimax");
            if (apiKey == null || apiKey.isBlank()) {
                return "错误：未配置 MiniMax API Key，请在设置中配置后再试。";
            }

            String ratio = (aspectRatio != null && !aspectRatio.isBlank()) ? aspectRatio : "1:1";

            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", "image-01");
            body.put("prompt", prompt);
            body.put("response_format", "base64");
            body.put("aspect_ratio", ratio);
            body.put("n", 1);

            Request request = new Request.Builder()
                    .url("https://api.minimaxi.com/v1/image_generation")
                    .addHeader("Authorization", "Bearer " + apiKey)
                    .addHeader("Content-Type", "application/json")
                    .post(RequestBody.create(
                            objectMapper.writeValueAsString(body),
                            okhttp3.MediaType.parse("application/json")))
                    .build();

            try (okhttp3.Response response = httpClient.newCall(request).execute()) {
                String raw = response.body() == null ? "" : response.body().string();
                if (!response.isSuccessful()) {
                    return "图片生成失败（HTTP " + response.code() + "）: " + raw;
                }

                JsonNode root = objectMapper.readTree(raw);
                String base64 = root.at("/data/image_base64/0").asText(null);
                if (base64 == null || base64.isEmpty()) {
                    return "错误：API 未返回有效图片数据";
                }

                // 保存文件
                byte[] data = java.util.Base64.getDecoder().decode(base64);
                String ext = detectImageExtension(data);
                String filename = UUID.randomUUID() + ext;
                Path saveDir = Paths.get(System.getProperty("user.home"), ".weizhi-agent-v2/generated_images");
                Files.createDirectories(saveDir);
                Path filePath = saveDir.resolve(filename);
                Files.write(filePath, data);

                String url = "/api/images/files/" + filename;

                // 追加历史
                historyService.appendImageHistory(prompt, url);

                return "图片生成成功！文件：" + filename + "，URL：" + url;
            }
        } catch (Exception e) {
            return "图片生成出错：" + e.getMessage();
        }
    }

    private String detectImageExtension(byte[] data) {
        if (data.length >= 3 && data[0] == (byte)0xFF && data[1] == (byte)0xD8) return ".jpg";
        if (data.length >= 8 && data[0] == 0x89 && data[1] == 0x50)
            return data[2] == 0x4E ? ".png" : ".gif";
        return ".png";
    }
}
```

---

### 4.2 TtsSynthesizeTool

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/tools/TtsSynthesizeTool.java`

```java
package com.weizhi.agent.tools;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.weizhi.agent.service.AiSettingsService;
import com.weizhi.agent.service.HistoryService;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

import java.nio.file.*;
import java.util.*;

@Component
public class TtsSynthesizeTool {

    private final AiSettingsService settingsService;
    private final HistoryService historyService;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final okhttp3.OkHttpClient httpClient = new okhttp3.OkHttpClient.Builder()
            .connectTimeout(java.util.concurrent.TimeUnit.SECONDS, 10)
            .writeTimeout(java.util.concurrent.TimeUnit.SECONDS, 60)
            .readTimeout(java.util.concurrent.TimeUnit.SECONDS, 120)
            .build();

    public TtsSynthesizeTool(AiSettingsService settingsService, HistoryService historyService) {
        this.settingsService = settingsService;
        this.historyService = historyService;
    }

    /**
     * 将文本转换为语音。
     * 当用户要求「朗读」「播放」「把文字转语音」时，AI 会自动调用此工具。
     *
     * @param text 要转换的文本内容（必填），建议在1000字以内
     * @param voiceId 音色 ID，如 "chinese_female"（可选，默认 chinese_female）
     * @param speed 语速，0.5-2.0（可选，默认 1.0）
     */
    @Tool(name = "synthesize_speech", description =
        "将文本转换为语音并生成音频文件。当用户说「朗读」「播放语音」「把这段话转成语音」时调用。\n" +
        "参数：\n" +
        "  - text (必填): 要转换的文本，建议1000字以内\n" +
        "  - voice_id (可选): 音色 ID，默认 chinese_female，可选 chinese_male 等\n" +
        "  - speed (可选): 语速，0.5-2.0，默认 1.0"
    )
    public String synthesizeSpeech(
            @ToolParam(description = "要转换为语音的文本内容，建议1000字以内") String text,
            @ToolParam(description = "音色 ID，默认 chinese_female", required = false) String voiceId,
            @ToolParam(description = "语速，0.5-2.0，默认 1.0", required = false) Double speed
    ) {
        try {
            String apiKey = settingsService.getApiKey("minimax");
            if (apiKey == null || apiKey.isBlank()) {
                return "错误：未配置 MiniMax API Key，请在设置中配置后再试。";
            }

            String voice = (voiceId != null && !voiceId.isBlank()) ? voiceId : "chinese_female";
            double spd = (speed != null && speed >= 0.5 && speed <= 2.0) ? speed : 1.0;

            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", "speech-2.8-hd");
            body.put("text", text);
            body.put("voice_id", voice);
            body.put("speed", spd);
            body.put("output_format", "mp3");

            Request request = new Request.Builder()
                    .url("https://api.minimaxi.com/v1/t2a_v2")
                    .addHeader("Authorization", "Bearer " + apiKey)
                    .addHeader("Content-Type", "application/json")
                    .post(RequestBody.create(
                            objectMapper.writeValueAsString(body),
                            okhttp3.MediaType.parse("application/json")))
                    .build();

            try (okhttp3.Response response = httpClient.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    String raw = response.body() == null ? "" : response.body().string();
                    return "语音合成失败（HTTP " + response.code() + "）: " + raw;
                }

                byte[] data = Objects.requireNonNull(response.body()).bytes();
                String filename = UUID.randomUUID() + ".mp3";
                Path saveDir = Paths.get(System.getProperty("user.home"), ".weizhi-agent-v2/generated_audio");
                Files.createDirectories(saveDir);
                Path filePath = saveDir.resolve(filename);
                Files.write(filePath, data);

                String url = "/api/tts/audio/" + filename;
                historyService.appendTtsHistory(text, voice, "mp3", url, false);

                return "语音合成成功！文件：" + filename + "，URL：" + url;
            }
        } catch (Exception e) {
            return "语音合成出错：" + e.getMessage();
        }
    }

    /**
     * 获取可用的音色列表。
     */
    @Tool(name = "list_voices", description = "获取 MiniMax TTS 所有可用的音色列表，帮助用户选择合适的音色。")
    public String listVoices() {
        return "可用音色（voice_id）：\n" +
               "  chinese_female - 中文女声（默认）\n" +
               "  chinese_male - 中文男声\n" +
               "  english_female - 英文女声\n" +
               "  english_male - 英文男声\n" +
               "  japanese_female - 日文女声\n" +
               "  chinese_dialect - 中文方言";
    }
}
```

---

## 5. 第五阶段：Agent 层（ChatClient + Tool Calling）

### 5.1 MiniMax Agent

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/agent/MiniMaxAgent.java`

```java
package com.weizhi.agent.agent;

import com.weizhi.agent.tools.ImageGenerationTool;
import com.weizhi.agent.tools.TtsSynthesizeTool;
import org.springframework.ai.chat.client.*;
import org.springframework.ai.chat.client.proxy.AiApiChatModelProxy;
import org.springframework.stereotype.Component;

import java.util.*;

@Component
public class MiniMaxAgent {

    private final ChatClient chatClient;
    private final ImageGenerationTool imageTool;
    private final TtsSynthesizeTool ttsTool;

    public MiniMaxAgent(
            ChatClient.Builder miniMaxBuilder,
            ImageGenerationTool imageTool,
            TtsSynthesizeTool ttsTool) {
        this.chatClient = miniMaxBuilder
                .defaultTools(imageTool, ttsTool)
                .build();
        this.imageTool = imageTool;
        this.ttsTool = ttsTool;
    }

    /**
     * 对话（带 Function Calling）
     * LLM 会自动判断是否需要调用 generate_image / synthesize_speech / list_voices
     */
    public String chat(String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .call()
                .content();
    }

    /**
     * 流式对话
     */
    public Flux<String> streamChat(String userMessage) {
        return chatClient.prompt()
                .user(userMessage)
                .stream()
                .content();
    }
}
```

### 5.2 DeepSeek Agent

**Files:**
- Create: `backend/src/main/java/com/weizhi/agent/agent/DeepSeekAgent.java`

```java
package com.weizhi.agent.agent;

import com.weizhi.agent.service.DeepSeekUsageService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.ai.chat.client.*;
import org.springframework.stereotype.Component;

import java.util.*;

@Component
public class DeepSeekAgent {

    private final ChatClient chatClient;
    private final DeepSeekUsageService usageService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public DeepSeekAgent(
            ChatClient.Builder deepSeekBuilder,
            DeepSeekUsageService usageService) {
        this.chatClient = deepSeekBuilder.build();
        this.usageService = usageService;
    }

    /**
     * 多轮对话（纯对话，无 Tool Calling）
     */
    public String chat(String userMessage, List<ChatMessage> history) {
        ChatClient.PromptPublisher publisher = chatClient.prompt()
                .messages(convertHistory(history))
                .user(userMessage)
                .stream();

        StringBuilder result = new StringBuilder();

        publisher.content().subscribe(
            chunk -> result.append(chunk),
            error -> { throw new RuntimeException(error); }
        ).join();

        return result.toString();
    }

    /**
     * 从响应中提取 token 用量（需要解析 AI Output-Usage header 或响应体）
     * Spring AI 1.0.x 会自动将 usage 记录到 ChatResponse.metadata 中
     */
    public record ChatMessage(String role, String content) {}

    private List<ChatClient.Message> convertHistory(List<ChatMessage> history) {
        return history.stream().map(h ->
            switch (h.role()) {
                case "user"    -> ChatClient.Message.ofUser(h.content());
                case "assistant" -> ChatClient.Message.ofAssistant(h.content());
                default -> ChatClient.Message.ofUser(h.content());
            }
        ).toList();
    }
}
```

---

## 6. 第六阶段：Controller 层

### 6.1 ChatController

**Files:**
- Modify: `backend/src/main/java/com/weizhi/agent/controller/ChatController.java`

**设计原则：** Controller 只做 HTTP 参数解析和响应封装，实际逻辑全部委托 Agent

```java
package com.weizhi.agent.controller;

import com.weizhi.agent.agent.MiniMaxAgent;
import com.weizhi.agent.agent.DeepSeekAgent;
import com.weizhi.agent.service.DeepSeekUsageService;
import com.weizhi.agent.service.AiSettingsService;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.*;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final MiniMaxAgent miniMaxAgent;
    private final DeepSeekAgent deepSeekAgent;
    private final AiSettingsService settingsService;

    public ChatController(MiniMaxAgent miniMaxAgent, DeepSeekAgent deepSeekAgent,
                          AiSettingsService settingsService) {
        this.miniMaxAgent = miniMaxAgent;
        this.deepSeekAgent = deepSeekAgent;
        this.settingsService = settingsService;
    }

    // MiniMax 对话（带 Tool Calling）
    @PostMapping("/minimax")
    public Map<String, Object> chatMiniMax(@RequestBody Map<String, Object> request) {
        String message = (String) request.get("message");
        if (message == null || message.isBlank()) {
            return Map.of("text", "请输入问题。", "media", List.of());
        }
        String answer = miniMaxAgent.chat(message);
        return Map.of("text", answer, "media", List.of());
    }

    // DeepSeek 对话（多轮）
    @PostMapping("/deepseek")
    public Map<String, Object> chatDeepSeek(@RequestBody Map<String, Object> request) {
        String message = (String) request.get("message");
        @SuppressWarnings("unchecked")
        List<Map<String, String>> history = (List<Map<String, String>>) request.getOrDefault("history", List.of());

        if (message == null || message.isBlank()) {
            return Map.of("text", "请输入问题。", "media", List.of());
        }

        List<DeepSeekAgent.ChatMessage> chatHistory = history.stream()
                .map(h -> new DeepSeekAgent.ChatMessage(h.get("role"), h.get("content")))
                .toList();

        String answer = deepSeekAgent.chat(message, chatHistory);

        return Map.of(
            "text", answer,
            "media", List.of(),
            "usage", deepSeekUsageService.snapshot()
        );
    }

    // MiniMax 流式
    @GetMapping(value = "/minimax/stream", produces = "text/event-stream")
    public Flux<String> streamMiniMax(@RequestParam String message) {
        return miniMaxAgent.streamChat(message);
    }
}
```

---

## 7. 第七阶段：前端（直接复用 V1）

**Files:**
- Copy: `frontend/` 整个目录到 `weizhi-agent-v2/frontend/`
- Modify: `vite.config.ts` 代理目标改为 localhost:3007（不变）

**Step 1:** 复制前端代码
Command: `cp -r /mnt/d/apple/weizhi_agent/frontend /mnt/d/apple/weizhi_agent_v2/frontend`

**Step 2:** 确认 API 适配
V1 的 API 路径：`/api/chat/ask` → V2：`/api/chat/minimax`
如果前端调用路径不同，需要修改 `frontend/src/utils/api.ts` 中的端点路径。

---

## 8. 第八阶段：Electron 启动（main.js 适配）

**Files:**
- Copy: `desktop/` 到 `weizhi-agent-v2/desktop/`
- Modify: `desktop/main.js` 中的 JAR 路径、端口、存储目录

主要改动：
- JAR 路径：`backend/target/weizhi-agent-v2-1.0.0.jar`
- 存储目录：`.weizhi-agent-v2`
- 启动参数中的配置路径对应 V2 的 `app.storage.*` 前缀

---

## 9. 第九阶段：日志系统（复用）

**Files:**
- Copy: `logging/` 整个包到 V2
- Modify: `LogAppenderConfig` 中的 service 引用

---

## 10. 验收标准

1. `mvn compile` 无错误
2. `mvn test` 全量通过
3. 启动 `mvn spring-boot:run`，`curl http://localhost:3007/api/system/health` 返回 200
4. 前端 `npm run dev` 正常启动，浏览器能打开 localhost:5181
5. 对话接口 `/api/chat/minimax` POST `{"message":"画一只猫"}` 能触发 `ImageGenerationTool`，返回图片 URL
6. 对话接口 `/api/chat/minimax` POST `{"message":"把春天朗读出来"}` 能触发 `TtsSynthesizeTool`，返回音频 URL
7. `/api/chat/deepseek` 多轮对话正常，usage 统计正确

---

## 11. 关键决策备忘

| 决策点 | 方案 | 理由 |
|---|---|---|
| Spring AI 版本 | 1.0.4 (stable) | 不再用 M 版本，避免 API 不稳定 |
| 多模型支持 | 两个独立的 `ChatClient` bean（按名字注入）| Spring AI 原生支持多端点 |
| Tool 注册 | `@Tool` + `@Component` + `ChatClient.defaultTools()` | Spring AI 1.0.x 标准方式 |
| 图片/TTS | 不走 ChatClient 流式，直接 OkHttp 返回 URL | 这些是异步文件生成，不适合 SSE 流式 |
| SSE | 仅用于日志流推送，不做对话流式 | MiniMax API 本身不支持 SSE，DeepSeek 有但非核心需求 |
| 存储 | JSON 文件 + H2（仅日志框架用）| 与 V1 保持一致 |
