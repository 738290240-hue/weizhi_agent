package com.weizhi.agent.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ChatResponse {
    private String text;
    private List<ChatMedia> media = new ArrayList<>();
    private Map<String, Object> metadata = new LinkedHashMap<>();

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public List<ChatMedia> getMedia() {
        return media;
    }

    public void setMedia(List<ChatMedia> media) {
        this.media = media;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }
}
