import { useCallback, useEffect, useRef, useState } from 'react'
import { Film, Layers, RefreshCw } from 'lucide-react'
import PageShell from '../components/PageShell.jsx'
import CreationModal from '../components/CreationModal.jsx'
import ContentMediaCarousel from '../components/ContentMediaCarousel.jsx'
import api from '../services/api.js'
import { getImageUrl, getMediaType, getVideoPosterUrl } from '../utils/imageUrl.js'

const contentId = (content) => content.content_id ?? content.contentId
const mediaItems = (content) => {
  const items = content.media?.length
    ? [...content.media]
    : content.file_url ? [{ mediaUrl: content.file_url, mediaType: content.content_type, displayOrder: 0 }] : []
  return items.sort((a, b) => (a.displayOrder ?? a.display_order ?? 0) - (b.displayOrder ?? b.display_order ?? 0))
}
const includedStatuses = new Set(['WAITING_APPROVAL', 'APPROVED'])
const hasUsableMedia = (content) => mediaItems(content).some((item) => {
  const url = item?.mediaUrl || item?.media_url
  const type = getMediaType(url, item?.mediaType || item?.media_type)
  return Boolean(url) && (type === 'image' || type === 'video')
})
const plannedFirst = (first, second) => {
  const mediaPriority = Number(hasUsableMedia(second)) - Number(hasUsableMedia(first))
  if (mediaPriority) return mediaPriority
  const firstTime = Date.parse(first.plannedPublishDate || first.planned_publish_date || '')
  const secondTime = Date.parse(second.plannedPublishDate || second.planned_publish_date || '')
  const firstDated = Number.isFinite(firstTime)
  const secondDated = Number.isFinite(secondTime)
  if (firstDated !== secondDated) return firstDated ? -1 : 1
  if (firstDated && firstTime !== secondTime) return firstTime - secondTime
  return Number(contentId(first) || 0) - Number(contentId(second) || 0)
}
const sortFeedItems = (items) => {
  const manual = items.filter((item) => Number.isInteger(item.feedOrder)).sort((a, b) => a.feedOrder - b.feedOrder || plannedFirst(a, b))
  const automatic = items.filter((item) => !Number.isInteger(item.feedOrder)).sort(plannedFirst)
  return manual.length ? [...manual, ...automatic] : automatic
}

