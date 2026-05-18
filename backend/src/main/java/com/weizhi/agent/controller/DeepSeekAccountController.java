package com.weizhi.agent.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weizhi.agent.service.AiSettingsService;
import com.weizhi.agent.service.DeepSeekUsageService;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/deepseek/account")
public class DeepSeekAccountController {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final DeepSeekUsageService usageService;
    private final AiSettingsService settingsService;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();

    public DeepSeekAccountController(DeepSeekUsageService usageService, AiSettingsService settingsService) {
        this.usageService = usageService;
        this.settingsService = settingsService;
    }

    @GetMapping("/balance")
    public Map<String, Object> balance() {
        Map<String, Object> result = new LinkedHashMap<>();
        String apiKey = settingsService.apiKey("deepseek");
        if (apiKey == null || apiKey.isBlank()) {
            result.put("success", false);
            result.put("message", "DEEPSEEK_API_KEY 未配置。");
            return result;
        }

        Request request = new Request.Builder()
                .url(settingsService.deepSeekBaseUrl() + "/user/balance")
                .addHeader("Authorization", "Bearer " + apiKey)
                .get()
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            String raw = response.body() == null ? "" : response.body().string();
            result.put("success", response.isSuccessful());
            result.put("status", response.code());
            if (response.isSuccessful()) {
                JsonNode root = objectMapper.readTree(raw);
                result.put("isAvailable", root.path("is_available").asBoolean(false));
                result.put("balanceInfos", objectMapper.convertValue(root.path("balance_infos"), Object.class));
            } else {
                result.put("message", raw);
            }
            return result;
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
            return result;
        }
    }

    @GetMapping("/usage")
    public Map<String, Object> usage() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("usage", usageService.snapshot());
        result.put("officialUsageUrl", "https://platform.deepseek.com/usage");
        result.put("note", "官方按月/API Key 明细需在 Usage 页面导出 CSV；这里显示本项目启动后的本地累计。");
        return result;
    }
}
