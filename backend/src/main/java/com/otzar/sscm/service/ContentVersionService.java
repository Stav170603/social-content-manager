package com.otzar.sscm.service;

import com.otzar.sscm.entities.Content;
import com.otzar.sscm.entities.ContentVersion;
import com.otzar.sscm.entities.ContentVersionChangeType;
import com.otzar.sscm.models.ContentVersionResponse;
import com.otzar.sscm.repository.ContentVersionRepository;
import com.otzar.sscm.repository.ContentMediaRepository;
import com.otzar.sscm.repository.ContentVersionMediaRepository;
import com.otzar.sscm.entities.ContentMedia;
import com.otzar.sscm.entities.ContentVersionMedia;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class ContentVersionService {

    private final ContentVersionRepository contentVersionRepository;
    private final ContentMediaRepository contentMediaRepository;
    private final ContentVersionMediaRepository versionMediaRepository;

    public ContentVersionService(ContentVersionRepository contentVersionRepository,
                                 ContentMediaRepository contentMediaRepository,
                                 ContentVersionMediaRepository versionMediaRepository) {
        this.contentVersionRepository = contentVersionRepository;
        this.contentMediaRepository = contentMediaRepository;
        this.versionMediaRepository = versionMediaRepository;
    }

    public ContentState capture(Content content) {
        return new ContentState(content, contentMediaRepository.findByContentId(content.getContent_id()));
    }

    public void lockContent(Long contentId) {
        contentVersionRepository.lockContent(contentId);
    }

    public Optional<ContentVersion> findVersion(Long contentId, Integer versionNumber) {
        return contentVersionRepository.findByContentIdAndVersionNumber(contentId, versionNumber).map(this::enrich);
    }

    public boolean hasMeaningfulChanges(ContentState before, Content after,
                                        List<ContentMedia> requestedMedia, boolean mediaProvided) {
        return !before.matches(after, requestedMedia, mediaProvided);
    }

    public ContentVersion createSnapshot(Content content, Long changedByUserId,
                                         ContentVersionChangeType changeType) {
        contentVersionRepository.lockContent(content.getContent_id());

        ContentVersion version = new ContentVersion();
        version.setContentId(content.getContent_id());
        version.setVersionNumber(contentVersionRepository.nextVersionNumber(content.getContent_id()));
        version.setTitle(content.getTitle());
        version.setDescription(content.getDescription());
        version.setContentType(content.getContent_type());
        version.setFileUrl(content.getFile_url());
        version.setStatus(content.getStatus());
        version.setPlannedPublishDate(content.getPlannedPublishDate());
        version.setChangedByUserId(changedByUserId);
        version.setChangedAt(LocalDateTime.now());
        version.setChangeType(changeType);
        ContentVersion saved = contentVersionRepository.save(version);
        for (ContentMedia media : contentMediaRepository.findByContentId(content.getContent_id())) {
            ContentVersionMedia snapshot = new ContentVersionMedia();
            snapshot.setContentVersionId(saved.getContentVersionId()); snapshot.setMediaUrl(media.getMediaUrl());
            snapshot.setMediaType(media.getMediaType()); snapshot.setDisplayOrder(media.getDisplayOrder()); snapshot.setThumbnailUrl(media.getThumbnailUrl());
            versionMediaRepository.save(snapshot);
        }
        return enrich(saved);
    }

    public List<ContentVersionResponse> findHistory(Long contentId) {
        // Public history is deterministic: version 1 first, newest version last.
        return contentVersionRepository.findByContentIdOrdered(contentId).stream()
                .map(this::enrich).map(ContentVersionResponse::new)
                .collect(Collectors.toList());
    }

    private ContentVersion enrich(ContentVersion version){version.setMedia(versionMediaRepository.findByVersionId(version.getContentVersionId()));return version;}

    public static final class ContentState {
        private final String title;
        private final String description;
        private final String fileUrl;
        private final String contentType;
        private final LocalDateTime plannedPublishDate;
        private final List<MediaState> media;

        private ContentState(Content content, List<ContentMedia> media) {
            this.title = text(content.getTitle());
            this.description = text(content.getDescription());
            this.fileUrl = text(content.getFile_url());
            this.contentType = type(content.getContent_type());
            this.plannedPublishDate = content.getPlannedPublishDate();
            this.media = mediaStates(media);
        }

        private boolean matches(Content content, List<ContentMedia> requestedMedia, boolean mediaProvided) {
            List<MediaState> effectiveMedia = mediaProvided ? mediaStates(requestedMedia) : media;
            String effectiveFileUrl = mediaProvided && !effectiveMedia.isEmpty()
                    ? effectiveMedia.get(0).mediaUrl : text(content.getFile_url());
            String effectiveContentType = mediaProvided && !effectiveMedia.isEmpty()
                    ? effectiveMedia.get(0).mediaType : type(content.getContent_type());
            return Objects.equals(title, text(content.getTitle()))
                    && Objects.equals(description, text(content.getDescription()))
                    && Objects.equals(fileUrl, effectiveFileUrl)
                    && Objects.equals(contentType, effectiveContentType)
                    && Objects.equals(plannedPublishDate, content.getPlannedPublishDate())
                    && Objects.equals(media, effectiveMedia);
        }

        private static List<MediaState> mediaStates(List<ContentMedia> values) {
            if (values == null) return List.of();
            java.util.ArrayList<MediaState> states = new java.util.ArrayList<>();
            for (int index = 0; index < values.size(); index++) {
                ContentMedia value = values.get(index);
                states.add(new MediaState(text(value.getMediaUrl()), type(value.getMediaType()),
                        text(value.getThumbnailUrl()), value.getDisplayOrder() == null ? index : value.getDisplayOrder()));
            }
            states.sort(java.util.Comparator.comparing(MediaState::displayOrder));
            return List.copyOf(states);
        }

        private static String text(String value) {
            if (value == null) return null;
            String normalized = value.trim().replaceAll("\\s+", " ");
            return normalized.isEmpty() ? null : normalized;
        }

        private static String type(String value) {
            String normalized = text(value);
            return normalized == null ? null : normalized.toUpperCase(java.util.Locale.ROOT);
        }
    }

    private static final class MediaState {
        private final String mediaUrl;
        private final String mediaType;
        private final String thumbnailUrl;
        private final Integer displayOrder;

        private MediaState(String mediaUrl, String mediaType, String thumbnailUrl, Integer displayOrder) {
            this.mediaUrl = mediaUrl; this.mediaType = mediaType;
            this.thumbnailUrl = thumbnailUrl; this.displayOrder = displayOrder;
        }
        private Integer displayOrder() { return displayOrder; }
        @Override public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof MediaState)) return false;
            MediaState value = (MediaState) other;
            return Objects.equals(mediaUrl, value.mediaUrl) && Objects.equals(mediaType, value.mediaType)
                    && Objects.equals(thumbnailUrl, value.thumbnailUrl) && Objects.equals(displayOrder, value.displayOrder);
        }
        @Override public int hashCode() { return Objects.hash(mediaUrl, mediaType, thumbnailUrl, displayOrder); }
    }
}
