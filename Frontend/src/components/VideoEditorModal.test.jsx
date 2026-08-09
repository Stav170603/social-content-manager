import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import VideoEditorModal from './VideoEditorModal.jsx'

describe('VideoEditorModal', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks() })

  function loadVideo(props = {}) {
    const result = render(<VideoEditorModal file={new File(['video'], 'reel.mp4', { type: 'video/mp4' })} onCancel={vi.fn()} onSave={vi.fn()} {...props} />)
    const video = result.container.querySelector('video')
    Object.defineProperty(video, 'duration', { configurable: true, value: 12 })
    fireEvent.loadedMetadata(video)
    return { ...result, video }
  }

  it('trims, reports final duration, validates ranges, and preserves audio by default', () => {
    loadVideo()
    fireEvent.click(screen.getByRole('button', { name: 'שמע' }))
    expect(screen.getByRole('checkbox', { name: 'השתקת השמע המקורי' }).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'חיתוך' }))
    fireEvent.change(screen.getByRole('slider', { name: 'זמן התחלה' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('slider', { name: 'זמן סיום' }), { target: { value: '9' } })
    expect(screen.getByText('משך סופי: 0:06')).toBeTruthy()
    fireEvent.change(screen.getByRole('slider', { name: 'זמן התחלה' }), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'סיום' }))
    expect(screen.getByRole('alert').textContent).toContain('טווח')
  })

  it('selects a cover, saves trim/mute, and cancel does not save', async () => {
    const cover = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' })
    const captureCover = vi.fn().mockResolvedValue(cover)
    const onSave = vi.fn()
    const onCancel = vi.fn()
    loadVideo({ captureCover, onSave, onCancel })
    fireEvent.change(screen.getByRole('slider', { name: 'זמן התחלה' }), { target: { value: '2' } })
    fireEvent.change(screen.getByRole('slider', { name: 'זמן סיום' }), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'כריכה' }))
    fireEvent.change(screen.getByRole('slider', { name: 'זמן הכריכה' }), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'בחירת פריים ככריכה' }))
    fireEvent.click(screen.getByRole('button', { name: 'שמע' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'השתקת השמע המקורי' }))
    fireEvent.click(screen.getByRole('button', { name: 'סיום' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ edit: expect.objectContaining({ start: 2, end: 8, muted: true }), coverFile: cover }))
    expect(captureCover).toHaveBeenCalled()
    cleanup()
    loadVideo({ captureCover, onSave, onCancel })
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('switches visual tools, previews them, resets, and submits implemented Cloudinary parameters', async () => {
    const onSave = vi.fn()
    loadVideo({ onSave })
    for (const [tool, value] of [['בהירות', '25'], ['ניגודיות', '-15'], ['רוויה', '30'], ['וינייטה', '40']]) {
      fireEvent.click(screen.getByRole('button', { name: tool }))
      fireEvent.change(screen.getByRole('slider', { name: tool }), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'סיבוב' }))
    fireEvent.click(screen.getByRole('button', { name: 'ימינה' }))
    fireEvent.click(screen.getByRole('button', { name: 'יחס' }))
    fireEvent.click(screen.getByRole('button', { name: '4:5' }))
    const original = screen.getByRole('button', { name: 'צפייה במקור' })
    fireEvent.click(original)
    expect(original.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(original)
    fireEvent.click(screen.getByRole('button', { name: 'סיום' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ edit: expect.objectContaining({ brightness: 25, contrast: -15, saturation: 30, vignette: 40, rotation: 90, aspectRatio: '4:5' }), coverFile: null }))
  })

  it('handles non-finite metadata and browser decoding failures safely', () => {
    const { container } = render(<VideoEditorModal file={new File(['video'], 'mobile.mov', { type: 'video/quicktime' })} onCancel={vi.fn()} onSave={vi.fn()} />)
    const video = container.querySelector('video')
    Object.defineProperty(video, 'duration', { configurable: true, value: Number.NaN })
    fireEvent.loadedMetadata(video)
    expect(screen.getByRole('alert').textContent).toContain('משך')
    expect(screen.getByRole('button', { name: 'סיום' }).disabled).toBe(true)
    fireEvent.error(video)
    expect(screen.getByRole('alert').textContent).toContain('אינו יכול לפענח')
  })

  it('requests normalization on decode failure and shows preprocessing state', () => {
    const onDecodeFailure = vi.fn()
    const { container, rerender } = render(<VideoEditorModal file={new File(['video'], 'iphone.mov', { type: 'video/quicktime' })} onCancel={vi.fn()} onSave={vi.fn()} onDecodeFailure={onDecodeFailure} />)
    fireEvent.error(container.querySelector('video'))
    expect(onDecodeFailure).toHaveBeenCalledTimes(1)
    rerender(<VideoEditorModal file={new File(['video'], 'iphone.mov', { type: 'video/quicktime' })} onCancel={vi.fn()} onSave={vi.fn()} normalizing />)
    expect(screen.getByText('מכינים את הסרטון לעריכה...')).toBeTruthy()
  })

  it('keeps its object URL alive, accepts direct normalized preview, and records real metadata', () => {
    const file = new File(['video'], 'iphone.mov', { type: 'video/quicktime' })
    const { container, rerender } = render(<VideoEditorModal file={file} onCancel={vi.fn()} onSave={vi.fn()} />)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    rerender(<VideoEditorModal file={file} previewUrl="https://res.cloudinary.com/test/video/upload/normalized.mp4" onCancel={vi.fn()} onSave={vi.fn()} />)
    const video = container.querySelector('video')
    expect(video.getAttribute('src')).toBe('https://res.cloudinary.com/test/video/upload/normalized.mp4')
    expect(video.getAttribute('preload')).toBe('metadata')
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    Object.defineProperty(video, 'duration', { configurable: true, value: 12.5 })
    fireEvent.loadedMetadata(video)
    expect(screen.getByText('משך סופי: 0:12')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'סיום' }).disabled).toBe(false)
  })

  it('resets trim, audio, ratio, and visual adjustments', () => {
    loadVideo()
    fireEvent.click(screen.getByRole('button', { name: 'בהירות' }))
    fireEvent.change(screen.getByRole('slider', { name: 'בהירות' }), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: 'יחס' }))
    fireEvent.click(screen.getByRole('button', { name: '9:16' }))
    fireEvent.click(screen.getByRole('button', { name: 'שמע' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'השתקת השמע המקורי' }))
    fireEvent.click(screen.getByRole('button', { name: 'איפוס כל העריכות' }))
    fireEvent.click(screen.getByRole('button', { name: 'בהירות' }))
    expect(screen.getByRole('slider', { name: 'בהירות' }).value).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: 'יחס' }))
    expect(screen.getByRole('button', { name: 'מקורי' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'שמע' }))
    expect(screen.getByRole('checkbox', { name: 'השתקת השמע המקורי' }).checked).toBe(false)
  })
})
