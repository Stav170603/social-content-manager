package com.otzar.sscm.service;

import java.io.IOException;
import com.otzar.sscm.models.VideoEditSpec;
import com.otzar.sscm.models.NormalizedVideoResult;

public interface CloudinaryStorageClient {
    boolean isConfigured();
    String uploadImage(byte[] bytes) throws IOException;
    String uploadVideo(byte[] bytes) throws IOException;
    String uploadVideo(byte[] bytes, VideoEditSpec edit) throws IOException;
    NormalizedVideoResult normalizeVideo(byte[] bytes) throws IOException;
    void deleteTemporaryVideo(String publicId) throws IOException;
}
