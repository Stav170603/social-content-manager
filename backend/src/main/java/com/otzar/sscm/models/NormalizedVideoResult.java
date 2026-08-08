package com.otzar.sscm.models;

public class NormalizedVideoResult {
    private final String url;
    private final String publicId;
    private final String format;
    private final String videoCodec;
    private final String audioCodec;

    public NormalizedVideoResult(String url, String publicId, String format, String videoCodec, String audioCodec) {
        this.url = url; this.publicId = publicId; this.format = format; this.videoCodec = videoCodec; this.audioCodec = audioCodec;
    }
    public String getUrl() { return url; }
    public String getPublicId() { return publicId; }
    public String getFormat() { return format; }
    public String getVideoCodec() { return videoCodec; }
    public String getAudioCodec() { return audioCodec; }
}
