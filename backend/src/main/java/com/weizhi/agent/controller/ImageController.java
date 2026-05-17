package com.weizhi.agent.controller;

import com.weizhi.agent.model.ImageGenerationRequest;
import com.weizhi.agent.service.AiSettingsService;
import com.weizhi.agent.service.HistoryService;
import com.weizhi.agent.tools.FileUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/images")
public class ImageController {
    private final HistoryService historyService;
    private final AiSettingsService settingsService;

    @Value("${app.generated-images-path:generated_images}")
    private String generatedImagesPath;

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    public ImageController(HistoryService historyService, AiSettingsService settingsService) {
        this.historyService = historyService;
        this.settingsService = settingsService;
    }

    @PostMapping("/generate")
    public ResponseEntity<?> generate(@org.springframework.web.bind.annotation.RequestBody ImageGenerationRequest request) {
        try {
            Map<String, Object> bodyMap = Map.of(
                    "model", "image-01",
                    "prompt", request.getPrompt(),
                    "response_format", "base64",
                    "aspect_ratio", request.getAspectRatio() != null ? request.getAspectRatio() : "1:1",
                    "n", request.getCount() != null ? request.getCount() : 1
            );
            Request httpRequest = new Request.Builder()
                    .url("https://api.minimaxi.com/v1/image_generation")
                    .addHeader("Authorization", "Bearer " + settingsService.apiKey("minimax"))
                    .post(RequestBody.create(objectMapper.writeValueAsString(bodyMap), MediaType.parse("application/json")))
                    .build();

            try (Response response = httpClient.newCall(httpRequest).execute()) {
                if (!response.isSuccessful()) {
                    return ResponseEntity.badRequest().body(Map.of("success", false, "message", response.message()));
                }
                String raw = response.body().string();
                JsonNode root = objectMapper.readTree(raw);
                String base64 = root.at("/data/image_base64/0").asText();
                if (base64 == null || base64.isEmpty()) {
                    return ResponseEntity.badRequest().body(Map.of("success", false, "message", "API 未返回图片数据"));
                }

                byte[] data = java.util.Base64.getDecoder().decode(base64);
                String ext = FileUtils.detectImageExtension(data);
                String filename = FileUtils.generateUniqueFilename(ext);
                Path baseDir = Paths.get(generatedImagesPath).toAbsolutePath();
                Files.createDirectories(baseDir);
                Files.write(baseDir.resolve(filename), data);
                String url = "/api/images/files/" + filename;
                historyService.appendImage(request.getPrompt(), filename, url, "image-01");

                return ResponseEntity.ok(Map.of(
                        "success", true,
                        "filename", filename,
                        "url", url
                ));
                
            }
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(Map.of("success", false, "message", e.getMessage()));
        }
    }

    @GetMapping("/history")
    public ResponseEntity<?> history() {
        List<Map<String, Object>> histories = historyService.getImageHistory();
        return ResponseEntity.ok(Map.of("histories", histories));
    }

    @DeleteMapping("/history/{id}")
    public ResponseEntity<?> deleteHistory(@PathVariable String id) {
        boolean deleted = historyService.deleteImageHistory(id);
        return ResponseEntity.ok(Map.of("success", deleted));
    }

    @DeleteMapping("/history")
    public ResponseEntity<?> clearHistory() {
        historyService.clearImageHistory();
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/files/{filename}")
    public ResponseEntity<Resource> getImage(@PathVariable String filename) {
        try {
            Path basePath = Paths.get(generatedImagesPath).toAbsolutePath().normalize();
            Path filePath = basePath.resolve(filename).normalize();
            if (!FileUtils.isPathSafe(filePath.toString(), basePath.toString()) || !Files.exists(filePath)) {
                Path legacyBasePath = Paths.get("generated_images").toAbsolutePath().normalize();
                Path legacyFilePath = legacyBasePath.resolve(filename).normalize();
                if (FileUtils.isPathSafe(legacyFilePath.toString(), legacyBasePath.toString()) && Files.exists(legacyFilePath)) {
                    filePath = legacyFilePath;
                } else {
                    return ResponseEntity.notFound().build();
                }
            }
            if (!Files.isRegularFile(filePath)) {
                return ResponseEntity.notFound().build();
            }
            Resource resource = new UrlResource(filePath.toUri());
            return ResponseEntity.ok().body(resource);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }
}
