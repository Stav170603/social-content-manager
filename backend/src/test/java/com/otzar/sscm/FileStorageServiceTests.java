package com.otzar.sscm;

import com.otzar.sscm.service.CloudinaryStorageClient;
import com.otzar.sscm.service.FileStorageService;
import com.otzar.sscm.models.VideoEditSpec;
import com.otzar.sscm.models.NormalizedVideoResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class FileStorageServiceTests {
    @TempDir
    Path tempDirectory;

    @Test
    void configuredStoragePathIsCreatedAndKeepsLocalUploadUrl() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(false);
        Path configuredStoragePath = tempDirectory.resolve("custom-uploads");
        FileStorageService service = new FileStorageService(cloudinary, false, configuredStoragePath.toString());
        MockMultipartFile file = new MockMultipartFile(
                "file", "example.mp4", "video/mp4", new byte[]{1, 2, 3});

        String url = service.store(file);

        assertEquals(configuredStoragePath.toAbsolutePath().normalize(), service.getUploadDirectory());
        assertTrue(Files.isDirectory(configuredStoragePath));
        assertTrue(url.startsWith("/uploads/"));
        assertTrue(Files.isRegularFile(
                configuredStoragePath.resolve(url.substring("/uploads/".length()))));
    }

    @Test
    void railwayDefaultUsesWritableTemporaryDirectory() throws Exception {
        assumeTrue(System.getenv("RAILWAY_ENVIRONMENT") != null);
        FileStorageService service = new FileStorageService(mock(CloudinaryStorageClient.class));

        assertEquals(
                Path.of(System.getProperty("java.io.tmpdir"), "uploads").toAbsolutePath().normalize(),
                service.getUploadDirectory());
        assertTrue(Files.isDirectory(service.getUploadDirectory()));
    }

    @Test
    void configuredCloudinaryStoresImageAndReturnsSecureUrl() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(true);
        when(cloudinary.uploadImage(any(byte[].class)))
                .thenReturn("https://res.cloudinary.com/demo/image/upload/sscm/example.jpg");
        FileStorageService service = new FileStorageService(cloudinary);
        MockMultipartFile file = new MockMultipartFile(
                "file", "example.jpg", "image/jpeg", new byte[]{1, 2, 3});

        String url = service.store(file);

        assertEquals("https://res.cloudinary.com/demo/image/upload/sscm/example.jpg", url);
        verify(cloudinary).uploadImage(any(byte[].class));
    }

    @Test
    void invalidFileIsRejectedBeforeCloudinaryCall() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(true);
        FileStorageService service = new FileStorageService(cloudinary);
        MockMultipartFile file = new MockMultipartFile(
                "file", "payload.exe", "application/octet-stream", new byte[]{1});

        assertThrows(IllegalArgumentException.class, () -> service.store(file));
        verify(cloudinary, never()).uploadImage(any(byte[].class));
    }

    @Test
    void emptyFileIsRejectedWithoutExternalCall() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(true);
        FileStorageService service = new FileStorageService(cloudinary);
        MockMultipartFile file = new MockMultipartFile(
                "file", "empty.jpg", "image/jpeg", new byte[0]);

        assertThrows(IllegalArgumentException.class, () -> service.store(file));
        verify(cloudinary, never()).uploadImage(any(byte[].class));
    }

    @Test
    void configuredCloudinaryReceivesRealVideoTrimAndMuteInstructions() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(true);
        when(cloudinary.uploadVideo(any(byte[].class), any(VideoEditSpec.class)))
                .thenReturn("https://res.cloudinary.com/demo/video/upload/sscm/edited.mp4");
        FileStorageService service = new FileStorageService(cloudinary);
        MockMultipartFile file = new MockMultipartFile("files", "reel.mp4", "video/mp4", new byte[]{1, 2, 3});
        VideoEditSpec edit = new VideoEditSpec(); edit.setIndex(0); edit.setStart(2.0); edit.setEnd(8.0); edit.setMuted(true);

        String url = service.store(file, edit);

        assertEquals("https://res.cloudinary.com/demo/video/upload/sscm/edited.mp4", url);
        verify(cloudinary).uploadVideo(any(byte[].class), org.mockito.ArgumentMatchers.argThat(value ->
                value.getStart().equals(2.0) && value.getEnd().equals(8.0) && value.isMuted()));
    }

    @Test
    void localStorageRejectsPlaybackOnlyVideoEdits() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(false);
        FileStorageService service = new FileStorageService(cloudinary, false, tempDirectory.resolve("local").toString());
        MockMultipartFile file = new MockMultipartFile("files", "reel.mp4", "video/mp4", new byte[]{1});
        VideoEditSpec edit = new VideoEditSpec(); edit.setIndex(0); edit.setStart(1.0);

        assertThrows(IllegalStateException.class, () -> service.store(file, edit));
    }

    @Test
    void recognizesMobileMovWithGenericMimeByExtension() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(false);
        FileStorageService service = new FileStorageService(cloudinary, false, tempDirectory.resolve("mov").toString());
        MockMultipartFile file = new MockMultipartFile("files", "iphone.MOV", "application/octet-stream", new byte[]{1});

        assertTrue(service.store(file).startsWith("/uploads/"));
    }

    @Test
    void normalizesSupportedPhoneVideoWithoutPersistingContent() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(true);
        NormalizedVideoResult result = new NormalizedVideoResult(
                "https://res.cloudinary.com/demo/video/upload/normalized.mp4",
                "sscm-temporary/phone-video", "mp4", "h264", "aac");
        when(cloudinary.normalizeVideo(any(byte[].class))).thenReturn(result);
        FileStorageService service = new FileStorageService(cloudinary);
        MockMultipartFile file = new MockMultipartFile(
                "file", "iphone.MOV", "video/quicktime", new byte[]{1, 2, 3});

        assertEquals(result, service.normalizeVideo(file));
        verify(cloudinary).normalizeVideo(any(byte[].class));
    }

    @Test
    void rejectsNonVideoNormalizationBeforeCloudinaryCall() throws Exception {
        CloudinaryStorageClient cloudinary = mock(CloudinaryStorageClient.class);
        when(cloudinary.isConfigured()).thenReturn(true);
        FileStorageService service = new FileStorageService(cloudinary);
        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.jpg", "image/jpeg", new byte[]{1});

        assertThrows(IllegalArgumentException.class, () -> service.normalizeVideo(file));
        verify(cloudinary, never()).normalizeVideo(any(byte[].class));
    }
}
