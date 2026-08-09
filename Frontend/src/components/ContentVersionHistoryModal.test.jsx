import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ContentVersionHistoryModal from './ContentVersionHistoryModal.jsx'
import { getContentVersions } from '../api/contentVersions.js'

vi.mock('../api/contentVersions.js', () => ({
  getContentVersions: vi.fn(),
  restoreContentVersion: vi.fn(),
}))

describe('ContentVersionHistoryModal', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const content = { content_id: 42, title: 'תוכן לבדיקה', status: 'DRAFT' }

  it('shows the no-history state when the content has never had a real edit', async () => {
    getContentVersions.mockResolvedValue([])

    render(<ContentVersionHistoryModal content={content} role="ADMIN" onClose={vi.fn()} />)

    expect(await screen.findByText('אין גרסאות קודמות לתוכן זה')).toBeTruthy()
    expect(screen.queryByText(/גרסה 1/)).toBeNull()
  })

  it('shows a real historical version returned after an edit', async () => {
    getContentVersions.mockResolvedValue([{
      contentVersionId: 7,
      versionNumber: 1,
      title: 'הכותרת הקודמת',
      description: 'התיאור הקודם',
      contentType: 'TEXT',
      status: 'DRAFT',
      changeType: 'EDITED',
      changedAt: '2026-08-09T10:00:00',
      changedByUserId: 1,
    }])

    render(<ContentVersionHistoryModal content={content} role="ADMIN" onClose={vi.fn()} />)

    expect(await screen.findByText('גרסה 1')).toBeTruthy()
    expect(screen.getByText('הכותרת הקודמת')).toBeTruthy()
    expect(screen.queryByText('אין גרסאות קודמות לתוכן זה')).toBeNull()
  })
})
