package com.otzar.sscm.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.Transformation;
import com.cloudinary.utils.ObjectUtils;
import com.otzar.sscm.models.VideoEditSpec;
import com.otzar.sscm.models.NormalizedVideoResult;
import com.otzar.sscm.models.VideoNormalizationException;
import com.otzar.sscm.models.TemporaryAudioResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.IOException;
import java.util.Map;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;

@Service
public class CloudinaryStorageClientImpl implements CloudinaryStorageClient {
    private static final Logger logger = LoggerFactory.getLogger(CloudinaryStorageClientImpl.class);
    private final Cloudinary cloudinary;
    private final boolean configured;

    @Autowired
    public CloudinaryStorageClientImpl(
            @Value("${CLOUDINARY_CLOUD_NAME:}") String cloudName,
            @Value("${CLOUDINARY_API_KEY:}") String apiKey,
            @Value("${CLOUDINARY_API_SECRET:}") String apiSecret) {
        this.configured = isPresent(cloudName) && isPresent(apiKey) && isPresent(apiSecret);
        this.cloudinary = configured
                ? new Cloudinary(ObjectUtils.asMap(
                        "cloud_name", cloudName,
                        "api_key", apiKey,
                        "api_secret", apiSecret,
                        "secure", true))
                : null;
    }

    CloudinaryStorageClientImpl(Cloudinary cloudinary, boolean configured) {
        this.cloudinary = cloudinary;
        this.configured = configured;
    }

    @Override
    public boolean isConfigured() {
        return configured;
    }

    @Override
    public String uploadImage(byte[] bytes) throws IOException {
        return upload(bytes, "image");
    }

    @Override
    public String uploadVideo(byte[] bytes) throws IOException {
        return upload(bytes, "video");
    }

    @Override
    public String uploadVideo(byte[] bytes, VideoEditSpec edit) throws IOException {
        if (edit == null || !edit.hasProcessing()) return uploadVideo(bytes);
        edit.validate();
        return upload(bytes, "video", buildVideoTransformation(edit));
    }

