package com.otzar.sscm.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.otzar.sscm.entities.Content;
import com.otzar.sscm.entities.ContentStatus;
import com.otzar.sscm.models.InstagramPublishResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import com.otzar.sscm.entities.ContentMedia;

@Service
public class InstagramPublishService {
    private static final org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(InstagramPublishService.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();
    private final ContentService contentService;
    private final RestTemplate restTemplate;
    private final String instagramUserId;
    private final String accessToken;
    private final String graphApiBaseUrl;
    private final InstagramConnectionSettingsService connectionSettings;
    private final int readinessAttempts;
    private final long pollIntervalMillis;

    @Autowired
    public InstagramPublishService(
            ContentService contentService,
            @Value("${META_INSTAGRAM_USER_ID:}") String instagramUserId,
            @Value("${META_PAGE_ACCESS_TOKEN:}") String accessToken,
            @Value("${META_GRAPH_API_BASE_URL:${META_GRAPH_API_BASE:https://graph.facebook.com/v25.0}}") String graphApiBaseUrl,
            InstagramConnectionSettingsService connectionSettings) {
        this(contentService, new RestTemplate(), instagramUserId, accessToken, graphApiBaseUrl,
                connectionSettings, 30, 2000);
    }

    public InstagramPublishService(ContentService contentService, RestTemplate restTemplate,
                                   String instagramUserId, String accessToken, String graphApiBaseUrl) {
        this(contentService, restTemplate, instagramUserId, accessToken, graphApiBaseUrl, null, 30, 2000);
    }

    public InstagramPublishService(ContentService contentService, RestTemplate restTemplate,
                                   String instagramUserId, String accessToken, String graphApiBaseUrl,
                                   int readinessAttempts, long pollIntervalMillis) {
        this(contentService, restTemplate, instagramUserId, accessToken, graphApiBaseUrl, null,
                readinessAttempts, pollIntervalMillis);
    }

    private InstagramPublishService(ContentService contentService, RestTemplate restTemplate,
                                   String instagramUserId, String accessToken, String graphApiBaseUrl,
                                   InstagramConnectionSettingsService connectionSettings,
                                   int readinessAttempts, long pollIntervalMillis) {
        this.contentService = contentService;
        this.restTemplate = restTemplate;
        this.instagramUserId = trim(instagramUserId);
        this.accessToken = trim(accessToken);
        this.graphApiBaseUrl = trimTrailingSlash(graphApiBaseUrl);
        this.connectionSettings = connectionSettings;
        this.readinessAttempts = readinessAttempts;
        this.pollIntervalMillis = pollIntervalMillis;
    }

    public InstagramPublishResponse publish(Long contentId) {
        requireConfiguration();
        Content content = contentService.findById(contentId)
                .orElseThrow(() -> new InstagramPublishException(
                        InstagramPublishException.Reason.CONTENT_NOT_FOUND, "Content not found"));
        validateContent(content);

        if (content.getMedia() != null && content.getMedia().size() > 1) return publishCarousel(content);

        boolean video = isVideo(content);
        MultiValueMap<String, String> container = form(
                video ? "video_url" : "image_url", content.getFile_url(),
                "caption", content.getDescription() == null ? "" : content.getDescription());
        if (video) container.add("media_type", "REELS");
        String creationId = postForId("media", container);
        logger.info("Instagram container created contentId={} mediaType={} containerIdPresent={}",
                contentId, video ? "VIDEO/REEL" : "IMAGE", !creationId.isBlank());
        waitUntilReady(creationId);
        String mediaId = publishReadyContainer(creationId);
        return new InstagramPublishResponse(true, mediaId);
    }

    private InstagramPublishResponse publishCarousel(Content content) {
        List<ContentMedia> items = content.getMedia();
        if (items.size() < 2 || items.size() > 10)
            throw new InstagramPublishException(InstagramPublishException.Reason.UNSUPPORTED_MEDIA,
                    "Instagram carousels require between 2 and 10 media items");
        List<String> children = new ArrayList<>();
        for (ContentMedia item : items) {
            boolean video = "VIDEO".equalsIgnoreCase(item.getMediaType());
            if (!video && !"IMAGE".equalsIgnoreCase(item.getMediaType()))
                throw new InstagramPublishException(InstagramPublishException.Reason.UNSUPPORTED_MEDIA, "Unsupported carousel media type");
            if (!isPublicHttpsUrl(item.getMediaUrl()))
                throw new InstagramPublishException(InstagramPublishException.Reason.IMAGE_NOT_PUBLIC, "Carousel media must have a public HTTPS URL");
            MultiValueMap<String,String> child = form(video ? "video_url" : "image_url", item.getMediaUrl(),
                    "is_carousel_item", "true");
            if (video) child.add("media_type", "VIDEO");
            String childId = postForId("media", child);
            if (video) waitUntilReady(childId);
            children.add(childId);
        }
        MultiValueMap<String,String> parent = form("media_type", "CAROUSEL", "children", String.join(",",children),
                "caption", content.getDescription()==null?"":content.getDescription());
        String parentId = postForId("media", parent);
        logger.info("Instagram final carousel container created contentId={} containerIdPresent={}",
                content.getContent_id(), !parentId.isBlank());
        waitUntilReady(parentId);
        String mediaId = publishReadyContainer(parentId);
        return new InstagramPublishResponse(true, mediaId);
    }

    private String publishReadyContainer(String creationId) {
        try {
            logger.info("Instagram media_publish attempt containerIdPresent=true retry=false");
            return postForId("media_publish", form("creation_id", creationId));
        } catch (InstagramPublishException exception) {
            if (!Integer.valueOf(9007).equals(exception.getMetaCode())
                    || !Integer.valueOf(2207027).equals(exception.getMetaSubcode())) throw exception;
            logger.info("Instagram media_publish reported not-ready; rechecking same container before one retry");
            waitUntilReady(creationId);
            logger.info("Instagram media_publish attempt containerIdPresent=true retry=true");
            return postForId("media_publish", form("creation_id", creationId));
        }
    }

    private void waitUntilReady(String creationId) {
        for (int attempt = 0; attempt < readinessAttempts; attempt++) {
            URI uri = UriComponentsBuilder.fromHttpUrl(currentGraphApiBaseUrl())
                    .pathSegment(creationId)
                    .queryParam("fields", "status_code,status")
                    .build().encode().toUri();
            try {
                HttpHeaders headers = new HttpHeaders();
                headers.setBearerAuth(currentAccessToken());
                ResponseEntity<Map> response = restTemplate.exchange(
                        uri, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
                Map body = response.getBody();
                String status = body == null ? "" : String.valueOf(body.get("status_code"));
                logger.info("Instagram container status poll attempt={} status={}", attempt + 1,
                        status.isBlank() ? "UNKNOWN" : status);
                if ("FINISHED".equals(status)) return;
                if ("ERROR".equals(status) || "EXPIRED".equals(status)) {
                    throw new InstagramPublishException(
                            InstagramPublishException.Reason.MEDIA_PROCESSING_FAILED,
                            "אינסטגרם לא הצליחה לעבד את המדיה לפרסום");
                }
                if (pollIntervalMillis > 0) Thread.sleep(pollIntervalMillis);
            } catch (InstagramPublishException exception) {
                throw exception;
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new InstagramPublishException(
                        InstagramPublishException.Reason.MEDIA_PROCESSING_FAILED,
                        "Video processing was interrupted", exception);
            } catch (HttpStatusCodeException exception) {
                throw metaFailure("video processing status", exception);
            } catch (RestClientException exception) {
                throw new InstagramPublishException(
                        InstagramPublishException.Reason.META_API_FAILURE,
                        "Could not check Instagram video processing", exception);
            }
        }
        throw new InstagramPublishException(
                InstagramPublishException.Reason.MEDIA_PROCESSING_FAILED,
                "המדיה עדיין בעיבוד באינסטגרם. נסו לפרסם שוב בעוד מספר שניות.");
    }

    private String postForId(String action, MultiValueMap<String, String> form) {
        URI uri = UriComponentsBuilder.fromHttpUrl(currentGraphApiBaseUrl())
                .pathSegment(currentInstagramUserId(), action)
                .build()
                .toUri();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        headers.setBearerAuth(currentAccessToken());
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    uri, new HttpEntity<>(form, headers), Map.class);
            Object id = response.getBody() == null ? null : response.getBody().get("id");
            if (id == null || id.toString().trim().isEmpty()) {
                throw new InstagramPublishException(
                        InstagramPublishException.Reason.META_API_FAILURE,
                        "Meta API returned an invalid response");
            }
            return id.toString();
        } catch (InstagramPublishException exception) {
            throw exception;
        } catch (HttpStatusCodeException exception) {
            throw metaFailure("media_publish".equals(action) ? "media publish" : "media container creation", exception);
        } catch (RestClientException exception) {
            throw new InstagramPublishException(
                    InstagramPublishException.Reason.META_API_FAILURE,
                    "Instagram publishing failed at Meta", exception);
        }
    }

