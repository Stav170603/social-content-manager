package com.otzar.sscm;

import com.otzar.sscm.entities.Content;
import com.otzar.sscm.entities.ContentStatus;
import com.otzar.sscm.entities.ContentMedia;
import com.otzar.sscm.models.InstagramPublishResponse;
import com.otzar.sscm.service.ContentService;
import com.otzar.sscm.service.InstagramPublishException;
import com.otzar.sscm.service.InstagramPublishService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.Optional;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import org.springframework.http.HttpStatus;

class InstagramPublishServiceTests {
    @Test
    void createsContainerThenPublishesUsingMockedMetaResponses() {
        ContentService contentService = mock(ContentService.class);
        when(contentService.findById(12L)).thenReturn(Optional.of(approvedImage()));
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(once(), requestTo("https://graph.example/v25.0/ig-user/media"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"id\":\"creation-123\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/creation-123?fields=status_code")))
                .andRespond(withSuccess("{\"status_code\":\"FINISHED\"}", MediaType.APPLICATION_JSON));
        server.expect(once(), requestTo("https://graph.example/v25.0/ig-user/media_publish"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"id\":\"media-456\"}", MediaType.APPLICATION_JSON));
        InstagramPublishService service = new InstagramPublishService(
                contentService, restTemplate, "ig-user", "secret-token",
                "https://graph.example/v25.0");

        InstagramPublishResponse result = service.publish(12L);

