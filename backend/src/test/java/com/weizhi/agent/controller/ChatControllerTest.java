package com.weizhi.agent.controller;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ChatController.class)
public class ChatControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ChatModel chatModel;

    @Test
    public void testAsk() throws Exception {
        when(chatModel.call(anyString())).thenReturn("AI Response");

        mockMvc.perform(post("/api/chat/ask")
                .content("Hello")
                .contentType(MediaType.TEXT_PLAIN))
                .andExpect(status().isOk())
                .andExpect(content().string("AI Response"));
    }
}
