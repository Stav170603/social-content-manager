import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, HelpCircle, ImageOff, RefreshCw } from 'lucide-react'
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import PageShell from '../components/PageShell.jsx'
import {
  formatAnalyticsChartDate as formatChartDate,
  mergeAnalyticsTrends,
  showAnalyticsValue as show,
  unavailableAnalyticsValue as unavailable,
} from '../utils/analyticsFormat.js'
import {
  getAnalyticsClients, getAnalyticsProfile, getInstagramAccountInsights, getInstagramMediaInsights,
} from '../api/analytics.js'

const ranges = {
  7: '7 הימים האחרונים',
  30: '30 הימים האחרונים',
  custom: 'טווח מותאם אישית',
}
const mediaTypes = {
  ALL: 'כל סוגי התוכן', IMAGE: 'תמונות', VIDEO: 'סרטונים ורילס', CAROUSEL_ALBUM: 'קרוסלות',
}
const metricCards = [
  ['followersCount', 'עוקבים'], ['mediaCount', 'מספר פוסטים'], ['reach', 'חשיפה'],
  ['views', 'צפיות'], ['profileViews', 'ביקורים בפרופיל'],
  ['accountsEngaged', 'חשבונות מעורבים'], ['totalInteractions', 'סך אינטראקציות'],
  ['netFollowerChange', 'שינוי נטו בעוקבים'], ['engagementRate', 'שיעור מעורבות'],
]

function dateParams(range, custom) {
  const until = custom.until || new Date().toISOString().slice(0, 10)
  const sinceDate = new Date(`${until}T12:00:00`)
  const days = range === 'custom' && !custom.since ? 7 : Number(range)
  if (range !== 'custom' || !custom.since) sinceDate.setDate(sinceDate.getDate() - days + 1)
  return { since: range === 'custom' && custom.since ? custom.since : sinceDate.toISOString().slice(0, 10), until }
}

function friendlyError(error) {
  if (!window.navigator.onLine) return { kind: 'OFFLINE', text: 'אין חיבור לאינטרנט. יש להתחבר מחדש כדי לבצע פעולה זו.' }
  const code = error?.response?.data?.code
  const backendMessage = error?.response?.data?.message
  if (code === 'INSTAGRAM_NOT_CONNECTED') return { kind: code, text: 'Instagram account is not connected for this client.' }
  if (code === 'NOT_CONFIGURED') return { kind: code, text: `הגדרות Instagram Insights אינן מלאות. ${backendMessage || ''}`.trim() }
  if (code === 'MISSING_PERMISSION') return { kind: code, text: 'חסרה הרשאת instagram_manage_insights. יש לחדש את אסימון Meta לאחר הוספת ההרשאה.' }
  if (code === 'TOKEN_INVALID' || error?.response?.status === 401) return { kind: 'TOKEN_INVALID', text: 'אסימון Meta פג או אינו תקין. יש לחדש אותו בהגדרות השרת.' }
  if (code === 'INVALID_ACCOUNT_ID') return { kind: code, text: 'מזהה החשבון אינו מזהה של חשבון Instagram מקצועי המחובר לאסימון Meta.' }
  if (code === 'UNSUPPORTED_ACCOUNT') return { kind: code, text: 'Instagram Insights זמין רק לחשבון מקצועי מסוג Business או Creator.' }
  if (code === 'RATE_LIMIT' || error?.response?.status === 429) return { kind: 'RATE_LIMIT', text: 'Meta הגבילה זמנית את קצב הבקשות. נסו שוב מאוחר יותר.' }
  if (error?.response?.status === 403) return { kind: 'FORBIDDEN', text: 'הגישה לאנליטיקה זמינה למנהלים בלבד.' }
  if (backendMessage) return { kind: code || 'META_REQUEST_ERROR', text: backendMessage }
  return { kind: 'TEMPORARY', text: 'לא הצלחנו לטעון את נתוני Instagram כרגע.' }
}

