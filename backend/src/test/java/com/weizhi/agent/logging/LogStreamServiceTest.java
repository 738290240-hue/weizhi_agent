package com.weizhi.agent.logging;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.junit.jupiter.api.Assertions.assertNotNull;

public class LogStreamServiceTest {

    @Test
    public void testCreateEmitter() {
        LogStreamService service = new LogStreamService();
        SseEmitter emitter = service.createEmitter();
        assertNotNull(emitter);
    }
}
