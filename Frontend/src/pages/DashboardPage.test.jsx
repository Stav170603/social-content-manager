import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import DashboardPage from './DashboardPage.jsx'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('../components/PageShell.jsx', () => ({ default: ({ children }) => <main>{children}</main> }))
vi.mock('../components/SelectedMediaPreview.jsx', () => ({ default: ({ file }) => <span data-testid="selected-preview">{file.name}</span> }))
vi.mock('../components/ImageEditorModal.jsx', () => ({ default: ({ file, onCancel, onSave }) => <section role="dialog" aria-label="mock-image-editor">
  <span>{file.name}</span>
  <button type="button" onClick={onCancel}>ביטול עריכה</button>
  <button type="button" onClick={() => onSave(new File(['edited'], `edited-${file.name}`, { type: file.type }))}>שמירת עריכה</button>
</section> }))
vi.mock('../components/VideoEditorModal.jsx', () => ({ default: ({ file, onCancel, onSave, onDecodeFailure, normalizing, externalError }) => <section role="dialog" aria-label="mock-video-editor">
  <span>{file.name}</span>
  {normalizing && <span role="status">normalizing-video</span>}
  {externalError && <span>{externalError}</span>}
  {onDecodeFailure && <button type="button" onClick={onDecodeFailure}>simulate-decode-failure</button>}
  <button type="button" onClick={onCancel}>ביטול עריכת וידאו</button>
  <button type="button" onClick={() => onSave({ edit: { start: 1, end: 5, muted: true }, coverFile: new File(['cover'], 'cover.jpg', { type: 'image/jpeg' }) })}>שמירת עריכת וידאו</button>
</section> }))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function mockDashboardData({ role = 'ADMIN', clients = [], contents = [], comments = [] } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/users/me') return Promise.resolve({ data: { role, id: 1, clientId: role === 'CLIENT' ? 1 : null } })
    if (url === '/clients') return Promise.resolve({ data: clients })
    if (url === '/contents') return Promise.resolve({ data: contents })
    if (url === '/comments') return Promise.resolve({ data: comments })
    return Promise.resolve({ data: [] })
  })
}

describe('Clients Management cards', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('keeps client details without rendering an initial avatar', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/users/me') return Promise.resolve({ data: { role: 'ADMIN', id: 1 } })
      if (url === '/clients') return Promise.resolve({ data: [{ client_id: 7, business_name: 'Otzar social', phone: '050-1234567', user_id: 2 }] })
      if (url === '/users') return Promise.resolve({ data: [{ user_id: 2, full_name: 'Otzar Client' }] })
      if (url === '/users/social-managers') return Promise.resolve({ data: [] })
      return Promise.resolve({ data: [] })
    })

    const { container } = render(
      <MemoryRouter>
        <DashboardPage activeRoute="clients" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Otzar social')).toBeTruthy()
    expect(screen.getByText(/050-1234567/)).toBeTruthy()
    expect(container.querySelector('#clients-title')?.closest('.management-section')?.querySelector('.entity-mark')).toBeNull()
  })
})