export function PendingFeed({ profile, reloadKey = 0 }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [comments, setComments] = useState([])
  const [reason, setReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const draggedId = useRef(null)
  const touchTimer = useRef(null)
  const touchDraggedId = useRef(null)
  const suppressClick = useRef(false)
  const selected = items.find((content) => contentId(content) === selectedId) || null

  const load = useCallback(async () => {
    setSelectedId(null)
    setRejectOpen(false)
    setReason('')
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/contents', { suppressGlobalErrorToast: true })
      setItems(sortFeedItems(response.data.filter((content) => includedStatuses.has(content.status) && contentId(content) != null)))
    } catch {
      setError('לא הצלחנו לטעון את התכנים שממתינים לאישור.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { Promise.resolve().then(load) }, [load, reloadKey])

  async function openDetails(clickedId) {
    const clicked = items.find((content) => contentId(content) === clickedId)
    if (!clicked || contentId(clicked) !== clickedId || mediaItems(clicked).length === 0) return
    setSelectedId(clickedId)
    setComments([])
    try {
      const response = await api.get('/comments/by-content', { params: { contentId: clickedId }, suppressGlobalErrorToast: true })
      setComments(response.data)
    } catch { setComments([]) }
  }

  function removeSelected() {
    const id = selectedId
    setItems((current) => current.filter((content) => contentId(content) !== id))
    setSelectedId(null)
    setRejectOpen(false)
    setReason('')
  }

  async function approve() {
    if (!selected || selected.status !== 'WAITING_APPROVAL') return
    setSaving(true)
    try {
      await api.put(`/contents/${contentId(selected)}/approve`)
      setItems((current) => current.map((content) => contentId(content) === contentId(selected) ? { ...content, status: 'APPROVED' } : content))
    } finally { setSaving(false) }
  }

  async function reject(event) {
    event.preventDefault()
    if (!selected || !reason.trim()) return
    setSaving(true)
    try {
      await api.put(`/contents/${contentId(selected)}/reject`, { reason: reason.trim() })
      setRejectOpen(false)
      setReason('')
      removeSelected()
    } finally { setSaving(false) }
  }

  async function persistOrder(next, previous) {
    setItems(next.map((content, index) => ({ ...content, feedOrder: index })))
    try { await api.put('/contents/feed-order', { contentIds: next.map(contentId) }) }
    catch { setItems(previous) }
  }

  function reorder(sourceId, targetId) {
    if (sourceId == null || targetId == null || sourceId === targetId) return
    const previous = items
    const from = previous.findIndex((item) => contentId(item) === Number(sourceId))
    const to = previous.findIndex((item) => contentId(item) === Number(targetId))
    if (from < 0 || to < 0) return
    const next = [...previous]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    persistOrder(next, previous)
  }

  function dragProps(content) {
    const id = contentId(content)
    return {
      draggable: true,
      'data-feed-id': id,
      onDragStart: (event) => { draggedId.current = id; suppressClick.current = true; event.dataTransfer?.setData('text/plain', String(id)) },
      onDragOver: (event) => event.preventDefault(),
      onDrop: (event) => { event.preventDefault(); reorder(Number(event.dataTransfer?.getData('text/plain') || draggedId.current), id) },
      onDragEnd: () => { draggedId.current = null; setTimeout(() => { suppressClick.current = false }, 0) },
      onPointerDown: (event) => {
        if (event.pointerType !== 'touch') return
        clearTimeout(touchTimer.current)
        touchTimer.current = setTimeout(() => { touchDraggedId.current = id; suppressClick.current = true }, 450)
      },
      onPointerUp: (event) => {
        clearTimeout(touchTimer.current)
        if (touchDraggedId.current != null) {
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-feed-id]')
          reorder(touchDraggedId.current, Number(target?.dataset.feedId))
          touchDraggedId.current = null
          setTimeout(() => { suppressClick.current = false }, 0)
        }
      },
      onPointerCancel: () => { clearTimeout(touchTimer.current); touchDraggedId.current = null },
      onKeyDown: (event) => {
        if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
        event.preventDefault()
        const index = items.findIndex((item) => contentId(item) === id)
        const target = event.key === 'ArrowLeft' ? index - 1 : index + 1
        if (target >= 0 && target < items.length) reorder(id, contentId(items[target]))
      },
    }
  }

  async function resetOrder() {
    await api.delete('/contents/feed-order')
    setItems((current) => sortFeedItems(current.map((content) => ({ ...content, feedOrder: null }))))
  }

  if (loading) return <div className="feed-grid feed-skeleton" aria-label="טוען פיד" role="status">{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
  if (error) return <div className="feed-state" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={load}><RefreshCw size={17} /> ניסיון חוזר</button></div>
  if (!items.length) return <div className="feed-state"><h2>אין כרגע תכנים להצגה בפיד</h2><p>תכנים מאושרים ותכנים שממתינים לאישור יופיעו כאן.</p></div>

  return <>
    {items.some((content) => Number.isInteger(content.feedOrder)) && <div className="feed-order-actions"><button type="button" className="ghost-button" onClick={resetOrder}>איפוס סדר</button></div>}
    <section className="feed-grid" aria-label="תכנים שממתינים לאישור">
      {items.map((content) => {
        const media = mediaItems(content)
        const first = media[0]
        const mediaUrl = first?.mediaUrl || first?.media_url
        const type = getMediaType(mediaUrl, first?.mediaType || first?.media_type)
        const videoPoster = type === 'video' ? getVideoPosterUrl(mediaUrl, first?.thumbnailUrl || first?.thumbnail_url) : undefined
        if (!first) return <div {...dragProps(content)} className="feed-tile feed-tile-empty" dir="rtl" key={contentId(content)} role="img" aria-label={`${content.title}: ללא מדיה`}><span className="feed-no-media">ללא מדיה</span></div>
        return <button {...dragProps(content)} type="button" className="feed-tile" dir="rtl" key={contentId(content)} onClick={() => { if (!suppressClick.current) openDetails(contentId(content)) }} aria-label={`פתיחת ${content.title}`}>
          {type === 'video'
            ? videoPoster
              ? <img src={videoPoster} alt={content.title} loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />
              : <video src={getImageUrl(mediaUrl)} muted playsInline preload="metadata" />
            : <img src={getImageUrl(first.mediaUrl || first.media_url)} alt={content.title} loading="lazy" />}
          <span className="feed-overlay-icons">
            {media.length > 1 && <Layers aria-label="מספר פריטי מדיה" />}
            {type === 'video' && <Film aria-label="וידאו" />}
          </span>
        </button>
      })}
    </section>

    <CreationModal key={selectedId ?? 'closed'} open={Boolean(selected)} titleId="feed-detail-title" closeLabel="סגירת פרטי התוכן" onClose={() => setSelectedId(null)}>
      {selected && <article className="feed-detail">
        <div className="feed-detail-media"><ContentMediaCarousel media={mediaItems(selected)} fallbackUrl={selected.file_url} fallbackType={selected.content_type} alt={selected.title} /></div>
        <div className="feed-detail-copy">
          <p className="eyebrow">{selected.status === 'APPROVED' ? 'מאושר' : 'ממתין לאישור'}</p>
          <h2 id="feed-detail-title">{selected.title}</h2>
          <p className="feed-caption">{selected.description || 'אין תיאור'}</p>
          {selected.plannedPublishDate && <p><strong>מועד פרסום מתוכנן:</strong> {new Date(selected.plannedPublishDate).toLocaleString('he-IL')}</p>}
          {comments.length > 0 && <section className="feed-comments" aria-label="תגובות קיימות"><h3>תגובות</h3>{comments.map((comment) => <p key={comment.commentId ?? comment.comment_id}>{comment.commentText}</p>)}</section>}
          {profile?.role === 'CLIENT' && selected.status === 'WAITING_APPROVAL' && <div className="feed-approval-actions">
            <button type="button" className="primary-button" onClick={approve} disabled={saving}>אישור</button>
            <button type="button" className="danger-button" onClick={() => setRejectOpen(true)} disabled={saving}>דחייה</button>
          </div>}
        </div>
      </article>}
    </CreationModal>

    <CreationModal open={rejectOpen} titleId="feed-reject-title" closeLabel="סגירת דחייה" onClose={() => setRejectOpen(false)}>
      <form className="feed-reject-form" onSubmit={reject}>
        <h2 id="feed-reject-title">דחיית תוכן</h2>
        <label>סיבת הדחייה<textarea value={reason} onChange={(event) => setReason(event.target.value)} required /></label>
        <button className="danger-button" disabled={saving || !reason.trim()}>דחיית התוכן</button>
      </form>
    </CreationModal>
  </>
}

function FeedPage(props) {
  const [profile, setProfile] = useState(null)
  useEffect(() => { api.get('/users/me').then((response) => setProfile(response.data)).catch(() => setProfile(null)) }, [])
  return <PageShell {...props}><div className="feed-page"><header className="feed-header"><p className="eyebrow">תכני לקוח</p><h2>פיד</h2></header><PendingFeed profile={profile} /></div></PageShell>
}

export default FeedPage