    private void validateContent(Content content) {
        if (content.getStatus() != ContentStatus.APPROVED) {
            throw new InstagramPublishException(
                    InstagramPublishException.Reason.CONTENT_NOT_APPROVED,
                    "Only approved content can be published to Instagram");
        }
        boolean carousel = content.getMedia()!=null && content.getMedia().size()>1;
        if (!carousel && (content.getFile_url() == null || content.getFile_url().trim().isEmpty())) {
            throw new InstagramPublishException(
                    InstagramPublishException.Reason.IMAGE_REQUIRED,
                    "Media is required for Instagram publishing");
        }
        String type = content.getContent_type() == null ? "" : content.getContent_type().toUpperCase();
        if (!carousel && !type.equals("IMAGE") && !type.equals("VIDEO") && !type.equals("REEL")) {
            throw new InstagramPublishException(
                    InstagramPublishException.Reason.UNSUPPORTED_MEDIA,
                    "Only images, videos, and reels can be published");
        }
        if (!carousel && !isPublicHttpsUrl(content.getFile_url())) {
            throw new InstagramPublishException(
                    InstagramPublishException.Reason.IMAGE_NOT_PUBLIC,
                    "The image must have a public HTTPS URL");
        }
    }

    private InstagramPublishException metaFailure(String stage, HttpStatusCodeException exception) {
        Integer code = null;
        Integer subcode = null;
        String message = "Meta did not provide an error message";
        try {
            JsonNode error = objectMapper.readTree(exception.getResponseBodyAsString()).path("error");
            code = error.path("code").isInt() ? error.path("code").intValue() : null;
            subcode = error.path("error_subcode").isInt() ? error.path("error_subcode").intValue() : null;
            message = sanitizeMetaMessage(error.path("message").asText(message));
        } catch (Exception ignored) {
            message = "Meta returned an unreadable error response";
        }
        logger.warn("Instagram publish failed stage={} metaStatus={} metaCode={} metaSubcode={} message={}",
                stage, exception.getRawStatusCode(), code, subcode, message);
        String details = "Meta rejected " + stage + " (HTTP " + exception.getRawStatusCode()
                + ", code " + (code == null ? "not provided" : code)
                + ", subcode " + (subcode == null ? "not provided" : subcode) + "): " + message;
        return new InstagramPublishException(InstagramPublishException.Reason.META_API_FAILURE, details,
                exception, code, subcode);
    }

