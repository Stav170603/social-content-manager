package com.otzar.sscm.service;

import com.otzar.sscm.models.VideoEditSpec;
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
        assertEquals("vc_h264,ac_aac/f_mp4", options.get("eager"));
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
}