        assertEquals(true, result.isSuccess());
        assertEquals("media-456", result.getInstagramMediaId());
        server.verify();
    }

    @Test
    void metaFailureIsMappedToSafeException() {
        ContentService contentService = mock(ContentService.class);
        when(contentService.findById(12L)).thenReturn(Optional.of(approvedImage()));
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media"))
                .andRespond(withBadRequest().body("{\"error\":{\"message\":\"Invalid media URL https://signed.example/file?token=secret\",\"code\":100,\"error_subcode\":2207006}}")
                        .contentType(MediaType.APPLICATION_JSON));
        InstagramPublishService service = new InstagramPublishService(
                contentService, restTemplate, "ig-user", "secret-token",
                "https://graph.example/v25.0");

        InstagramPublishException exception = assertThrows(
                InstagramPublishException.class, () -> service.publish(12L));

        assertEquals(InstagramPublishException.Reason.META_API_FAILURE, exception.getReason());
        assertEquals("Meta rejected media container creation (HTTP 400, code 100, subcode 2207006): Invalid media URL [redacted URL]", exception.getMessage());
        server.verify();
    }

    @Test
    void localUploadUrlIsRejectedBeforeMetaCall() {
        ContentService contentService = mock(ContentService.class);
        Content content = approvedImage();
        content.setFile_url("/uploads/local.jpg");
        when(contentService.findById(12L)).thenReturn(Optional.of(content));
        InstagramPublishService service = new InstagramPublishService(
                contentService, new RestTemplate(), "ig-user", "secret-token",
                "https://graph.example/v25.0");

        InstagramPublishException exception = assertThrows(
                InstagramPublishException.class, () -> service.publish(12L));

        assertEquals(InstagramPublishException.Reason.IMAGE_NOT_PUBLIC, exception.getReason());
    }

    @Test
    void publishesMixedCarouselChildrenInDisplayOrder() {
        ContentService contentService=mock(ContentService.class); Content content=approvedImage();
        ContentMedia image=media("https://cdn.example/first.jpg","IMAGE",0);
        ContentMedia video=media("https://cdn.example/second.mp4","VIDEO",1); content.setMedia(List.of(image,video)); content.setContent_type("CAROUSEL");
        when(contentService.findById(12L)).thenReturn(Optional.of(content));
        RestTemplate restTemplate=new RestTemplate(); MockRestServiceServer server=MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media")).andExpect(content().string(containsString("image_url=https%3A%2F%2Fcdn.example%2Ffirst.jpg"))).andExpect(content().string(containsString("is_carousel_item=true"))).andRespond(withSuccess("{\"id\":\"child-image\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media")).andExpect(content().string(containsString("video_url=https%3A%2F%2Fcdn.example%2Fsecond.mp4"))).andRespond(withSuccess("{\"id\":\"child-video\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/child-video?fields=status_code"))).andExpect(method(HttpMethod.GET)).andRespond(withSuccess("{\"status_code\":\"FINISHED\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media")).andExpect(content().string(containsString("media_type=CAROUSEL"))).andExpect(content().string(containsString("children=child-image%2Cchild-video"))).andRespond(withSuccess("{\"id\":\"parent\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/parent?fields=status_code"))).andRespond(withSuccess("{\"status_code\":\"FINISHED\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media_publish")).andRespond(withSuccess("{\"id\":\"published-carousel\"}",MediaType.APPLICATION_JSON));
        InstagramPublishResponse result=new InstagramPublishService(contentService,restTemplate,"ig-user","secret-token","https://graph.example/v25.0").publish(12L);
        assertEquals("published-carousel",result.getInstagramMediaId()); server.verify();
    }

    @Test
    void imageWaitsThroughProcessingBeforePublishing() {
        ContentService contents=mock(ContentService.class); when(contents.findById(12L)).thenReturn(Optional.of(approvedImage()));
        RestTemplate rest=new RestTemplate(); MockRestServiceServer server=MockRestServiceServer.bindTo(rest).build();
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media")).andRespond(withSuccess("{\"id\":\"same-container\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/same-container?fields=status_code"))).andRespond(withSuccess("{\"status_code\":\"IN_PROGRESS\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/same-container?fields=status_code"))).andRespond(withSuccess("{\"status_code\":\"FINISHED\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media_publish")).andExpect(content().string(containsString("creation_id=same-container"))).andRespond(withSuccess("{\"id\":\"published\"}",MediaType.APPLICATION_JSON));
        assertEquals("published",new InstagramPublishService(contents,rest,"ig-user","token","https://graph.example/v25.0",3,0).publish(12L).getInstagramMediaId()); server.verify();
    }

    @Test
    void readinessTimeoutDoesNotPublish() {
        ContentService contents=mock(ContentService.class); when(contents.findById(12L)).thenReturn(Optional.of(approvedImage()));
        RestTemplate rest=new RestTemplate(); MockRestServiceServer server=MockRestServiceServer.bindTo(rest).build();
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media")).andRespond(withSuccess("{\"id\":\"container\"}",MediaType.APPLICATION_JSON));
        for(int i=0;i<2;i++) server.expect(requestTo(containsString("/container?fields=status_code"))).andRespond(withSuccess("{\"status_code\":\"IN_PROGRESS\"}",MediaType.APPLICATION_JSON));
        InstagramPublishException failure=assertThrows(InstagramPublishException.class,()->new InstagramPublishService(contents,rest,"ig-user","token","https://graph.example/v25.0",2,0).publish(12L));
        assertEquals(InstagramPublishException.Reason.MEDIA_PROCESSING_FAILED,failure.getReason()); server.verify();
    }

    @Test
    void processingErrorDoesNotPublish() {
        ContentService contents=mock(ContentService.class); when(contents.findById(12L)).thenReturn(Optional.of(approvedImage()));
        RestTemplate rest=new RestTemplate(); MockRestServiceServer server=MockRestServiceServer.bindTo(rest).build();
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media")).andRespond(withSuccess("{\"id\":\"container\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/container?fields=status_code"))).andRespond(withSuccess("{\"status_code\":\"ERROR\"}",MediaType.APPLICATION_JSON));
        assertThrows(InstagramPublishException.class,()->new InstagramPublishService(contents,rest,"ig-user","token","https://graph.example/v25.0",2,0).publish(12L)); server.verify();
    }

    @Test
    void notAvailablePublishRechecksAndRetriesSameContainerOnce() {
        ContentService contents=mock(ContentService.class); when(contents.findById(12L)).thenReturn(Optional.of(approvedImage()));
        RestTemplate rest=new RestTemplate(); MockRestServiceServer server=MockRestServiceServer.bindTo(rest).build();
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media")).andRespond(withSuccess("{\"id\":\"same-container\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/same-container?fields=status_code"))).andRespond(withSuccess("{\"status_code\":\"FINISHED\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media_publish")).andExpect(content().string(containsString("creation_id=same-container"))).andRespond(withStatus(HttpStatus.BAD_REQUEST).body("{\"error\":{\"message\":\"Media ID is not available\",\"code\":9007,\"error_subcode\":2207027}}").contentType(MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/same-container?fields=status_code"))).andRespond(withSuccess("{\"status_code\":\"FINISHED\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media_publish")).andExpect(content().string(containsString("creation_id=same-container"))).andRespond(withSuccess("{\"id\":\"published\"}",MediaType.APPLICATION_JSON));
        assertEquals("published",new InstagramPublishService(contents,rest,"ig-user","token","https://graph.example/v25.0",2,0).publish(12L).getInstagramMediaId()); server.verify();
    }

    @Test
    void ambiguousPublishFailureIsNeverRetried() {
        ContentService contents=mock(ContentService.class); when(contents.findById(12L)).thenReturn(Optional.of(approvedImage()));
        RestTemplate rest=new RestTemplate(); MockRestServiceServer server=MockRestServiceServer.bindTo(rest).build();
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media")).andRespond(withSuccess("{\"id\":\"container\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo(containsString("/container?fields=status_code"))).andRespond(withSuccess("{\"status_code\":\"FINISHED\"}",MediaType.APPLICATION_JSON));
        server.expect(requestTo("https://graph.example/v25.0/ig-user/media_publish")).andRespond(withServerError());
        assertThrows(InstagramPublishException.class,()->new InstagramPublishService(contents,rest,"ig-user","token","https://graph.example/v25.0",2,0).publish(12L)); server.verify();
    }

    private ContentMedia media(String url,String type,int order){ContentMedia m=new ContentMedia();m.setMediaUrl(url);m.setMediaType(type);m.setDisplayOrder(order);return m;}

    private Content approvedImage() {
        Content content = new Content();
        content.setContent_id(12L);
        content.setStatus(ContentStatus.APPROVED);
        content.setContent_type("IMAGE");
        content.setDescription("Caption");
        content.setFile_url("https://res.cloudinary.com/demo/image/upload/example.jpg");
        return content;
    }
}
