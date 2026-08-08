import { describe, expect, it } from 'vitest'
import { appendVideoEdits, formatVideoDuration, getVideoEligibility, normalizeSelectedMediaFile, validateTrimRange } from './videoEditor.js'

describe('video editor utilities', () => {
  it('validates trim ranges and formats final duration', () => {
    expect(validateTrimRange(2, 8, 10)).toBe('')
    expect(validateTrimRange(8, 2, 10)).toContain('טווח')
    expect(validateTrimRange(0, 11, 10)).toContain('טווח')
    expect(formatVideoDuration(65.8)).toBe('1:05')
  })

  it('recognizes MP4 and QuickTime by MIME or mobile filename and rejects unsupported formats', () => {
    expect(getVideoEligibility(new File(['x'], 'clip.mp4', { type: 'video/mp4' })).eligible).toBe(true)
    expect(getVideoEligibility(new File(['x'], 'camera.MOV', { type: '' }))).toEqual(expect.objectContaining({ eligible: true, detectedMime: 'video/quicktime', extension: 'mov' }))
    expect(normalizeSelectedMediaFile(new File(['x'], 'camera.MOV', { type: '' })).type).toBe('video/quicktime')
    expect(getVideoEligibility(new File(['x'], 'clip.avi', { type: '' })).eligible).toBe(false)
  })

  it('appends indexed edits and covers without changing media order', () => {
    const image = new File(['image'], 'first.jpg', { type: 'image/jpeg' })
    const video = new File(['video'], 'second.mp4', { type: 'video/mp4' })
    const last = new File(['image'], 'third.png', { type: 'image/png' })
    const cover = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' })
    const form = new FormData()
    appendVideoEdits(form, [image, video, last], new Map([[video, { edit: { start: 2, end: 8, muted: true }, coverFile: cover }]]))
    expect(JSON.parse(form.get('videoEditsJson'))).toEqual([{ index: 1, start: 2, end: 8, muted: true }])
    expect(form.get('coverMediaIndexes')).toBe('1')
    expect(form.get('coverFiles').name).toBe('cover.jpg')
  })
})
