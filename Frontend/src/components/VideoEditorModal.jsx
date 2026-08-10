import { useEffect, useRef, useState } from 'react'
import { captureVideoCover, formatVideoDuration, getVideoEligibility, validateTrimRange } from '../utils/videoEditor.js'

const defaultVisuals = Object.freeze({ brightness: 0, contrast: 0, saturation: 0, rotation: 0, vignette: 0, aspectRatio: 'original' })
const tools = [
  ['trim', 'חיתוך', '✂'], ['cover', 'כריכה', '▣'], ['audio', 'שמע', '♫'],
  ['brightness', 'בהירות', '☀'], ['contrast', 'ניגודיות', '◐'], ['saturation', 'רוויה', '◉'],
  ['rotation', 'סיבוב', '↻'], ['ratio', 'יחס', '□'], ['vignette', 'וינייטה', '◍'],
]
tools.splice(3, 0, ['music', 'מוזיקה', '♫'])
const adjustmentConfig = {
  brightness: { label: 'בהירות', min: -100, max: 100 },
  contrast: { label: 'ניגודיות', min: -100, max: 100 },
  saturation: { label: 'רוויה', min: -100, max: 100 },
  vignette: { label: 'וינייטה', min: 0, max: 100 },
}

function Adjustment({ label, min, max, value, onChange }) {
  return <div className="video-editor-adjustment"><div><strong>{label}</strong><output>{value > 0 ? `+${value}` : value}</output><button type="button" onClick={() => onChange(0)}>איפוס</button></div>
    <input type="range" aria-label={label} min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </div>
}

