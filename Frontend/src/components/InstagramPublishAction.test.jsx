import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import InstagramPublishAction from './InstagramPublishAction.jsx'
import {
  getInstagramPublishErrorMessage,
  publishContentToInstagram,
} from '../api/publishing.js'

vi.mock('../api/publishing.js', () => ({
  publishContentToInstagram: vi.fn(),
  getInstagramPublishErrorMessage: vi.fn(() => 'שגיאת פרסום בטוחה'),
}))

const approvedImage = {
  content_id: 42,
  status: 'APPROVED',
  content_type: 'IMAGE',
  file_url: 'https://res.cloudinary.com/demo/image/upload/example.jpg',
}

function renderAction(overrides = {}) {
  const props = {
    content: approvedImage,
    role: 'ADMIN',
    publishedMediaId: '',
    onPublished: vi.fn(),
    ...overrides,
  }
  return { ...render(<InstagramPublishAction {...props} />), props }
}

describe('InstagramPublishAction', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('shows the action for an admin with approved image content', () => {
    renderAction()
    expect(screen.getByRole('button', { name: 'פרסום באינסטגרם' })).toBeTruthy()
  })

  it('is hidden from clients', () => {
    renderAction({ role: 'CLIENT' })
    expect(screen.queryByRole('button', { name: 'פרסום באינסטגרם' })).toBeNull()
  })

  it('requires confirmation before publishing', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))
    expect(publishContentToInstagram).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('keeps image/video previews and warning inside the responsive body', () => {
    const { unmount } = renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))
    expect(document.documentElement.classList.contains('instagram-confirmation-open')).toBe(true)
    expect(document.querySelector('.instagram-confirmation-body img')).toBeTruthy()
    expect(screen.getByText(/הפעולה תפרסם פוסט אמיתי/)).toBeTruthy()
    unmount()

    const video = { ...approvedImage, content_type: 'VIDEO', file_url: 'https://res.cloudinary.com/demo/video/upload/example.mp4' }
    renderAction({ content: video })
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))
    expect(document.querySelector('.instagram-confirmation-body video')).toBeTruthy()
  })

  it('uses explicit viewport-fit header, scroll body, and action rows', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))

    const dialog = screen.getByRole('dialog')
    expect(dialog.parentElement.classList.contains('instagram-confirmation-backdrop')).toBe(true)
    expect(dialog.parentElement.parentElement).toBe(document.body)
    expect(dialog.classList.contains('instagram-confirmation')).toBe(true)
    expect(dialog.children[0].classList.contains('instagram-confirmation-header')).toBe(true)
    expect(dialog.children[1].classList.contains('instagram-confirmation-body')).toBe(true)
    expect(dialog.children[2].classList.contains('modal-actions')).toBe(true)
    expect(document.querySelector('.instagram-confirmation-body .content-media-carousel')).toBeTruthy()
  })

  it('keeps both mobile actions inside the fixed action row', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))

    const actions = screen.getByRole('dialog').querySelector('.modal-actions')
    const cancel = screen.getByRole('button', { name: 'ביטול' })
    const confirm = screen.getByRole('button', { name: 'אישור ופרסום' })
    expect(actions.children).toHaveLength(2)
    expect(actions.contains(cancel)).toBe(true)
    expect(actions.contains(confirm)).toBe(true)
  })

  it('cancels from the visible action without publishing', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.documentElement.classList.contains('instagram-confirmation-open')).toBe(false)
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
    expect(publishContentToInstagram).not.toHaveBeenCalled()
  })

  it('shows loading state and prevents duplicate requests', async () => {
    let resolveRequest
    publishContentToInstagram.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))
    const confirm = screen.getByRole('button', { name: 'אישור ופרסום' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    expect(screen.getByRole('button', { name: 'מפרסם...' }).disabled).toBe(true)
    expect(publishContentToInstagram).toHaveBeenCalledTimes(1)
    resolveRequest({ success: true, instagramMediaId: 'media-123' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes an idle confirmation dialog with Escape', () => {
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reports success and exposes the media ID only under technical details', async () => {
    publishContentToInstagram.mockResolvedValue({ success: true, instagramMediaId: 'media-456' })
    const { props, rerender } = renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))
    fireEvent.click(screen.getByRole('button', { name: 'אישור ופרסום' }))

    await waitFor(() => expect(props.onPublished).toHaveBeenCalledWith(42, 'media-456'))
    rerender(<InstagramPublishAction
      content={approvedImage}
      role="ADMIN"
      publishedMediaId="media-456"
      onPublished={props.onPublished}
    />)
    expect(screen.getByRole('button', { name: 'פורסם באינסטגרם' }).disabled).toBe(true)
    expect(screen.getByText('פרטים טכניים')).toBeTruthy()
    expect(screen.getByText(/media-456/)).toBeTruthy()
  })

  it('shows a safe failure and re-enables publishing', async () => {
    publishContentToInstagram.mockRejectedValue(new Error('raw secret error'))
    getInstagramPublishErrorMessage.mockReturnValue('הפרסום באינסטגרם נכשל')
    const toastListener = vi.fn()
    window.addEventListener('sscm:toast', toastListener)
    renderAction()
    fireEvent.click(screen.getByRole('button', { name: 'פרסום באינסטגרם' }))
    fireEvent.click(screen.getByRole('button', { name: 'אישור ופרסום' }))

    await waitFor(() => expect(toastListener).toHaveBeenCalled())
    expect(toastListener.mock.calls[0][0].detail.message).toBe('הפרסום באינסטגרם נכשל')
    expect(screen.getByRole('button', { name: 'אישור ופרסום' }).disabled).toBe(false)
    window.removeEventListener('sscm:toast', toastListener)
  })
})
