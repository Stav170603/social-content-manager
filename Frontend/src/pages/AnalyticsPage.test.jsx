import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AnalyticsPage from './AnalyticsPage.jsx'
import {
  formatAnalyticsChartDate as formatChartDate,
  mergeAnalyticsTrends,
  showAnalyticsValue as show,
} from '../utils/analyticsFormat.js'
import {
  getAnalyticsClients, getAnalyticsProfile, getInstagramAccountInsights, getInstagramMediaInsights,
} from '../api/analytics.js'

vi.mock('../api/analytics.js', () => ({
  getAnalyticsProfile: vi.fn(),
  getAnalyticsClients: vi.fn(),
  getInstagramAccountInsights: vi.fn(),
  getInstagramMediaInsights: vi.fn(),
}))
vi.mock('../components/PageShell.jsx', () => ({ default: ({ children }) => <main>{children}</main> }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>, Line: () => null,
  CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}))

const account = {
  followersCount: 1234, mediaCount: 20, reach: 74, views: 211, profileViews: null,
  accountsEngaged: 15, totalInteractions: 21, netFollowerChange: 3, engagementRate: 28.37,
  dailyTrend: [{ date: '2026-07-27', reach: 74, views: 211, totalInteractions: 21 }],
}
const item = {
  mediaId: 'm1', caption: 'פוסט אמיתי', mediaType: 'IMAGE', timestamp: '2026-07-27T10:00:00Z',
  mediaUrl: 'https://cdn.example.com/instagram-media.jpg',
  reach: 74, views: 211, likes: 10, comments: 2, saved: 3, shares: 1, totalInteractions: 16,
  engagementRate: 21.62, permalink: 'https://instagram.com/p/example',
}
const media = { items: [item], topByReach: item, topByViews: item, topByEngagement: item }

