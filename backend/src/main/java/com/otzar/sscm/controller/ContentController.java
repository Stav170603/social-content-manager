package com.otzar.sscm.controller;

import com.otzar.sscm.entities.Content;
import com.otzar.sscm.entities.ContentStatus;
import com.otzar.sscm.entities.User;
import com.otzar.sscm.entities.NotificationType;
import com.otzar.sscm.entities.ContentMedia;
import com.otzar.sscm.models.ApiResponse;
import com.otzar.sscm.models.CreateContentMultipartRequest;
import com.otzar.sscm.models.VideoEditSpec;
import com.otzar.sscm.models.NormalizedVideoResult;
import com.otzar.sscm.models.VideoNormalizationException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.otzar.sscm.models.ContentVersionResponse;
import com.otzar.sscm.service.AuthService;
import com.otzar.sscm.service.ContentService;
import com.otzar.sscm.service.ContentVersionService;
import com.otzar.sscm.service.FileStorageService;
import com.otzar.sscm.service.NotificationService;
import com.otzar.sscm.service.SocialPublishingService;
import com.otzar.sscm.service.InstagramPublishService;
import com.otzar.sscm.service.ContentService.ContentOperationResult;
import com.otzar.sscm.service.ContentService.RestoreContentVersionResult;
import com.otzar.sscm.models.RejectContentRequest;
import com.otzar.sscm.models.UpdateScheduleRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import javax.validation.Valid;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/contents")
public class ContentController {

    private static final Logger logger = LoggerFactory.getLogger(ContentController.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private final ContentService contentService;
    private final ContentVersionService contentVersionService;
    private final AuthService authService;
    private final FileStorageService fileStorageService;
    private final NotificationService notificationService;
    private final SocialPublishingService socialPublishingService;
    private final InstagramPublishService instagramPublishService;

    public ContentController(ContentService contentService, ContentVersionService contentVersionService,
                             AuthService authService,
                             FileStorageService fileStorageService, NotificationService notificationService,
                             SocialPublishingService socialPublishingService,
                             InstagramPublishService instagramPublishService) {
        this.contentService = contentService;
        this.contentVersionService = contentVersionService;
        this.authService = authService;
        this.fileStorageService = fileStorageService;
        this.notificationService = notificationService;
        this.socialPublishingService = socialPublishingService;
        this.instagramPublishService = instagramPublishService;
    }

    @GetMapping
    public ResponseEntity<List<Content>> getAllContents(@CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        User user = currentUser.get();

        if (authService.isAdmin(user)) {
            return ResponseEntity.ok(contentService.findAll());
        }

        return authService.findClientIdForUser(user)
                .map(clientId -> ResponseEntity.ok(contentService.findByClientId(clientId)))
                .orElseGet(() -> ResponseEntity.ok(Collections.emptyList()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Content> getContentById(@PathVariable Long id,
                                                  @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<Content> content = contentService.findById(id);

        if (content.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        if (!authService.canAccessContent(currentUser.get(), content.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return ResponseEntity.ok(content.get());
    }

    @PostMapping("/{contentId}/publish/instagram")
    public ResponseEntity<?> publishToInstagram(
            @PathVariable Long contentId,
            @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);
        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse(false, "Authentication required"));
        }
        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new ApiResponse(false, "Administrator access required"));
        }
        return ResponseEntity.ok(instagramPublishService.publish(contentId));
    }

    @GetMapping("/{id}/versions")
    public ResponseEntity<List<ContentVersionResponse>> getContentVersions(
            @PathVariable Long id,
            @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);
        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<Content> content = contentService.findById(id);
        if (content.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        if (!authService.canAccessContent(currentUser.get(), content.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return ResponseEntity.ok(contentVersionService.findHistory(id));
    }

    @PostMapping("/{contentId}/versions/{versionNumber}/restore")
    public ResponseEntity<?> restoreContentVersion(
            @PathVariable Long contentId,
            @PathVariable Integer versionNumber,
            @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);
        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        try {
            RestoreContentVersionResult result = contentService.restoreVersion(
                    contentId, versionNumber, currentUser.get().getUser_id());
            if (!result.isSuccess()) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(result.getResponse());
        } catch (IllegalStateException ex) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, ex.getMessage()));
        }
    }

