import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Send, X } from 'lucide-react'
import { getMediaType } from '../utils/imageUrl.js'
import {
  getInstagramPublishErrorMessage,
  publishContentToInstagram,
} from '../api/publishing.js'
import { showToast } from '../utils/toast.js'
import ContentMediaCarousel from './ContentMediaCarousel.jsx'

const OFFLINE_MESSAGE = 'אין חיבור לאינטרנט. יש להתחבר מחדש כדי לבצע פעולה זו.'

function InstagramPublishAction({ content, role, publishedMediaId, onPublished }) {
  const [confirming, setConfirming] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const requestLock = useRef(false)
  const contentId = content.content_id ?? content.contentId
  const isEligible = role === 'ADMIN'
    && content.status === 'APPROVED'
    && (Boolean(content.file_url) || content.media?.length > 0)
    && (content.media?.length > 1 || ['image', 'video'].includes(getMediaType(content.file_url, content.content_type)))

  useEffect(() => {
    if (!confirming) return undefined
    const previousOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.documentElement.classList.add('instagram-confirmation-open')
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !publishing) setConfirming(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.documentElement.classList.remove('instagram-confirmation-open')
      document.body.style.overflow = previousOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [confirming, publishing])

  if (!isEligible) return null

  async function publish() {
    if (requestLock.current || publishedMediaId) return
    if (!window.navigator.onLine) {
      showToast(OFFLINE_MESSAGE, 'error')
      return
    }
    requestLock.current = true
    setPublishing(true)
    try {
      const result = await publishContentToInstagram(contentId)
      onPublished(contentId, result.instagramMediaId)
      setConfirming(false)
      showToast('התוכן פורסם בהצלחה באינסטגרם.', 'success')
    } catch (error) {
      showToast(getInstagramPublishErrorMessage(error), 'error')
    } finally {
      requestLock.current = false
      setPublishing(false)
    }
  }

  return (
    <div className="instagram-publish-action">
      <button
        type="button"
        className={`secondary-button small-button instagram-button ${publishedMediaId ? 'published' : ''}`}
        disabled={publishing || Boolean(publishedMediaId)}
        onClick={() => setConfirming(true)}
      >
        {publishedMediaId
          ? <><CheckCircle2 size={20} />פורסם באינסטגרם</>
          : <><Send size={20} />פרסום באינסטגרם</>}
      </button>

      {publishedMediaId && (
        <details className="instagram-technical-details">
          <summary>פרטים טכניים</summary>
          <span dir="ltr">Instagram media ID: {publishedMediaId}</span>
        </details>
      )}

      {confirming && !publishedMediaId && createPortal((
        <div className="modal-backdrop instagram-confirmation-backdrop" role="presentation" onMouseDown={() => !publishing && setConfirming(false)}>
          <section className="modal-card instagram-confirmation" role="dialog" aria-modal="true" aria-labelledby={`instagram-confirm-title-${contentId}`} onMouseDown={(event) => event.stopPropagation()}>
            <header className="instagram-confirmation-header">
              <button className="modal-close" type="button" onClick={() => setConfirming(false)} disabled={publishing} aria-label="סגירת חלון האישור"><X size={20} /></button>
              <h2 id={`instagram-confirm-title-${contentId}`}>פרסום אמיתי באינסטגרם</h2>
            </header>
            <div className="instagram-confirmation-body">
              <ContentMediaCarousel media={content.media} fallbackUrl={content.file_url} fallbackType={content.content_type} alt={content.title || 'תצוגה מקדימה לפרסום'} />
              <strong>{content.media?.length > 1 ? `קרוסלה · ${content.media.length} פריטים` : getMediaType(content.file_url, content.content_type) === 'video' ? 'וידאו / Reel' : 'תמונה יחידה'}</strong>
              <p>הפעולה תפרסם פוסט אמיתי בחשבון האינסטגרם המחובר. לא ניתן לבטל את הפרסום מתוך המערכת.</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setConfirming(false)} disabled={publishing}>ביטול</button>
              <button type="button" className="primary-button" onClick={publish} disabled={publishing}>
                {publishing ? <><span className="button-spinner" />מפרסם...</> : <><Send size={20} />אישור ופרסום</>}
              </button>
            </div>
          </section>
        </div>
      ), document.body)}
    </div>
  )
}

export default InstagramPublishAction
