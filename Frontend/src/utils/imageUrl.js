import { API_BASE_URL } from '../services/api.js'

export const FALLBACK_IMAGE_URL =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">' +
      '<rect width="640" height="360" fill="#eeeae3"/>' +
      '<path d="M170 270l92-98 70 70 53-55 85 83H170z" fill="#b8ad9e"/>' +
      '<circle cx="410" cy="115" r="34" fill="#c9c0b4"/>' +
      '<text x="320" y="320" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#766b5d">Image unavailable</text>' +
    '</svg>',
  )

export function getImageUrl(path) {
  if (!path) return FALLBACK_IMAGE_URL

  const value = String(path).trim()
  if (/^(https?:|blob:|data:)/i.test(value)) return value

  return `${API_BASE_URL}/${value.replace(/^\/+/, '')}`
}

export function getMediaType(path, declaredType = '') {
  const cleanPath = String(path || '').split(/[?#]/)[0].toLowerCase()
  const type = String(declaredType || '').toUpperCase()
  if (type === 'VIDEO' || type === 'REEL' || /\.(mp4|webm|mov|m4v)$/.test(cleanPath)) return 'video'
  if (type === 'IMAGE' || /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/.test(cleanPath)) return 'image'
  return path ? 'file' : 'none'
}

export function getVideoPosterUrl(path, thumbnailUrl) {
  if (thumbnailUrl) return getImageUrl(thumbnailUrl)
  if (!path) return undefined
  try {
    const url = new URL(getImageUrl(path))
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'res.cloudinary.com') return undefined
    const marker = '/video/upload/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex < 0 || !/\.(mp4|mov|m4v|webm)$/i.test(url.pathname)) return undefined
    const prefix = url.pathname.slice(0, markerIndex + marker.length)
    const asset = url.pathname.slice(markerIndex + marker.length).replace(/\.(mp4|mov|m4v|webm)$/i, '.jpg')
    if (asset.startsWith('s--')) return undefined
    url.pathname = `${prefix}so_0.5,q_auto/${asset}`
    return url.toString()
  } catch {
    return undefined
  }
}

export function getFileName(path) {
  const cleanPath = String(path || '').split(/[?#]/)[0]
  try {
    return decodeURIComponent(cleanPath.split('/').pop()) || 'קובץ מצורף'
  } catch {
    return cleanPath.split('/').pop() || 'קובץ מצורף'
  }
}

export function useFallbackImage(event) {
  const image = event.currentTarget
  image.onerror = null
  image.src = FALLBACK_IMAGE_URL
}
