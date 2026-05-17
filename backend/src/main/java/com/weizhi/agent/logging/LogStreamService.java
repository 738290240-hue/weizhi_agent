package com.weizhi.agent.logging;

import ch.qos.logback.classic.spi.ILoggingEvent;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class LogStreamService {
    private static final int MAX_ENTRIES = 1000;
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();
    private final Deque<LogEntry> entries = new LinkedList<>();

    public SseEmitter createEmitter() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        return emitter;
    }

    public synchronized void capture(ILoggingEvent eventObject) {
        LogEntry entry = new LogEntry();
        entry.setId(UUID.randomUUID().toString());
        entry.setTimestamp(Instant.ofEpochMilli(eventObject.getTimeStamp()));
        entry.setLevel(eventObject.getLevel().toString());
        entry.setLogger(eventObject.getLoggerName() == null ? "" : eventObject.getLoggerName());
        entry.setThread(eventObject.getThreadName() == null ? "" : eventObject.getThreadName());
        entry.setMessage(eventObject.getFormattedMessage() == null ? "" : eventObject.getFormattedMessage());
        entries.addFirst(entry);
        while (entries.size() > MAX_ENTRIES) entries.removeLast();
        broadcast(formatLine(entry));
    }

    public synchronized List<LogEntry> list(String level, String query, int limit) {
        String normalizedLevel = level == null ? "" : level.trim().toUpperCase();
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        int safeLimit = Math.min(Math.max(limit <= 0 ? 200 : limit, 1), MAX_ENTRIES);
        return entries.stream()
                .filter(entry -> normalizedLevel.isEmpty() || normalizedLevel.equals(entry.getLevel()))
                .filter(entry -> normalizedQuery.isEmpty()
                        || safeLower(entry.getMessage()).contains(normalizedQuery)
                        || safeLower(entry.getLogger()).contains(normalizedQuery)
                        || safeLower(entry.getThread()).contains(normalizedQuery))
                .sorted(Comparator.comparing(LogEntry::getTimestamp).reversed())
                .limit(safeLimit)
                .toList();
    }

    public synchronized void clear() {
        entries.clear();
        broadcast("Logs cleared.");
    }

    public void broadcast(String logLine) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(logLine);
            } catch (IOException e) {
                emitters.remove(emitter);
            }
        }
    }

    private String formatLine(LogEntry entry) {
        return "[" + entry.getLevel() + "] " + entry.getLogger() + " - " + entry.getMessage();
    }

    private String safeLower(String value) {
        return value == null ? "" : value.toLowerCase();
    }
}
