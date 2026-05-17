package com.weizhi.agent.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class AiSettingsService {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();

    @Value("${settings.file:data/ai-settings.json}")
    private String settingsFile;

    @Value("${spring.ai.openai.api-key:}")
    private String defaultMiniMaxKey;

    @Value("${chat.model:${MINIMAX_REVIEW_MODEL:MiniMax-M2.7}}")
    private String defaultMiniMaxModel;

    @Value("${deepseek.api-key:${DEEPSEEK_API_KEY:}}")
    private String defaultDeepSeekKey;

    @Value("${deepseek.base-url:https://api.deepseek.com}")
    private String defaultDeepSeekBaseUrl;

    @Value("${deepseek.model:deepseek-v4-flash}")
    private String defaultDeepSeekModel;

    public synchronized Map<String, Object> getSettings() {
        Map<String, Object> stored = readStored();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("minimax", providerView("minimax", stored));
        result.put("deepseek", providerView("deepseek", stored));
        return result;
    }

    public synchronized Map<String, Object> updateProvider(String provider, Map<String, Object> payload) {
        Map<String, Object> stored = readStored();
        Map<String, Object> providerSettings = providerSettings(provider, stored);
        if (payload.containsKey("apiKey")) {
            String apiKey = String.valueOf(payload.getOrDefault("apiKey", "")).trim();
            if (!apiKey.isEmpty()) providerSettings.put("apiKey", apiKey);
        }
        if (payload.containsKey("model")) {
            String model = String.valueOf(payload.getOrDefault("model", "")).trim();
            if (!model.isEmpty()) providerSettings.put("model", model);
        }
        stored.put(provider, providerSettings);
        writeStored(stored);
        return providerView(provider, stored);
    }

    public String apiKey(String provider) {
        Map<String, Object> stored = readStored();
        Object configured = providerSettings(provider, stored).get("apiKey");
        String value = configured == null ? "" : String.valueOf(configured);
        if (!value.isBlank()) return value;
        if ("deepseek".equals(provider)) return defaultDeepSeekKey == null ? "" : defaultDeepSeekKey;
        return defaultMiniMaxKey == null ? "" : defaultMiniMaxKey;
    }

    public String model(String provider) {
        Map<String, Object> stored = readStored();
        Object configured = providerSettings(provider, stored).get("model");
        String value = configured == null ? "" : String.valueOf(configured);
        if (!value.isBlank()) return value;
        if ("deepseek".equals(provider)) return defaultDeepSeekModel;
        return defaultMiniMaxModel;
    }

    public String deepSeekBaseUrl() {
        return defaultDeepSeekBaseUrl;
    }

    public List<Map<String, Object>> models(String provider) {
        if ("deepseek".equals(provider)) return deepSeekModels();
        return List.of(
                modelInfo("MiniMax-M2.7", "MiniMax M2.7"),
                modelInfo("MiniMax-M1", "MiniMax M1"),
                modelInfo("MiniMax-M2.5", "MiniMax M2.5"),
                modelInfo("MiniMax-M2.1", "MiniMax M2.1"),
                modelInfo("MiniMax-M2", "MiniMax M2")
        );
    }

    private List<Map<String, Object>> deepSeekModels() {
        String key = apiKey("deepseek");
        if (key.isBlank()) {
            return fallbackDeepSeekModels();
        }
        Request request = new Request.Builder()
                .url(defaultDeepSeekBaseUrl + "/models")
                .addHeader("Authorization", "Bearer " + key)
                .get()
                .build();
        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful() || response.body() == null) return fallbackDeepSeekModels();
            Map<String, Object> root = objectMapper.readValue(response.body().string(), new TypeReference<Map<String, Object>>() {});
            Object data = root.get("data");
            if (!(data instanceof List<?> list)) return fallbackDeepSeekModels();
            List<Map<String, Object>> models = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map && map.get("id") != null) {
                    String id = String.valueOf(map.get("id"));
                    models.add(modelInfo(id, id));
                }
            }
            return models.isEmpty() ? fallbackDeepSeekModels() : models;
        } catch (Exception ignored) {
            return fallbackDeepSeekModels();
        }
    }

    private List<Map<String, Object>> fallbackDeepSeekModels() {
        return List.of(
                modelInfo("deepseek-v4-flash", "DeepSeek V4 Flash"),
                modelInfo("deepseek-v4-pro", "DeepSeek V4 Pro"),
                modelInfo("deepseek-chat", "DeepSeek Chat"),
                modelInfo("deepseek-reasoner", "DeepSeek Reasoner")
        );
    }

    private Map<String, Object> modelInfo(String id, String name) {
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("id", id);
        model.put("name", name);
        return model;
    }

    private Map<String, Object> providerView(String provider, Map<String, Object> stored) {
        Map<String, Object> settings = providerSettings(provider, stored);
        String key = apiKey(provider);
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("provider", provider);
        view.put("apiKeyConfigured", key != null && !key.isBlank());
        view.put("apiKeyMasked", mask(key));
        view.put("model", model(provider));
        view.put("models", models(provider));
        if ("deepseek".equals(provider)) view.put("baseUrl", defaultDeepSeekBaseUrl);
        view.put("source", settings.containsKey("apiKey") ? "local" : "env");
        return view;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> providerSettings(String provider, Map<String, Object> stored) {
        Object value = stored.get(provider);
        if (value instanceof Map<?, ?> map) return (Map<String, Object>) map;
        return new LinkedHashMap<>();
    }

    private Map<String, Object> readStored() {
        try {
            Path path = Paths.get(settingsFile).toAbsolutePath().normalize();
            if (!Files.exists(path)) return new LinkedHashMap<>();
            return objectMapper.readValue(path.toFile(), new TypeReference<Map<String, Object>>() {});
        } catch (Exception ignored) {
            return new LinkedHashMap<>();
        }
    }

    private void writeStored(Map<String, Object> settings) {
        try {
            Path path = Paths.get(settingsFile).toAbsolutePath().normalize();
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), settings);
        } catch (Exception ignored) {
        }
    }

    private String mask(String key) {
        if (key == null || key.isBlank()) return "";
        if (key.length() <= 12) return "****";
        return key.substring(0, 6) + "..." + key.substring(key.length() - 4);
    }
}
