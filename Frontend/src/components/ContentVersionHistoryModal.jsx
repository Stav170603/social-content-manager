import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { X } from 'lucide-react'
import { getContentVersions, restoreContentVersion } from '../api/contentVersions.js'
import StatusBadge from './StatusBadge.jsx'
import MediaPreview from './MediaPreview.jsx'

const RESTORABLE_STATUSES = new Set(['DRAFT', 'REJECTED'])

const changeTypeLabels = {
  CREATED: 'יצירה',
  EDITED: 'עריכת תוכן',
  SCHEDULED: 'שינוי מועד פרסום',
  STATUS_CHANGED: 'שינוי סטטוס',
}

const contentTypeLabels = { IMAGE: 'תמונה', VIDEO: 'וידאו', TEXT: 'טקסט' }

function formatDateTime(value) {
  if (!value) return 'לא צוין'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('he-IL')
}

const comparisonFields = [
  { key: 'title', label: 'כותרת' },
  { key: 'description', label: 'תיאור' },
  { key: 'contentType', label: 'סוג תוכן' },
  { key: 'fileUrl', label: 'מדיה' },
  { key: 'status', label: 'סטטוס' },
  { key: 'plannedPublishDate', label: 'מועד פרסום' },
]

function versionKey(version) {
  return String(version.contentVersionId ?? `version-${version.versionNumber}`)
}

function valuesAreEqual(first, second) {
  return (first == null ? null : first) === (second == null ? null : second)
}

function displayValue(field, value) {
  if (value == null) return 'לא צוין'
  if (value === '') return 'ערך ריק'
  if (field === 'plannedPublishDate') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'תאריך לא תקין' : date.toLocaleString('he-IL')
  }
  if (field === 'contentType') return contentTypeLabels[value] || value
  return value
}

function ComparisonValue({ field, version }) {
  const value = version[field]
  const displayed = displayValue(field, value)

  if (field === 'status' && value) return <StatusBadge status={value} />
  if (field !== 'fileUrl') return <span>{displayed}</span>

  return (
    <div className="version-comparison-media-wrap">
      <MediaPreview path={value} type={version.contentType} alt={`מדיה מגרסה ${version.versionNumber}`} />
      <span className="version-comparison-url" dir="ltr">{displayed}</span>
    </div>
  )
}

function getHistoryErrorMessage(error) {
  const status = error?.response?.status
  if (status === 401) return 'ההתחברות פגה. יש להתחבר מחדש כדי לצפות בהיסטוריה.'
  if (status === 403) return 'אין לך הרשאה לצפות בהיסטוריה של תוכן זה.'
  if (status === 404) return 'התוכן המבוקש לא נמצא.'
  return 'לא הצלחנו לטעון את היסטוריית הגרסאות. אפשר לנסות שוב.'
}

function getRestoreErrorMessage(error) {
  const status = error?.response?.status
  const backendMessage = error?.response?.data?.message
  if (status === 401) return 'ההתחברות פגה. יש להתחבר מחדש לפני השחזור.'
  if (status === 403) return 'רק מנהל מערכת רשאי לשחזר גרסה.'
  if (status === 404) return 'התוכן או הגרסה המבוקשת אינם קיימים.'
  if (status === 400 && backendMessage === 'Historical media file is unavailable') {
    return 'לא ניתן לשחזר: קובץ המדיה של גרסה זו אינו זמין.'
  }
  if (status === 400) return 'לא ניתן לשחזר גרסה במצב הנוכחי של התוכן.'
  return 'השחזור נכשל. לא בוצעו שינויים ואפשר לנסות שוב.'
}

