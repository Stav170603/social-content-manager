package com.otzar.sscm.service;

public class ContentDeletionBlockedException extends RuntimeException {
    public ContentDeletionBlockedException() {
        super("לא ניתן למחוק תוכן שיש לו היסטוריית פרסום. היסטוריית הפרסום נשמרה ולא בוצעו שינויים.");
    }
}
