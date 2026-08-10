const VIDEO_MIME_BY_EXTENSION = Object.freeze({ mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime' })
const SUPPORTED_VIDEO_MIMES = new Set(['video/mp4', 'video/quicktime'])

export function getVideoExtension(file) {
  const name = file?.name || ''
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export function getVideoEligibility(file) {
  const extension = getVideoExtension(file)
  const declaredMime = (file?.type || '').toLowerCase()
  const inferredMime = VIDEO_MIME_BY_EXTENSION[extension] || ''
  const detectedMime = SUPPORTED_VIDEO_MIMES.has(declaredMime) ? declaredMime : inferredMime
  return { eligible: Boolean(file && detectedMime), declaredMime, detectedMime, extension }
}

export function normalizeSelectedMediaFile(file) {
  const detection = getVideoEligibility(file)
  if (!detection.eligible || file.type === detection.detectedMime) return file
  return new File([file], file.name, { type: detection.detectedMime, lastModified: file.lastModified })
}

export function validateTrimRange(start, end, duration) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(duration) || duration <= 0) return 'לא ניתן לקרוא את משך הסרטון.'
  if (start < 0 || end > duration || end <= start) return 'יש לבחור טווח חיתוך תקין.'
  if (end - start < 0.1) return 'הסרטון הערוך חייב להיות באורך של לפחות 0.1 שניות.'
  return ''
}

export function formatVideoDuration(value) {
  const seconds = Math.max(0, Number(value) || 0)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function captureVideoCover(video, fileName = 'video') {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context || !canvas.width || !canvas.height) return Promise.reject(new Error('VIDEO_COVER_FAILED'))
  context.drawImage(video, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) return reject(new Error('VIDEO_COVER_FAILED'))
    const base = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName
    resolve(new File([blob], `${base}-cover.jpg`, { type: 'image/jpeg', lastModified: Date.now() }))
  }, 'image/jpeg', 0.9))
}

export function appendVideoEdits(form, files, editsByFile) {
  const edits = []
  files.forEach((file, index) => {
    const saved = editsByFile.get(file)
    if (!saved) return
    const edit = saved.edit || {}
    if (Object.entries(edit).some(([key, value]) => key === 'aspectRatio' ? value !== 'original' : Boolean(value))) edits.push({ index, ...edit })
    if (saved.coverFile) {
      form.append('coverFiles', saved.coverFile)
      form.append('coverMediaIndexes', String(index))
    }
    if (saved.musicFile) {
      form.append('musicFiles', saved.musicFile)
      form.append('musicMediaIndexes', String(index))
    }
  })
  if (edits.length) form.append('videoEditsJson', JSON.stringify(edits))
}
