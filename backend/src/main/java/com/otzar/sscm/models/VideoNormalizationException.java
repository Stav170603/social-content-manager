package com.otzar.sscm.models;

public class VideoNormalizationException extends RuntimeException {
    private final String code;
    private final Integer upstreamStatus;

    public VideoNormalizationException(String code, String message, Integer upstreamStatus, Throwable cause) {
        super(message, cause);
        this.code = code;
        this.upstreamStatus = upstreamStatus;
    }

    public String getCode() { return code; }
    public Integer getUpstreamStatus() { return upstreamStatus; }
}
