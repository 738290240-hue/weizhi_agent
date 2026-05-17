package com.weizhi.agent.model;

public class ImageGenerationRequest {
    private String prompt;
    private String aspectRatio;
    private Integer count;
    private String stylePreset;
    private String negativePrompt;
    private String model;

    public String getPrompt() {
        return prompt;
    }

    public void setPrompt(String prompt) {
        this.prompt = prompt;
    }

    public String getAspectRatio() {
        return aspectRatio;
    }

    public void setAspectRatio(String aspectRatio) {
        this.aspectRatio = aspectRatio;
    }

    public Integer getCount() {
        return count;
    }

    public void setCount(Integer count) {
        this.count = count;
    }

    public String getStylePreset() {
        return stylePreset;
    }

    public void setStylePreset(String stylePreset) {
        this.stylePreset = stylePreset;
    }

    public String getNegativePrompt() {
        return negativePrompt;
    }

    public void setNegativePrompt(String negativePrompt) {
        this.negativePrompt = negativePrompt;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }
}