    private String sanitizeMetaMessage(String message) {
        if (message == null || message.isBlank()) return "Meta did not provide an error message";
        String sanitized = message
                .replaceAll("(?i)(access[_ ]?token[=:\\s]+)[^\\s,;]+", "$1[redacted]")
                .replaceAll("(?i)bearer\\s+[^\\s,;]+", "Bearer [redacted]")
                .replaceAll("(?i)https?://[^\\s]+", "[redacted URL]");
        return sanitized.length() > 300 ? sanitized.substring(0, 300) : sanitized;
    }

    private boolean isVideo(Content content) {
        String type = content.getContent_type() == null ? "" : content.getContent_type();
        return "VIDEO".equalsIgnoreCase(type) || "REEL".equalsIgnoreCase(type);
    }

    private boolean isPublicHttpsUrl(String value) {
        try {
            URI uri = new URI(value);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null) return false;
            String normalized = host.toLowerCase();
            return !normalized.equals("localhost")
                    && !normalized.equals("127.0.0.1")
                    && !normalized.startsWith("10.")
                    && !normalized.startsWith("192.168.")
                    && !normalized.matches("^172\\.(1[6-9]|2\\d|3[01])\\..*");
        } catch (URISyntaxException exception) {
            return false;
        }
    }

    private void requireConfiguration() {
        if (currentInstagramUserId().isEmpty() || currentAccessToken().isEmpty()
                || currentGraphApiBaseUrl().isEmpty()) {
            throw new InstagramPublishException(
                    InstagramPublishException.Reason.NOT_CONFIGURED,
                    "Instagram publishing is not configured");
        }
    }

    private MultiValueMap<String, String> form(String... values) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        for (int index = 0; index < values.length; index += 2) {
            form.add(values[index], values[index + 1]);
        }
        return form;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static String trimTrailingSlash(String value) {
        String result = trim(value);
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }
    private String currentInstagramUserId() {
        return connectionSettings == null ? instagramUserId : trim(connectionSettings.instagramUserId());
    }
    private String currentGraphApiBaseUrl() {
        return connectionSettings == null ? graphApiBaseUrl
                : trimTrailingSlash(connectionSettings.graphApiBaseUrl());
    }
    private String currentAccessToken() {
        return connectionSettings == null ? accessToken : trim(connectionSettings.accessToken());
    }
}
