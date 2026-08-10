package com.otzar.sscm.service;

public class InstagramPublishException extends RuntimeException {
    public enum Reason {
        NOT_CONFIGURED,
        CONTENT_NOT_FOUND,
        CONTENT_NOT_APPROVED,
        IMAGE_REQUIRED,
        IMAGE_NOT_PUBLIC,
        UNSUPPORTED_MEDIA,
        MEDIA_PROCESSING_FAILED,
        META_API_FAILURE
    }

    private final Reason reason;
    private final Integer metaCode;
    private final Integer metaSubcode;

    public InstagramPublishException(Reason reason, String message) {
        super(message);
        this.reason = reason;
        this.metaCode = null;
        this.metaSubcode = null;
    }

    public InstagramPublishException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
        this.metaCode = null;
        this.metaSubcode = null;
    }

    public InstagramPublishException(Reason reason, String message, Throwable cause,
                                     Integer metaCode, Integer metaSubcode) {
        super(message, cause);
        this.reason = reason;
        this.metaCode = metaCode;
        this.metaSubcode = metaSubcode;
    }

    public Reason getReason() { return reason; }
    public Integer getMetaCode() { return metaCode; }
    public Integer getMetaSubcode() { return metaSubcode; }
}
