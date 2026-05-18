package com.weizhi.agent.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "storage")
public class StorageProperties {
    private String audioDir = "generated_audio";
    private String imageDir = "generated_images";
    private String imageHistoryFile = "data/image-history.json";
    private String ttsHistoryFile = "data/tts-history.json";

    public String getAudioDir() {
        return audioDir;
    }

    public void setAudioDir(String audioDir) {
        this.audioDir = audioDir;
    }

    public String getImageDir() {
        return imageDir;
    }

    public void setImageDir(String imageDir) {
        this.imageDir = imageDir;
    }

    public String getImageHistoryFile() {
        return imageHistoryFile;
    }

    public void setImageHistoryFile(String imageHistoryFile) {
        this.imageHistoryFile = imageHistoryFile;
    }

    public String getTtsHistoryFile() {
        return ttsHistoryFile;
    }

    public void setTtsHistoryFile(String ttsHistoryFile) {
        this.ttsHistoryFile = ttsHistoryFile;
    }
}
