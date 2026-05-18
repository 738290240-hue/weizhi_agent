package com.weizhi.agent;

import io.github.cdimascio.dotenv.Dotenv;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class WeizhiAgentApplication {
    public static void main(String[] args) {
        // Try loading from root then from backend folder
        loadEnv(".");
        loadEnv("backend");
        
        SpringApplication.run(WeizhiAgentApplication.class, args);
    }

    private static void loadEnv(String path) {
        try {
            Dotenv dotenv = Dotenv.configure()
                .directory(path)
                .ignoreIfMalformed()
                .ignoreIfMissing()
                .load();
            dotenv.entries().forEach(entry -> {
                if (System.getProperty(entry.getKey()) == null) {
                    System.setProperty(entry.getKey(), entry.getValue());
                }
            });
        } catch (Exception ignored) {}
    }
}
