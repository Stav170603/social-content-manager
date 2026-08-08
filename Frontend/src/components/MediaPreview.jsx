import { useState } from 'react'
import { FileText, ImageOff, Paperclip } from 'lucide-react'
import {
  FALLBACK_IMAGE_URL,
  getFileName,
  getImageUrl,
  getMediaType,
} from '../utils/imageUrl.js'

function MediaPreview({ path, type, alt = 'תצוגת מדיה', className = '', poster }) {
  const [loading, setLoading] = useState(Boolean(path))
  const [failed, setFailed] = useState(false)
  const mediaType = getMediaType(path, type)
  const url = getImageUrl(path)

  if (!path) {
    return <div className={`media-placeholder ${className}`} role="img" aria-label="אין מדיה זמינה">
      <ImageOff size={30} aria-hidden="true" />
      <span>אין מדיה זמינה</span>
    </div>
  }

  if (mediaType === 'file') {
    return (
      <a className={`media-file ${className}`} href={url} target="_blank" rel="noreferrer noopener">
        <span className="media-file-icon"><FileText size={22} /></span>
        <span><strong>{getFileName(path)}</strong><small>קובץ מצורף · פתיחה בחלון חדש</small></span>
        <Paperclip size={18} aria-hidden="true" />
      </a>
    )
  }

  return (
    <div className={`media-preview ${className} ${loading ? 'is-loading' : ''}`}>
      {loading && <span className="media-skeleton" aria-label="טוען מדיה" role="status" />}
      {mediaType === 'video' ? (
        failed
          ? <div className="media-error"><FileText size={28} /><span>לא ניתן לטעון את הווידאו</span><a href={url}>פתיחת הקובץ</a></div>
          : <video src={url} poster={poster ? getImageUrl(poster) : undefined} controls playsInline preload="metadata" onLoadedData={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true) }} />
      ) : (
        <a href={url} target="_blank" rel="noreferrer noopener">
          <img
            src={failed ? FALLBACK_IMAGE_URL : url}
            alt={alt}
            loading="lazy"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setFailed(true) }}
          />
        </a>
      )}
    </div>
  )
}

export default MediaPreview
