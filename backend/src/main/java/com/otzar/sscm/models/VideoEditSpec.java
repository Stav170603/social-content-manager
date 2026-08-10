package com.otzar.sscm.models;

public class VideoEditSpec {
    private int index;
    private Double start;
    private Double end;
    private boolean muted;
    private int brightness;
    private int contrast;
    private int saturation;
    private int rotation;
    private int vignette;
    private String aspectRatio = "original";
    private String musicPublicId;
    private Double musicStart;
    private int originalVolume = 100;
    private int musicVolume = 100;

    public int getIndex() { return index; }
    public void setIndex(int index) { this.index = index; }
    public Double getStart() { return start; }
    public void setStart(Double start) { this.start = start; }
    public Double getEnd() { return end; }
    public void setEnd(Double end) { this.end = end; }
    public boolean isMuted() { return muted; }
    public void setMuted(boolean muted) { this.muted = muted; }
    public int getBrightness() { return brightness; }
    public void setBrightness(int value) { brightness = value; }
    public int getContrast() { return contrast; }
    public void setContrast(int value) { contrast = value; }
    public int getSaturation() { return saturation; }
    public void setSaturation(int value) { saturation = value; }
    public int getRotation() { return rotation; }
    public void setRotation(int value) { rotation = value; }
    public int getVignette() { return vignette; }
    public void setVignette(int value) { vignette = value; }
    public String getAspectRatio() { return aspectRatio; }
    public void setAspectRatio(String value) { aspectRatio = value == null ? "original" : value; }
    public String getMusicPublicId() { return musicPublicId; }
    public void setMusicPublicId(String value) { musicPublicId = value; }
    public Double getMusicStart() { return musicStart; }
    public void setMusicStart(Double value) { musicStart = value; }
    public int getOriginalVolume() { return originalVolume; }
    public void setOriginalVolume(int value) { originalVolume = value; }
    public int getMusicVolume() { return musicVolume; }
    public void setMusicVolume(int value) { musicVolume = value; }

    public boolean hasProcessing() {
        return (start != null && start > 0) || end != null || muted || brightness != 0 || contrast != 0
                || saturation != 0 || rotation != 0 || vignette != 0 || !"original".equals(aspectRatio)
                || musicPublicId != null || originalVolume != 100;
    }

    public void validate() {
        if (index < 0 || (start != null && start < 0) || (end != null && end <= 0)
                || (start != null && end != null && end <= start)) {
            throw new IllegalArgumentException("Invalid video trim range");
        }
        if (brightness < -100 || brightness > 100 || contrast < -100 || contrast > 100
                || saturation < -100 || saturation > 100 || vignette < 0 || vignette > 100
                || rotation % 90 != 0 || !java.util.Set.of("original", "1:1", "4:5", "9:16").contains(aspectRatio)
                || originalVolume < 0 || originalVolume > 100 || musicVolume < 0 || musicVolume > 100
                || (musicStart != null && musicStart < 0)) {
            throw new IllegalArgumentException("Unsupported video transformation");
        }
    }
}
