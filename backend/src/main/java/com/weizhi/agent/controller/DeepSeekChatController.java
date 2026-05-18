package com.weizhi.agent.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weizhi.agent.model.ChatResponse;
import com.weizhi.agent.service.AiSettingsService;
import com.weizhi.agent.service.DeepSeekUsageService;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/deepseek/chat")
public class DeepSeekChatController {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final DeepSeekUsageService usageService;
    private final AiSettingsService settingsService;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build();

    public DeepSeekChatController(DeepSeekUsageService usageService, AiSettingsService settingsService) {
        this.usageService = usageService;
        this.settingsService = settingsService;
    }

    @PostMapping("/ask")
    public ChatResponse ask(@org.springframework.web.bind.annotation.RequestBody Map<String, Object> requestBody) {
        ChatResponse response = new ChatResponse();
        String apiKey = settingsService.apiKey("deepseek");
        if (apiKey == null || apiKey.isBlank()) {
            response.setText("DeepSeek API Key 未配置，请在 .env 或环境变量中设置 DEEPSEEK_API_KEY。");
            response.setMedia(new ArrayList<>());
            return response;
        }

        List<Map<String, String>> messages = resolveMessages(requestBody);
        if (messages.isEmpty()) {
            response.setText("请输入问题。");
            response.setMedia(new ArrayList<>());
            return response;
        }

        Map<String, Object> result = callDeepSeek(messages);
        response.setText(String.valueOf(result.getOrDefault("text", "DeepSeek 返回为空，请重试。")));
        response.setMedia(new ArrayList<>());
        response.setMetadata(result);
        return response;
    }

    private Map<String, Object> callDeepSeek(List<Map<String, String>> messages) {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            String model = settingsService.model("deepseek");
            String apiKey = settingsService.apiKey("deepseek");
            String baseUrl = settingsService.deepSeekBaseUrl();
            List<Map<String, String>> requestMessages = new ArrayList<>();
            requestMessages.add(Map.of(
                    "role", "system",
                    "content", "你运行在 Weizhi Agent 的 DeepSeek 专属会话中。当前后端配置的 DeepSeek API 模型 ID 是 " + model + "。"
                            + "当用户询问你是什么模型、是否免费、底层模型或计费方式时，必须明确说明：这是 DeepSeek API 调用，不是免费无限服务；API 按 token 计费，费用由配置 API Key 的账户承担。"
                            + "不要声称 DeepSeek API 完全免费、无限使用或没有计费。"
            ));
            requestMessages.addAll(messages);

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", model);
            payload.put("messages", requestMessages);
            payload.put("temperature", 0.7);
            payload.put("max_tokens", 4096);
            payload.put("thinking", Map.of("type", "disabled"));

            Request request = new Request.Builder()
                    .url(baseUrl + "/chat/completions")
                    .addHeader("Authorization", "Bearer " + apiKey)
                    .addHeader("Content-Type", "application/json")
                    .post(RequestBody.create(objectMapper.writeValueAsString(payload), MediaType.parse("application/json")))
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                String raw = response.body() == null ? "" : response.body().string();
                if (!response.isSuccessful()) {
                    result.put("text", "DeepSeek 问答失败: " + response.code() + " - " + raw);
                    return result;
                }
                JsonNode root = objectMapper.readTree(raw);
                String content = root.path("choices").path(0).path("message").path("content").asText("");
                if (content == null || content.isBlank()) content = "DeepSeek 返回为空，请重试。";
                Map<String, Object> usage = objectMapper.convertValue(root.path("usage"), Map.class);
                usageService.record(usage);
                result.put("text", content);
                result.put("provider", "deepseek");
                result.put("model", model);
                result.put("usage", usage);
                result.put("localUsage", usageService.snapshot());
                return result;
            }
        } catch (Exception e) {
            result.put("text", "DeepSeek 问答失败: " + e.getMessage());
            return result;
        }
    }

    private List<Map<String, String>> resolveMessages(Map<String, Object> requestBody) {
        List<Map<String, String>> messages = new ArrayList<>();
        Object rawMessages = requestBody.get("messages");
        if (rawMessages instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Object rawRole = map.get("role");
                    Object rawContent = map.get("content");
                    String role = rawRole == null ? "user" : String.valueOf(rawRole);
                    String content = rawContent == null ? "" : String.valueOf(rawContent).trim();
                    if (content.isEmpty()) continue;
                    if (!"assistant".equals(role) && !"system".equals(role)) role = "user";
                    messages.add(Map.of("role", role, "content", content));
                }
            }
        }

        if (!messages.isEmpty()) return messages;

        Object message = requestBody.get("message");
        String content = message == null ? "" : String.valueOf(message).trim();
        if (!content.isEmpty()) messages.add(Map.of("role", "user", "content", content));
        return messages;
    }
}