function ContentVersionHistoryModal({ content, role, onClose, onRestored }) {
  const contentId = content.content_id ?? content.contentId
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [restoringVersion, setRestoringVersion] = useState(null)
  const [restoreError, setRestoreError] = useState('')
  const [restoreSuccess, setRestoreSuccess] = useState('')
  const [selectedVersionKeys, setSelectedVersionKeys] = useState([])
  const [selectionMessage, setSelectionMessage] = useState('')
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [showOnlyChanges, setShowOnlyChanges] = useState(false)
  const comparisonPanelRef = useRef(null)
  const isAdmin = role === 'ADMIN'
  const canRestore = isAdmin && RESTORABLE_STATUSES.has(content.status)

  const loadHistory = useCallback(async (signal) => {
    setSelectedVersionKeys([])
    setSelectionMessage('')
    setComparisonOpen(false)
    setShowOnlyChanges(false)
    setError('')
    setLoading(true)
    try {
      const history = await getContentVersions(contentId, signal)
      setVersions(Array.isArray(history) ? history : [])
    } catch (requestError) {
      if (!axios.isCancel(requestError)) setError(getHistoryErrorMessage(requestError))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [contentId])

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => {
      setVersions([])
      setRestoreError('')
      setRestoreSuccess('')
      loadHistory(controller.signal)
    })
    return () => controller.abort()
  }, [loadHistory])

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && restoringVersion === null) {
        setSelectedVersionKeys([])
        setSelectionMessage('')
        setComparisonOpen(false)
        setShowOnlyChanges(false)
        onClose()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, restoringVersion])

  useEffect(() => {
    if (comparisonOpen) comparisonPanelRef.current?.focus()
  }, [comparisonOpen])

  function resetComparison() {
    setSelectedVersionKeys([])
    setSelectionMessage('')
    setComparisonOpen(false)
    setShowOnlyChanges(false)
  }

  function handleVersionSelection(version, checked) {
    const key = versionKey(version)
    setSelectionMessage('')
    setComparisonOpen(false)

    if (!checked) {
      setSelectedVersionKeys((selected) => selected.filter((selectedKey) => selectedKey !== key))
      return
    }

    if (selectedVersionKeys.length >= 2) {
      setSelectionMessage('יש לנקות תחילה בחירה של גרסה אחת.')
      return
    }
    setSelectedVersionKeys((selected) => [...selected, key])
  }

  async function handleRestore(versionNumber) {
    const confirmed = window.confirm(`לשחזר את גרסה ${versionNumber}?\nהסטטוס ומועד הפרסום הנוכחיים יישמרו.`)
    if (!confirmed) return

    setRestoringVersion(versionNumber)
    setRestoreError('')
    setRestoreSuccess('')
    try {
      const result = await restoreContentVersion(contentId, versionNumber)
      if (onRestored) await onRestored(result)
      await loadHistory()
      setRestoreSuccess(result.changed
        ? `גרסה ${versionNumber} שוחזרה ונשמרה כגרסה ${result.newVersionNumber}.`
        : `התוכן כבר תואם לגרסה ${versionNumber}; לא נוצרה גרסה חדשה.`)
    } catch (requestError) {
      setRestoreError(getRestoreErrorMessage(requestError))
    } finally {
      setRestoringVersion(null)
    }
  }

  const closeIfIdle = () => {
    if (restoringVersion === null) {
      resetComparison()
      onClose()
    }
  }

  const selectedVersions = selectedVersionKeys
    .map((key) => versions.find((version) => versionKey(version) === key))
    .filter(Boolean)
    .sort((first, second) => first.versionNumber - second.versionNumber)
  const comparisonRows = selectedVersions.length === 2
    ? comparisonFields.map((field) => ({
        ...field,
        changed: !valuesAreEqual(selectedVersions[0][field.key], selectedVersions[1][field.key]),
      })).filter((field) => !showOnlyChanges || field.changed)
    : []

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={closeIfIdle}>
      <section className="modal-card version-history-modal" role="dialog" aria-modal="true" aria-labelledby="version-history-title" dir="rtl" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={closeIfIdle} disabled={restoringVersion !== null} aria-label="סגירת היסטוריית גרסאות"><X size={20} /></button>
        <header className="version-history-header">
          <p>תוכן #{contentId}</p>
          <h2 id="version-history-title">היסטוריית גרסאות</h2>
          <span>{content.title}</span>
        </header>

        <div className="version-history-body" aria-live="polite">
          {isAdmin && !canRestore && (
            <p className="version-restore-note">שחזור זמין רק כאשר התוכן במצב טיוטה או נדחה, כדי לא לעקוף תהליכי אישור ופרסום.</p>
          )}
          {restoreError && <p className="version-restore-feedback version-restore-error" role="alert">{restoreError}</p>}
          {restoreSuccess && <p className="version-restore-feedback version-restore-success">{restoreSuccess}</p>}
          {loading && <div className="version-history-state"><span className="history-loader" />טוען היסטוריית גרסאות...</div>}
          {!loading && error && <div className="version-history-state version-history-error" role="alert">{error}</div>}
          {!loading && !error && versions.length === 0 && <div className="version-history-state">אין גרסאות קודמות לתוכן זה</div>}
          {!loading && !error && versions.length > 0 && (
            <>
              <div className="version-comparison-controls">
                <div>
                  {selectedVersionKeys.length === 1 && <span>נבחרה גרסה אחת מתוך 2</span>}
                  {selectedVersionKeys.length === 2 && <span>נבחרו 2 גרסאות מתוך 2</span>}
                  {selectedVersionKeys.length === 0 && <span>יש לבחור שתי גרסאות להשוואה</span>}
                </div>
                <div className="version-comparison-buttons">
                  <button type="button" className="ghost-button small-button" onClick={resetComparison} disabled={selectedVersionKeys.length === 0}>נקה בחירה</button>
                  <button type="button" className="primary-button small-button" onClick={() => setComparisonOpen(true)} disabled={selectedVersionKeys.length !== 2}>השווה גרסאות</button>
                </div>
              </div>
              {selectionMessage && <p className="version-selection-message" role="status">{selectionMessage}</p>}

              {comparisonOpen && selectedVersions.length === 2 && (
                <section className="version-comparison-panel" aria-labelledby="version-comparison-title" ref={comparisonPanelRef} tabIndex="-1">
                  <div className="version-comparison-heading">
                    <div>
                      <h3 id="version-comparison-title">השוואת גרסאות</h3>
                      <p>גרסה {selectedVersions[0].versionNumber} מול גרסה {selectedVersions[1].versionNumber}</p>
                    </div>
                    <label className="version-comparison-toggle">
                      <input type="checkbox" checked={showOnlyChanges} onChange={(event) => setShowOnlyChanges(event.target.checked)} />
                      <span>הצג רק שינויים</span>
                    </label>
                  </div>
                  <p className="version-comparison-warning">הסטטוס ומועד הפרסום מוצגים לצורכי השוואה בלבד ואינם משוחזרים בפעולת שחזור גרסה.</p>
                  <div className="version-comparison-column-headings" aria-hidden="true">
                    <span />
                    <strong>גרסה מוקדמת · גרסה {selectedVersions[0].versionNumber}</strong>
                    <strong>גרסה מאוחרת · גרסה {selectedVersions[1].versionNumber}</strong>
                  </div>
                  <div className="version-comparison-rows">
                    {comparisonRows.map((field) => (
                      <div className={`version-comparison-row ${field.changed ? 'is-changed' : 'is-unchanged'}`} key={field.key}>
                        <div className="version-comparison-field-name">
                          <strong>{field.label}</strong>
                          <span>{field.changed ? 'שונה' : 'ללא שינוי'}</span>
                        </div>
                        <div className="version-comparison-value">
                          <span className="version-comparison-mobile-label">גרסה מוקדמת · גרסה {selectedVersions[0].versionNumber}</span>
                          <ComparisonValue field={field.key} version={selectedVersions[0]} />
                        </div>
                        <div className="version-comparison-value">
                          <span className="version-comparison-mobile-label">גרסה מאוחרת · גרסה {selectedVersions[1].versionNumber}</span>
                          <ComparisonValue field={field.key} version={selectedVersions[1]} />
                        </div>
                      </div>
                    ))}
                    {comparisonRows.length === 0 && <p className="version-comparison-empty">לא נמצאו שינויים בין הגרסאות שנבחרו.</p>}
                  </div>
                </section>
              )}

              <ol className="version-history-list">
              {versions.map((version) => {
                const key = versionKey(version)
                return (
                  <li className="version-history-item" key={version.contentVersionId ?? version.versionNumber}>
                    <div className="version-history-summary">
                      <div><strong>גרסה {version.versionNumber}</strong><span>{changeTypeLabels[version.changeType] || version.changeType}</span></div>
                      <div className="version-history-card-controls">
                        <label className="version-selection-control">
                          <input type="checkbox" checked={selectedVersionKeys.includes(key)} onChange={(event) => handleVersionSelection(version, event.target.checked)} />
                          <span>בחר גרסה {version.versionNumber} להשוואה</span>
                        </label>
                        <StatusBadge status={version.status} />
                      </div>
                    </div>
                    <div className="version-history-meta">
                      <span>עודכן: {formatDateTime(version.changedAt)}</span>
                      <span>משתמש #{version.changedByUserId ?? 'לא ידוע'}</span>
                    </div>
                    <dl className="version-history-fields">
                      <div><dt>כותרת</dt><dd>{version.title || 'ללא כותרת'}</dd></div>
                      <div><dt>תיאור</dt><dd>{version.description || 'אין תיאור'}</dd></div>
                      <div><dt>סוג תוכן</dt><dd>{contentTypeLabels[version.contentType] || version.contentType || 'לא צוין'}</dd></div>
                      <div><dt>מועד פרסום</dt><dd>{formatDateTime(version.plannedPublishDate)}</dd></div>
                    </dl>
                    {version.fileUrl && <MediaPreview path={version.fileUrl} type={version.contentType} alt={`מדיה מגרסה ${version.versionNumber}`} />}
                    {canRestore && (
                      <div className="version-restore-actions">
                        <button type="button" className="ghost-button small-button version-restore-button" disabled={restoringVersion !== null} onClick={() => handleRestore(version.versionNumber)}>
                          {restoringVersion === version.versionNumber ? <><span className="button-spinner dark-spinner" />משחזר...</> : 'שחזור גרסה זו'}
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
              </ol>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default ContentVersionHistoryModal
