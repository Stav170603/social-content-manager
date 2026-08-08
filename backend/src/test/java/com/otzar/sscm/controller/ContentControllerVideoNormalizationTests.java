package com.otzar.sscm.controller;

import com.otzar.sscm.entities.User;
import com.otzar.sscm.models.NormalizedVideoResult;
import com.otzar.sscm.service.AuthService;
import com.otzar.sscm.service.ContentService;
import com.otzar.sscm.service.ContentVersionService;
import com.otzar.sscm.service.FileStorageService;
import com.otzar.sscm.service.InstagramPublishService;
import com.otzar.sscm.service.NotificationService;
import com.otzar.sscm.service.SocialPublishingService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ContentControllerVideoNormalizationTests {
    @Test
    void preprocessingReturnsTemporaryMediaWithoutCreatingContent() throws Exception {
        ContentService contentService = mock(ContentService.class);
        AuthService authService = mock(AuthService.class);
        FileStorageService storage = mock(FileStorageService.class);
        ContentController controller = new ContentController(contentService, mock(ContentVersionService.class),
                authService, storage, mock(NotificationService.class), mock(SocialPublishingService.class),
                mock(InstagramPublishService.class));
        User admin = new User();
        admin.setRole("ADMIN");
        MockMultipartFile file = new MockMultipartFile("file", "iphone.mov", "video/quicktime", new byte[]{1});
        NormalizedVideoResult normalized = new NormalizedVideoResult(
                "https://res.cloudinary.com/demo/video/upload/normalized.mp4",
                "sscm-temporary/iphone", "mp4", "h264", "aac");
        when(authService.findUserByToken("admin-token")).thenReturn(Optional.of(admin));
        when(authService.isAdmin(admin)).thenReturn(true);
        when(storage.normalizeVideo(file)).thenReturn(normalized);

        var response = controller.normalizeVideo(file, "admin-token");

        assertEquals(200, response.getStatusCodeValue());
        assertEquals(normalized, response.getBody());
        verifyNoInteractions(contentService);
    }
}
