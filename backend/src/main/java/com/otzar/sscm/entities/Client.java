package com.otzar.sscm.entities;

public class Client {

    private Long client_id;

    private Long user_id;
    private Long admin_id;

    private String business_name;
    private String phone;
    private String instagramUsername;
    private boolean archived;
    private String email;

    // getters & setters
    public Long getClient_id() { return client_id; }
    public void setClient_id(Long client_id) { this.client_id = client_id; }

    public Long getUser_id() { return user_id; }
    public void setUser_id(Long user_id) { this.user_id = user_id; }

    public Long getAdmin_id() { return admin_id; }
    public void setAdmin_id(Long admin_id) { this.admin_id = admin_id; }

    public String getBusiness_name() { return business_name; }
    public void setBusiness_name(String business_name) { this.business_name = business_name; }

    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }

    public String getInstagramUsername() { return instagramUsername; }
    public void setInstagramUsername(String instagramUsername) { this.instagramUsername = instagramUsername; }

    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}
