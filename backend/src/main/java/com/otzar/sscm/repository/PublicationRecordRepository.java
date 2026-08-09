package com.otzar.sscm.repository;

import com.otzar.sscm.entities.PublicationRecord;
import com.otzar.sscm.entities.PublicationStatus;
import com.otzar.sscm.entities.PublicationTriggerType;
import com.otzar.sscm.models.PublishingProviderType;
import com.otzar.sscm.service.Persist;
import org.hibernate.LockMode;
import org.hibernate.query.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;

@Repository
public class PublicationRecordRepository {
    private final Persist persist;
    public PublicationRecordRepository(Persist persist) { this.persist = persist; }

    public PublicationRecord save(PublicationRecord record) {
        persist.save(record);
        persist.getQuerySession().flush();
        return record;
    }

    public Optional<PublicationRecord> findById(Long id) {
        return Optional.ofNullable(persist.loadObject(PublicationRecord.class, id));
    }

    public Optional<PublicationRecord> findByIdForUpdate(Long id) {
        return Optional.ofNullable(persist.getQuerySession().get(
                PublicationRecord.class, id, LockMode.PESSIMISTIC_WRITE));
    }

    public boolean existsByContentId(Long contentId) {
        Long count = persist.getQuerySession().createQuery(
                "SELECT COUNT(*) FROM PublicationRecord WHERE contentId = :contentId", Long.class)
                .setParameter("contentId", contentId).uniqueResult();
        return count != null && count > 0;
    }

    @Transactional(readOnly = true)
    public List<PublicationRecord> find(Long contentId, Long clientId, PublicationStatus status,
                                        PublishingProviderType provider,
                                        PublicationTriggerType triggerType, int limit) {
        StringBuilder hql = new StringBuilder("FROM PublicationRecord p WHERE 1=1");
        if (contentId != null) hql.append(" AND p.contentId=:contentId");
        if (clientId != null) hql.append(" AND p.contentId IN (SELECT c.content_id FROM Content c WHERE c.clientId=:clientId)");
        if (status != null) hql.append(" AND p.status=:status");
        if (provider != null) hql.append(" AND p.provider=:provider");
        if (triggerType != null) hql.append(" AND p.triggerType=:triggerType");
        hql.append(" ORDER BY p.requestedAt DESC, p.publicationId DESC");
        Query<PublicationRecord> query = persist.getQuerySession().createQuery(hql.toString(), PublicationRecord.class);
        if (contentId != null) query.setParameter("contentId", contentId);
        if (clientId != null) query.setParameter("clientId", clientId);
        if (status != null) query.setParameter("status", status);
        if (provider != null) query.setParameter("provider", provider);
        if (triggerType != null) query.setParameter("triggerType", triggerType);
        return query.setMaxResults(limit).list();
    }
}
