package com.weizhi.agent.config;

import com.weizhi.agent.logging.LogStreamService;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import org.springframework.context.annotation.Configuration;
import jakarta.annotation.PostConstruct;

@Configuration
public class LogAppenderConfig {
    private final LogStreamService logStreamService;

    public LogAppenderConfig(LogStreamService logStreamService) {
        this.logStreamService = logStreamService;
    }

    @PostConstruct
    public void init() {
        ch.qos.logback.classic.Logger root = (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        AppenderBase<ILoggingEvent> appender = new AppenderBase<>() {
            @Override
            protected void append(ILoggingEvent eventObject) {
                logStreamService.capture(eventObject);
            }
        };
        appender.setContext(root.getLoggerContext());
        appender.start();
        root.addAppender(appender);
    }
}