function VideoEditorModal({ file, previewUrl = '', initialValue, onCancel, onSave, onDecodeFailure, normalizing = false, externalError = '', captureCover = captureVideoCover }) {
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const normalizationRequested = useRef(false)
  const [objectUrl] = useState(() => URL.createObjectURL(file))
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(initialValue?.edit?.start || 0)
  const [end, setEnd] = useState(0)
  const [muted, setMuted] = useState(initialValue?.edit?.muted || false)
  const [musicFile, setMusicFile] = useState(initialValue?.musicFile || null)
  const [musicUrl, setMusicUrl] = useState(() => initialValue?.musicFile ? URL.createObjectURL(initialValue.musicFile) : '')
  const [musicDuration, setMusicDuration] = useState(0)
  const [musicStart, setMusicStart] = useState(initialValue?.edit?.musicStart || 0)
  const [originalVolume, setOriginalVolume] = useState(initialValue?.edit?.originalVolume ?? (initialValue?.edit?.muted ? 0 : 100))
  const [musicVolume, setMusicVolume] = useState(initialValue?.edit?.musicVolume ?? 100)
  const [coverTime, setCoverTime] = useState(0)
  const [coverSelected, setCoverSelected] = useState(Boolean(initialValue?.coverFile))
  const [visuals, setVisuals] = useState({ ...defaultVisuals, ...initialValue?.edit })
  const [activeTool, setActiveTool] = useState('trim')
  const [showOriginal, setShowOriginal] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const detection = getVideoEligibility(file)

  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])
  useEffect(() => () => { if (musicUrl) URL.revokeObjectURL(musicUrl) }, [musicUrl])

  function syncMusic() {
    const video = videoRef.current; const audio = audioRef.current
    if (!video || !audio) return
    const target = musicStart + Math.max(0, video.currentTime - start)
    if (Number.isFinite(target) && Math.abs(audio.currentTime - target) > 0.15) audio.currentTime = target
  }

  function playMusic() { syncMusic(); audioRef.current?.play().catch(() => {}) }
  function pauseMusic() { audioRef.current?.pause() }

  function loadMetadata(event) {
    const value = event.currentTarget.duration
    if (!Number.isFinite(value) || value <= 0) {
      setError('לא ניתן לקרוא את נתוני הווידאו או את משך הסרטון.')
      console.info('[VideoEditor] metadata', { detectedMime: detection.detectedMime, extension: detection.extension, duration: value, eligible: detection.eligible })
      return
    }
    setError('')
    setDuration(value)
    setEnd(initialValue?.edit?.end ?? value)
    console.info('[VideoEditor] media stage', { stage: 'VIDEO_METADATA_LOADED', detectedMime: detection.detectedMime, extension: detection.extension, fileSize: file.size, duration: value })
  }

  function metadataError(event) {
    const mediaError = event.currentTarget.error
    console.error('[VideoEditor] media stage', { stage: mediaError?.code === 3 ? 'VIDEO_DECODE_FAILED' : 'VIDEO_METADATA_FAILED', detectedMime: detection.detectedMime, extension: detection.extension, fileSize: file.size, videoErrorCode: mediaError?.code ?? null, videoErrorMessage: mediaError?.message || '' })
    if (onDecodeFailure && !normalizationRequested.current) {
      normalizationRequested.current = true
      setError('')
      onDecodeFailure()
      return
    }
    setError('הדפדפן אינו יכול לפענח את פורמט הווידאו הזה.')
  }

  function canPlay(event) {
    console.info('[VideoEditor] media stage', { stage: 'VIDEO_CAN_PLAY', detectedMime: detection.detectedMime, extension: detection.extension, fileSize: file.size, duration: event.currentTarget.duration })
  }

  function seek(value) {
    const time = Number(value)
    setCoverTime(time)
    if (videoRef.current) videoRef.current.currentTime = time
  }

  function reset() {
    setStart(0); setEnd(duration); setMuted(false); setCoverTime(0); setCoverSelected(false)
    setVisuals({ ...defaultVisuals }); setShowOriginal(false); setError('')
    if (videoRef.current) videoRef.current.currentTime = 0
    setMusicFile(null); setMusicUrl(''); setMusicDuration(0); setMusicStart(0); setOriginalVolume(100); setMusicVolume(100)
  }

  async function save() {
    const validation = validateTrimRange(start, end, duration)
    if (validation) { setError(validation); return }
    setSaving(true); setError('')
    try {
      if (musicFile && (!musicDuration || musicStart + (end - start) > musicDuration + 0.05)) { setError('אין מספיק אודיו מנקודת ההתחלה שנבחרה.'); return }
      const coverFile = coverSelected ? await captureCover(videoRef.current, file.name) : initialValue?.coverFile || null
      const result = { edit: { start: start > 0 ? start : null, end: musicFile ? end : (end < duration - 0.05 ? end : null), muted: muted || originalVolume === 0, originalVolume: muted ? 0 : originalVolume, musicVolume, musicStart, ...visuals }, coverFile }
      if (musicFile) result.musicFile = musicFile
      onSave(result)
    } catch { setError('לא ניתן ליצור את תמונת הכריכה.') } finally { setSaving(false) }
  }

  const displayed = showOriginal ? defaultVisuals : visuals
  const previewStyle = {
    filter: `brightness(${100 + displayed.brightness}%) contrast(${100 + displayed.contrast}%) saturate(${100 + displayed.saturation}%)`,
    transform: `rotate(${displayed.rotation}deg)`,
  }
  const ratio = displayed.aspectRatio === 'original' ? undefined : displayed.aspectRatio.replace(':', ' / ')
  const adjustment = adjustmentConfig[activeTool]

  return <div className="video-editor-overlay" role="presentation">
    <section className="video-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="video-editor-title" dir="rtl">
      <header><button type="button" onClick={onCancel}>ביטול</button><h2 id="video-editor-title">עריכת וידאו</h2><button type="button" className="primary-button" disabled={!duration || saving || normalizing} onClick={save}>{saving ? 'שומר...' : 'סיום'}</button></header>
      <div className={`video-editor-preview ${displayed.vignette ? 'has-vignette' : ''}`} style={{ aspectRatio: ratio, '--video-vignette': displayed.vignette / 100 }}>
        <video ref={videoRef} src={previewUrl || objectUrl} crossOrigin={previewUrl ? 'anonymous' : undefined} style={previewStyle} controls playsInline preload="metadata" muted={originalVolume === 0} onPlay={playMusic} onPause={pauseMusic} onSeeking={syncMusic} onTimeUpdate={syncMusic} onEnded={pauseMusic} onLoadedMetadata={loadMetadata} onCanPlay={canPlay} onError={metadataError} />
        {musicUrl && <audio ref={audioRef} src={musicUrl} preload="metadata" onLoadedMetadata={(event) => { setMusicDuration(event.currentTarget.duration); event.currentTarget.volume = musicVolume / 100 }} />}
        <button type="button" className="video-editor-original" aria-pressed={showOriginal} onClick={() => setShowOriginal((current) => !current)}>צפייה במקור</button>
      </div>
      {normalizing && <div className="video-normalization-state" role="status"><span className="spinner" aria-hidden="true" />מכינים את הסרטון לעריכה...</div>}
      {(externalError || error) && <p className="entity-state entity-state-error" role="alert">{externalError || error}</p>}
      <div className="video-editor-controls">
        <div className="video-editor-secondary-panel">
          {activeTool === 'trim' && <fieldset><legend>חיתוך</legend>
            <label>התחלה <input aria-label="זמן התחלה" type="range" min="0" max={duration || 0} step="0.1" value={start} onChange={(event) => setStart(Number(event.target.value))} /><output>{formatVideoDuration(start)}</output></label>
            <label>סיום <input aria-label="זמן סיום" type="range" min="0" max={duration || 0} step="0.1" value={end} onChange={(event) => setEnd(Number(event.target.value))} /><output>{formatVideoDuration(end)}</output></label>
            <strong>משך סופי: {formatVideoDuration(Math.max(0, end - start))}</strong>
          </fieldset>}
          {activeTool === 'cover' && <fieldset><legend>כריכה</legend><label>פריים לכריכה <input aria-label="זמן הכריכה" type="range" min="0" max={duration || 0} step="0.1" value={coverTime} onChange={(event) => seek(event.target.value)} /></label><button type="button" className={coverSelected ? 'primary-button' : 'secondary-button'} onClick={() => setCoverSelected((current) => !current)}>{coverSelected ? 'הכריכה נבחרה' : 'בחירת פריים ככריכה'}</button></fieldset>}
          {activeTool === 'audio' && <label className="video-editor-mute"><input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} /> השתקת השמע המקורי</label>}
          {activeTool === 'music' && <div className="video-editor-music-panel">
            <strong>הוספת מוזיקה</strong>
            <label className="video-editor-music-picker"><span>{musicFile ? 'החלפה' : 'בחירת קובץ'}</span><input aria-label="בחירת קובץ מוזיקה" type="file" accept="audio/*" onChange={(event) => { const selected = event.target.files?.[0]; if (!selected) return; if (!selected.type.startsWith('audio/') || !selected.size) { setError('יש לבחור קובץ אודיו תקין.'); return } setError(''); setMusicFile(selected); setMusicUrl(URL.createObjectURL(selected)); setMusicStart(0) }} /></label>
            {musicFile && <div className="video-editor-music-file"><span title={musicFile.name}>{musicFile.name}</span><small>{musicDuration ? formatVideoDuration(musicDuration) : 'טוען…'}</small><button type="button" onClick={() => audioRef.current?.paused ? audioRef.current.play() : audioRef.current?.pause()}>ניגון/השהיה</button><button type="button" onClick={() => { pauseMusic(); setMusicFile(null); setMusicUrl(''); setMusicDuration(0); setMusicStart(0) }}>הסרה</button></div>}
            <label>קול מקורי <input aria-label="קול מקורי" type="range" min="0" max="100" value={originalVolume} onChange={(event) => { const value=Number(event.target.value); setOriginalVolume(value); setMuted(value === 0); if(videoRef.current) videoRef.current.volume=value/100 }} /><output>{originalVolume}%</output></label>
            <label>מוזיקה <input aria-label="מוזיקה" type="range" min="0" max="100" value={musicVolume} disabled={!musicFile} onChange={(event) => { const value=Number(event.target.value); setMusicVolume(value); if(audioRef.current) audioRef.current.volume=value/100 }} /><output>{musicVolume}%</output></label>
            {musicFile && <label>התחלה <input aria-label="התחלת מוזיקה" type="range" min="0" max={Math.max(0, musicDuration - (end - start))} step="0.1" value={Math.min(musicStart, Math.max(0, musicDuration - (end - start)))} onChange={(event) => setMusicStart(Number(event.target.value))} /><output>{formatVideoDuration(musicStart)}</output></label>}
            <small className="video-editor-copyright">יש להשתמש במוזיקה ובקבצי אודיו שיש לך הרשאה להשתמש בהם.</small>
          </div>}
          {adjustment && <Adjustment {...adjustment} value={visuals[activeTool]} onChange={(value) => setVisuals((current) => ({ ...current, [activeTool]: value }))} />}
          {activeTool === 'rotation' && <div className="video-editor-choice-panel"><span>סיבוב: {((visuals.rotation % 360) + 360) % 360}°</span><button type="button" onClick={() => setVisuals((current) => ({ ...current, rotation: current.rotation - 90 }))}>שמאלה</button><button type="button" onClick={() => setVisuals((current) => ({ ...current, rotation: current.rotation + 90 }))}>ימינה</button></div>}
          {activeTool === 'ratio' && <div className="video-editor-choice-panel" aria-label="יחס וידאו">{['original', '1:1', '4:5', '9:16'].map((value) => <button type="button" key={value} aria-pressed={visuals.aspectRatio === value} className={visuals.aspectRatio === value ? 'active' : ''} onClick={() => setVisuals((current) => ({ ...current, aspectRatio: value }))}>{value === 'original' ? 'מקורי' : value}</button>)}</div>}
        </div>
        <div className="video-editor-tool-strip" role="toolbar" aria-label="כלי עריכת וידאו">{tools.map(([id, label, icon]) => <button type="button" key={id} aria-pressed={activeTool === id} className={activeTool === id ? 'active' : ''} onClick={() => setActiveTool(id)}><span aria-hidden="true">{icon}</span><small>{label}</small></button>)}</div>
      </div>
      <footer><button type="button" className="ghost-button" onClick={reset}>איפוס כל העריכות</button></footer>
    </section>
  </div>
}

export default VideoEditorModal
