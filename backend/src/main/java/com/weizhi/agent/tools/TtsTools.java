package com.weizhi.agent.tools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.weizhi.agent.config.StorageProperties;
import com.weizhi.agent.model.TtsRequest;
import com.weizhi.agent.service.AiSettingsService;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Description;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;

@Configuration
public class TtsTools {
    private static final Logger log = LoggerFactory.getLogger(TtsTools.class);

    private final StorageProperties storageProperties;
    private final AiSettingsService settingsService;

    public TtsTools(StorageProperties storageProperties, AiSettingsService settingsService) {
        this.storageProperties = storageProperties;
        this.settingsService = settingsService;
    }

    private final OkHttpClient httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Bean
    @Description("把文本转为语音并保存为本地音频文件，返回可播放链接。")
    public Function<TtsRequest, String> ttsSynthesize() {
        return request -> {
            try {
                String text = request.getText() == null ? "" : request.getText().trim();
                if (text.isEmpty()) return "文本为空，无法生成语音。";

                String voiceId = blankToDefault(request.getVoiceId(), "male-qn-qingse");
                String model = blankToDefault(request.getModel(), "speech-2.8-hd");
                String format = blankToDefault(request.getFormat(), "mp3").toLowerCase();
                double speed = request.getSpeed() == null ? 1.0 : request.getSpeed();
                double vol = request.getVol() == null ? 1.0 : request.getVol();
                int pitch = request.getPitch() == null ? 0 : request.getPitch();
                int sampleRate = request.getSampleRate() == null ? 32000 : request.getSampleRate();
                int bitrate = request.getBitrate() == null ? 128000 : request.getBitrate();

                Map<String, Object> bodyMap = Map.of(
                        "model", model,
                        "text", text,
                        "stream", false,
                        "language_boost", "Chinese",
                        "output_format", "hex",
                        "voice_setting", Map.of(
                                "voice_id", voiceId,
                                "speed", speed,
                                "vol", vol,
                                "pitch", pitch
                        ),
                        "audio_setting", Map.of(
                                "sample_rate", sampleRate,
                                "bitrate", bitrate,
                                "format", format,
                                "channel", 1
                        )
                );

                Request httpRequest = new Request.Builder()
                        .url("https://api.minimaxi.com/v1/t2a_v2")
                        .addHeader("Authorization", "Bearer " + settingsService.apiKey("minimax"))
                        .post(RequestBody.create(objectMapper.writeValueAsString(bodyMap), MediaType.parse("application/json")))
                        .build();

                try (Response response = httpClient.newCall(httpRequest).execute()) {
                    if (!response.isSuccessful()) return "语音生成失败: " + response.message();
                    String raw = response.body().string();
                    JsonNode root = objectMapper.readTree(raw);
                    String hexAudio = root.at("/data/audio").asText();
                    if (hexAudio == null || hexAudio.isEmpty()) return "API 未返回有效语音数据。";

                    byte[] audioBytes = hexToBytes(hexAudio);
                    String fileName = FileUtils.generateUniqueFilename(format);
                    Path dir = Paths.get(storageProperties.getAudioDir()).toAbsolutePath();
                    Files.createDirectories(dir);
                    Files.write(dir.resolve(fileName), audioBytes);

                    return "语音已生成: /api/tts/audio/" + fileName;
                }
            } catch (Exception e) {
                log.error("TTS tool error", e);
                return "语音生成异常: " + e.getMessage();
            }
        };
    }

    @Bean
    @Description("返回当前可用的预置音色列表。")
    public Function<String, String> listVoices() {
        return ignored -> String.join(", ", defaultVoices());
    }

    public List<String> defaultVoices() {
        return List.of(
                "male-qn-qingse",
                "male-qn-jingying",
                "female-shaonv",
                "female-yujie",
                "female-tianmei",
                "Cantonese_CuteGirl"
        );
    }

    private static byte[] hexToBytes(String hex) {
        int len = hex.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hex.charAt(i), 16) << 4)
                    + Character.digit(hex.charAt(i + 1), 16));
        }
        return data;
    }

    private static String blankToDefault(String value, String defaultValue) {
        if (value == null || value.isBlank()) return defaultValue;
        return value.trim();
    }
}