function Preview({ item, variant = 'thumbnail' }) {
  const [failed, setFailed] = useState(false)
  const source = item.thumbnailUrl || item.mediaUrl
  return source && !failed
    ? <img className={`instagram-media-thumb instagram-media-${variant}`} src={source} alt={`תצוגה מקדימה: ${item.caption || 'תוכן Instagram'}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className={`instagram-media-fallback instagram-media-${variant}`} role="img" aria-label="תצוגה מקדימה אינה זמינה"><ImageOff size={20} aria-hidden="true" /></span>
}

function TrendChart({ data, dataKey, title, color, unavailableMessage = 'אין נתונים זמינים לתקופה שנבחרה.' }) {
  const usable = data.some((row) => row[dataKey] !== null && row[dataKey] !== undefined)
  return <section className="analytics-panel instagram-chart-panel">
    <div className="analytics-panel-title"><h3>{title}</h3></div>
    {!usable ? <p className="analytics-panel-empty">{unavailableMessage}</p> :
      <div className="instagram-chart"><ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8ded2" />
          <XAxis dataKey="date" tickFormatter={(value) => formatChartDate(value)} tick={{ fontSize: 11 }} />
          <YAxis width={42} tick={{ fontSize: 11 }} />
          <Tooltip
            labelFormatter={(value) => formatChartDate(value, true)}
            formatter={(value) => [show(value), title]}
          />
          <Legend /><Line type="monotone" dataKey={dataKey} name={title} stroke={color} strokeWidth={2.5} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer></div>}
  </section>
}

function TopCard({ title, item }) {
  return <article className="instagram-top-card">
    <h3>{title}</h3>
    {!item ? <p>{unavailable}</p> : <><Preview item={item} variant="card" /><strong>{item.caption || 'ללא כיתוב'}</strong></>}
  </article>
}

function topItem(items, key) {
  return items
    .filter((item) => typeof item[key] === 'number')
    .reduce((best, item) => (!best || item[key] > best[key] ? item : best), null)
}

function AnalyticsPage(props) {
  const [profile, setProfile] = useState(null)
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [account, setAccount] = useState(null)
  const [media, setMedia] = useState(null)
  const [range, setRange] = useState('7')
  const [custom, setCustom] = useState({ since: '', until: '' })
  const [mediaType, setMediaType] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const params = useMemo(() => dateParams(range, custom), [range, custom])
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const current = profile || await getAnalyticsProfile()
      setProfile(current)
      if (current?.role === 'ADMIN' && clients.length === 0) setClients(await getAnalyticsClients())
      if (current?.role === 'ADMIN' && !selectedClientId) { setAccount(null); setMedia(null); return }
      const query = { ...params, period: 'day', ...(current?.role === 'ADMIN' ? { clientId: selectedClientId } : {}) }
      const [accountData, mediaData] = await Promise.all([
        getInstagramAccountInsights(query),
        getInstagramMediaInsights({ ...query, mediaType, limit: 50 }),
      ])
      setAccount(accountData); setMedia(mediaData)
    } catch (requestError) {
      setAccount(null); setMedia(null); setError(friendlyError(requestError))
    } finally { setLoading(false) }
  }, [params, mediaType, profile, clients.length, selectedClientId])

  useEffect(() => { Promise.resolve().then(load) }, [load])
  const isAdmin = profile?.role === 'ADMIN'
  const canView = isAdmin || profile?.role === 'CLIENT'
  const trend = mergeAnalyticsTrends(account?.dailyTrend, media?.dailyTrend)
  const items = media?.items || []
  const availableMetricCards = metricCards.filter(([key]) => account?.[key] !== null && account?.[key] !== undefined)
  const unavailableMetricLabels = metricCards
    .filter(([key]) => account?.[key] === null || account?.[key] === undefined)
    .map(([, label]) => label)
  const topReach = media?.topByReach || topItem(items, 'reach')
  const topViews = media?.topByViews || topItem(items, 'views')
  const topEngagement = media?.topByEngagement || topItem(items, 'engagementRate')

  return <PageShell {...props}>
    <section className="analytics-page instagram-analytics" dir="rtl">
      <header className="analytics-heading">
        <div><p className="eyebrow">Instagram Insights</p><h2>אנליטיקת אינסטגרם</h2><p>נתוני אמת מחשבון Instagram המקצועי המחובר.</p></div>
        <button type="button" className="secondary-button analytics-refresh" onClick={load} disabled={loading}><RefreshCw size={18} />רענון</button>
      </header>

      {canView && <section className="instagram-filters" aria-label="מסנני אנליטיקה">
        {isAdmin && <label>לקוח<select aria-label="Client" value={selectedClientId} onChange={(e) => { setAccount(null); setMedia(null); setError(null); setSelectedClientId(e.target.value) }}><option value="">בחירת לקוח</option>{clients.map(client => <option key={client.client_id} value={client.client_id}>{client.business_name}</option>)}</select></label>}
        <label>טווח זמן<select value={range} onChange={(e) => setRange(e.target.value)}>{Object.entries(ranges).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {range === 'custom' && <><label>מתאריך<input type="date" value={custom.since} onChange={(e) => setCustom(c => ({...c,since:e.target.value}))} /></label><label>עד תאריך<input type="date" value={custom.until} onChange={(e) => setCustom(c => ({...c,until:e.target.value}))} /></label></>}
        <label>סוג תוכן<select value={mediaType} onChange={(e) => setMediaType(e.target.value)}>{Object.entries(mediaTypes).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </section>}

      {loading && <div className="analytics-state" role="status"><span className="analytics-loader" />טוען נתוני Instagram Insights...</div>}
      {!loading && error && <div className="analytics-state analytics-error" role="alert"><p>{error.text}</p>{error.kind !== 'FORBIDDEN' && <button type="button" className="secondary-button" onClick={load}>ניסיון נוסף</button>}</div>}
      {!loading && !error && canView && !account && <div className="analytics-state">{isAdmin && !selectedClientId ? 'יש לבחור לקוח להצגת אנליטיקת Instagram.' : 'אין נתוני חשבון זמינים.'}</div>}
      {!loading && !error && canView && account && <>
        <section className="analytics-summary instagram-summary" aria-label="מדדי סיכום">
          {availableMetricCards.map(([key,label]) => <article key={key}>
            <span>{label}{key === 'engagementRate' && <span className="metric-help" title="סך האינטראקציות חלקי החשיפה, כפול 100" aria-label="שיעור מעורבות: סך האינטראקציות חלקי החשיפה, כפול 100"><HelpCircle size={15} aria-hidden="true" /></span>}</span>
            <strong>{show(account[key], key === 'engagementRate')}</strong>
          </article>)}
        </section>
        {unavailableMetricLabels.length > 0 && <p className="analytics-availability-note">
          Meta לא החזירה כרגע את המדדים: {unavailableMetricLabels.join(', ')}. הזמינות תלויה בסוג החשבון, בהרשאות ובטווח התאריכים.
        </p>}
        <div className="analytics-grid instagram-charts-grid">
          <TrendChart data={trend} dataKey="reach" title="חשיפה לאורך זמן" color="#8f6d4f" />
          <TrendChart data={trend} dataKey="views" title="צפיות לאורך זמן" color="#b27468" />
          <TrendChart data={trend} dataKey="totalInteractions" title="אינטראקציות לאורך זמן" color="#617f72" />
        </div>
        <section className="instagram-top-grid">
          <TopCard title="התוכן עם החשיפה הגבוהה ביותר" item={topReach} />
          <TopCard title="התוכן עם מספר הצפיות הגבוה ביותר" item={topViews} />
          <TopCard title="התוכן עם שיעור המעורבות הגבוה ביותר" item={topEngagement} />
        </section>
        <section className="analytics-panel instagram-media-panel">
          <div className="analytics-panel-title"><h3>ביצועי תוכן</h3></div>
          {items.length === 0 ? <p className="analytics-panel-empty">אין מדיה בטווח שנבחר.</p> :
          <div className="analytics-table-wrap"><table className="analytics-table instagram-media-table">
            <thead><tr>{['תצוגה','כיתוב','תאריך פרסום','סוג','חשיפה','צפיות','לייקים','תגובות','שמירות','שיתופים','אינטראקציות','שיעור מעורבות','קישור'].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>{items.map(item => <tr key={item.mediaId}>
              <td><Preview item={item} /></td><td className="instagram-caption">{item.caption?.trim() ? item.caption : ''}</td>
              <td>{item.timestamp ? new Date(item.timestamp).toLocaleDateString('he-IL') : unavailable}</td><td>{item.mediaProductType || item.mediaType || unavailable}</td>
              {['reach','views','likes','comments','saved','shares','totalInteractions'].map(k=><td key={k}>{show(item[k])}</td>)}
              <td>{show(item.engagementRate,true)}</td><td>{item.permalink ? <a href={item.permalink} target="_blank" rel="noopener noreferrer" aria-label="צפייה בפוסט באינסטגרם"><ExternalLink size={18}/></a> : unavailable}</td>
            </tr>)}</tbody>
          </table></div>}
        </section>
      </>}
    </section>
  </PageShell>
}

export default AnalyticsPage
