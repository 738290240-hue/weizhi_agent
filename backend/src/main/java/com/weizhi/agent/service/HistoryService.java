package com.weizhi.agent.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weizhi.agent.config.StorageProperties;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class HistoryService {
    private final StorageProperties storageProperties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public HistoryService(StorageProperties storageProperties) {
        this.storageProperties = storageProperties;
    }

    public synchronized void appendImage(String prompt, String filename, String url, String model) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", UUID.randomUUID().toString());
        item.put("prompt", prompt);
        item.put("filename", filename);
        item.put("url", url);
        item.put("model", model);
        item.put("createdAt", Instant.now().toString());
        append(storageProperties.getImageHistoryFile(), item);
    }

    public synchronized void appendTts(String text, String voiceId, String model, String format, String audioUrl, boolean preview) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", UUID.randomUUID().toString());
        item.put("text", text);
        item.put("voiceId", voiceId);
        item.put("model", model);
        item.put("format", format);
        item.put("audioUrl", audioUrl);
        item.put("preview", preview);
        item.put("createdAt", Instant.now().toString());
        append(storageProperties.getTtsHistoryFile(), item);
    }

    public synchronized List<Map<String, Object>> getImageHistory() {
        List<Map<String, Object>> histories = read(storageProperties.getImageHistoryFile());
        List<Map<String, Object>> merged = mergeImageFiles(histories);
        if (merged.size() != histories.size()) {
            write(storageProperties.getImageHistoryFile(), merged);
        }
        return merged;
    }

    public synchronized List<Map<String, Object>> getTtsHistory() {
        return read(storageProperties.getTtsHistoryFile());
    }

    public synchronized boolean deleteImageHistory(String id) {
        return deleteById(storageProperties.getImageHistoryFile(), id);
    }

    public synchronized boolean deleteTtsHistory(String id) {
        return deleteById(storageProperties.getTtsHistoryFile(), id);
    }

    public synchronized void clearImageHistory() {
        write(storageProperties.getImageHistoryFile(), new ArrayList<>());
    }

    public synchronized void clearTtsHistory() {
        write(storageProperties.getTtsHistoryFile(), new ArrayList<>());
    }

    private void append(String filePath, Map<String, Object> item) {
        List<Map<String, Object>> all = read(filePath);
        all.add(0, item);
        if (all.size() > 200) {
            all = new ArrayList<>(all.subList(0, 200));
        }
        write(filePath, all);
    }

    private List<Map<String, Object>> read(String filePath) {
        try {
            Path path = Paths.get(filePath).toAbsolutePath().normalize();
            if (!Files.exists(path)) return new ArrayList<>();
            return objectMapper.readValue(path.toFile(), new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception ignored) {
            return new ArrayList<>();
        }
    }

    private void write(String filePath, List<Map<String, Object>> data) {
        try {
            Path path = Paths.get(filePath).toAbsolutePath().normalize();
            if (path.getParent() != null) Files.createDirectories(path.getParent());
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), data);
        } catch (IOException ignored) {
        }
    }

    private boolean deleteById(String filePath, String id) {
        List<Map<String, Object>> all = read(filePath);
        int originalSize = all.size();
        all.removeIf(item -> id.equals(String.valueOf(item.get("id"))));
        if (all.size() == originalSize) return false;
        write(filePath, all);
        return true;
    }

    private List<Map<String, Object>> mergeImageFiles(List<Map<String, Object>> histories) {
        List<Map<String, Object>> merged = new ArrayList<>(histories);
        Set<String> knownFilenames = new HashSet<>();
        for (Map<String, Object> item : histories) {
            Object filename = item.get("filename");
            if (filename != null) knownFilenames.add(String.valueOf(filename));
        }

        scanImageDir(Paths.get(storageProperties.getImageDir()).toAbsolutePath().normalize(), merged, knownFilenames);
        scanImageDir(Paths.get("generated_images").toAbsolutePath().normalize(), merged, knownFilenames);
        return merged;
    }

    private void scanImageDir(Path dir, List<Map<String, Object>> merged, Set<String> knownFilenames) {
        if (!Files.isDirectory(dir)) return;
        try (Stream<Path> files = Files.list(dir)) {
            files
                    .filter(Files::isRegularFile)
                    .filter(this::isImageFile)
                    .sorted((a, b) -> {
                        try {
                            return Files.getLastModifiedTime(b).compareTo(Files.getLastModifiedTime(a));
                        } catch (IOException e) {
                            return 0;
                        }
                    })
                    .forEach(path -> {
                        String filename = path.getFileName().toString();
                        if (knownFilenames.contains(filename)) return;
                        knownFilenames.add(filename);
                        Map<String, Object> item = new LinkedHashMap<>();
                        item.put("id", "legacy-" + filename);
                        item.put("prompt", "历史图片");
                        item.put("filename", filename);
                        item.put("url", "/api/images/files/" + filename);
                        item.put("model", "legacy");
                        try {
                            item.put("createdAt", Files.getLastModifiedTime(path).toInstant().toString());
                        } catch (IOException e) {
                            item.put("createdAt", Instant.now().toString());
                        }
                        merged.add(item);
                    });
        } catch (IOException ignored) {
        }
    }

    private boolean isImageFile(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        return name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")
                || name.endsWith(".webp") || name.endsWith(".gif");
    }
}
