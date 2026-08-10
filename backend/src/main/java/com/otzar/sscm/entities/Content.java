package com.otzar.sscm.entities;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonIgnore;

public class Content {

    private Long content_id;

    @NotNull(message = "Client ID is required")
    private Long clientId;

    @NotBlank(message = "Title is required")
    private String title;
    private String description;
    private String file_url;
    private String content_type;

    private ContentStatus status;
    private LocalDateTime plannedPublishDate;
    private LocalDateTime createdAt;
    private Integer feedOrder;
    private List<ContentMedia> media = new ArrayList<>();
    private boolean mediaProvided;

    public Long getContent_id() { return content_id; }
    public void setContent_id(Long content_id) { this.content_id = content_id; }

    public Long getClient_id() { return clientId; }
    public void setClient_id(Long client_id) { this.clientId = client_id; }

    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }

    public Long getClient() { return clientId; }
    public void setClient(Long client) { this.clientId = client; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getFile_url() { return file_url; }
    public void setFile_url(String file_url) { this.file_url = file_url; }

    public String getContent_type() { return content_type; }
    public void setContent_type(String content_type) { this.content_type = content_type; }

    public String getContentType() { return content_type; }
    public void setContentType(String contentType) { this.content_type = contentType; }

    public ContentStatus getStatus() {
        return status;
    }

    public void setStatus(ContentStatus status) {
        this.status = status;
    }

    public LocalDateTime getPlannedPublishDate() { return plannedPublishDate; }
    public void setPlannedPublishDate(LocalDateTime plannedPublishDate) { this.plannedPublishDate = plannedPublishDate; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public Integer getFeedOrder() { return feedOrder; }
    public void setFeedOrder(Integer feedOrder) { this.feedOrder = feedOrder; }
    public List<ContentMedia> getMedia() { return media; }
    public void setMedia(List<ContentMedia> media) { this.media = media == null ? new ArrayList<>() : media; this.mediaProvided = true; }
    @JsonIgnore public boolean isMediaProvided() { return mediaProvided; }
}
