package com.otzar.sscm.models;

import javax.validation.constraints.Pattern;
import javax.validation.constraints.Email;
import com.otzar.sscm.validation.ClientFieldNormalizer;
import com.fasterxml.jackson.annotation.JsonIgnore;

public class UpdateClientRequest {

    private Long userId;
    private Long adminId;
    private Boolean clearAdminAssignment;
    @Pattern(regexp = ".*\\S.*", message = "Business name must not be blank")
    private String businessName;
    @Pattern(regexp = "^05\\d{8}$", message = "יש להזין מספר טלפון ישראלי תקין")
    private String phone;
    @Pattern(regexp = "^[A-Za-z0-9._]{1,30}$", message = "יש להזין שם משתמש Instagram תקין")
    private String instagramUsername;
    private boolean instagramUsernameProvided;
    @Email(message = "Email must be valid")
    private String email;
    private boolean emailProvided;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public Long getAdminId() { return adminId; }
    public void setAdminId(Long adminId) { this.adminId = adminId; }
    public Boolean getClearAdminAssignment() { return clearAdminAssignment; }
    public void setClearAdminAssignment(Boolean clearAdminAssignment) { this.clearAdminAssignment = clearAdminAssignment; }

    public String getBusinessName() { return businessName; }
    public void setBusinessName(String businessName) { this.businessName = businessName; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = ClientFieldNormalizer.normalizePhone(phone); }

    public String getInstagramUsername() { return instagramUsername; }
    public void setInstagramUsername(String instagramUsername) {
        this.instagramUsernameProvided = true;
        this.instagramUsername = ClientFieldNormalizer.normalizeInstagramUsername(instagramUsername);
    }
    @JsonIgnore
    public boolean isInstagramUsernameProvided() { return instagramUsernameProvided; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.emailProvided = true; this.email = ClientFieldNormalizer.normalizeEmail(email); }
    @JsonIgnore
    public boolean isEmailProvided() { return emailProvided; }
}
