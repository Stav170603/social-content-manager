import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PendingFeed } from './FeedPage.jsx'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({ default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const imageContent = {
  content_id: 11, title: 'תמונת מוצר', description: 'תיאור מלא', status: 'WAITING_APPROVAL',
  file_url: 'https://example.com/photo.jpg', content_type: 'IMAGE',
}
const videoContent = {
  content_id: 12, title: 'סרטון מוצר', status: 'WAITING_APPROVAL',
  file_url: 'https://example.com/video.mp4', content_type: 'VIDEO',
}
const approvedContent = { ...videoContent, content_id: 21, title: 'Approved Video', status: 'APPROVED' }
const cloudinaryVideo = {
  content_id: 14, title: 'Cloudinary Video', status: 'WAITING_APPROVAL',
  media: [{ mediaId: 41, mediaUrl: 'https://res.cloudinary.com/demo/video/upload/sscm/video-one.mp4', mediaType: 'VIDEO', thumbnailUrl: null, displayOrder: 0 }],
}
const mixedContent = {
  content_id: 13, title: 'קרוסלה מעורבת', status: 'WAITING_APPROVAL',
  media: [
    { mediaUrl: 'https://example.com/first.jpg', mediaType: 'IMAGE', displayOrder: 0 },
    { mediaUrl: 'https://example.com/second.mp4', mediaType: 'VIDEO', displayOrder: 1 },
  ],
}

function load(contents) {
  api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/comments/') ? [] : contents }))
  return render(<PendingFeed profile={{ role: 'CLIENT' }} />)
}

describe('pending approval feed', () => {
  beforeEach(() => { api.put.mockResolvedValue({ data: {} }); api.delete.mockResolvedValue({ data: {} }) })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders the empty state', async () => {
    load([])
    expect(await screen.findByText('אין כרגע תכנים להצגה בפיד')).toBeTruthy()
    expect(api.get).toHaveBeenCalledWith('/contents', { suppressGlobalErrorToast: true })
  })

  it('renders WAITING_APPROVAL and APPROVED but excludes REJECTED content', async () => {
    load([imageContent, approvedContent, { ...videoContent, content_id: 22, title: 'Rejected Video', status: 'REJECTED' }])
    expect(await screen.findByLabelText('פתיחת תמונת מוצר')).toBeTruthy()
    expect(screen.getByLabelText('פתיחת Approved Video')).toBeTruthy()
    expect(screen.queryByLabelText('פתיחת Rejected Video')).toBeNull()
  })

  it('uses the media-only Instagram-style grid and keeps loading squares', async () => {
    let resolveRequest
    api.get.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    const { container } = render(<PendingFeed profile={{ role: 'CLIENT' }} />)
    expect(await screen.findByRole('status', { name: 'טוען פיד' })).toBeTruthy()
    expect(container.querySelectorAll('.feed-skeleton > span')).toHaveLength(6)
    resolveRequest({ data: [imageContent] })
    await screen.findByLabelText('פתיחת תמונת מוצר')
    expect(container.querySelector('.feed-grid')).toBeTruthy()
    expect(container.querySelector('.feed-tile-hover')).toBeNull()
  })

  it('renders image, video, and carousel indicator', async () => {
    const { container } = load([imageContent, videoContent, mixedContent])
    await screen.findByLabelText('פתיחת קרוסלה מעורבת')
    expect(container.querySelectorAll('.feed-tile img')).toHaveLength(2)
    expect(container.querySelectorAll('.feed-tile video')).toHaveLength(1)
    expect(screen.getByLabelText('מספר פריטי מדיה')).toBeTruthy()
    expect(screen.getByLabelText('וידאו')).toBeTruthy()
  })

  it('uses a saved video thumbnail in the Feed grid', async () => {
    const saved = { ...cloudinaryVideo, content_id: 15, title: 'Saved Cover', media: [{ ...cloudinaryVideo.media[0], thumbnailUrl: 'https://cdn.example/saved-cover.jpg' }] }
    const { container } = load([saved])
    await screen.findByLabelText('פתיחת Saved Cover')
    expect(container.querySelector('.feed-tile img')?.getAttribute('src')).toBe('https://cdn.example/saved-cover.jpg')
  })

  it.each(['VIDEO', 'REEL'])('derives a Cloudinary poster for %s without a thumbnail', async (mediaType) => {
    const item = { ...cloudinaryVideo, content_id: mediaType === 'VIDEO' ? 16 : 17, title: `${mediaType} poster`, media: [{ ...cloudinaryVideo.media[0], mediaType }] }
    const { container } = load([item])
    await screen.findByLabelText(`פתיחת ${mediaType} poster`)
    const image = container.querySelector('.feed-tile img')
    expect(image?.getAttribute('src')).toContain('/video/upload/so_0.5,q_auto/sscm/video-one.jpg')
    expect(screen.queryByText('ללא מדיה')).toBeNull()
  })

  it('uses the first ordered video poster and opens that exact content', async () => {
    const videoFirst = { ...cloudinaryVideo, content_id: 18, title: 'Video First', media: [
      { mediaUrl: 'https://cdn.example/second.jpg', mediaType: 'IMAGE', displayOrder: 1 },
      { ...cloudinaryVideo.media[0], displayOrder: 0 },
    ] }
    const { container } = load([videoFirst])
    const tile = await screen.findByLabelText('פתיחת Video First')
    expect(container.querySelector('.feed-tile img')?.getAttribute('src')).toContain('video-one.jpg')
    fireEvent.click(tile)
    const dialog = await screen.findByRole('dialog', { name: 'Video First' })
    expect(dialog.querySelector('video')?.getAttribute('src')).toContain('video-one.mp4')
  })

  it('keeps the first ordered image as the Feed thumbnail', async () => {
    const imageFirst = { ...mixedContent, content_id: 19, title: 'Image First' }
    const { container } = load([imageFirst])
    await screen.findByLabelText('פתיחת Image First')
    expect(container.querySelector('.feed-tile img')?.getAttribute('src')).toContain('first.jpg')
  })

  it('renders the same derived poster for an ADMIN without client approval controls', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/comments/') ? [] : [cloudinaryVideo] }))
    const { container } = render(<PendingFeed profile={{ role: 'ADMIN' }} />)
    fireEvent.click(await screen.findByLabelText('פתיחת Cloudinary Video'))
    expect(container.querySelector('.feed-tile img')?.getAttribute('src')).toContain('video-one.jpg')
    expect(screen.queryByRole('button', { name: 'אישור' })).toBeNull()
  })

  it('orders by planned publication date with undated content last and ID as stable tie-breaker', async () => {
    load([
      { ...imageContent, content_id: 30, title: 'Undated', plannedPublishDate: null },
      { ...videoContent, content_id: 29, title: 'Later', plannedPublishDate: '2026-08-15T10:00:00' },
      { ...imageContent, content_id: 28, title: 'Same B', plannedPublishDate: '2026-08-11T10:00:00' },
      { ...videoContent, content_id: 27, title: 'Same A', plannedPublishDate: '2026-08-11T10:00:00' },
    ])
    await screen.findByLabelText('פתיחת Undated')
    const labels = [...document.querySelectorAll('.feed-tile')].map((tile) => tile.getAttribute('aria-label'))
    expect(labels).toEqual(['פתיחת Same A', 'פתיחת Same B', 'פתיחת Later', 'פתיחת Undated'])
  })

  it('flows the grid LTR while keeping tiles RTL and moves all media-less content last', async () => {
    const contents = [
      { content_id: 41, title: 'Image', status: 'APPROVED', plannedPublishDate: '2026-08-11T10:00:00', file_url: 'https://cdn.example/image.jpg', content_type: 'IMAGE' },
      { content_id: 42, title: 'No Media Early', status: 'WAITING_APPROVAL', plannedPublishDate: '2026-08-12T10:00:00' },
      { content_id: 43, title: 'Cloud Video', status: 'WAITING_APPROVAL', plannedPublishDate: '2026-08-13T10:00:00', file_url: 'https://res.cloudinary.com/demo/video/upload/video.mp4', content_type: 'VIDEO' },
      { content_id: 44, title: 'Reel', status: 'APPROVED', plannedPublishDate: '2026-08-14T10:00:00', file_url: 'https://res.cloudinary.com/demo/video/upload/reel.mp4', content_type: 'REEL' },
      { content_id: 45, title: 'No Media Late', status: 'APPROVED', plannedPublishDate: '2026-08-15T10:00:00' },
      { content_id: 46, title: 'Carousel', status: 'WAITING_APPROVAL', plannedPublishDate: '2026-08-16T10:00:00', media: [
        { mediaUrl: 'https://cdn.example/carousel.jpg', mediaType: 'IMAGE', displayOrder: 0 },
        { mediaUrl: 'https://cdn.example/carousel-video.mp4', mediaType: 'VIDEO', displayOrder: 1 },
      ] },
    ]
    const { container } = load(contents)
    await screen.findByLabelText('פתיחת Carousel')
    const grid = container.querySelector('.feed-grid')
    expect(getComputedStyle(grid).direction).toBe('ltr')
    const tiles = [...grid.querySelectorAll('.feed-tile')]
    expect(getComputedStyle(tiles[0]).direction).toBe('rtl')
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'פתיחת Image', 'פתיחת Cloud Video', 'פתיחת Reel', 'פתיחת Carousel',
      'No Media Early: ללא מדיה', 'No Media Late: ללא מדיה',
    ])
    expect(screen.getAllByText('ללא מדיה')).toHaveLength(2)
    expect(grid.querySelector('[aria-label="פתיחת Cloud Video"] img')?.getAttribute('src')).toContain('video.jpg')
    fireEvent.click(screen.getByLabelText('פתיחת Reel'))
    expect(await screen.findByRole('dialog', { name: 'Reel' })).toBeTruthy()
  })

  it('persists desktop drag order without opening a modal and reloads that order', async () => {
    const ordered = [
      { ...imageContent, content_id: 51, title: 'Drag A' },
      { ...videoContent, content_id: 52, title: 'Drag B' },
      { ...approvedContent, content_id: 53, title: 'Drag C' },
    ]
    const { container, unmount } = load(ordered)
    const first = await screen.findByLabelText('פתיחת Drag A')
    const third = screen.getByLabelText('פתיחת Drag C')
    const transfer = { value: '', setData(_type, value) { this.value = value }, getData() { return this.value } }
    fireEvent.dragStart(third, { dataTransfer: transfer })
    fireEvent.drop(first, { dataTransfer: transfer })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/contents/feed-order', { contentIds: [53, 51, 52] }))
    expect([...container.querySelectorAll('.feed-tile')].map((tile) => tile.getAttribute('aria-label'))).toEqual(['פתיחת Drag C', 'פתיחת Drag A', 'פתיחת Drag B'])
    expect(screen.queryByRole('dialog')).toBeNull()
    unmount(); vi.clearAllMocks()
    load([{ ...ordered[0], feedOrder: 1 }, { ...ordered[1], feedOrder: 2 }, { ...ordered[2], feedOrder: 0 }])
    await screen.findByLabelText('פתיחת Drag C')
    expect([...document.querySelectorAll('.feed-tile')].map((tile) => tile.getAttribute('aria-label'))).toEqual(['פתיחת Drag C', 'פתיחת Drag A', 'פתיחת Drag B'])
  })

  it('resets persisted order to automatic ordering', async () => {
    load([
      { ...videoContent, content_id: 61, title: 'Later Manual First', plannedPublishDate: '2026-08-20T10:00:00', feedOrder: 0 },
      { ...imageContent, content_id: 62, title: 'Earlier Manual Second', plannedPublishDate: '2026-08-10T10:00:00', feedOrder: 1 },
    ])
    fireEvent.click(await screen.findByRole('button', { name: 'איפוס סדר' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/contents/feed-order'))
    expect([...document.querySelectorAll('.feed-tile')].map((tile) => tile.getAttribute('aria-label'))).toEqual(['פתיחת Earlier Manual Second', 'פתיחת Later Manual First'])
  })

  it('shows approved content as view-only and waiting content with CLIENT actions', async () => {
    load([approvedContent, imageContent])
    fireEvent.click(await screen.findByLabelText('פתיחת Approved Video'))
    expect(await screen.findByText('מאושר')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'אישור' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'סגירת פרטי התוכן' }))
    fireEvent.click(screen.getByLabelText('פתיחת תמונת מוצר'))
    expect(await screen.findByText('ממתין לאישור')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'אישור' })).toBeTruthy()
  })

  it('opens details and navigates a mixed carousel', async () => {
    load([mixedContent])
    fireEvent.click(await screen.findByLabelText('פתיחת קרוסלה מעורבת'))
    const dialog = await screen.findByRole('dialog', { name: 'קרוסלה מעורבת' })
    expect(within(dialog).getByText('1 / 2')).toBeTruthy()
    const carouselButtons = dialog.querySelectorAll('.content-media-carousel-controls button')
    fireEvent.click(carouselButtons[1])
    expect(within(dialog).getByText('2 / 2')).toBeTruthy()
  })

  it('does not make a no-media item clickable or open unrelated content', async () => {
    load([{ content_id: 20, title: 'ללא קובץ', status: 'WAITING_APPROVAL' }, imageContent])
    const placeholder = await screen.findByRole('img', { name: 'ללא קובץ: ללא מדיה' })
    expect(placeholder.tagName).toBe('DIV')
    fireEvent.click(placeholder)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByLabelText('פתיחת ללא קובץ')).toBeNull()
  })

  it('opens content A and content B strictly by their stable IDs', async () => {
    load([imageContent, videoContent])
    fireEvent.click(await screen.findByLabelText('פתיחת תמונת מוצר'))
    expect(await screen.findByRole('dialog', { name: 'תמונת מוצר' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'סגירת פרטי התוכן' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByLabelText('פתיחת סרטון מוצר'))
    expect(await screen.findByRole('dialog', { name: 'סרטון מוצר' })).toBeTruthy()
  })

  it('clears selection when the detail modal closes', async () => {
    load([imageContent])
    fireEvent.click(await screen.findByLabelText('פתיחת תמונת מוצר'))
    fireEvent.click(await screen.findByRole('button', { name: 'סגירת פרטי התוכן' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps an approved item in the feed and changes the modal to view-only', async () => {
    load([imageContent])
    fireEvent.click(await screen.findByLabelText('פתיחת תמונת מוצר'))
    fireEvent.click(await screen.findByRole('button', { name: 'אישור' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/contents/11/approve'))
    expect(await screen.findByText('מאושר')).toBeTruthy()
    expect(screen.getByLabelText('פתיחת תמונת מוצר')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'אישור' })).toBeNull()
  })

  it('rejects with the existing reason flow and removes the item', async () => {
    load([imageContent])
    fireEvent.click(await screen.findByLabelText('פתיחת תמונת מוצר'))
    fireEvent.click(await screen.findByRole('button', { name: 'דחייה' }))
    fireEvent.change(await screen.findByLabelText('סיבת הדחייה'), { target: { value: 'נדרש תיקון' } })
    fireEvent.click(screen.getByRole('button', { name: 'דחיית התוכן' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/contents/11/reject', { reason: 'נדרש תיקון' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('clears stale selection when the feed reloads', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url.includes('/comments/') ? [] : [imageContent] }))
    const { rerender } = render(<PendingFeed profile={{ role: 'CLIENT' }} reloadKey={0} />)
    fireEvent.click(await screen.findByLabelText('פתיחת תמונת מוצר'))
    expect(await screen.findByRole('dialog', { name: 'תמונת מוצר' })).toBeTruthy()
    rerender(<PendingFeed profile={{ role: 'CLIENT' }} reloadKey={1} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
