package com.otzar.sscm.models;

import javax.validation.constraints.Email;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import com.otzar.sscm.validation.ClientFieldNormalizer;

public class CreateClientRequest {

    @NotBlank(message = "Business name is required")
    private String businessName;
    private String fullName;
    @Email(message = "Email must be valid")
    private String email;
    @NotBlank(message = "Username is required")
    private String username;
    @NotBlank(message = "Password is required")
    private String password;
    @NotBlank(message = "יש להזין מספר טלפון ישראלי תקין")
    @Pattern(regexp = "^05\\d{8}$", message = "יש להזין מספר טלפון ישראלי תקין")
    private String phone;
    @Pattern(regexp = "^[A-Za-z0-9._]{1,30}$", message = "יש להזין שם משתמש Instagram תקין")
    private String instagramUsername;
    private Long adminId;

    public String getBusinessName() { return businessName; }
    public void setBusinessName(String businessName) { this.businessName = businessName; }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = ClientFieldNormalizer.normalizeEmail(email); }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = ClientFieldNormalizer.normalizePhone(phone); }

    public String getInstagramUsername() { return instagramUsername; }
    public void setInstagramUsername(String instagramUsername) {
        this.instagramUsername = ClientFieldNormalizer.normalizeInstagramUsername(instagramUsername);
    }

    public Long getAdminId() { return adminId; }
    public void setAdminId(Long adminId) { this.adminId = adminId; }
}
