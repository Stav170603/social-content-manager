package com.otzar.sscm.repository;
import com.otzar.sscm.entities.ContentVersionMedia; import com.otzar.sscm.service.Persist;
import org.springframework.stereotype.Repository; import org.springframework.transaction.annotation.Transactional; import java.util.List;
@Repository @Transactional public class ContentVersionMediaRepository {
 private final Persist persist; public ContentVersionMediaRepository(Persist p){persist=p;}
 public List<ContentVersionMedia> findByVersionId(Long id){return persist.getQuerySession().createQuery("FROM ContentVersionMedia WHERE contentVersionId=:id ORDER BY displayOrder, versionMediaId",ContentVersionMedia.class).setParameter("id",id).list();}
 public ContentVersionMedia save(ContentVersionMedia m){persist.save(m);return m;}
 public int deleteByContentId(Long id){return persist.getQuerySession().createQuery("DELETE FROM ContentVersionMedia WHERE contentVersionId IN (SELECT contentVersionId FROM ContentVersion WHERE contentId=:id)").setParameter("id",id).executeUpdate();}
}
