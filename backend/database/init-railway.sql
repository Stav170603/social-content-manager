USE railway;

CREATE TABLE users (
                       user_id INT AUTO_INCREMENT PRIMARY KEY,
                       full_name VARCHAR(100) NOT NULL,
                       email VARCHAR(150) NULL UNIQUE,
                       username VARCHAR(100) NOT NULL UNIQUE,
                       password VARCHAR(255) NOT NULL,
                       role ENUM('ADMIN', 'CLIENT') NOT NULL,
                       token VARCHAR(255),
                       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE admins (
                        admin_id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL UNIQUE,
                        can_manage_clients BOOLEAN DEFAULT TRUE,
                        can_publish_content BOOLEAN DEFAULT TRUE,
                        can_view_analytics BOOLEAN DEFAULT TRUE,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                        FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE clients (
                         client_id INT AUTO_INCREMENT PRIMARY KEY,
                         user_id INT NOT NULL,
                         admin_id INT,
                         business_name VARCHAR(150) NOT NULL,
                         phone VARCHAR(20),
                         instagram_username VARCHAR(100) NULL,
                         archived BOOLEAN NOT NULL DEFAULT FALSE,
                         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                         FOREIGN KEY (user_id) REFERENCES users(user_id),
                         FOREIGN KEY (admin_id) REFERENCES admins(admin_id)
);

CREATE TABLE contents (
                          content_id INT AUTO_INCREMENT PRIMARY KEY,
                          client_id INT NOT NULL,
                          title VARCHAR(150) NOT NULL,
                          description TEXT,
                          file_url VARCHAR(500),
                          content_type ENUM('IMAGE', 'VIDEO', 'TEXT') NOT NULL,
                          status ENUM('DRAFT', 'WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED') DEFAULT 'DRAFT',
                          planned_publish_date DATETIME,
                          feed_order INT NULL,
                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                          FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

CREATE TABLE content_versions (
                                  content_version_id BIGINT AUTO_INCREMENT PRIMARY KEY,
                                  content_id INT NOT NULL,
                                  version_number INT NOT NULL,
                                  title VARCHAR(150) NOT NULL,
                                  description TEXT,
                                  content_type ENUM('IMAGE', 'VIDEO', 'TEXT') NOT NULL,
                                  file_url VARCHAR(500),
                                  status ENUM('DRAFT', 'WAITING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED') NOT NULL,
                                  planned_publish_date DATETIME,
                                  changed_by_user_id INT NULL,
                                  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                  change_type ENUM('CREATED', 'EDITED', 'SCHEDULED', 'STATUS_CHANGED') NOT NULL,

                                  CONSTRAINT uk_content_version_number UNIQUE (content_id, version_number),
                                  FOREIGN KEY (content_id) REFERENCES contents(content_id) ON DELETE CASCADE,
                                  FOREIGN KEY (changed_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
                                  INDEX idx_content_versions_history (content_id, version_number)
);

CREATE TABLE content_media (
  media_id BIGINT AUTO_INCREMENT PRIMARY KEY, content_id INT NOT NULL,
  media_url VARCHAR(2048) NOT NULL, media_type VARCHAR(20) NOT NULL,
  display_order INT NOT NULL, thumbnail_url VARCHAR(2048), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_content_media_order(content_id,display_order), INDEX idx_content_media_content(content_id),
  FOREIGN KEY(content_id) REFERENCES contents(content_id)
);
CREATE TABLE content_version_media (
  version_media_id BIGINT AUTO_INCREMENT PRIMARY KEY, content_version_id BIGINT NOT NULL,
  media_url VARCHAR(2048) NOT NULL, media_type VARCHAR(20) NOT NULL,
  display_order INT NOT NULL, thumbnail_url VARCHAR(2048),
  UNIQUE KEY uk_version_media_order(content_version_id,display_order), INDEX idx_version_media_version(content_version_id),
  FOREIGN KEY(content_version_id) REFERENCES content_versions(content_version_id)
);

CREATE TABLE comments (
                          comment_id INT AUTO_INCREMENT PRIMARY KEY,
                          content_id INT NOT NULL,
                          user_id INT NOT NULL,
                          commentText TEXT NOT NULL,
                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                          FOREIGN KEY (content_id) REFERENCES contents(content_id),
                          FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE instagram_connection_settings (
    settings_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL UNIQUE,
    instagram_user_id VARCHAR(40) NOT NULL,
    graph_api_base_url VARCHAR(255) NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    related_content_id INT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (related_content_id) REFERENCES contents(content_id) ON DELETE SET NULL,
    INDEX idx_notifications_user_created (user_id, created_at),
    INDEX idx_notifications_user_read (user_id, is_read)
);

CREATE TABLE publication_records (
    publication_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    delivery_key VARCHAR(190) NOT NULL UNIQUE,
    content_id INT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    target_platform VARCHAR(50) NULL,
    status VARCHAR(30) NOT NULL,
    requested_at DATETIME NOT NULL,
    started_at DATETIME NULL,
    published_at DATETIME NULL,
    external_post_id VARCHAR(255) NULL,
    error_code VARCHAR(100) NULL,
    error_message VARCHAR(1000) NULL,
    attempt_number INT NOT NULL,
    trigger_type VARCHAR(30) NOT NULL,
    requested_by_user_id INT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (content_id) REFERENCES contents(content_id),
    FOREIGN KEY (requested_by_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_publications_content_requested (content_id, requested_at),
    INDEX idx_publications_status_requested (status, requested_at)
);

INSERT INTO users (full_name, email, username, password, role, token)
VALUES
    ('Admin', 'admin@sscm.com', 'admin', '$2a$10$ruYktCywZWcCmcdsm8xMQe/4G1jOU/e9rtO7j4qKyV9iQ4EHiwf9K', 'ADMIN', ''),
    ('Stav Beauty Studio', 'client1@sscm.com', 'client1', '$2a$10$DDh1xXonjjHc1jsb1Z.O9eBdmJGispoDRyn1pMLmLXjIi2awwz.5u', 'CLIENT', ''),
    ('Hodaya Nails', 'client2@sscm.com', 'client2', '$2a$10$DDh1xXonjjHc1jsb1Z.O9eBdmJGispoDRyn1pMLmLXjIi2awwz.5u', 'CLIENT', ''),
    ('Otzar', 'otzar@sscm.com', 'otzar', '$2a$10$QiC290Pfu8DVrzOm3GaAkOZLnoBYzH5ogIZG8Uzp3HLgU9D4D2.fm', 'CLIENT', '');

INSERT INTO admins (user_id)
VALUES (1);

INSERT INTO clients (user_id, admin_id, business_name, phone)
VALUES
    (2, 1, 'Stav Beauty Studio', '0501234567'),
    (3, 1, 'Hodaya Nails', '0527654321'),
    (4, 1, 'Otzar', '');

INSERT INTO contents (client_id, title, description, file_url, content_type, status)
VALUES
    (1, 'פוסט פתיחה לאינסטגרם', 'פוסט היכרות לעסק, מיועד לפרסום ביום ראשון בערב', 'https://example.com/post1.jpg', 'IMAGE', 'WAITING_APPROVAL'),
    (1, 'רילס לפני ואחרי', 'וידאו קצר המציג תוצאה של טיפול לפני ואחרי', 'https://example.com/reel1.mp4', 'VIDEO', 'DRAFT'),
    (2, 'מבצע לק ג׳ל', 'פוסט מבצע לחודש הקרוב עבור לק ג׳ל', 'https://example.com/post2.jpg', 'IMAGE', 'APPROVED');

INSERT INTO comments (content_id, user_id, commentText)
VALUES
    (1, 2, 'אהבתי את העיצוב, אפשר רק לשנות את הטקסט בסוף?'),
    (2, 1, 'העליתי גרסה ראשונית של הרילס, ממתין לאישור.'),
    (3, 3, 'מאשרת, אפשר לפרסם.');
