import { getVideoEligibility } from './videoEditor.js'

export const MIXED_MEDIA_MODE = 'MIXED'

export function mediaAcceptForMode(mode) {
  if (mode === 'IMAGE') return 'image/*'
  if (mode === 'VIDEO' || mode === 'REEL') return 'video/*'
  return mode === MIXED_MEDIA_MODE ? 'image/*,video/*' : ''
}

export function validateMediaSelection(mode, files, requireComplete = true) {
  const selected = Array.from(files || [])
  if (selected.length > 10) return 'אפשר לבחור עד 10 פריטי מדיה.'
  if (!selected.length && mode !== 'TEXT') return 'יש לבחור לפחות פריט מדיה אחד.'

  const imageCount = selected.filter((file) => file.type?.startsWith('image/')).length
  const videoCount = selected.filter((file) => getVideoEligibility(file).eligible).length
  if (imageCount + videoCount !== selected.length) return 'ניתן להעלות קובצי תמונה או וידאו בלבד.'
  if (mode === 'IMAGE' && videoCount) return 'בסוג תמונה ניתן להעלות תמונות בלבד.'
  if ((mode === 'VIDEO' || mode === 'REEL') && imageCount) return 'בסוג וידאו ניתן להעלות סרטונים בלבד.'
  if (mode === MIXED_MEDIA_MODE && requireComplete && (!imageCount || !videoCount)) {
    return 'בתמונה + סרטון יש לבחור לפחות תמונה אחת ולפחות סרטון אחד.'
  }
  return ''
}

export function appendMediaFiles(formData, files) {
  Array.from(files || []).forEach((file) => formData.append('files', file))
}

export function legacyContentType(mode, files) {
  const first = Array.from(files || [])[0]
  if (first) return first.type?.startsWith('video/') ? 'VIDEO' : 'IMAGE'
  return mode === MIXED_MEDIA_MODE ? 'IMAGE' : mode
}
