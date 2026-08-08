package com.otzar.sscm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.otzar.sscm.entities.Client;
import com.otzar.sscm.entities.ContentVersion;
import com.otzar.sscm.repository.ClientRepository;
import com.otzar.sscm.repository.CommentRepository;
import com.otzar.sscm.repository.ContentVersionRepository;
import com.otzar.sscm.repository.ContentMediaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.servlet.http.Cookie;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContentVersionIntegrationTests {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ClientRepository clientRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private ContentVersionRepository contentVersionRepository;
    @Autowired private ContentMediaRepository contentMediaRepository;

    private Cookie adminCookie;
    private Cookie clientCookie;
    private Cookie otherClientCookie;
    private Long clientId;

    @BeforeEach
    void setUp() throws Exception {
        adminCookie = tokenCookie(loginToken("admin", "123456"));
        clientCookie = tokenCookie(loginToken("client1", "123456"));
        otherClientCookie = tokenCookie(loginToken("client2", "123456"));
        clientId = clientRepository.findByUserId(2L).orElseGet(() -> createClient(2L)).getClient_id();
    }

    @Test
    void jsonCreationCreatesVersionOneWithAuthenticatedActor() throws Exception {
        Long contentId = createJsonContent("JSON version one");

        mockMvc.perform(get("/contents/{id}/versions", contentId).cookie(adminCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].versionNumber").value(1))
                .andExpect(jsonPath("$[0].title").value("JSON version one"))
                .andExpect(jsonPath("$[0].status").value("DRAFT"))
                .andExpect(jsonPath("$[0].changedByUserId").value(1))
                .andExpect(jsonPath("$[0].changeType").value("CREATED"));
    }

    @Test
    void multipartCreationCreatesVersionOne() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file", "version.png", "image/png", new byte[]{1, 2, 3});

        MvcResult result = mockMvc.perform(multipart("/contents")
                        .file(file)
                        .param("clientId", clientId.toString())
                        .param("title", "Multipart version")
                        .param("description", "Uploaded")
                        .param("contentType", "IMAGE")
                        .cookie(adminCookie))
                .andExpect(status().isCreated())
                .andReturn();

        Long contentId = responseId(result);
        List<ContentVersion> history = contentVersionRepository.findByContentIdOrdered(contentId);
        org.junit.jupiter.api.Assertions.assertEquals(1, history.size());
        org.junit.jupiter.api.Assertions.assertEquals(1, history.get(0).getVersionNumber());
        org.junit.jupiter.api.Assertions.assertNotNull(history.get(0).getFileUrl());
    }

    @Test
    void multipartCreationPersistsMultipleFilesInOrder() throws Exception {
        MockMultipartFile first = new MockMultipartFile(
                "files", "first.png", "image/png", new byte[]{1, 2, 3});
        MockMultipartFile second = new MockMultipartFile(
                "files", "second.jpg", "image/jpeg", new byte[]{4, 5, 6});

        MvcResult result = mockMvc.perform(multipart("/contents")
                        .file(first)
                        .file(second)
                        .param("clientId", clientId.toString())
                        .param("title", "Two image carousel")
                        .param("description", "Ordered upload")
                        .param("contentType", "IMAGE")
                        .cookie(adminCookie))
                .andExpect(status().isCreated())
                .andReturn();

        Long contentId = responseId(result);
        var media = contentMediaRepository.findByContentId(contentId);
        org.junit.jupiter.api.Assertions.assertEquals(2, media.size());
        org.junit.jupiter.api.Assertions.assertEquals(0, media.get(0).getDisplayOrder());
        org.junit.jupiter.api.Assertions.assertEquals(1, media.get(1).getDisplayOrder());
        JsonNode response = objectMapper.readTree(result.getResponse().getContentAsString());
        org.junit.jupiter.api.Assertions.assertEquals("IMAGE", response.get("content_type").asText());
        org.junit.jupiter.api.Assertions.assertEquals(media.get(0).getMediaUrl(), response.get("file_url").asText());
    }

    @Test
    void multipartCreationPersistsThreeImages() throws Exception {
        MvcResult result = mockMvc.perform(multipart("/contents")
                        .file(new MockMultipartFile("files", "one.png", "image/png", new byte[]{1}))
                        .file(new MockMultipartFile("files", "two.jpg", "image/jpeg", new byte[]{2}))
                        .file(new MockMultipartFile("files", "three.webp", "image/webp", new byte[]{3}))
                        .param("clientId", clientId.toString())
                        .param("title", "Three image carousel")
                        .param("contentType", "IMAGE")
                        .cookie(adminCookie))
                .andExpect(status().isCreated())
                .andReturn();

        var media = contentMediaRepository.findByContentId(responseId(result));
        org.junit.jupiter.api.Assertions.assertEquals(3, media.size());
        org.junit.jupiter.api.Assertions.assertEquals(List.of(0, 1, 2),
                media.stream().map(item -> item.getDisplayOrder()).toList());
    }

    @Test
    void multipartCreationPersistsMixedImageAndVideo() throws Exception {
        MvcResult result = mockMvc.perform(multipart("/contents")
                        .file(new MockMultipartFile("files", "cover.png", "image/png", new byte[]{1}))
                        .file(new MockMultipartFile("files", "clip.mp4", "video/mp4", new byte[]{2}))
                        .param("clientId", clientId.toString())
                        .param("title", "Mixed carousel")
                        .param("contentType", "IMAGE")
                        .cookie(adminCookie))
                .andExpect(status().isCreated())
                .andReturn();

        var media = contentMediaRepository.findByContentId(responseId(result));
        org.junit.jupiter.api.Assertions.assertEquals(List.of("IMAGE", "VIDEO"),
                media.stream().map(item -> item.getMediaType()).toList());
        JsonNode response = objectMapper.readTree(result.getResponse().getContentAsString());
        org.junit.jupiter.api.Assertions.assertEquals("IMAGE", response.get("content_type").asText());
        org.junit.jupiter.api.Assertions.assertEquals(media.get(0).getMediaUrl(), response.get("file_url").asText());
    }

    @Test
    void multipartCreationPersistsTwoVideos() throws Exception {
        MvcResult result = mockMvc.perform(multipart("/contents")
                        .file(new MockMultipartFile("files", "first.mp4", "video/mp4", new byte[]{1}))
                        .file(new MockMultipartFile("files", "second.webm", "video/webm", new byte[]{2}))
                        .param("clientId", clientId.toString())
                        .param("title", "Two video carousel")
                        .param("contentType", "VIDEO")
                        .cookie(adminCookie))
                .andExpect(status().isCreated())
                .andReturn();

        var media = contentMediaRepository.findByContentId(responseId(result));
        org.junit.jupiter.api.Assertions.assertEquals(List.of("VIDEO", "VIDEO"),
                media.stream().map(item -> item.getMediaType()).toList());
    }

    @Test
    void multipartVideoCoverIsAssociatedAndIncludedInVersionSnapshot() throws Exception {
        MvcResult result = mockMvc.perform(multipart("/contents")
                        .file(new MockMultipartFile("files", "clip.mp4", "video/mp4", new byte[]{1}))
                        .file(new MockMultipartFile("coverFiles", "cover.jpg", "image/jpeg", new byte[]{2}))
                        .param("coverMediaIndexes", "0")
                        .param("clientId", clientId.toString())
                        .param("title", "Video with cover")
                        .param("contentType", "VIDEO")
                        .cookie(adminCookie))
                .andExpect(status().isCreated())
                .andReturn();

        Long contentId = responseId(result);
        String thumbnail = contentMediaRepository.findByContentId(contentId).get(0).getThumbnailUrl();
        org.junit.jupiter.api.Assertions.assertTrue(thumbnail.startsWith("/uploads/"));
        mockMvc.perform(get("/contents/{id}/versions", contentId).cookie(adminCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].media[0].thumbnailUrl").value(thumbnail));
    }

    @Test
    void multipartCreationPreservesVideoThenImageOrder() throws Exception {
        MvcResult result = mockMvc.perform(multipart("/contents")
                        .file(new MockMultipartFile("files", "first.mp4", "video/mp4", new byte[]{1}))
                        .file(new MockMultipartFile("files", "second.png", "image/png", new byte[]{2}))
                        .param("clientId", clientId.toString())
                        .param("title", "Video first mixed carousel")
                        .param("contentType", "VIDEO")
                        .cookie(adminCookie))
                .andExpect(status().isCreated())
                .andReturn();

        var media = contentMediaRepository.findByContentId(responseId(result));
        org.junit.jupiter.api.Assertions.assertEquals(List.of("VIDEO", "IMAGE"),
                media.stream().map(item -> item.getMediaType()).toList());
        JsonNode response = objectMapper.readTree(result.getResponse().getContentAsString());
        org.junit.jupiter.api.Assertions.assertEquals("VIDEO", response.get("content_type").asText());
        org.junit.jupiter.api.Assertions.assertEquals(media.get(0).getMediaUrl(), response.get("file_url").asText());
    }

    @Test
    void meaningfulEditIncrementsVersionAndIdenticalEditDoesNot() throws Exception {
        Long contentId = createJsonContent("Original title");
        Map<String, Object> edit = contentPayload("Edited title");

        mockMvc.perform(put("/contents/{id}", contentId).cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(edit)))
                .andExpect(status().isOk());
        mockMvc.perform(put("/contents/{id}", contentId).cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(edit)))
                .andExpect(status().isOk());

        List<ContentVersion> history = contentVersionRepository.findByContentIdOrdered(contentId);
        org.junit.jupiter.api.Assertions.assertEquals(2, history.size());
        org.junit.jupiter.api.Assertions.assertEquals("EDITED", history.get(1).getChangeType().name());
    }

    @Test
    void scheduleChangeCreatesOneVersionAndRepeatedScheduleIsNoOp() throws Exception {
        Long contentId = createJsonContent("Scheduled content");
        String schedule = "{\"plannedPublishDate\":\"2026-09-12T15:45:00\"}";

        mockMvc.perform(put("/contents/{id}/schedule", contentId).cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON).content(schedule))
                .andExpect(status().isOk());
        mockMvc.perform(put("/contents/{id}/schedule", contentId).cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON).content(schedule))
                .andExpect(status().isOk());

        List<ContentVersion> history = contentVersionRepository.findByContentIdOrdered(contentId);
        org.junit.jupiter.api.Assertions.assertEquals(2, history.size());
        org.junit.jupiter.api.Assertions.assertEquals("SCHEDULED", history.get(1).getChangeType().name());
    }

    @Test
    void successfulApprovalAndPublishingTransitionsEachCreateOneVersion() throws Exception {
        Long contentId = createJsonContent("Workflow versions");

        mockMvc.perform(put("/contents/{id}/send-for-approval", contentId).cookie(adminCookie))
                .andExpect(status().isOk());
        mockMvc.perform(put("/contents/{id}/approve", contentId).cookie(clientCookie))
                .andExpect(status().isOk());
        mockMvc.perform(put("/contents/{id}/publish", contentId).cookie(adminCookie))
                .andExpect(status().isOk());

        List<ContentVersion> history = contentVersionRepository.findByContentIdOrdered(contentId);
        org.junit.jupiter.api.Assertions.assertEquals(4, history.size());
        org.junit.jupiter.api.Assertions.assertEquals("WAITING_APPROVAL", history.get(1).getStatus().name());
        org.junit.jupiter.api.Assertions.assertEquals(2L, history.get(2).getChangedByUserId());
        org.junit.jupiter.api.Assertions.assertEquals("PUBLISHED", history.get(3).getStatus().name());
    }

    @Test
    void rejectionCreatesExactlyOneVersionAndCommentThenResubmissionCreatesOneVersion() throws Exception {
        Long contentId = createJsonContent("Rejected version");
        mockMvc.perform(put("/contents/{id}/send-for-approval", contentId).cookie(adminCookie))
                .andExpect(status().isOk());

        mockMvc.perform(put("/contents/{id}/reject", contentId).cookie(clientCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Please revise the caption\"}"))
                .andExpect(status().isOk());

        org.junit.jupiter.api.Assertions.assertEquals(3,
                contentVersionRepository.findByContentIdOrdered(contentId).size());
        org.junit.jupiter.api.Assertions.assertEquals(1,
                commentRepository.getCommentsByContentId(contentId).size());

        mockMvc.perform(put("/contents/{id}/send-for-approval", contentId).cookie(adminCookie))
                .andExpect(status().isOk());
        org.junit.jupiter.api.Assertions.assertEquals(4,
                contentVersionRepository.findByContentIdOrdered(contentId).size());
    }

    @Test
    void failedTransitionAndUnauthorizedMutationCreateNoVersions() throws Exception {
        Long contentId = createJsonContent("Protected versions");

        mockMvc.perform(put("/contents/{id}/publish", contentId).cookie(adminCookie))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/contents/{id}", contentId).cookie(clientCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(contentPayload("Unauthorized edit"))))
                .andExpect(status().isForbidden());

        org.junit.jupiter.api.Assertions.assertEquals(1,
                contentVersionRepository.findByContentIdOrdered(contentId).size());
    }

    @Test
    void adminAndOwningClientCanViewHistoryInAscendingVersionOrder() throws Exception {
        Long contentId = createJsonContent("Ordered history");
        mockMvc.perform(put("/contents/{id}/send-for-approval", contentId).cookie(adminCookie))
                .andExpect(status().isOk());

        mockMvc.perform(get("/contents/{id}/versions", contentId).cookie(adminCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].versionNumber").value(1))
                .andExpect(jsonPath("$[1].versionNumber").value(2));
        mockMvc.perform(get("/contents/{id}/versions", contentId).cookie(clientCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)));
    }

    @Test
    void crossClientCannotViewHistory() throws Exception {
        Long contentId = createJsonContent("Private history");
        mockMvc.perform(get("/contents/{id}/versions", contentId).cookie(otherClientCookie))
                .andExpect(status().isForbidden());
    }

    @Test
    void unauthenticatedHistoryRequestReturnsUnauthorized() throws Exception {
        Long contentId = createJsonContent("Authenticated history");
        mockMvc.perform(get("/contents/{id}/versions", contentId))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void missingContentHistoryReturnsNotFound() throws Exception {
        mockMvc.perform(get("/contents/{id}/versions", 99999999L).cookie(adminCookie))
                .andExpect(status().isNotFound());
    }

    private Long createJsonContent(String title) throws Exception {
        MvcResult result = mockMvc.perform(post("/contents").cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(contentPayload(title))))
                .andExpect(status().isCreated())
                .andReturn();
        return responseId(result);
    }

    private Map<String, Object> contentPayload(String title) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("clientId", clientId);
        payload.put("title", title);
        payload.put("description", "Version history test content");
        payload.put("file_url", "https://example.com/version.jpg");
        payload.put("content_type", "IMAGE");
        return payload;
    }

    private Long responseId(MvcResult result) throws Exception {
        JsonNode response = objectMapper.readTree(result.getResponse().getContentAsString());
        return response.get("content_id").asLong();
    }

    private Client createClient(Long userId) {
        Client client = new Client();
        client.setUser_id(userId);
        client.setBusiness_name("Version History Client " + userId);
        return clientRepository.save(client);
    }

    private String loginToken(String username, String password) throws Exception {
        String response = mockMvc.perform(post("/users/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("token").asText();
    }

    private Cookie tokenCookie(String token) {
        return new Cookie("token", token);
    }
}