describe('Clients Management content filtering navigation', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })

  const clients = [
    { client_id: 1, business_name: 'Client A' },
    { client_id: 2, business_name: 'Client B' },
  ]
  const contents = [
    { contentId: 101, clientId: 1, title: 'Only A', status: 'DRAFT' },
    { contentId: 202, clientId: 2, title: 'Only B', status: 'DRAFT' },
  ]

  function renderDashboard(activeRoute, initialEntry) {
    return render(<MemoryRouter initialEntries={[initialEntry]}>
      <DashboardPage activeRoute={activeRoute} routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>)
  }

  it('navigates Client A and Client B with their stable clientId', async () => {
    mockDashboardData({ clients, contents })
    renderDashboard('clients', '/clients')

    const cardA = (await screen.findByText('Client A')).closest('article')
    const cardB = screen.getByText('Client B').closest('article')
    fireEvent.click(within(cardA).getAllByRole('button')[1])
    expect(screen.getByTestId('location').textContent).toBe('/content?clientId=1')
    fireEvent.click(within(cardB).getAllByRole('button')[1])
    expect(screen.getByTestId('location').textContent).toBe('/content?clientId=2')
  })

  it('restores the query filter on refresh and shows only Client B content', async () => {
    mockDashboardData({ clients, contents })
    const { container } = renderDashboard('content', '/content?clientId=2')

    await waitFor(() => expect(container.querySelector('select[name="clientId"]').value).toBe('2'))
    expect(screen.getByText('Only B')).toBeTruthy()
    expect(screen.queryByText('Only A')).toBeNull()
  })

  it('shows no unrelated content for an invalid clientId and clears stale selection when absent', async () => {
    mockDashboardData({ clients, contents })
    const { unmount } = renderDashboard('content', '/content?clientId=999')
    await screen.findByText(/לא ניתן לסנן לפי הלקוח המבוקש/)
    expect(screen.queryByText('Only A')).toBeNull()
    expect(screen.queryByText('Only B')).toBeNull()
    unmount()

    mockDashboardData({ clients, contents })
    renderDashboard('content', '/content')
    expect(await screen.findByText('Only A')).toBeTruthy()
    expect(screen.getByText('Only B')).toBeTruthy()
  })

  it('does not navigate when edit or delete actions are used', async () => {
    mockDashboardData({ clients, contents })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderDashboard('clients', '/clients')

    const actions = within((await screen.findByText('Client A')).closest('article')).getAllByRole('button')
    fireEvent.click(actions[2])
    expect(screen.getByTestId('location').textContent).toBe('/clients')
    fireEvent.click(actions[0])
    expect(screen.getByTestId('location').textContent).toBe('/clients')
  })

  it('keeps CLIENT backend scoping and ignores a clientId query override', async () => {
    mockDashboardData({ role: 'CLIENT', clients: [clients[0]], contents: [contents[0]] })
    const { container } = renderDashboard('content', '/content?clientId=2')

    expect(await screen.findByText('Only A')).toBeTruthy()
    expect(screen.queryByText('Only B')).toBeNull()
    expect(container.querySelector('select[name="clientId"]')).toBeNull()
  })

  it('keeps existing manual client filtering behavior', async () => {
    mockDashboardData({ clients, contents })
    const { container } = renderDashboard('content', '/content')
    await screen.findByText('Only A')

    fireEvent.change(container.querySelector('select[name="clientId"]'), { target: { name: 'clientId', value: '1' } })
    expect(screen.getByText('Only A')).toBeTruthy()
    expect(screen.queryByText('Only B')).toBeNull()
  })
})