    @GetMapping("/by-client")
    public ResponseEntity<List<Content>> getContentsByClient(@RequestParam Long clientId,
                                                             @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!authService.canAccessClient(currentUser.get(), clientId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return ResponseEntity.ok(contentService.findByClientId(clientId));
    }

    @GetMapping("/client/{clientId}")
    public ResponseEntity<List<Content>> getContentsByClientId(@PathVariable Long clientId,
                                                               @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!authService.canAccessClient(currentUser.get(), clientId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return contentService.findByClientIdIfClientExists(clientId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/status/{status}")
    public ResponseEntity<List<Content>> getContentsByStatus(@PathVariable String status,
                                                             @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            ContentStatus contentStatus = parseStatus(status);
            User user = currentUser.get();

            if (authService.isAdmin(user)) {
                return ResponseEntity.ok(contentService.findByStatus(contentStatus));
            }

            return authService.findClientIdForUser(user)
                    .map(clientId -> ResponseEntity.ok(contentService.findByClientIdAndStatus(clientId, contentStatus)))
                    .orElseGet(() -> ResponseEntity.ok(Collections.emptyList()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> addContent(@Valid @RequestBody Content content,
                                              @CookieValue(value = "token", required = false) String token) {
        return createContent(content, token);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> addContentWithFile(
            @Valid @ModelAttribute CreateContentMultipartRequest request,
            @CookieValue(value = "token", required = false) String token) {
        logger.info("Create content multipart request: clientId={}, titlePresent={}, mediaFileCount={}",
                request.getClientId(),
                request.getTitle() != null && !request.getTitle().trim().isEmpty(),
                request.allFiles().size());

        Optional<User> currentUser = authService.findUserByToken(token);
        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse(false, "Authentication required"));
        }
        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new ApiResponse(false, "You are not allowed to create content"));
        }
        if (!contentService.clientExists(request.getClientId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ApiResponse(false, "Client not found for id: " + request.getClientId()));
        }

        Content content = new Content();
        content.setClientId(request.getClientId());
        content.setTitle(request.getTitle().trim());
        content.setDescription(request.getDescription());
        content.setContent_type(request.getContentType());
        content.setPlannedPublishDate(request.getPlannedPublishDate());

        try {
            List<org.springframework.web.multipart.MultipartFile> files = request.allFiles();
            for (int index = 0; index < files.size(); index++) {
                String contentType = files.get(index).getContentType();
                logger.info("Create content media part: index={}, detectedType={}", index,
                        isVideoFile(files.get(index)) ? "VIDEO" : "IMAGE");
            }
            List<ContentMedia> media = storeMultipartMedia(request, files);
            logger.info("Create content media upload completed: receivedCount={}, uploadedCount={}",
                    files.size(), media.size());
            if (!media.isEmpty()) {
                content.setMedia(media); content.setFile_url(media.get(0).getMediaUrl());
                content.setContent_type(media.get(0).getMediaType());
            }
        } catch (IllegalArgumentException | IllegalStateException ex) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, ex.getMessage()));
        } catch (IOException ex) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(new ApiResponse(false, "Could not save uploaded file"));
        }

        return createContent(content, token);
    }

