package com.weizhi.agent.controller;

import com.weizhi.agent.service.AiSettingsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {
    private final AiSettingsService settingsService;

    public SettingsController(AiSettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @GetMapping
    public Map<String, Object> settings() {
        return settingsService.getSettings();
    }

    @GetMapping("/{provider}/models")
    public List<Map<String, Object>> models(@PathVariable String provider) {
        return settingsService.models(provider);
    }

    @PostMapping("/{provider}")
    public Map<String, Object> update(@PathVariable String provider, @org.springframework.web.bind.annotation.RequestBody Map<String, Object> payload) {
        return settingsService.updateProvider(provider, payload);
    }
}
