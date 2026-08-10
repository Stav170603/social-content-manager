package com.otzar.sscm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.otzar.sscm.entities.Client;
import com.otzar.sscm.entities.Comment;
import com.otzar.sscm.entities.Content;
import com.otzar.sscm.entities.ContentStatus;
import com.otzar.sscm.repository.ClientRepository;
import com.otzar.sscm.repository.CommentRepository;
import com.otzar.sscm.repository.ContentRepository;
import com.otzar.sscm.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import javax.servlet.http.Cookie;
import java.util.UUID;

import static org.hamcrest.Matchers.hasKey;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ValidationIntegrationTests {
    // Exercises request validation through the complete MVC stack.
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ClientRepository clientRepository;
    @Autowired private ContentRepository contentRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private UserRepository userRepository;

    private Cookie adminCookie;
    private Cookie clientCookie;

    @BeforeEach
    void setUp() throws Exception {
        adminCookie = loginCookie("admin", "123456");
        clientCookie = loginCookie("client1", "123456");
    }

    @Test
    void blankLoginUsernameReturnsStructuredBadRequest() throws Exception {
        expectFieldError(post("/users/login"), "{\"username\":\"   \",\"password\":\"123456\"}", "username");
    }

    @Test
    void blankLoginPasswordReturnsStructuredBadRequest() throws Exception {
        expectFieldError(post("/users/login"), "{\"username\":\"admin\",\"password\":\"   \"}", "password");
    }

    @Test
    void invalidCredentialsPreserveExistingResponse() throws Exception {
        mockMvc.perform(post("/users/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.errorCode").value(100));
    }

    @Test
    void blankClientNameReturnsBadRequest() throws Exception {
        expectAdminFieldError(post("/clients"), clientJson("   ", "valid@example.com"), "businessName");
    }

    @Test
    void invalidClientEmailReturnsBadRequest() throws Exception {
        expectAdminFieldError(post("/clients"), clientJson("Valid Business", "not-an-email"), "email");
    }

    @Test
    void blankContentTitleReturnsBadRequest() throws Exception {
        Client client = createClient(2L);
        expectAdminFieldError(post("/contents"), contentJson(client.getClient_id(), "   "), "title");
    }

    @Test
    void missingContentClientReturnsBadRequest() throws Exception {
        expectAdminFieldError(post("/contents"), "{\"title\":\"Title\",\"content_type\":\"TEXT\"}", "clientId");
    }

    @Test
    void nonExistingContentClientReturnsNotFound() throws Exception {
        mockMvc.perform(post("/contents").cookie(adminCookie).contentType(MediaType.APPLICATION_JSON)
                        .content(contentJson(Long.MAX_VALUE, "Title")))
                .andExpect(status().isNotFound());
    }

    @Test
    void blankCommentReturnsBadRequest() throws Exception {
        Content content = createContent(ContentStatus.DRAFT);
        expectClientFieldError("{\"contentId\":" + content.getContent_id() + ",\"commentText\":\"\"}", "commentText");
    }

    @Test
    void whitespaceOnlyCommentReturnsBadRequest() throws Exception {
        Content content = createContent(ContentStatus.DRAFT);
        expectClientFieldError("{\"contentId\":" + content.getContent_id() + ",\"commentText\":\"   \"}", "commentText");
    }

    @Test
    void missingCommentContentIdReturnsBadRequest() throws Exception {
        expectClientFieldError("{\"commentText\":\"A comment\"}", "contentId");
    }

    @Test
    void nonExistingCommentContentReturnsNotFound() throws Exception {
        mockMvc.perform(post("/comments").cookie(clientCookie).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentId\":" + Long.MAX_VALUE + ",\"commentText\":\"A comment\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void blankRejectionReasonReturnsBadRequest() throws Exception {
        Content content = createContent(ContentStatus.WAITING_APPROVAL);
        mockMvc.perform(put("/contents/{id}/reject", content.getContent_id()).cookie(clientCookie)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.reason").value("Rejection reason is required"));
    }

    @Test
    void validLoginStillWorks() throws Exception {
        mockMvc.perform(post("/users/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"123456\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void validClientCreationStillWorks() throws Exception {
        mockMvc.perform(post("/clients").cookie(adminCookie).contentType(MediaType.APPLICATION_JSON)
                        .content(clientJson("Valid Business", "valid@example.com")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.business_name").value("Valid Business"));
    }

    @Test
    void clientEmailIsOptionalAndCanBeCleared() throws Exception {
        String suffix = UUID.randomUUID().toString();
        String createJson = "{\"businessName\":\"No Email\",\"fullName\":\"Client Name\",\"email\":\"   \",\"username\":\"user-" + suffix
                + "\",\"password\":\"password\",\"phone\":\"0501234567\"}";
        String response = mockMvc.perform(post("/clients").cookie(adminCookie).contentType(MediaType.APPLICATION_JSON).content(createJson))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Client client = objectMapper.readValue(response, Client.class);
        org.junit.jupiter.api.Assertions.assertNull(userRepository.findById(client.getUser_id()).orElseThrow().getEmail());

        mockMvc.perform(put("/clients/" + client.getClient_id()).cookie(adminCookie).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"valid@example.com\"}"))
                .andExpect(status().isOk());
        org.junit.jupiter.api.Assertions.assertEquals("valid@example.com", userRepository.findById(client.getUser_id()).orElseThrow().getEmail());

        mockMvc.perform(put("/clients/" + client.getClient_id()).cookie(adminCookie).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"\"}"))
                .andExpect(status().isOk());
        org.junit.jupiter.api.Assertions.assertNull(userRepository.findById(client.getUser_id()).orElseThrow().getEmail());
    }

    @Test
    void validLocalIsraeliPhoneIsAccepted() throws Exception {
        mockMvc.perform(post("/clients").cookie(adminCookie).contentType(MediaType.APPLICATION_JSON)
                        .content(clientJsonWithFields("0501234567", null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.phone").value("0501234567"));
    }

    @Test
    void internationalIsraeliPhoneIsNormalizedToLocalFormat() throws Exception {
        mockMvc.perform(post("/clients").cookie(adminCookie).contentType(MediaType.APPLICATION_JSON)
                        .content(clientJsonWithFields("+972-50-123-4567", "@social.otzar")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.phone").value("0501234567"))
                .andExpect(jsonPath("$.instagramUsername").value("social.otzar"));
    }

    @Test
    void invalidClientPhonesAreRejected() throws Exception {
        for (String phone : new String[]{"050ABC4567", "050123", "050123456789", ""}) {
            expectAdminFieldError(post("/clients"), clientJsonWithFields(phone, null), "phone");
        }
    }

    @Test
    void optionalInstagramUsernameMayBeNull() throws Exception {
        mockMvc.perform(post("/clients").cookie(adminCookie).contentType(MediaType.APPLICATION_JSON)
                        .content(clientJsonWithFields("0507654321", null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.instagramUsername").doesNotExist());
    }

    @Test
    void invalidInstagramUsernamesAreRejected() throws Exception {
        for (String username : new String[]{"name with space", "@@social.otzar", "name!"}) {
            expectAdminFieldError(post("/clients"), clientJsonWithFields("0507654321", username), "instagramUsername");
        }
    }

    @Test
    void validContentCreationStillWorks() throws Exception {
        Client client = createClient(2L);
        mockMvc.perform(post("/contents").cookie(adminCookie).contentType(MediaType.APPLICATION_JSON)
                        .content(contentJson(client.getClient_id(), "Valid title")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    void validCommentCreationUsesAuthenticatedOwner() throws Exception {
        Content content = createContent(ContentStatus.DRAFT);
        mockMvc.perform(post("/comments").cookie(clientCookie).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentId\":" + content.getContent_id()
                                + ",\"userId\":3,\"commentText\":\"Valid comment\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").value(2));
    }

    @Test
    void validRejectionRemainsAtomic() throws Exception {
        Content content = createContent(ContentStatus.WAITING_APPROVAL);
        mockMvc.perform(put("/contents/{id}/reject", content.getContent_id()).cookie(clientCookie)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Needs revision\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));

        Content rejected = contentRepository.findById(content.getContent_id()).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(ContentStatus.REJECTED, rejected.getStatus());
        org.junit.jupiter.api.Assertions.assertEquals("Needs revision",
                commentRepository.getCommentsByContentId(content.getContent_id()).get(0).getCommentText());
    }

    private void expectFieldError(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
                                  String json, String field) throws Exception {
        mockMvc.perform(request.contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors", hasKey(field)));
    }

    private void expectAdminFieldError(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
                                       String json, String field) throws Exception {
        mockMvc.perform(request.cookie(adminCookie).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors", hasKey(field)));
    }

    private void expectClientFieldError(String json, String field) throws Exception {
        mockMvc.perform(post("/comments").cookie(clientCookie).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors", hasKey(field)));
    }

    private String clientJson(String businessName, String email) {
        String suffix = UUID.randomUUID().toString();
        return "{\"businessName\":\"" + businessName + "\",\"fullName\":\"Client Name\",\"email\":\""
                + email + "\",\"username\":\"user-" + suffix
                + "\",\"password\":\"password\",\"phone\":\"0501234567\"}";
    }

    private String clientJsonWithFields(String phone, String instagramUsername) {
        String suffix = UUID.randomUUID().toString();
        String instagram = instagramUsername == null ? "null" : "\"" + instagramUsername + "\"";
        return "{\"businessName\":\"Validated Client\",\"fullName\":\"Client Name\",\"email\":\""
                + suffix + "@example.com\",\"username\":\"user-" + suffix
                + "\",\"password\":\"password\",\"phone\":\"" + phone
                + "\",\"instagramUsername\":" + instagram + "}";
    }

    private String contentJson(Long clientId, String title) {
        return "{\"clientId\":" + clientId + ",\"title\":\"" + title + "\",\"content_type\":\"TEXT\"}";
    }

    private Client createClient(Long userId) {
        return clientRepository.findByUserId(userId).orElseGet(() -> {
            Client client = new Client();
            client.setUser_id(userId);
            client.setBusiness_name("Validation Client");
            return clientRepository.save(client);
        });
    }

    private Content createContent(ContentStatus status) {
        Client client = createClient(2L);
        Content content = new Content();
        content.setClientId(client.getClient_id());
        content.setTitle("Validation content");
        content.setContent_type("TEXT");
        content.setStatus(status);
        return contentRepository.save(content);
    }

    private Cookie loginCookie(String username, String password) throws Exception {
        String body = mockMvc.perform(post("/users/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return new Cookie("token", objectMapper.readTree(body).get("token").asText());
    }
}
