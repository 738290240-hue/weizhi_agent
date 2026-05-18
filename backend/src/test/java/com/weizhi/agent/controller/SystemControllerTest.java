package com.weizhi.agent.controller;

import com.weizhi.agent.logging.LogStreamService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SystemController.class)
public class SystemControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private LogStreamService logStreamService;

    @Test
    public void testHealth() throws Exception {
        mockMvc.perform(get("/api/system/health"))
                .andExpect(status().isOk())
                .andExpect(content().string("ok"));
    }
}
