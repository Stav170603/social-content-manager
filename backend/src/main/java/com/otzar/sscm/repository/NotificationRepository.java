package com.otzar.sscm.repository;

import com.otzar.sscm.entities.Notification;
import com.otzar.sscm.service.Persist;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
@Transactional
public class NotificationRepository {
    private final Persist persist;

    public NotificationRepository(Persist persist) { this.persist = persist; }

    public Notification save(Notification notification) { persist.save(notification); return notification; }
    public Optional<Notification> findById(Long id) { return Optional.ofNullable(persist.loadObject(Notification.class, id)); }
    public List<Notification> findByUserId(Long userId) {
        return persist.getQuerySession().createQuery(
                "FROM Notification WHERE userId = :userId ORDER BY createdAt DESC, notificationId DESC", Notification.class)
                .setParameter("userId", userId).list();
    }
    public long countUnread(Long userId) {
        return persist.getQuerySession().createQuery(
                "SELECT COUNT(*) FROM Notification WHERE userId = :userId AND read = false", Long.class)
                .setParameter("userId", userId).uniqueResult();
    }
    public int markAllRead(Long userId) {
        return persist.getQuerySession().createQuery(
                "UPDATE Notification SET read = true WHERE userId = :userId AND read = false")
                .setParameter("userId", userId).executeUpdate();
    }
    public int clearRelatedContentId(Long contentId) {
        return persist.getQuerySession().createQuery(
                "UPDATE Notification SET relatedContentId = null WHERE relatedContentId = :contentId")
                .setParameter("contentId", contentId).executeUpdate();
    }
}