describe('Client archive management', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  const activeClient = { client_id: 1, user_id: 10, business_name: 'Active Client', phone: '0501111111', archived: false }
  const archivedClient = { client_id: 2, user_id: 20, business_name: 'Archived Client', phone: '0502222222', instagramUsername: 'archived.social', archived: true }

  function mockArchiveApi() {
    let active = [activeClient]
    let archived = [archivedClient]
    api.get.mockImplementation((url) => {
      if (url === '/users/me') return Promise.resolve({ data: { role: 'ADMIN', id: 1 } })
      if (url === '/clients') return Promise.resolve({ data: active })
      if (url === '/clients/archived') return Promise.resolve({ data: archived })
      if (url === '/clients/1/content-count') return Promise.resolve({ data: { count: 1 } })
      if (url === '/contents') return Promise.resolve({ data: [
        { contentId: 101, clientId: 1, title: 'Active history', status: 'DRAFT' },
        { contentId: 202, clientId: 2, title: 'Archived history', status: 'PUBLISHED' },
      ] })
      return Promise.resolve({ data: [] })
    })
    api.put.mockImplementation((url) => {
      if (url === '/clients/1/archive') {
        active = []
        archived = [...archived, { ...activeClient, archived: true }]
      }
      if (url === '/clients/1/restore') {
        active = [activeClient]
        archived = archived.filter((client) => client.client_id !== 1)
      }
      return Promise.resolve({ data: {} })
    })
  }

  function renderClients() {
    return render(<MemoryRouter initialEntries={['/clients']}>
      <DashboardPage activeRoute="clients" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>)
  }

  it('separates active and archived lists and opens archived historical content', async () => {
    mockArchiveApi()
    renderClients()

    expect(await screen.findByText('Active Client')).toBeTruthy()
    expect(screen.queryByText('Archived Client')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'ארכיון' }))
    expect(await screen.findByText('Archived Client')).toBeTruthy()
    expect(screen.queryByText('Active Client')).toBeNull()
    expect(screen.getByText('בארכיון')).toBeTruthy()
    expect(screen.getByText('@archived.social')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'צפייה בתכנים' }))
    expect(screen.getByTestId('location').textContent).toBe('/content?clientId=2')
  })

  it('shows archive confirmation for a client with content, archives it, and restores it', async () => {
    mockArchiveApi()
    renderClients()
    const card = (await screen.findByText('Active Client')).closest('article')
    fireEvent.click(within(card).getByRole('button', { name: 'מחיקה' }))

    expect(await screen.findByRole('dialog', { name: 'העברת לקוח לארכיון' })).toBeTruthy()
    expect(screen.getByText(/לא ניתן למחוק אותו לצמיתות/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'העבר לארכיון' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/clients/1/archive'))
    expect(screen.queryByText('Active Client')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'ארכיון' }))
    const archivedCard = (await screen.findByText('Active Client')).closest('article')
    fireEvent.click(within(archivedCard).getByRole('button', { name: 'שחזור לקוח' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/clients/1/restore'))
    expect(screen.queryByText('Active Client')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'לקוחות פעילים' }))
    expect(await screen.findByText('Active Client')).toBeTruthy()
  })

  it('keeps archived clients out of the new-content client selector', async () => {
    mockArchiveApi()
    const { container } = render(<MemoryRouter initialEntries={['/content']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)
    await screen.findByText('Active history')
    fireEvent.click(screen.getAllByRole('button', { name: 'יצירת תוכן חדש' })[0])

    const createForm = container.querySelector('.creation-modal-dialog form')
    const clientSelector = createForm.querySelector('select[name="clientId"]')
    expect(within(clientSelector).getByText('Active Client')).toBeTruthy()
    expect(within(clientSelector).queryByText('Archived Client')).toBeNull()
  })
})

