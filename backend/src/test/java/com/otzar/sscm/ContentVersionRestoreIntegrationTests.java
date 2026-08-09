package com.otzar.sscm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.otzar.sscm.entities.Client;
import com.otzar.sscm.entities.Comment;
import com.otzar.sscm.entities.Content;
import com.otzar.sscm.entities.ContentStatus;
import com.otzar.sscm.entities.User;
import com.otzar.sscm.repository.ClientRepository;
import com.otzar.sscm.repository.CommentRepository;
import com.otzar.sscm.repository.ContentRepository;
import com.otzar.sscm.repository.ContentVersionRepository;
import com.otzar.sscm.repository.NotificationRepository;
import com.otzar.sscm.repository.UserRepository;
import com.otzar.sscm.service.FileStorageService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.servlet.http.Cookie;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContentVersionRestoreIntegrationTests {
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ClientRepository clientRepository;
    @Autowired private ContentRepository contentRepository;
    @Autowired private ContentVersionRepository contentVersionRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private FileStorageService fileStorageService;

    private final List<Path> testFiles = new ArrayList<>();
    private Cookie adminCookie;
    private Cookie clientCookie;
    private Long clientId;

    @BeforeEach
    void setUp() throws Exception {
        adminCookie = tokenCookie(loginToken("admin", "123456"));
        clientCookie = tokenCookie(loginToken("client1", "123456"));
        clientId = clientRepository.findByUserId(2L).orElseGet(() -> createClient(2L)).getClient_id();
    }

    @AfterEach
    void removeTestFiles() throws Exception {
        for (Path testFile : testFiles) Files.deleteIfExists(testFile);
    }

    @Test
    void adminRestoresDraftFieldsAndPreservesOwnershipStatusAndSchedule() throws Exception {
        Long contentId = createContent("Original title", "Original description", "IMAGE",
                "https://example.com/original.jpg", "2026-08-01T10:00:00");
        updateContent(contentId, "Current title", "Current description", "VIDEO",
                "https://example.com/current.mp4", "2026-09-15T12:30:00");

        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                        .cookie(adminCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value(true))
                .andExpect(jsonPath("$.restoredFromVersionNumber").value(1))
                .andExpect(jsonPath("$.newVersionNumber").value(2))
                .andExpect(jsonPath("$.content.title").value("Original title"))
                .andExpect(jsonPath("$.content.description").value("Original description"))
                .andExpect(jsonPath("$.content.content_type").value("IMAGE"))
                .andExpect(jsonPath("$.content.file_url").value("https://example.com/original.jpg"))
                .andExpect(jsonPath("$.content.clientId").value(clientId))
                .andExpect(jsonPath("$.content.status").value("DRAFT"))
                .andExpect(jsonPath("$.content.plannedPublishDate").value("2026-09-15T12:30:00"));

        assertEquals(2, contentVersionRepository.findByContentIdOrdered(contentId).size());
        assertEquals(1L, contentVersionRepository.findByContentIdOrdered(contentId).get(1).getChangedByUserId());
        assertEquals("EDITED", contentVersionRepository.findByContentIdOrdered(contentId).get(1).getChangeType().name());
    }

    @Test
    void adminRestoresRejectedContentAndHistoricalStatusIsIgnored() throws Exception {
        Long contentId = createContent("Rejected original", "Old", "TEXT", null, null);
        updateContent(contentId, "Rejected current", "Current", "IMAGE", null, null);
        Content content = contentRepository.findById(contentId).orElseThrow();
        content.setStatus(ContentStatus.REJECTED);
        contentRepository.save(content);

        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                        .cookie(adminCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.title").value("Rejected original"))
                .andExpect(jsonPath("$.content.status").value("REJECTED"));
    }

    @Test
    void clientUnauthenticatedAndUnknownRolesCannotRestore() throws Exception {
        Long contentId = createContent("Protected", "Original", "TEXT", null, null);

        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                        .cookie(clientCookie))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1))
                .andExpect(status().isUnauthorized());

        User unknown = new User();
        unknown.setFull_name("Restore Unknown");
        unknown.setEmail("restore-unknown@example.com");
        unknown.setUsername("restore-unknown");
        unknown.setPassword("not-used");
        unknown.setRole("UNKNOWN");
        unknown.setToken("restore-unknown-token");
        userRepository.save(unknown);
        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                        .cookie(tokenCookie("restore-unknown-token")))
                .andExpect(status().isForbidden());
    }

    @Test
    void missingContentVersionAndCrossContentVersionReturnNotFound() throws Exception {
        Long first = createContent("First", "First", "TEXT", null, null);
        Long second = createContent("Second", "Second", "TEXT", null, null);
        updateContent(second, "Second v2", "Second", "TEXT", null, null);

        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", 99999999L, 1)
                        .cookie(adminCookie)).andExpect(status().isNotFound());
        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", first, 99)
                        .cookie(adminCookie)).andExpect(status().isNotFound());
        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", first, 2)
                        .cookie(adminCookie)).andExpect(status().isNotFound());
    }

    @Test
    void waitingApprovedAndPublishedStatusesBlockRestoreWithoutNewVersion() throws Exception {
        for (ContentStatus blockedStatus : List.of(
                ContentStatus.WAITING_APPROVAL, ContentStatus.APPROVED, ContentStatus.PUBLISHED)) {
            Long contentId = createContent("Blocked " + blockedStatus, "Blocked", "TEXT", null, null);
            updateContent(contentId, "Blocked edited " + blockedStatus, "Blocked", "TEXT", null, null);
            Content content = contentRepository.findById(contentId).orElseThrow();
            content.setStatus(blockedStatus);
            contentRepository.save(content);

            mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                            .cookie(adminCookie))
                    .andExpect(status().isBadRequest());
            assertEquals(1, contentVersionRepository.findByContentIdOrdered(contentId).size());
            assertEquals(blockedStatus, contentRepository.findById(contentId).orElseThrow().getStatus());
        }
    }

    @Test
    void noOpReturnsUnchangedAndCreatesNoVersion() throws Exception {
        Long contentId = createContent("No-op", "Same", "IMAGE", null, null);
        updateContent(contentId, "Changed", "Same", "IMAGE", null, null);
        updateContent(contentId, "No-op", "Same", "IMAGE", null, null);

        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                        .cookie(adminCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.changed").value(false))
                .andExpect(jsonPath("$.newVersionNumber").doesNotExist());
        assertEquals(2, contentVersionRepository.findByContentIdOrdered(contentId).size());
    }

    @Test
    void restoreLeavesCommentsAndNotificationsUntouched() throws Exception {
        Long contentId = createContent("With related data", "Old", "TEXT", null, null);
        updateContent(contentId, "With related data current", "New", "IMAGE", null, null);
        Comment comment = new Comment();
        comment.setContentId(contentId);
        comment.setUserId(2L);
        comment.setCommentText("Keep this comment");
        commentRepository.save(comment);
        int commentsBefore = commentRepository.getCommentsByContentId(contentId).size();
        int notificationsBefore = notificationRepository.findByUserId(2L).size();

        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                        .cookie(adminCookie)).andExpect(status().isOk());

        assertEquals(commentsBefore, commentRepository.getCommentsByContentId(contentId).size());
        assertEquals(notificationsBefore, notificationRepository.findByUserId(2L).size());
    }

    @Test
    void existingManagedMediaRestoresWithoutCopyingIt() throws Exception {
        String filename = "restore-existing-media.png";
        Path media = fileStorageService.getUploadDirectory().resolve(filename);
        Files.write(media, new byte[]{1, 2, 3});
        testFiles.add(media);
        Long contentId = createContent("Local media", "Old", "IMAGE", "/uploads/" + filename, null);
        updateContent(contentId, "Local media current", "New", "TEXT", null, null);

        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                        .cookie(adminCookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.file_url").value("/uploads/" + filename));
        assertTrue(Files.isRegularFile(media));
        assertEquals(3, Files.size(media));
    }

    @Test
    void missingManagedMediaRejectsAndRollsBackEverything() throws Exception {
        Long contentId = createContent("Missing media old", "Old", "IMAGE",
                "/uploads/restore-file-that-does-not-exist.png", null);
        updateContent(contentId, "Missing media current", "Current", "TEXT",
                "https://example.com/current.txt", null);

        mockMvc.perform(post("/contents/{contentId}/versions/{version}/restore", contentId, 1)
                        .cookie(adminCookie))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Historical media file is unavailable"));

        Content unchanged = contentRepository.findById(contentId).orElseThrow();
        assertEquals("Missing media current", unchanged.getTitle());
        assertEquals("https://example.com/current.txt", unchanged.getFile_url());
        assertEquals(1, contentVersionRepository.findByContentIdOrdered(contentId).size());
    }

    private Long createContent(String title, String description, String type, String fileUrl,
                               String plannedPublishDate) throws Exception {
        String dateJson = plannedPublishDate == null ? "null" : "\"" + plannedPublishDate + "\"";
        MvcResult result = mockMvc.perform(post("/contents").cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":" + clientId + ",\"title\":\"" + title +
                                "\",\"description\":\"" + description + "\",\"content_type\":\"" + type +
                                "\",\"file_url\":" + nullableJson(fileUrl) +
                                ",\"plannedPublishDate\":" + dateJson + "}"))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("content_id").asLong();
    }

    private void updateContent(Long contentId, String title, String description, String type,
                               String fileUrl, String plannedPublishDate) throws Exception {
        String dateField = plannedPublishDate == null ? "" :
                ",\"plannedPublishDate\":\"" + plannedPublishDate + "\"";
        mockMvc.perform(put("/contents/{id}", contentId).cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":" + clientId + ",\"title\":\"" + title +
                                "\",\"description\":\"" + description + "\",\"content_type\":\"" + type +
                                "\",\"file_url\":" + nullableJson(fileUrl) + dateField + "}"))
                .andExpect(status().isOk());
    }

    private String nullableJson(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    private Client createClient(Long userId) {
        Client client = new Client();
        client.setUser_id(userId);
        client.setBusiness_name("Restore Test Client");
        return clientRepository.save(client);
    }

    private String loginToken(String username, String password) throws Exception {
        String response = mockMvc.perform(post("/users/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("token").asText();
    }

    private Cookie tokenCookie(String token) { return new Cookie("token", token); }
}
