import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import MediaPreview from './MediaPreview.jsx'

describe('MediaPreview video playback', () => {
  afterEach(cleanup)

  it('renders a CLIENT-visible HTTPS video with controls, inline playback, and poster', () => {
    const { container } = render(<MediaPreview
      path="https://res.cloudinary.com/demo/video/upload/client-video.mp4"
      type="VIDEO"
      poster="https://res.cloudinary.com/demo/image/upload/client-cover.jpg"
    />)
    const video = container.querySelector('video')
    expect(video).toBeTruthy()
    expect(video.getAttribute('src')).toContain('client-video.mp4')
    expect(video.getAttribute('poster')).toContain('client-cover.jpg')
    expect(video.controls).toBe(true)
    expect(video.playsInline).toBe(true)
  })

  it('stops covering controls as soon as video metadata is available', () => {
    const { container } = render(<MediaPreview path="https://cdn.example/video.mp4" type="VIDEO" />)
    const video = container.querySelector('video')
    expect(screen.getByRole('status', { name: 'טוען מדיה' })).toBeTruthy()
    fireEvent.loadedMetadata(video)
    expect(screen.queryByRole('status', { name: 'טוען מדיה' })).toBeNull()
  })

  it('shows a safe video-specific fallback for an invalid URL', () => {
    const { container } = render(<MediaPreview path="https://cdn.example/missing.mp4" type="VIDEO" />)
    fireEvent.error(container.querySelector('video'))
    expect(screen.getByText('לא ניתן לטעון את הווידאו')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'פתיחת הקובץ' }).getAttribute('href')).toContain('missing.mp4')
  })
})