describe('Client form validation and Instagram username', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  function renderClientForm(client = { client_id: 1, business_name: 'Form Client', phone: '0501234567', instagramUsername: 'form.social' }) {
    api.get.mockImplementation((url) => {
      if (url === '/users/me') return Promise.resolve({ data: { role: 'ADMIN', id: 1 } })
      if (url === '/clients') return Promise.resolve({ data: [client] })
      return Promise.resolve({ data: [] })
    })
    api.post.mockResolvedValue({ data: {} })
    return render(<MemoryRouter initialEntries={['/clients']}>
      <DashboardPage activeRoute="clients" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)
  }

  it('renders Instagram in display/edit and omits the line when missing', async () => {
    const { unmount } = renderClientForm()
    expect(await screen.findByText('@form.social')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'עריכה' }))
    expect(screen.getByDisplayValue('form.social')).toBeTruthy()
    unmount()

    renderClientForm({ client_id: 2, business_name: 'No Instagram', phone: '0507654321' })
    await screen.findByText('No Instagram')
    expect(document.querySelector('.instagram-username')).toBeNull()
  })

  it('shows clear validation messages and does not submit invalid fields', async () => {
    const { container } = renderClientForm()
    await screen.findByText('Form Client')
    fireEvent.click(screen.getByRole('button', { name: 'יצירת לקוח חדש' }))
    const form = container.querySelector('.creation-modal-dialog form')
    for (const [name, value] of Object.entries({
      businessName: 'New Client', email: 'new@example.com', username: 'new-user', password: 'password',
      phone: '05ABC', instagramUsername: 'bad username',
    })) fireEvent.change(form.elements[name], { target: { name, value } })
    fireEvent.submit(form)

    expect(screen.getByText('יש להזין מספר טלפון ישראלי תקין')).toBeTruthy()
    expect(screen.getByText('יש להזין שם משתמש Instagram תקין')).toBeTruthy()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('submits normalized phone and optional Instagram username', async () => {
    const { container } = renderClientForm()
    await screen.findByText('Form Client')
    fireEvent.click(screen.getByRole('button', { name: 'יצירת לקוח חדש' }))
    const form = container.querySelector('.creation-modal-dialog form')
    for (const [name, value] of Object.entries({
      businessName: 'New Client', email: 'new@example.com', username: 'new-user', password: 'password',
      phone: '+972 50-123-4567', instagramUsername: '@new.social',
    })) fireEvent.change(form.elements[name], { target: { name, value } })
    fireEvent.submit(form)

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/clients', expect.objectContaining({
      phone: '0501234567', instagramUsername: 'new.social',
    })))
  })
})