    @Override
    public TemporaryAudioResult uploadTemporaryAudio(byte[] bytes) throws IOException {
        if (!configured) throw new IllegalStateException("Cloudinary audio processing is not configured");
        Map<?, ?> result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                "resource_type", "video", "folder", "sscm-temporary/audio", "unique_filename", true, "use_filename", false));
        String publicId = requiredResult(result, "public_id");
        Object duration = result.get("duration");
        if (!(duration instanceof Number) || ((Number) duration).doubleValue() <= 0) {
            try { deleteTemporaryAudio(publicId); } catch (IOException ignored) { }
            throw new IOException("Cloudinary returned invalid audio metadata");
        }
        return new TemporaryAudioResult(publicId, ((Number) duration).doubleValue());
    }

    @Override
    public void deleteTemporaryAudio(String publicId) throws IOException {
        if (publicId == null || !publicId.startsWith("sscm-temporary/audio/")) throw new IllegalArgumentException("Invalid temporary audio identifier");
        if (!configured) throw new IllegalStateException("Cloudinary audio processing is not configured");
        try { cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "video", "invalidate", true)); }
        catch (RuntimeException exception) { throw new IOException("Could not delete temporary audio", exception); }
    }

    @Override
    public NormalizedVideoResult normalizeVideo(byte[] bytes) throws IOException {
        if (!configured) throw new IllegalStateException("Cloudinary video normalization is not configured");
        logger.info("Video normalization upload: bytes={}, configured={}, resourceType=video, folder=sscm-temporary, optionKeys={}",
                bytes.length, configured, normalizationOptions().keySet());
        final Map<?, ?> result;
        try {
            result = cloudinary.uploader().upload(bytes, normalizationOptions());
        } catch (IOException | RuntimeException exception) {
            Throwable root = rootCause(exception);
            Integer status = cloudinaryStatus(exception);
            String code = uploadFailureCode(exception, status);
            logger.warn("Video normalization upload failed: code={}, cloudinaryStatus={}, exceptionClass={}, message={}, rootCauseClass={}, rootCauseMessage={}, bytes={}, configured={}, resourceType=video, folder=sscm-temporary",
                    code, status, exception.getClass().getName(), safeMessage(exception), root.getClass().getName(),
                    safeMessage(root), bytes.length, configured);
            throw new VideoNormalizationException(code, safeMessage(exception), status, exception);
        }
        String publicId = requiredResult(result, "public_id");
        Object eagerValue = result.get("eager");
        if (!(eagerValue instanceof List) || ((List<?>) eagerValue).isEmpty()
                || !(((List<?>) eagerValue).get(0) instanceof Map)) {
            logger.warn("Video normalization transcode failed: cloudinaryStatus=200, code=VIDEO_NORMALIZATION_TRANSCODE_FAILED, returnedFormat={}", result.get("format"));
            throw new VideoNormalizationException("VIDEO_NORMALIZATION_TRANSCODE_FAILED", "Cloudinary did not return an eager video result", 200, null);
        }
        Map<?, ?> eager = (Map<?, ?>) ((List<?>) eagerValue).get(0);
        String url = requiredResult(eager, "secure_url");
        String format = requiredResult(eager, "format");
        logger.info("Video normalization returned: cloudinaryStatus=200, resourceType={}, sourceFormat={}, returnedFormat={}, bytes={}, duration={}, eagerTransformation={}",
                result.get("resource_type"), result.get("format"), format, result.get("bytes"), result.get("duration"), eager.get("transformation"));
        verifyNormalizedAsset(url);
        return new NormalizedVideoResult(url, publicId, format, "h264", "aac");
    }

    @Override
    public void deleteTemporaryVideo(String publicId) throws IOException {
        if (publicId == null || !publicId.startsWith("sscm-temporary/")) throw new IllegalArgumentException("Invalid temporary video identifier");
        if (!configured) throw new IllegalStateException("Cloudinary video normalization is not configured");
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "video", "invalidate", true));
        } catch (RuntimeException exception) {
            throw new IOException("Could not delete temporary normalized video", exception);
        }
    }

    String buildVideoTransformation(VideoEditSpec edit) {
        java.util.List<String> chain = new java.util.ArrayList<>();
        StringBuilder timing = new StringBuilder();
        if (edit.getStart() != null && edit.getStart() > 0) timing.append("so_").append(decimal(edit.getStart()));
        if (edit.getEnd() != null) appendTransformation(timing, "eo_" + decimal(edit.getEnd()));
        if (edit.isMuted() || edit.getOriginalVolume() == 0) appendTransformation(timing, "ac_none");
        if (timing.length() > 0) chain.add(timing.toString());
        if (!edit.isMuted() && edit.getOriginalVolume() != 100) chain.add("e_volume:" + edit.getOriginalVolume());
        if (edit.getMusicPublicId() != null) {
            double editedDuration = edit.getEnd() == null ? 0 : edit.getEnd() - (edit.getStart() == null ? 0 : edit.getStart());
            String layerId = edit.getMusicPublicId().replace('/', ':');
            StringBuilder layer = new StringBuilder("l_audio:").append(layerId);
            if (edit.getMusicStart() != null && edit.getMusicStart() > 0) layer.append("/so_").append(decimal(edit.getMusicStart()));
            if (editedDuration > 0) layer.append(",du_").append(decimal(editedDuration));
            if (edit.getMusicVolume() != 100) layer.append("/e_volume:").append(edit.getMusicVolume());
            layer.append("/fl_layer_apply");
            chain.add(layer.toString());
        }
        String crop = cropTransformation(edit.getAspectRatio());
        if (crop != null) chain.add(crop);
        int rotation = Math.floorMod(edit.getRotation(), 360);
        if (rotation != 0) chain.add("a_" + rotation);
        if (edit.getBrightness() != 0) chain.add("e_brightness:" + edit.getBrightness());
        if (edit.getContrast() != 0) chain.add("e_contrast:" + edit.getContrast());
        if (edit.getSaturation() != 0) chain.add("e_saturation:" + edit.getSaturation());
        if (edit.getVignette() != 0) chain.add("e_vignette:" + edit.getVignette());
        if (edit.getMusicPublicId() != null) {
            chain.add("vc_h264,ac_aac");
            chain.add("f_mp4");
        }
        return String.join("/", chain);
    }

    Map<String, Object> normalizationOptions() {
        List<Transformation<?>> eagerTransformations = List.of(
                new Transformation<>().videoCodec("h264").audioCodec("aac").fetchFormat("mp4"));
        return ObjectUtils.asMap("resource_type", "video", "folder", "sscm-temporary",
                "eager", eagerTransformations, "eager_async", false,
                "unique_filename", true, "use_filename", false);
    }

    private void verifyNormalizedAsset(String secureUrl) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(secureUrl).openConnection();
            connection.setRequestMethod("HEAD");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            int status = connection.getResponseCode();
            String contentType = connection.getContentType();
            long contentLength = connection.getContentLengthLong();
            connection.disconnect();
            logger.info("Video normalization asset check: status={}, contentType={}, bytes={}", status, contentType, contentLength);
            if (status < 200 || status >= 300 || contentType == null || !contentType.toLowerCase().startsWith("video/")) {
                throw new VideoNormalizationException("VIDEO_NORMALIZATION_TRANSCODE_FAILED", "Normalized asset is not ready", status, null);
            }
        } catch (VideoNormalizationException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new VideoNormalizationException("VIDEO_NORMALIZATION_TRANSCODE_FAILED", "Could not verify normalized asset", null, exception);
        }
    }

    private Integer cloudinaryStatus(Throwable exception) {
        for (Throwable current = exception; current != null; current = current.getCause()) {
            try {
                Object value = current.getClass().getMethod("getHttpCode").invoke(current);
                if (value instanceof Number) return ((Number) value).intValue();
            } catch (ReflectiveOperationException ignored) {
                // Continue through wrapped SDK/network exceptions.
            }
        }
        return null;
    }

    String safeMessage(Throwable exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) return exception.getClass().getSimpleName();
        return message
                .replaceAll("(?i)(api_key|api_secret|signature|authorization|access_token|token)[=:][^, &]+", "$1=[redacted]")
                .replaceAll("https?://[^\\s,]+", "[url-redacted]");
    }

    private Throwable rootCause(Throwable exception) {
        Throwable current = exception;
        while (current.getCause() != null && current.getCause() != current) current = current.getCause();
        return current;
    }

    String uploadFailureCode(Throwable exception, Integer status) {
        Throwable root = rootCause(exception);
        String message = (safeMessage(exception) + " " + safeMessage(root)).toLowerCase(java.util.Locale.ROOT);
        if (message.contains("too large") || message.contains("file size") || message.contains("maximum") || status != null && status == 413) {
            return "VIDEO_NORMALIZATION_UPLOAD_TOO_LARGE";
        }
        if (root instanceof SocketTimeoutException || root instanceof UnknownHostException
                || root instanceof java.net.ConnectException || message.contains("timed out")) {
            return "VIDEO_NORMALIZATION_CLOUDINARY_CONNECTION_FAILED";
        }
        if (status != null && status >= 400) return "VIDEO_NORMALIZATION_CLOUDINARY_REJECTED";
        return "VIDEO_NORMALIZATION_UPLOAD_FAILED";
    }

    private String upload(byte[] bytes, String resourceType) throws IOException {
        return upload(bytes, resourceType, null);
    }

    private String upload(byte[] bytes, String resourceType, String transformation) throws IOException {
        if (!configured) {
            throw new IllegalStateException("Cloudinary media storage is not configured");
        }
        Map<?, ?> options = transformation == null || transformation.isEmpty()
                ? ObjectUtils.asMap("resource_type", resourceType, "folder", "sscm")
                : ObjectUtils.asMap("resource_type", resourceType, "folder", "sscm", "transformation", transformation);
        Map<?, ?> result = cloudinary.uploader().upload(bytes, options);
        Object secureUrl = result.get("secure_url");
        if (secureUrl == null || !secureUrl.toString().startsWith("https://")) {
            throw new IOException("Cloudinary did not return a secure image URL");
        }
        return secureUrl.toString();
    }

    private void appendTransformation(StringBuilder value, String component) {
        if (value.length() > 0) value.append(',');
        value.append(component);
    }

    private String decimal(Double value) {
        return java.math.BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }

    private String cropTransformation(String ratio) {
        if ("1:1".equals(ratio)) return "c_fill,g_center,h_1080,w_1080";
        if ("4:5".equals(ratio)) return "c_fill,g_center,h_1350,w_1080";
        if ("9:16".equals(ratio)) return "c_fill,g_center,h_1920,w_1080";
        return null;
    }

    private String requiredResult(Map<?, ?> result, String key) throws IOException {
        Object value = result.get(key);
        if (value == null || value.toString().isBlank()) throw new IOException("Cloudinary normalization response is incomplete");
        return value.toString();
    }

    private boolean isPresent(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