describe('AnalyticsPage', () => {
  beforeEach(() => {
    getAnalyticsProfile.mockResolvedValue({ role: 'CLIENT' })
    getAnalyticsClients.mockResolvedValue([{ client_id: 1, business_name: 'Otzar' }])
    getInstagramAccountInsights.mockResolvedValue(account)
    getInstagramMediaInsights.mockResolvedValue(media)
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })
  const renderPage = () => render(<AnalyticsPage isAuthenticated routes={{}} />)

  it('formats chart dates for Hebrew readers without raw ISO timestamps', () => {
    expect(formatChartDate('2026-07-22')).toBe('22.07')
    expect(formatChartDate('2026-07-22', true)).toContain('22')
    expect(formatChartDate('2026-07-22', true)).not.toContain('2026-07-22')
  })

  it('distinguishes unavailable values from an explicit zero', () => {
    expect(show(null)).toBe('לא זמין')
    expect(show(0)).toBe('0')
    expect(show(0, true)).toBe('0%')
  })

  it('loads real response values and Hebrew cards', async () => {
    renderPage()
    expect(await screen.findByText('1,234')).toBeTruthy()
    expect(screen.getByText('עוקבים')).toBeTruthy()
    expect(screen.getAllByText('211').length).toBeGreaterThan(0)
  })
  it('shows unavailable instead of inventing zero', async () => {
    getInstagramAccountInsights.mockResolvedValue({
      ...account,
      dailyTrend: [{ date: '2026-07-27', reach: null, views: null, totalInteractions: null }],
    })
    renderPage()
    await screen.findByText('1,234')
    expect(screen.getAllByText('אין נתונים זמינים לתקופה שנבחרה.').length).toBeGreaterThan(0)
  })
  it('omits the unavailable follower-change trend while preserving other charts and follower count', async () => {
    getInstagramAccountInsights.mockResolvedValue({
      ...account,
      dailyTrendUnavailableReasons: { netFollowerChange: 'META_DAILY_FOLLOWER_CHANGE_UNAVAILABLE' },
    })
    renderPage()
    expect(await screen.findByText('עוקבים')).toBeTruthy()
    expect(screen.getByText('חשיפה לאורך זמן')).toBeTruthy()
    expect(screen.getByText('צפיות לאורך זמן')).toBeTruthy()
    expect(screen.getByText('אינטראקציות לאורך זמן')).toBeTruthy()
    expect(screen.queryByText('שינוי בעוקבים לאורך זמן')).toBeNull()
    expect(screen.queryByText('Meta אינה מספקת נתוני שינוי יומיים בעוקבים עבור החשבון או התקופה הזו.')).toBeNull()
  })
  it('updates requests when media filter changes', async () => {
    renderPage(); await screen.findByText('1,234')
    fireEvent.change(screen.getByLabelText('סוג תוכן'), { target: { value: 'IMAGE' } })
    await waitFor(() => expect(getInstagramMediaInsights).toHaveBeenLastCalledWith(expect.objectContaining({ mediaType: 'IMAGE' })))
  })
  it('renders loading and media performance table', async () => {
    let resolve
    getInstagramAccountInsights.mockReturnValue(new Promise(r => { resolve = r }))
    renderPage()
    expect(await screen.findByText('טוען נתוני Instagram Insights...')).toBeTruthy()
    resolve(account)
    expect((await screen.findAllByText('פוסט אמיתי')).length).toBeGreaterThan(0)
    const previews = screen.getAllByAltText(/תצוגה מקדימה/)
    expect(previews.every((preview) => preview.getAttribute('loading') === 'lazy')).toBe(true)
    expect(previews.every((preview) => preview.getAttribute('decoding') === 'async')).toBe(true)
    expect(previews.filter((preview) => preview.classList.contains('instagram-media-card')).length).toBe(3)
    expect(previews.some((preview) => preview.classList.contains('instagram-media-thumbnail'))).toBe(true)
    expect(screen.getByLabelText('צפייה בפוסט באינסטגרם').getAttribute('rel')).toBe('noopener noreferrer')
  })
  it('renders captions verbatim and leaves missing or blank caption cells empty', async () => {
    const captionItems = [
      { ...item, mediaId: 'caption-present', caption: '  כיתוב עם רווחים  ' },
      { ...item, mediaId: 'caption-null', caption: null, reach: null },
      { ...item, mediaId: 'caption-undefined', caption: undefined },
      { ...item, mediaId: 'caption-empty', caption: '' },
      { ...item, mediaId: 'caption-whitespace', caption: '   \t\n' },
    ]
    getInstagramMediaInsights.mockResolvedValue({ items: captionItems })

    const { container } = renderPage()
    await screen.findByText('1,234')

    const rows = [...container.querySelectorAll('.instagram-media-table tbody tr')]
    const captionCells = rows.map((row) => row.querySelector('.instagram-caption'))
    expect(captionCells[0].textContent).toBe('  כיתוב עם רווחים  ')
    expect(captionCells.slice(1).every((cell) => cell.textContent === '')).toBe(true)
    expect(rows[1].children[4].textContent).toBe('לא זמין')
  })

  it('aligns and orders account and media trends without replacing authoritative values', () => {
    expect(mergeAnalyticsTrends([
      { date: '2026-07-03T00:00:00Z', reach: 9, views: 0, netFollowerChange: -2 },
      { date: '2026-07-01T00:00:00Z', reach: 4, totalInteractions: 0, netFollowerChange: 0 },
    ], [
      { date: '2026-07-02', views: 12, totalInteractions: 5 },
      { date: '2026-07-03', views: 99, totalInteractions: 7 },
    ])).toEqual([
      { date: '2026-07-01', reach: 4, totalInteractions: 0, netFollowerChange: 0 },
      { date: '2026-07-02', views: 12, totalInteractions: 5 },
      { date: '2026-07-03', reach: 9, views: 0, netFollowerChange: -2, totalInteractions: 7 },
    ])
  })
  it('displays available and zero media views while preserving genuinely unavailable metrics', async () => {
    getInstagramMediaInsights.mockResolvedValue({ items: [
      { ...item, mediaId: 'views-present', views: 321, reach: 41, likes: 8 },
      { ...item, mediaId: 'views-zero', views: 0, reach: 42, likes: 9 },
      { ...item, mediaId: 'views-null', views: null, reach: 43, likes: 10 },
      { ...item, mediaId: 'views-missing', views: undefined, reach: 44, likes: 11 },
    ] })

    const { container } = renderPage()
    await screen.findByText('1,234')

    const rows = [...container.querySelectorAll('.instagram-media-table tbody tr')]
    expect(rows.map((row) => row.children[5].textContent)).toEqual(['321', '0', 'לא זמין', 'לא זמין'])
    expect(rows.map((row) => row.children[4].textContent)).toEqual(['41', '42', '43', '44'])
    expect(rows.map((row) => row.children[6].textContent)).toEqual(['8', '9', '10', '11'])
  })
  it('renders permission error and retry for temporary failures', async () => {
    getInstagramAccountInsights.mockRejectedValue({ response: { data: { code: 'MISSING_PERMISSION' }, status: 403 } })
    const view = renderPage()
    expect(await screen.findByText(/instagram_manage_insights/)).toBeTruthy()
    cleanup()
    getInstagramAccountInsights.mockRejectedValue(new Error('network'))
    view.unmount()
    renderPage()
    expect(await screen.findByRole('button', { name: 'ניסיון נוסף' })).toBeTruthy()
  })
  it('shows the safe backend configuration error instead of an empty state', async () => {
    getInstagramAccountInsights.mockRejectedValue({
      response: {
        status: 503,
        data: {
          code: 'NOT_CONFIGURED',
          message: 'Instagram Insights configuration is missing or invalid: Meta access token',
        },
      },
    })
    renderPage()
    expect(await screen.findByText(/Meta access token/)).toBeTruthy()
    expect(screen.queryByText('אין נתוני חשבון זמינים.')).toBeNull()
  })
  it('loads CLIENT analytics without exposing a client selector', async () => {
    getAnalyticsProfile.mockResolvedValue({ role: 'CLIENT' })
    renderPage()
    expect(await screen.findByText('1,234')).toBeTruthy()
    expect(screen.queryByLabelText('Client')).toBeNull()
    expect(getInstagramAccountInsights).toHaveBeenCalledWith(expect.not.objectContaining({ clientId: expect.anything() }))
  })
})
