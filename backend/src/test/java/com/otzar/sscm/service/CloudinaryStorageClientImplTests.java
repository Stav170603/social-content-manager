package com.otzar.sscm.service;

import com.otzar.sscm.models.VideoEditSpec;
import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.otzar.sscm.models.VideoNormalizationException;
import java.io.IOException;
import java.net.SocketTimeoutException;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import org.mockito.ArgumentCaptor;
import java.util.Map;
import java.util.List;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CloudinaryStorageClientImplTests {
    @Test
    void buildsRealTrimMuteCropRotationAndVisualTransformationChain() {
        CloudinaryStorageClientImpl client = new CloudinaryStorageClientImpl("", "", "");
        VideoEditSpec edit = new VideoEditSpec(); edit.setIndex(1); edit.setStart(2.5); edit.setEnd(8.0); edit.setMuted(true);
        edit.setAspectRatio("4:5"); edit.setRotation(90); edit.setBrightness(20); edit.setContrast(-10);
        edit.setSaturation(30); edit.setVignette(40); edit.validate();

        assertEquals("so_2.5,eo_8,ac_none/c_fill,g_center,h_1350,w_1080/a_90/e_brightness:20/e_contrast:-10/e_saturation:30/e_vignette:40",
                client.buildVideoTransformation(edit));
    }

    @Test
    void rejectsUnsupportedVisualValues() {
        VideoEditSpec edit = new VideoEditSpec(); edit.setAspectRatio("2:3");
        assertThrows(IllegalArgumentException.class, edit::validate);
    }

    @Test
    void normalizationUsesSynchronousEagerH264AacMp4VideoTransformation() {
        CloudinaryStorageClientImpl client = new CloudinaryStorageClientImpl("", "", "");
        var options = client.normalizationOptions();
        assertEquals("video", options.get("resource_type"));
        assertTrue(options.get("eager") instanceof List);
        List<?> eager = (List<?>) options.get("eager");
        assertEquals(1, eager.size());
        assertTrue(eager.get(0) instanceof com.cloudinary.Transformation);
        String transformation = eager.get(0).toString();
        assertTrue(transformation.contains("vc_h264"));
        assertTrue(transformation.contains("ac_aac"));
        assertTrue(transformation.contains("f_mp4"));
        assertEquals(false, options.get("eager_async"));
        assertEquals(null, options.get("transformation"));
        assertEquals("sscm-temporary", options.get("folder"));
    }

    @Test
    void cleanupCannotTargetProductionAssets() {
        CloudinaryStorageClientImpl client = new CloudinaryStorageClientImpl("", "", "");
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> client.deleteTemporaryVideo("sscm/production-video"));
        assertTrue(error.getMessage().contains("temporary"));
    }

    @Test
    void classifiesAndSanitizesCloudinaryUploadFailures() throws Exception {
        Cloudinary cloudinary = mock(Cloudinary.class);
        Uploader uploader = mock(Uploader.class);
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(), any())).thenThrow(new IOException(
                "request failed https://secret.example/video?api_key=secret", new SocketTimeoutException("timed out")));
        CloudinaryStorageClientImpl client = new CloudinaryStorageClientImpl(cloudinary, true);

        VideoNormalizationException error = assertThrows(VideoNormalizationException.class,
                () -> client.normalizeVideo(new byte[]{1, 2, 3}));
        assertEquals("VIDEO_NORMALIZATION_CLOUDINARY_CONNECTION_FAILED", error.getCode());
        assertTrue(client.safeMessage(error.getCause()).contains("[url-redacted]"));
        assertTrue(!client.safeMessage(error.getCause()).contains("secret.example"));
    }

    @Test
    void distinguishesLargeAndGenericUploadFailures() {
        CloudinaryStorageClientImpl client = new CloudinaryStorageClientImpl(mock(Cloudinary.class), true);
        assertEquals("VIDEO_NORMALIZATION_UPLOAD_TOO_LARGE",
                client.uploadFailureCode(new IOException("File size exceeds maximum"), 413));
        assertEquals("VIDEO_NORMALIZATION_UPLOAD_FAILED",
                client.uploadFailureCode(new IllegalStateException("unexpected SDK failure"), null));
    }

    @Test
    void structuredEagerOptionsReachUploaderAndSuccessfulEagerUrlIsRead() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/normalized.mp4", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "video/mp4");
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        try {
            Cloudinary cloudinary = mock(Cloudinary.class);
            Uploader uploader = mock(Uploader.class);
            when(cloudinary.uploader()).thenReturn(uploader);
            String normalizedUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/normalized.mp4";
            when(uploader.upload(any(), any())).thenReturn(Map.of(
                    "public_id", "sscm-temporary/test", "resource_type", "video", "format", "mov",
                    "bytes", 3, "duration", 1,
                    "eager", List.of(Map.of("secure_url", normalizedUrl, "format", "mp4", "transformation", "vc_h264,ac_aac/f_mp4"))));
            CloudinaryStorageClientImpl client = new CloudinaryStorageClientImpl(cloudinary, true);

            var result = client.normalizeVideo(new byte[]{1, 2, 3});

            assertEquals(normalizedUrl, result.getUrl());
            ArgumentCaptor<Map> options = ArgumentCaptor.forClass(Map.class);
            verify(uploader).upload(any(), options.capture());
            assertTrue(options.getValue().get("eager") instanceof List);
            assertTrue(! (options.getValue().get("eager") instanceof String));
        } finally {
            server.stop(0);
        }
    }
}
