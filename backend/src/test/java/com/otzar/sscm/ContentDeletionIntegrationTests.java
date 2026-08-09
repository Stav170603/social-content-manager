package com.otzar.sscm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.otzar.sscm.entities.Client;
import com.otzar.sscm.repository.ClientRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import javax.servlet.http.Cookie;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ContentDeletionIntegrationTests {
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ClientRepository clientRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private Cookie adminCookie;
    private Cookie clientCookie;
    private Long clientId;

    @BeforeEach
    void setUp() throws Exception {
        adminCookie = tokenCookie(loginToken("admin", "123456"));
        clientCookie = tokenCookie(loginToken("client1", "123456"));
        clientId = clientRepository.findByUserId(2L).orElseGet(this::createClient).getClient_id();
    }

    @Test
    void adminDeletesEligibleContentAndAllOwnedDependentsOnly() throws Exception {
        Long deletedId = createContent("Delete me", true);
        Long untouchedId = createContent("Keep me", false);
        editTitle(deletedId, "Delete me edited");
        jdbcTemplate.update("INSERT INTO comments(content_id,user_id,commentText) VALUES (?,?,?)", deletedId, 2L, "related");
        jdbcTemplate.update("INSERT INTO notifications(user_id,type,title,message,related_content_id,is_read,created_at) VALUES (?,?,?,?,?,false,CURRENT_TIMESTAMP)",
                1L, "COMMENT_ADDED", "related", "related", deletedId);

        mockMvc.perform(delete("/contents/{id}", deletedId).cookie(adminCookie))
                .andExpect(status().isNoContent());

        assertEquals(0, count("contents", "content_id", deletedId));
        assertEquals(0, count("content_media", "content_id", deletedId));
        assertEquals(0, count("comments", "content_id", deletedId));
        assertEquals(0, count("content_versions", "content_id", deletedId));
        assertEquals(1, count("notifications", "notification_id", notificationIdWithClearedReference("related")));
        assertEquals(1, count("contents", "content_id", untouchedId));
    }

    @Test
    void clientCannotDeleteAndMissingContentReturns404() throws Exception {
        Long contentId = createContent("Protected", false);

        mockMvc.perform(delete("/contents/{id}", contentId).cookie(clientCookie))
                .andExpect(status().isForbidden());
        assertEquals(1, count("contents", "content_id", contentId));

        mockMvc.perform(delete("/contents/{id}", Long.MAX_VALUE).cookie(adminCookie))
                .andExpect(status().isNotFound());
    }

    @Test
    void publicationHistoryBlocksDeletionWithSafeConflictAndNoPartialChanges() throws Exception {
        Long contentId = createContent("Published history", true);
        jdbcTemplate.update("INSERT INTO publication_records(delivery_key,content_id,provider,target_platform,status,requested_at,attempt_number,trigger_type,created_at,updated_at) " +
                        "VALUES (?,?,?,'INSTAGRAM','SUCCEEDED',CURRENT_TIMESTAMP,1,'MANUAL',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
                "delete-test-" + contentId, contentId, "LOCAL");

        mockMvc.perform(delete("/contents/{id}", contentId).cookie(adminCookie))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONTENT_HAS_PUBLICATION_HISTORY"))
                .andExpect(jsonPath("$.message").value("לא ניתן למחוק תוכן שיש לו היסטוריית פרסום. היסטוריית הפרסום נשמרה ולא בוצעו שינויים."));

        assertEquals(1, count("contents", "content_id", contentId));
        assertEquals(1, count("content_media", "content_id", contentId));
        assertEquals(1, count("publication_records", "content_id", contentId));
    }

    private Long createContent(String title, boolean withMedia) throws Exception {
        String media = withMedia ? ",\"media\":[{\"mediaUrl\":\"https://example.com/" + title.replace(" ", "-") + ".jpg\",\"mediaType\":\"IMAGE\",\"displayOrder\":0}]" : "";
        MvcResult result = mockMvc.perform(post("/contents").cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":" + clientId + ",\"title\":\"" + title + "\",\"description\":\"description\",\"content_type\":\"IMAGE\"" + media + "}"))
                .andExpect(status().isCreated()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("content_id").asLong();
    }

    private void editTitle(Long contentId, String title) throws Exception {
        mockMvc.perform(put("/contents/{id}", contentId).cookie(adminCookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":" + clientId + ",\"title\":\"" + title + "\"}"))
                .andExpect(status().isOk());
    }

    private int count(String table, String column, Long id) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + column + "=?", Integer.class, id);
    }

    private Long notificationIdWithClearedReference(String title) {
        return jdbcTemplate.queryForObject("SELECT notification_id FROM notifications WHERE title=? AND related_content_id IS NULL ORDER BY notification_id DESC LIMIT 1", Long.class, title);
    }

    private Client createClient() {
        Client client = new Client();
        client.setUser_id(2L);
        client.setBusiness_name("Deletion Test Client");
        return clientRepository.save(client);
    }

    private String loginToken(String username, String password) throws Exception {
        String response = mockMvc.perform(post("/users/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response).get("token").asText();
    }

    private Cookie tokenCookie(String token) { return new Cookie("token", token); }
}
