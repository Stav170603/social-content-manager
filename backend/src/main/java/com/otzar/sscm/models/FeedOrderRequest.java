package com.otzar.sscm.models;

import javax.validation.constraints.NotNull;
import java.util.List;

public class FeedOrderRequest {
    @NotNull(message = "Content order is required")
    private List<Long> contentIds;
    public List<Long> getContentIds() { return contentIds; }
    public void setContentIds(List<Long> contentIds) { this.contentIds = contentIds; }
}
