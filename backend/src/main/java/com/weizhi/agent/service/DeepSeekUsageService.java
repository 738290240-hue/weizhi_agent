package com.weizhi.agent.service;

import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class DeepSeekUsageService {
    private final AtomicLong requests = new AtomicLong();
    private final AtomicLong promptTokens = new AtomicLong();
    private final AtomicLong completionTokens = new AtomicLong();
    private final AtomicLong totalTokens = new AtomicLong();
    private final AtomicLong cacheHitTokens = new AtomicLong();
    private final AtomicLong cacheMissTokens = new AtomicLong();

    public void record(Map<String, Object> usage) {
        if (usage == null || usage.isEmpty()) return;
        requests.incrementAndGet();
        promptTokens.addAndGet(numberValue(usage.get("prompt_tokens")));
        completionTokens.addAndGet(numberValue(usage.get("completion_tokens")));
        totalTokens.addAndGet(numberValue(usage.get("total_tokens")));
        cacheHitTokens.addAndGet(numberValue(usage.get("prompt_cache_hit_tokens")));
        cacheMissTokens.addAndGet(numberValue(usage.get("prompt_cache_miss_tokens")));
    }

    public Map<String, Object> snapshot() {
        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("requests", requests.get());
        usage.put("promptTokens", promptTokens.get());
        usage.put("completionTokens", completionTokens.get());
        usage.put("totalTokens", totalTokens.get());
        usage.put("cacheHitTokens", cacheHitTokens.get());
        usage.put("cacheMissTokens", cacheMissTokens.get());
        return usage;
    }

    private long numberValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        if (value == null) return 0;
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }
}
