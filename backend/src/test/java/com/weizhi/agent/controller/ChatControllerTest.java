package com.weizhi.agent.controller;

import com.weizhi.agent.service.AiSettingsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ChatController.class)
public class ChatControllerTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private AiSettingsService settingsService;

    @Test
    public void testAskRejectsBlankMessage() throws Exception {
        mockMvc.perform(post("/api/chat/ask")
                .content("{\"message\":\"\"}")
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").isString())
                .andExpect(jsonPath("$.media").isArray());
    }

    @Test
    public void testExtractsOpenAiCompatibleContent() throws Exception {
        ChatController controller = new ChatController(settingsService);
        String content = controller.extractMiniMaxContent(objectMapper.readTree("""
                {"choices":[{"message":{"content":"hello from minimax"}}]}
                """));
        assertEquals("hello from minimax", content);
    }

    @Test
    public void testExtractsLegacyMiniMaxReply() throws Exception {
        ChatController controller = new ChatController(settingsService);
        String content = controller.extractMiniMaxContent(objectMapper.readTree("""
                {"reply":"legacy reply"}
                """));
        assertEquals("legacy reply", content);
    }
}