    private ResponseEntity<?> createContent(Content content, String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new ApiResponse(false, "Authentication required"));
        }

        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new ApiResponse(false, "You are not allowed to create content"));
        }

        ContentOperationResult result;

        try {
            result = contentService.create(content, currentUser.get().getUser_id());
        } catch (IllegalArgumentException | IllegalStateException ex) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, ex.getMessage()));
        }

        if (!result.isSuccess()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new ApiResponse(false, "Content must be connected to a client"));
        }

        Content created = result.getContent();
        notificationService.notifyClient(created, NotificationType.CONTENT_CREATED,
                "תוכן חדש נוצר", "נוצר עבורך תוכן חדש: " + created.getTitle());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Content> updateContent(@PathVariable Long id,
                                                 @RequestBody Content content,
                                                 @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        ContentOperationResult result;

        try {
            result = contentService.update(id, content, currentUser.get().getUser_id());
        } catch (IllegalArgumentException | IllegalStateException ex) {
            return ResponseEntity.badRequest().build();
        }

        if (!result.isSuccess()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(result.getContent());
    }

    @PostMapping(value = "/normalize-video", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> normalizeVideo(@RequestParam("file") MultipartFile file,
                                            @CookieValue(value = "token", required = false) String token) {
        Optional<User> user = authService.findUserByToken(token);
        if (user.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiResponse(false, "Authentication required"));
        if (!authService.isAdmin(user.get())) return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ApiResponse(false, "Video normalization is restricted"));
        try {
            NormalizedVideoResult result = fileStorageService.normalizeVideo(file);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, exception.getMessage()));
        } catch (IllegalStateException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ApiResponse(false, exception.getMessage()));
        } catch (VideoNormalizationException exception) {
            logger.warn("Video normalization failed: code={}, upstreamStatus={}", exception.getCode(), exception.getUpstreamStatus());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of(
                    "success", false, "code", exception.getCode(), "message", "Video normalization failed"));
        } catch (IOException | RuntimeException exception) {
            logger.warn("Video normalization failed: code=VIDEO_NORMALIZATION_TRANSCODE_FAILED, exceptionType={}", exception.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of(
                    "success", false, "code", "VIDEO_NORMALIZATION_TRANSCODE_FAILED", "message", "Video normalization failed"));
        }
    }

    @DeleteMapping("/normalize-video")
    public ResponseEntity<?> deleteNormalizedVideo(@RequestParam("publicId") String publicId,
                                                   @CookieValue(value = "token", required = false) String token) {
        Optional<User> user = authService.findUserByToken(token);
        if (user.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!authService.isAdmin(user.get())) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try {
            fileStorageService.deleteTemporaryVideo(publicId);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, exception.getMessage()));
        } catch (IOException | RuntimeException exception) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(new ApiResponse(false, "Temporary video cleanup failed"));
        }
    }

    @PutMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> updateContentWithMedia(
            @PathVariable Long id,
            @Valid @ModelAttribute CreateContentMultipartRequest request,
            @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);
        if (currentUser.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        if (!authService.isAdmin(currentUser.get())) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();

        Content update = new Content();
        update.setClientId(request.getClientId());
        update.setTitle(request.getTitle().trim());
        update.setDescription(request.getDescription());
        update.setContent_type(request.getContentType());
        update.setPlannedPublishDate(request.getPlannedPublishDate());
        try {
            // The persisted content is untouched unless the replacement upload completes.
            List<org.springframework.web.multipart.MultipartFile> files = request.allFiles();
            List<ContentMedia> media = storeMultipartMedia(request, files);
            if (!media.isEmpty()) {
                update.setMedia(media); update.setFile_url(media.get(0).getMediaUrl()); update.setContent_type(media.get(0).getMediaType());
            }
            ContentOperationResult result = contentService.update(id, update, currentUser.get().getUser_id());
            if (!result.isSuccess()) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(result.getContent());
        } catch (IllegalArgumentException | IllegalStateException exception) {
            return ResponseEntity.badRequest().body(new ApiResponse(false, exception.getMessage()));
        } catch (IOException exception) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(new ApiResponse(false, "Could not upload replacement media"));
        }
    }

    private List<ContentMedia> storeMultipartMedia(CreateContentMultipartRequest request,
                                                    List<org.springframework.web.multipart.MultipartFile> files) throws IOException {
        List<VideoEditSpec> indexedEdits = new ArrayList<>(Collections.nCopies(files.size(), null));
        if (request.getVideoEditsJson() != null && !request.getVideoEditsJson().trim().isEmpty()) {
            try {
                List<VideoEditSpec> edits = OBJECT_MAPPER.readValue(request.getVideoEditsJson(), new TypeReference<List<VideoEditSpec>>() {});
                for (VideoEditSpec edit : edits) {
                    edit.validate();
                    if (edit.getIndex() >= files.size()) throw new IllegalArgumentException("Invalid video edit media index");
                    if (!isVideoFile(files.get(edit.getIndex()))) throw new IllegalArgumentException("Video edits can only target video media");
                    indexedEdits.set(edit.getIndex(), edit);
                }
            } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
                throw new IllegalArgumentException("Invalid video edit metadata");
            }
        }

        List<String> urls = fileStorageService.storeAll(files, indexedEdits);
        Map<Integer, String> covers = new HashMap<>();
        if (request.getCoverFiles().size() != request.getCoverMediaIndexes().size()) {
            throw new IllegalArgumentException("Video cover files and indexes must match");
        }
        for (int coverIndex = 0; coverIndex < request.getCoverFiles().size(); coverIndex++) {
            int mediaIndex = request.getCoverMediaIndexes().get(coverIndex);
            if (mediaIndex < 0 || mediaIndex >= files.size()) throw new IllegalArgumentException("Invalid video cover media index");
            if (!isVideoFile(files.get(mediaIndex))) throw new IllegalArgumentException("A cover can only target video media");
            covers.put(mediaIndex, fileStorageService.store(request.getCoverFiles().get(coverIndex)));
        }

        List<ContentMedia> media = new ArrayList<>();
        for (int index = 0; index < urls.size(); index++) {
            ContentMedia item = new ContentMedia();
            item.setMediaUrl(urls.get(index));
            item.setMediaType(isVideoFile(files.get(index)) ? "VIDEO" : "IMAGE");
            item.setDisplayOrder(index);
            item.setThumbnailUrl(covers.get(index));
            media.add(item);
        }
        return media;
    }

    private boolean isVideoFile(org.springframework.web.multipart.MultipartFile file) {
        String mime = file.getContentType();
        if (mime != null && mime.toLowerCase(Locale.ROOT).startsWith("video/")) return true;
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        return name.endsWith(".mp4") || name.endsWith(".m4v") || name.endsWith(".mov");
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteContent(@PathVariable Long id,
                                              @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        if (!contentService.delete(id)) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/schedule")
    public ResponseEntity<Content> updateSchedule(@PathVariable Long id,
                                                  @RequestBody UpdateScheduleRequest request,
                                                  @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);
        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        if (request == null || request.getPlannedPublishDate() == null) {
            return ResponseEntity.badRequest().build();
        }

        return contentService.updatePlannedPublishDate(
                        id, request.getPlannedPublishDate(), currentUser.get().getUser_id())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}/status")
    public ResponseEntity<Content> updateStatus(@PathVariable Long id,
                                                @RequestParam String status,
                                                @Valid @RequestBody(required = false) RejectContentRequest request,
                                                @CookieValue(value = "token", required = false) String token) {
        ContentStatus requestedStatus;

        try {
            requestedStatus = parseStatus(status);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }

        if (requestedStatus == ContentStatus.APPROVED) {
            return clientStatusChange(id, token, user -> contentService.approve(id, user.getUser_id()).map(content -> {
                notificationService.notifyAdmin(content, NotificationType.CONTENT_APPROVED,
                        "התוכן אושר", "הלקוח אישר את התוכן ‘" + content.getTitle() + "’");
                return content;
            }));
        }

        if (requestedStatus == ContentStatus.REJECTED) {
            return clientRejection(id, token, request);
        }

        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        try {
            if (requestedStatus == ContentStatus.PUBLISHED) {
                return socialPublishingService.publish(id, currentUser.get().getUser_id())
                        .map(ResponseEntity::ok)
                        .orElseGet(() -> ResponseEntity.notFound().build());
            }
            return withStatusNotification(contentService.updateStatus(
                            id, requestedStatus.name(), currentUser.get().getUser_id()), requestedStatus)
                    .map(ResponseEntity::ok)
                    .orElseGet(() -> ResponseEntity.notFound().build());
        } catch (IllegalArgumentException | IllegalStateException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PutMapping("/{id}/send-for-approval")
    public ResponseEntity<Content> sendForApproval(@PathVariable Long id,
                                                   @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        ContentStatus previousStatus = contentService.findById(id).map(Content::getStatus).orElse(null);
        return changeStatus(() -> contentService.sendForApproval(id, currentUser.get().getUser_id()).map(content -> {
            NotificationType type = previousStatus == ContentStatus.REJECTED
                    ? NotificationType.CONTENT_RESUBMITTED : NotificationType.CONTENT_WAITING_APPROVAL;
            String title = type == NotificationType.CONTENT_RESUBMITTED ? "התוכן הוגש מחדש" : "תוכן ממתין לאישור";
            notificationService.notifyClient(content, type, title, "התוכן ‘" + content.getTitle() + "’ מוכן לבדיקה");
            return content;
        }));
    }

    @PutMapping("/{id}/approve")
    public ResponseEntity<Content> approve(@PathVariable Long id,
                                           @CookieValue(value = "token", required = false) String token) {
        return clientStatusChange(id, token, user -> contentService.approve(id, user.getUser_id()).map(content -> {
            notificationService.notifyAdmin(content, NotificationType.CONTENT_APPROVED,
                    "התוכן אושר", "הלקוח אישר את התוכן ‘" + content.getTitle() + "’");
            return content;
        }));
    }

    @PutMapping("/{id}/reject")
    public ResponseEntity<Content> reject(@PathVariable Long id,
                                          @Valid @RequestBody RejectContentRequest request,
                                          @CookieValue(value = "token", required = false) String token) {
        return clientRejection(id, token, request);
    }

    @PutMapping("/{id}/publish")
    public ResponseEntity<Content> publish(@PathVariable Long id,
                                           @CookieValue(value = "token", required = false) String token) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!authService.isAdmin(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return changeStatus(() -> socialPublishingService.publish(id, currentUser.get().getUser_id()));
    }

    private ResponseEntity<Content> clientStatusChange(Long id, String token, ClientContentStatusOperation operation) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!authService.isClient(currentUser.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Optional<Content> content = contentService.findById(id);

        if (content.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        if (!authService.canAccessContent(currentUser.get(), content.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return changeStatus(() -> operation.execute(currentUser.get()));
    }

    private ResponseEntity<Content> clientRejection(Long id, String token, RejectContentRequest request) {
        Optional<User> currentUser = authService.findUserByToken(token);

        if (currentUser.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        User user = currentUser.get();
        if (!authService.isClient(user)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Optional<Content> content = contentService.findById(id);
        if (content.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        if (!authService.canAccessContent(user, content.get())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        String reason = request == null ? null : request.getReason();
        return changeStatus(() -> contentService.reject(id, user.getUser_id(), reason).map(rejected -> {
            notificationService.notifyAdmin(rejected, NotificationType.CONTENT_REJECTED,
                    "התוכן נדחה", "התוכן ‘" + rejected.getTitle() + "’ נדחה. סיבה: " + reason.trim());
            return rejected;
        }));
    }

    private Optional<Content> withStatusNotification(Optional<Content> result, ContentStatus status) {
        return result.map(content -> {
            if (status == ContentStatus.WAITING_APPROVAL) {
                notificationService.notifyClient(content, NotificationType.CONTENT_WAITING_APPROVAL,
                        "תוכן ממתין לאישור", "התוכן ‘" + content.getTitle() + "’ מוכן לבדיקה");
            } else if (status == ContentStatus.PUBLISHED) {
                notificationService.notifyClient(content, NotificationType.CONTENT_PUBLISHED,
                        "התוכן פורסם", "התוכן ‘" + content.getTitle() + "’ פורסם");
            }
            return content;
        });
    }

    private ContentStatus parseStatus(String status) {
        return ContentStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
    }

    private ResponseEntity<Content> changeStatus(ContentStatusOperation operation) {
        try {
            return operation.execute()
                    .map(ResponseEntity::ok)
                    .orElseGet(() -> ResponseEntity.notFound().build());
        } catch (IllegalArgumentException | IllegalStateException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    private interface ContentStatusOperation {
        Optional<Content> execute();
    }

    private interface ClientContentStatusOperation {
        Optional<Content> execute(User user);
    }
}
