package com.otzar.sscm.repository;

import com.otzar.sscm.entities.Content;
import com.otzar.sscm.entities.ContentVersion;
import com.otzar.sscm.service.Persist;
import org.hibernate.LockMode;
import org.hibernate.LockOptions;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
@Transactional
public class ContentVersionRepository {

    private final Persist persist;

    public ContentVersionRepository(Persist persist) {
        this.persist = persist;
    }

    public void lockContent(Long contentId) {
        Content content = persist.loadObject(Content.class, contentId);
        if (content != null) {
            persist.getQuerySession()
                    .buildLockRequest(new LockOptions(LockMode.PESSIMISTIC_WRITE))
                    .lock(content);
        }
    }

    public int nextVersionNumber(Long contentId) {
        Integer maximum = persist.getQuerySession()
                .createQuery("SELECT MAX(versionNumber) FROM ContentVersion WHERE contentId = :contentId", Integer.class)
                .setParameter("contentId", contentId)
                .uniqueResult();
        return maximum == null ? 1 : maximum + 1;
    }

    public ContentVersion save(ContentVersion version) {
        persist.getQuerySession().save(version);
        return version;
    }

    public List<ContentVersion> findByContentIdOrdered(Long contentId) {
        return persist.getQuerySession()
                .createQuery("FROM ContentVersion WHERE contentId = :contentId ORDER BY versionNumber ASC", ContentVersion.class)
                .setParameter("contentId", contentId)
                .list();
    }

    public Optional<ContentVersion> findByContentIdAndVersionNumber(Long contentId, Integer versionNumber) {
        return persist.getQuerySession()
                .createQuery("FROM ContentVersion WHERE contentId = :contentId " +
                        "AND versionNumber = :versionNumber", ContentVersion.class)
                .setParameter("contentId", contentId)
                .setParameter("versionNumber", versionNumber)
                .uniqueResultOptional();
    }

    public int deleteByContentId(Long contentId) {
        return persist.getQuerySession().createQuery("DELETE FROM ContentVersion WHERE contentId = :contentId")
                .setParameter("contentId", contentId).executeUpdate();
    }
}
