package com.weizhi.agent.controller;

import com.weizhi.agent.model.ChatMedia;
import com.weizhi.agent.model.ChatRequest;
import com.weizhi.agent.model.ChatResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weizhi.agent.service.AiSettingsService;
import com.weizhi.agent.tools.FileUtils;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    private static final Pattern IMAGE_URL = Pattern.compile("/api/images/files/[A-Za-z0-9._-]+");
    private static final Pattern AUDIO_URL = Pattern.compile("/api/tts/audio/[A-Za-z0-9._-]+");
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiSettingsService settingsService;

    @Value("${chat.endpoint:${MINIMAX_REVIEW_ENDPOINT:https://api.minimaxi.com/v1/chat/completions}}")
    private String chatEndpoint;

    @Value("${app.generated-images-path:generated_images}")
    private String generatedImagesPath;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build();

    public ChatController(AiSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping("/stream")
    public Flux<String> streamChat(@RequestParam String message) {
        String input = message == null ? "" : message.trim();
        if (input.isEmpty()) return Flux.just("请输入问题。");
        return Flux.just(callMiniMax(input));
    }

    @PostMapping("/ask")
    public ChatResponse ask(@org.springframework.web.bind.annotation.RequestBody Object requestBody) {
        String input = resolveInput(requestBody);
        ChatResponse response = new ChatResponse();
        if (input.isEmpty()) {
            response.setText("请输入问题。");
            response.setMedia(new ArrayList<>());
            return response;
        }

        String text;
        try {
            text = callMiniMax(input);
        } catch (Exception e) {
            response.setText("问答失败: " + e.getMessage());
            response.setMedia(new ArrayList<>());
            return response;
        }
        if (text == null || text.isBlank()) {
            text = "模型返回为空，请重试。";
        }
        response.setText(text);
        response.setMedia(extractMedia(text));
        return response;
    }

    private String callMiniMax(String input) {
        if (looksLikeImageRequest(input)) {
            String url = generateImageFromPrompt(input);
            if (url != null) {
                return "图片已生成: " + url;
            }
            return "图片生成失败，请稍后重试。";
        }
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", settingsService.model("minimax"));
            payload.put("messages", List.of(Map.of("role", "user", "content", input)));
            payload.put("temperature", 0.7);
            payload.put("max_tokens", 2048);

            Request request = new Request.Builder()
                    .url(chatEndpoint)
                    .addHeader("Authorization", "Bearer " + settingsService.apiKey("minimax"))
                    .addHeader("Content-Type", "application/json")
                    .post(RequestBody.create(objectMapper.writeValueAsString(payload), MediaType.parse("application/json")))
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                String raw = response.body() == null ? "" : response.body().string();
                if (!response.isSuccessful()) {
                    return "问答失败: " + response.code() + " - " + raw;
                }
                String content = extractMiniMaxContent(objectMapper.readTree(raw));
                if (content == null || content.isBlank()) {
                    return "模型返回为空，请重试。";
                }
                return content;
            }
        } catch (Exception e) {
            return "问答失败: " + e.getMessage();
        }
    }

    String extractMiniMaxContent(JsonNode root) {
        String content = root.path("choices").path(0).path("message").path("content").asText("");
        if (!content.isBlank()) return content;

        content = root.path("choices").path(0).path("delta").path("content").asText("");
        if (!content.isBlank()) return content;

        content = root.path("reply").asText("");
        if (!content.isBlank()) return content;

        JsonNode legacyMessages = root.path("choices").path(0).path("messages");
        if (legacyMessages.isArray()) {
            StringBuilder builder = new StringBuilder();
            for (JsonNode message : legacyMessages) {
                String text = message.path("text").asText("");
                if (!text.isBlank()) builder.append(text);
            }
            if (!builder.isEmpty()) return builder.toString();
        }

        content = root.path("output_text").asText("");
        if (!content.isBlank()) return content;

        return root.path("text").asText("");
    }

    private boolean looksLikeImageRequest(String input) {
        String s = input.toLowerCase();
        return (s.contains("生成") || s.contains("画") || s.contains("创建"))
                && (s.contains("图片") || s.contains("图像") || s.contains("照片") || s.contains("image"));
    }

    private String generateImageFromPrompt(String prompt) {
        try {
            Map<String, Object> bodyMap = Map.of(
                    "model", "image-01",
                    "prompt", prompt,
                    "response_format", "base64",
                    "aspect_ratio", "1:1",
                    "n", 1
            );
            Request httpRequest = new Request.Builder()
                    .url("https://api.minimaxi.com/v1/image_generation")
                    .addHeader("Authorization", "Bearer " + settingsService.apiKey("minimax"))
                    .post(RequestBody.create(objectMapper.writeValueAsString(bodyMap), MediaType.parse("application/json")))
                    .build();
            try (Response response = httpClient.newCall(httpRequest).execute()) {
                if (!response.isSuccessful() || response.body() == null) return null;
                String raw = response.body().string();
                JsonNode root = objectMapper.readTree(raw);
                String base64 = root.at("/data/image_base64/0").asText();
                if (base64 == null || base64.isEmpty()) return null;

                byte[] data = Base64.getDecoder().decode(base64);
                String ext = FileUtils.detectImageExtension(data);
                String filename = FileUtils.generateUniqueFilename(ext);
                Path baseDir = Paths.get(generatedImagesPath).toAbsolutePath();
                Files.createDirectories(baseDir);
                Files.write(baseDir.resolve(filename), data);
                return "/api/images/files/" + filename;
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    private String resolveInput(Object requestBody) {
        if (requestBody == null) return "";
        if (requestBody instanceof String raw) return raw.trim();
        if (requestBody instanceof Map<?, ?> map) {
            Object msg = map.get("message");
            return msg == null ? "" : String.valueOf(msg).trim();
        }
        if (requestBody instanceof ChatRequest req) {
            return req.getMessage() == null ? "" : req.getMessage().trim();
        }
        return String.valueOf(requestBody).trim();
    }

    private List<ChatMedia> extractMedia(String text) {
        List<ChatMedia> media = new ArrayList<>();
        Matcher imageMatcher = IMAGE_URL.matcher(text);
        while (imageMatcher.find()) {
            media.add(new ChatMedia("image", imageMatcher.group()));
        }
        Matcher audioMatcher = AUDIO_URL.matcher(text);
        while (audioMatcher.find()) {
            media.add(new ChatMedia("audio", audioMatcher.group()));
        }
        return media;
    }
}
