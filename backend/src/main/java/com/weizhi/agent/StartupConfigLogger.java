package com.weizhi.agent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

@Component
public class StartupConfigLogger implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(StartupConfigLogger.class);
    @Value("${minimax.endpoint:}")
    private String baseUrl;
    @Value("${spring.ai.openai.base-url:}")
    private String openAiBaseUrl;
    @Value("${spring.ai.openai.chat.options.model:}")
    private String model;
    @Value("${spring.ai.openai.api-key:}")
    private String apiKey;
    @Value("${deepseek.model:}")
    private String deepSeekModel;
    @Value("${deepseek.api-key:}")
    private String deepSeekApiKey;

    @Override
    public void run(String... args) {
        log.info("--- AI Agent Configuration ---");
        log.info("Target Base URL: {}", baseUrl);
        log.info("Spring AI OpenAI Base URL: {}", openAiBaseUrl);
        log.info("Active Model: {}", model);
        log.info("API Key Configured: {}", (apiKey != null && !apiKey.isBlank()));
        log.info("DeepSeek Model: {}", deepSeekModel);
        log.info("DeepSeek API Key Configured: {}", (deepSeekApiKey != null && !deepSeekApiKey.isBlank()));
        log.info("------------------------------");
    }
}
