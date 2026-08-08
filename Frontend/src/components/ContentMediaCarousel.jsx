import { useState } from 'react'
import MediaPreview from './MediaPreview.jsx'

function ContentMediaCarousel({ media = [], fallbackUrl, fallbackType, alt = 'תוכן' }) {
  const items = media.length ? media : (fallbackUrl ? [{ mediaUrl: fallbackUrl, mediaType: fallbackType }] : [])
  const [index, setIndex] = useState(0)
  if (!items.length) return null
  const safeIndex = Math.min(index, items.length - 1)
  const item = items[safeIndex]
  return <section className="content-media-carousel" aria-label={`קרוסלת מדיה, ${items.length} פריטים`}>
    <MediaPreview path={item.mediaUrl || item.media_url} type={item.mediaType || item.media_type} poster={item.thumbnailUrl || item.thumbnail_url} alt={`${alt}, פריט ${safeIndex + 1}`} />
    {items.length > 1 && <div className="content-media-carousel-controls">
      <button type="button" aria-label="המדיה הקודמת" onClick={() => setIndex((safeIndex - 1 + items.length) % items.length)}>‹</button>
      <span>{safeIndex + 1} / {items.length}</span>
      <button type="button" aria-label="המדיה הבאה" onClick={() => setIndex((safeIndex + 1) % items.length)}>›</button>
    </div>}
  </section>
}
export default ContentMediaCarousel
