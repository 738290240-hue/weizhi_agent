package com.weizhi.agent.controller;

import com.weizhi.agent.logging.LogEntry;
import com.weizhi.agent.logging.LogStreamService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/system")
public class SystemController {
    private final LogStreamService logStreamService;

    public SystemController(LogStreamService logStreamService) {
        this.logStreamService = logStreamService;
    }

    @GetMapping("/health")
    public String health() { return "ok"; }

    @GetMapping(value = "/logs", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamLogs() {
        return logStreamService.createEmitter();
    }

    @GetMapping("/logs/history")
    public Map<String, Object> logHistory(
            @RequestParam(required = false) String level,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "200") int limit
    ) {
        List<LogEntry> logs = logStreamService.list(level, query, limit);
        return Map.of("logs", logs);
    }

    @DeleteMapping("/logs")
    public Map<String, Object> clearLogs() {
        logStreamService.clear();
        return Map.of("success", true);
    }
}
