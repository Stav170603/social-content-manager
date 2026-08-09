import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import CreationModal from './CreationModal.jsx'

function ModalHarness({ kind = 'content', onSubmit = vi.fn() }) {
  const [open, setOpen] = useState(false)
  const isContent = kind === 'content'
  const title = isContent ? 'יצירת תוכן' : 'יצירת לקוח'
  return <>
    <button type="button" onClick={() => setOpen(true)}>{`${title} חדש`}</button>
    <CreationModal
      open={open}
      titleId={`${kind}-dialog-title`}
      closeLabel={`סגירת ${title}`}
      onClose={() => setOpen(false)}
    >
      <form className="entity-form" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
        <h3 id={`${kind}-dialog-title`}>{title}</h3>
        <label>שם<input aria-label={`שם ${kind}`} /></label>
        <button type="submit">שמירה</button>
      </form>
    </CreationModal>
  </>
}

describe('CreationModal', () => {
  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
  })

  it.each([
    ['content', 'יצירת תוכן חדש', 'יצירת תוכן'],
    ['client', 'יצירת לקוח חדש', 'יצירת לקוח'],
  ])('opens the %s form in the shared viewport overlay', async (kind, buttonLabel, title) => {
    render(<ModalHarness kind={kind} />)
    fireEvent.click(screen.getByRole('button', { name: buttonLabel }))

    const dialog = screen.getByRole('dialog', { name: title })
    expect(dialog.closest('.creation-modal-overlay')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(dialog))
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
  })

  it('closes with Escape, restores scrolling, and returns focus to the opener', async () => {
    render(<ModalHarness />)
    const opener = screen.getByRole('button', { name: 'יצירת תוכן חדש' })
    opener.focus()
    fireEvent.click(opener)
    await screen.findByRole('dialog')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(opener))
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('keeps existing form submission behavior', () => {
    const onSubmit = vi.fn()
    render(<ModalHarness onSubmit={onSubmit} />)
    fireEvent.click(screen.getByRole('button', { name: 'יצירת תוכן חדש' }))
    fireEvent.click(screen.getByRole('button', { name: 'שמירה' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('uses fixed viewport positioning and internal form scrolling', () => {
    const css = readFileSync('src/App.css', 'utf8')
    expect(css).toMatch(/\.creation-modal-overlay\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/)
    expect(css).toMatch(/\.creation-modal-dialog\s*>\s*\.entity-form\s*\{[\s\S]*?overflow-y:\s*auto;/)
    expect(css).toContain('max-height: calc(100dvh')
  })

  it('contains the mobile dialog width and safe-area rules without horizontal scrolling', () => {
    const css = readFileSync('src/App.css', 'utf8')
    expect(css).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.creation-modal-dialog\s*\{[\s\S]*?width:\s*calc\(100vw - 24px\);[\s\S]*?overflow-x:\s*hidden;/)
    expect(css).toMatch(/\.content-creation-form\s*\{[\s\S]*?overflow-x:\s*hidden;/)
    expect(css).toContain('env(safe-area-inset-bottom)')
    expect(css).toMatch(/\.content-creation-form \.carousel-file-name\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/)
    expect(css).toMatch(/\.content-creation-form \.carousel-file-row\s*\{[\s\S]*?grid-template-columns:\s*64px minmax\(0, 1fr\);/)
  })
})