describe('Content image editor upload integration', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('replaces only the selected image, preserves carousel order, and uploads the edited File', async () => {
    const client = { client_id: 1, business_name: 'Media Client' }
    mockDashboardData({ clients: [client], contents: [] })
    api.post.mockResolvedValue({ data: {} })
    const { container } = render(<MemoryRouter initialEntries={['/content']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/clients'))
    fireEvent.click(screen.getAllByRole('button', { name: 'יצירת תוכן חדש' })[0])
    const form = container.querySelector('.creation-modal-dialog form')
    fireEvent.change(form.elements.clientId, { target: { name: 'clientId', value: '1' } })
    fireEvent.change(form.elements.title, { target: { name: 'title', value: 'Edited carousel' } })
    fireEvent.change(form.elements.media_mode, { target: { name: 'media_mode', value: 'MIXED' } })
    const firstImage = new File(['first'], 'first.jpg', { type: 'image/jpeg' })
    const video = new File(['video'], 'middle.mp4', { type: 'video/mp4' })
    const lastImage = new File(['last'], 'last.png', { type: 'image/png' })
    fireEvent.change(form.elements.files, { target: { name: 'files', files: [firstImage, video, lastImage] } })

    const editButtons = screen.getAllByRole('button', { name: 'עריכת תמונה' })
    expect(editButtons).toHaveLength(2)
    fireEvent.click(editButtons[1])
    expect(screen.getByRole('dialog', { name: 'mock-image-editor' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'שמירת עריכה' }))
    fireEvent.submit(form)

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const upload = api.post.mock.calls.find(([url]) => url === '/contents')[1]
    expect(upload.getAll('files').map((file) => file.name)).toEqual([
      'first.jpg', 'middle.mp4', 'edited-last.png',
    ])
  })

  it('offers editing for replacement images but not replacement videos', async () => {
    const content = { contentId: 10, clientId: 1, title: 'Existing content', status: 'DRAFT', content_type: 'IMAGE' }
    mockDashboardData({ clients: [{ client_id: 1, business_name: 'Media Client' }], contents: [content] })
    const { container } = render(<MemoryRouter initialEntries={['/content']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)
    const card = (await screen.findByText('Existing content')).closest('article')
    fireEvent.click(within(card).getByRole('button', { name: 'עריכה' }))
    const replacementInput = container.querySelector('.replace-media-field input[type="file"]')
    fireEvent.change(replacementInput, { target: { files: [
      new File(['image'], 'replacement.webp', { type: 'image/webp' }),
      new File(['video'], 'replacement.mp4', { type: 'video/mp4' }),
    ] } })
    expect(within(card).getAllByRole('button', { name: 'עריכת תמונה' })).toHaveLength(1)
  })
})

describe('Content video editor upload integration', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('keeps mixed carousel order and submits indexed trim, mute, and cover metadata', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably')
    mockDashboardData({ clients: [{ client_id: 1, business_name: 'Media Client' }], contents: [] })
    api.post.mockResolvedValue({ data: {} })
    const { container } = render(<MemoryRouter initialEntries={['/content']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/clients'))
    fireEvent.click(screen.getAllByRole('button', { name: 'יצירת תוכן חדש' })[0])
    const form = container.querySelector('.creation-modal-dialog form')
    fireEvent.change(form.elements.clientId, { target: { name: 'clientId', value: '1' } })
    fireEvent.change(form.elements.title, { target: { name: 'title', value: 'Edited video carousel' } })
    fireEvent.change(form.elements.media_mode, { target: { name: 'media_mode', value: 'MIXED' } })
    const image = new File(['image'], 'first.jpg', { type: 'image/jpeg' })
    const video = new File(['video'], 'second.mp4', { type: 'video/mp4' })
    fireEvent.change(form.elements.files, { target: { name: 'files', files: [image, video] } })
    expect(form.classList.contains('content-creation-form')).toBe(true)
    expect(container.querySelectorAll('.carousel-file-row')).toHaveLength(2)
    expect(container.querySelectorAll('.carousel-file-name')).toHaveLength(2)
    expect(container.querySelectorAll('.carousel-file-actions')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'עריכת וידאו' }))
    fireEvent.click(screen.getByRole('button', { name: 'שמירת עריכת וידאו' }))
    fireEvent.submit(form)

    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const upload = api.post.mock.calls.find(([url]) => url === '/contents')[1]
    expect(upload.getAll('files').map((file) => file.name)).toEqual(['first.jpg', 'second.mp4'])
    expect(JSON.parse(upload.get('videoEditsJson'))).toEqual([{ index: 1, start: 1, end: 5, muted: true }])
    expect(upload.get('coverMediaIndexes')).toBe('1')
    expect(upload.get('coverFiles').name).toBe('cover.jpg')
  })

  it('normalizes an unsupported phone video, replaces only that file, and cleans up the temporary asset', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('')
    mockDashboardData({ clients: [{ client_id: 1, business_name: 'Media Client' }], contents: [] })
    api.post.mockImplementation((url) => url === '/contents/normalize-video'
      ? Promise.resolve({ data: { url: 'https://res.cloudinary.com/test/video/upload/normalized.mp4', publicId: 'sscm-temporary/phone-video' } })
      : Promise.resolve({ data: {} }))
    api.delete.mockResolvedValue({ data: {} })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['normalized'], { type: 'video/mp4' })) }))

    const { container } = render(<MemoryRouter initialEntries={['/content']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/clients'))
    fireEvent.click(screen.getAllByRole('button', { name: 'יצירת תוכן חדש' })[0])
    const form = container.querySelector('.creation-modal-dialog form')
    fireEvent.change(form.elements.media_mode, { target: { name: 'media_mode', value: 'MIXED' } })
    const image = new File(['image'], 'first.jpg', { type: 'image/jpeg' })
    const video = new File(['phone-video'], 'phone.mov', { type: 'video/quicktime' })
    fireEvent.change(form.elements.files, { target: { name: 'files', files: [image, video] } })
    fireEvent.click(screen.getByRole('button', { name: 'עריכת וידאו' }))

    await waitFor(() => expect(screen.getAllByText('phone-normalized.mp4')).toHaveLength(2))
    expect(screen.getAllByTestId('selected-preview').map((node) => node.textContent)).toEqual(['first.jpg', 'phone-normalized.mp4'])
    const normalizationCall = api.post.mock.calls.find(([url]) => url === '/contents/normalize-video')
    expect(normalizationCall[1].get('file')).toBe(video)
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/contents/normalize-video', { params: { publicId: 'sscm-temporary/phone-video' } }))
  })

  it('does not clean up the temporary asset before the normalized browser download completes', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('')
    mockDashboardData({ clients: [{ client_id: 1, business_name: 'Media Client' }], contents: [] })
    api.post.mockImplementation((url) => url === '/contents/normalize-video'
      ? Promise.resolve({ data: { url: 'https://res.cloudinary.com/test/video/upload/normalized.mp4', publicId: 'sscm-temporary/pending' } })
      : Promise.resolve({ data: {} }))
    api.delete.mockResolvedValue({ data: {} })
    let finishDownload
    const pendingBlob = new Promise((resolve) => { finishDownload = resolve })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: () => pendingBlob }))

    const { container } = render(<MemoryRouter initialEntries={['/content']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/clients'))
    fireEvent.click(screen.getAllByRole('button', { name: 'יצירת תוכן חדש' })[0])
    const form = container.querySelector('.creation-modal-dialog form')
    fireEvent.change(form.elements.media_mode, { target: { name: 'media_mode', value: 'VIDEO' } })
    fireEvent.change(form.elements.files, { target: { name: 'files', files: [new File(['video'], 'phone.mov', { type: 'video/quicktime' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'עריכת וידאו' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(api.delete).not.toHaveBeenCalled()

    finishDownload(new Blob(['normalized'], { type: 'video/mp4' }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/contents/normalize-video', { params: { publicId: 'sscm-temporary/pending' } }))
  })

  it('shows a safe error and does not substitute another file when normalization fails', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('')
    mockDashboardData({ clients: [{ client_id: 1, business_name: 'Media Client' }], contents: [] })
    api.post.mockRejectedValue(new Error('normalization failed'))

    const { container } = render(<MemoryRouter initialEntries={['/content']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/clients'))
    fireEvent.click(screen.getAllByRole('button', { name: 'יצירת תוכן חדש' })[0])
    const form = container.querySelector('.creation-modal-dialog form')
    fireEvent.change(form.elements.media_mode, { target: { name: 'media_mode', value: 'VIDEO' } })
    const video = new File(['phone-video'], 'phone.mov', { type: 'video/quicktime' })
    fireEvent.change(form.elements.files, { target: { name: 'files', files: [video] } })
    fireEvent.click(screen.getByRole('button', { name: 'עריכת וידאו' }))

    expect(await screen.findByText('לא הצלחנו להכין את הסרטון לעריכה. נסו סרטון אחר.')).toBeTruthy()
    expect(screen.getByTestId('selected-preview').textContent).toBe('phone.mov')
  })
})

describe('CLIENT recent content navigation', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  const clientContents = [
    { contentId: 301, clientId: 1, title: 'Recent A', status: 'APPROVED' },
    { content_id: 302, client_id: 1, title: 'Recent B', status: 'DRAFT' },
  ]

  it('navigates Content A and Content B by exact stable ID without stale selection', async () => {
    mockDashboardData({ role: 'CLIENT', contents: clientContents })
    render(<MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage activeRoute="dashboard" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>)

    fireEvent.click(await screen.findByRole('button', { name: 'פתיחת התוכן Recent A' }))
    expect(screen.getByTestId('location').textContent).toBe('/content/301?highlightId=301')
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת התוכן Recent B' }))
    expect(screen.getByTestId('location').textContent).toBe('/content/302?highlightId=302')
  })

  it('opens only the requested content on the destination page', async () => {
    mockDashboardData({ role: 'CLIENT', contents: clientContents })
    render(<MemoryRouter initialEntries={['/content/302?highlightId=302']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)

    expect(await screen.findByText('Recent B')).toBeTruthy()
    expect(screen.queryByText('Recent A')).toBeNull()
  })

  it('supports keyboard activation through the semantic recent-content button', async () => {
    const user = userEvent.setup()
    mockDashboardData({ role: 'CLIENT', contents: clientContents.slice(0, 1) })
    render(<MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage activeRoute="dashboard" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>)

    const recentButton = await screen.findByRole('button', { name: 'פתיחת התוכן Recent A' })
    recentButton.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location').textContent).toBe('/content/301?highlightId=301')
  })

  it('does not expose another client content through a manually changed ID', async () => {
    mockDashboardData({ role: 'CLIENT', contents: clientContents.slice(0, 1) })
    render(<MemoryRouter initialEntries={['/content/999?highlightId=999']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)

    await screen.findByText(/לא ניתן לפתוח את התוכן המבוקש/)
    expect(screen.queryByText('Recent A')).toBeNull()
  })
})

describe('Activity Center comment navigation', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  const contentA = { contentId: 101, clientId: 1, title: 'Content A', status: 'DRAFT' }
  const contentB = { contentId: 202, clientId: 2, title: 'Content B', status: 'DRAFT' }
  const commentA = { commentId: 11, contentId: 101, userId: 1, commentText: 'Comment A' }
  const commentB = { commentId: 22, contentId: 202, userId: 1, commentText: 'Comment B' }

  function renderMessages(initialEntries = ['/messages']) {
    return render(<MemoryRouter initialEntries={initialEntries}>
      <DashboardPage activeRoute="messages" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
      <LocationProbe />
    </MemoryRouter>)
  }

  it('opens content A and content B by exact ID without stale selection', async () => {
    mockDashboardData({ contents: [contentA, contentB], comments: [commentA, commentB] })
    renderMessages()

    const firstCard = (await screen.findByText('Comment A')).closest('article')
    fireEvent.click(firstCard)
    expect(screen.getByTestId('location').textContent).toBe('/content/101?highlightId=101')
    fireEvent.click(screen.getByText('Comment B').closest('article'))
    expect(screen.getByTestId('location').textContent).toBe('/content/202?highlightId=202')
  })

  it('supports keyboard activation for a comment card', async () => {
    mockDashboardData({ contents: [contentA], comments: [commentA] })
    renderMessages()

    const card = (await screen.findByText('Comment A')).closest('article')
    fireEvent.keyDown(card, { key: 'Enter' })
    expect(screen.getByTestId('location').textContent).toBe('/content/101?highlightId=101')
    fireEvent.keyDown(card, { key: ' ' })
    expect(screen.getByTestId('location').textContent).toBe('/content/101?highlightId=101')
  })

  it('does not link missing content or content outside a CLIENT scoped response', async () => {
    mockDashboardData({ role: 'CLIENT', contents: [contentA], comments: [
      commentA,
      { commentId: 99, contentId: 999, userId: 1, commentText: 'Foreign comment' },
    ] })
    renderMessages()

    expect((await screen.findByText('Comment A')).closest('article').getAttribute('role')).toBe('link')
    const foreignCard = screen.getByText('Foreign comment').closest('article')
    expect(foreignCard.getAttribute('role')).toBeNull()
    fireEvent.click(foreignCard)
    expect(screen.getByTestId('location').textContent).toBe('/messages')
  })

  it('shows a safe message instead of opening stale content when a deep-linked content is missing', async () => {
    mockDashboardData({ contents: [contentA], comments: [] })
    render(<MemoryRouter initialEntries={['/content/999?highlightId=999']}>
      <DashboardPage activeRoute="content" routes={{}} onNavigate={vi.fn()} isAuthenticated onLogout={vi.fn()} />
    </MemoryRouter>)

    expect(await screen.findByText('לא ניתן לפתוח את התוכן המבוקש. ייתכן שהוא נמחק או שאין לך הרשאה לצפות בו.')).toBeTruthy()
    expect(screen.queryByText('Content A')).toBeNull()
  })
})
