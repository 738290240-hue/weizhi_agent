package com.weizhi.agent.tools;

import com.weizhi.agent.model.ImageGenerationRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weizhi.agent.service.AiSettingsService;
import okhttp3.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Description;

import java.util.Map;
import java.util.function.Function;
import java.util.concurrent.TimeUnit;

@Configuration
public class ImageTools {
    private static final Logger log = LoggerFactory.getLogger(ImageTools.class);

    private final AiSettingsService settingsService;

    public ImageTools(AiSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Bean
    @Description("根据提示词生成图片。可以指定比例（如 1:1, 16:9）和风格。")
    public Function<ImageGenerationRequest, String> generateImage() {
        return request -> {
            log.info("Agent is invoking ImageTool with prompt: {}", request.getPrompt());
            try {
                // 逻辑移植：构造 MiniMax 原生图片生成请求
                Map<String, Object> bodyMap = Map.of(
                    "model", "image-01",
                    "prompt", request.getPrompt(),
                    "response_format", "base64",
                    "aspect_ratio", request.getAspectRatio() != null ? request.getAspectRatio() : "1:1",
                    "n", 1
                );

                Request httpRequest = new Request.Builder()
                        .url("https://api.minimaxi.com/v1/image_generation")
                        .addHeader("Authorization", "Bearer " + settingsService.apiKey("minimax"))
                        .post(RequestBody.create(objectMapper.writeValueAsString(bodyMap), MediaType.parse("application/json")))
                        .build();

                try (Response response = httpClient.newCall(httpRequest).execute()) {
                    if (!response.isSuccessful()) return "图片生成失败: " + response.message();
                    String body = response.body().string();
                    JsonNode root = objectMapper.readTree(body);
                    String base64 = root.at("/data/image_base64/0").asText();
                    
                    if (base64 == null || base64.isEmpty()) return "API 未返回有效图片数据";
                    
                    // 保存到用户目录 (复用之前的存储标准)
                    byte[] data = java.util.Base64.getDecoder().decode(base64);
                    String ext = FileUtils.detectImageExtension(data);
                    String filename = FileUtils.generateUniqueFilename(ext);
                    // 注意：此处路径需要由 main.js 注入或使用默认
                    String savePath = System.getProperty("user.home") + "/.weizhi-agent/storage/generated_images";
                    FileUtils.saveFile(data, filename, savePath);
                    
                    log.info("Image saved to: {}", filename);
                    return "图片已成功生成并保存。文件名: " + filename + "。请告诉用户可以通过预览区查看。";
                }
            } catch (Exception e) {
                log.error("Image tool error", e);
                return "执行出错: " + e.getMessage();
            }
        };
    }
}
