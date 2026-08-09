import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, MessageCircle, Users } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import PageShell from '../components/PageShell.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import ContentVersionHistoryModal from '../components/ContentVersionHistoryModal.jsx'
import CaptionGenerator from '../components/CaptionGenerator.jsx'
import PublishingRecommendation from '../components/PublishingRecommendation.jsx'
import { getActivity } from '../api/activity.js'
import api, { getApiErrorMessage } from '../services/api.js'
import EmptyState from '../components/EmptyState.jsx'
import Skeleton from '../components/Skeleton.jsx'
import InstagramPublishAction from '../components/InstagramPublishAction.jsx'
import CreationModal from '../components/CreationModal.jsx'
import ContentMediaCarousel from '../components/ContentMediaCarousel.jsx'
import SelectedMediaPreview from '../components/SelectedMediaPreview.jsx'
import ImageEditorModal from '../components/ImageEditorModal.jsx'
import VideoEditorModal from '../components/VideoEditorModal.jsx'
import { ActivityIcon, formatRelativeActivityTime, getActivityDesign } from '../components/activityDesign.js'
import { appendMediaFiles, legacyContentType, mediaAcceptForMode, MIXED_MEDIA_MODE, validateMediaSelection } from '../utils/contentMediaForm.js'
import { emptyContentFilters, filterContents } from '../utils/contentFilters.js'
import { normalizeInstagramUsername, normalizeIsraeliPhone, validateClientFields } from '../utils/clientFields.js'
import { isEditableImage } from '../utils/imageEditor.js'
import { appendVideoEdits, getVideoEligibility, normalizeSelectedMediaFile } from '../utils/videoEditor.js'

const statusOptions = [
  { value: 'DRAFT', label: 'טיוטה' },
  { value: 'WAITING_APPROVAL', label: 'ממתין לאישור' },
  { value: 'APPROVED', label: 'מאושר' },
  { value: 'REJECTED', label: 'נדחה' },
  { value: 'PUBLISHED', label: 'פורסם' },
]

const contentTypeOptions = [
  { value: 'IMAGE', label: 'תמונה' },
  { value: 'VIDEO', label: 'וידאו' },
  { value: 'REEL', label: 'ריל' },
  { value: 'TEXT', label: 'טקסט' },
]

const createContentTypeOptions = [
  ...contentTypeOptions.slice(0, 2),
  { value: MIXED_MEDIA_MODE, label: 'תמונה + סרטון' },
  ...contentTypeOptions.slice(2),
]

const emptyClientForm = {
  businessName: '',
  fullName: '',
  email: '',
  username: '',
  password: '',
  phone: '',
  instagramUsername: '',
  adminId: 1,
}

const emptyContentForm = {
  clientId: '',
  title: '',
  description: '',
  file: null,
  files: [],
  content_type: 'IMAGE',
  media_mode: 'IMAGE',
  status: 'DRAFT',
  plannedPublishDate: '',
}

const emptyCommentForm = {
  contentId: '',
  commentText: '',
}

const statusLabelByValue = statusOptions.reduce((labels, status) => {
  labels[status.value] = status.label
  return labels
}, {})

const typeLabelByValue = contentTypeOptions.reduce((labels, type) => {
  labels[type.value] = type.label
  return labels
}, {})

function toInputDateTime(value) {
  if (!value) {
    return ''
  }

  return value.slice(0, 16)
}

function getContentId(content) {
  return content.content_id ?? content.contentId
}

function sortContentsNewest(items = []) {
  return [...items].sort((first, second) => {
    const firstTime = Date.parse(first.createdAt || first.created_at || '')
    const secondTime = Date.parse(second.createdAt || second.created_at || '')
    if (Number.isFinite(firstTime) || Number.isFinite(secondTime)) {
      if (!Number.isFinite(firstTime)) return 1
      if (!Number.isFinite(secondTime)) return -1
      if (firstTime !== secondTime) return secondTime - firstTime
    }
    return Number(getContentId(second) || 0) - Number(getContentId(first) || 0)
  })
}

function getClientId(client) {
  return client.client_id ?? client.clientId
}

function getProfileInitials(profile) {
  const name = profile.fullName || profile.username || 'משתמש'
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return 'מ'
  }

  return parts.slice(0, 2).map((part) => part.charAt(0)).join('')
}

const routeByPanel = { contents: 'content', clients: 'clients', comments: 'messages' }
const sessionInstagramPublications = new Map()

function DashboardPage({ activeRoute, routes, onNavigate, isAuthenticated, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [profile, setProfile] = useState({
    id: '',
    clientId: '',
    fullName: '',
    username: '',
    email: '',
    role: '',
  })

  const [clients, setClients] = useState([])
  const [archivedClients, setArchivedClients] = useState([])
  const [users, setUsers] = useState([])
  const [socialManagers, setSocialManagers] = useState([])
  const [contents, setContents] = useState([])
  const [comments, setComments] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityUnavailable, setActivityUnavailable] = useState(false)

  const [clientForm, setClientForm] = useState(emptyClientForm)
  const [contentForm, setContentForm] = useState(emptyContentForm)
  const [commentForm, setCommentForm] = useState(emptyCommentForm)
  const [showCreateForm, setShowCreateForm] = useState({
    clients: false,
    contents: false,
  })

  const [clientSearch, setClientSearch] = useState('')
  const [clientValidation, setClientValidation] = useState({ phone: '', instagramUsername: '' })
  const [clientView, setClientView] = useState('active')
  const [commentSearch, setCommentSearch] = useState('')
  const [dashboardClientId, setDashboardClientId] = useState('')
  const [contentFilter, setContentFilter] = useState(() => ({
    ...emptyContentFilters,
    clientId: new URLSearchParams(location.search).has('clientId') ? '__pending__' : '',
  }))
  const [commentsContentId, setCommentsContentId] = useState('')
  const [filteredResults, setFilteredResults] = useState({
    clients: false,
    contents: false,
    comments: false,
  })
  const [resultsHidden, setResultsHidden] = useState({
    clients: false,
    contents: false,
    comments: false,
  })

  const [editingClientId, setEditingClientId] = useState(null)
  const [editingContentId, setEditingContentId] = useState(null)
  const [clientDraft, setClientDraft] = useState(null)
  const [contentDraft, setContentDraft] = useState(null)
  const [replacementMedia, setReplacementMedia] = useState([])
  const [imageEditor, setImageEditor] = useState(null)
  const [videoEditor, setVideoEditor] = useState(null)
  const [videoEdits, setVideoEdits] = useState(() => new Map())
  const videoNormalizationId = useRef(0)

  const [loading, setLoading] = useState({
    clients: true,
    contents: true,
    comments: true,
    profile: true,
  })
  const [saving, setSaving] = useState({
    client: false,
    content: false,
    comment: false,
  })
  const [errors, setErrors] = useState({
    clients: '',
    contents: '',
    comments: '',
    profile: '',
  })
  const [notice, setNotice] = useState('')
  const [rejectionDialog, setRejectionDialog] = useState({ contentId: null, reason: '' })
  const [archiveDialog, setArchiveDialog] = useState({ clientId: null, businessName: '' })
  const [archivingClient, setArchivingClient] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [historyContent, setHistoryContent] = useState(null)
  const [highlightedElementId, setHighlightedElementId] = useState('')
  const [instagramPublications, setInstagramPublications] = useState(
    () => Object.fromEntries(sessionInstagramPublications),
  )

  const clientById = useMemo(() => {
    return new Map([...clients, ...archivedClients].map((client) => [Number(getClientId(client)), client]))
  }, [archivedClients, clients])
  const userById = useMemo(() => new Map(users.map((user) => [Number(user.user_id), user])), [users])
  const managerByAdminId = useMemo(() => new Map(socialManagers.map((manager) => [Number(manager.adminId), manager])), [socialManagers])
  const visibleClients = useMemo(() => {
    const source = clientView === 'archived' ? archivedClients : clients
    const query = clientSearch.trim().toLocaleLowerCase('he-IL')
    if (!query) return source
    return source.filter((client) => {
      const customer = userById.get(Number(client.user_id))
      const clientContent = contents.filter((content) => Number(content.clientId ?? content.client_id) === Number(getClientId(client)))
      return [
        client.business_name,
        client.phone,
        client.instagramUsername,
        customer?.full_name,
        customer?.username,
        ...clientContent.flatMap((content) => [content.title, content.description]),
      ].some((value) => String(value || '').toLocaleLowerCase('he-IL').includes(query))
    })
  }, [archivedClients, clientSearch, clientView, clients, contents, userById])
  const visibleComments = useMemo(() => {
    const query = commentSearch.trim().toLocaleLowerCase('he-IL')
    if (!query) return comments
    return comments.filter((comment) => {
      const content = contents.find((item) => Number(getContentId(item)) === Number(comment.contentId))
      const client = clientById.get(Number(content?.clientId ?? content?.client_id))
      const user = userById.get(Number(comment.userId))
      return [client?.business_name, client?.phone, content?.title, comment.commentText,
        user?.full_name, user?.username]
        .some((value) => String(value || '').toLocaleLowerCase('he-IL').includes(query))
    })
  }, [commentSearch, comments, contents, clientById, userById])

  const dashboardContents = useMemo(() => {
    const selected = profile.role === 'CLIENT' ? profile.clientId : dashboardClientId
    return selected
      ? contents.filter((content) => Number(content.clientId ?? content.client_id) === Number(selected))
      : contents
  }, [contents, dashboardClientId, profile.clientId, profile.role])
  const waitingApprovalCount = useMemo(() => {
    return dashboardContents.filter((content) => content.status === 'WAITING_APPROVAL').length
  }, [dashboardContents])
  const statusCounts = useMemo(() => dashboardContents.reduce((counts, content) => {
    counts[content.status] = (counts[content.status] || 0) + 1
    return counts
  }, {}), [dashboardContents])
  const recentContents = useMemo(() => dashboardContents.slice(0, 3), [dashboardContents])
  const upcomingContents = useMemo(() => dashboardContents
    .filter((content) => content.plannedPublishDate && new Date(content.plannedPublishDate) >= new Date())
    .sort((a, b) => new Date(a.plannedPublishDate) - new Date(b.plannedPublishDate))
    .slice(0, 3), [dashboardContents])

  const isClient = profile.role === 'CLIENT'
  const isAdmin = profile.role === 'ADMIN'
  const visibleContents = useMemo(() => filterContents(contents, contentFilter, clientById), [contents, contentFilter, clientById])
  const requestedContentId = useMemo(() => {
    const match = location.pathname.match(/^\/content\/(\d+)\/?$/)
    return match ? Number(match[1]) : null
  }, [location.pathname])
  const displayedContents = useMemo(() => requestedContentId === null
    ? visibleContents
    : visibleContents.filter((content) => Number(getContentId(content)) === requestedContentId),
  [requestedContentId, visibleContents])
  function navigateToPanel(panel) {
    onNavigate(routeByPanel[panel])
  }

  const resetResultView = useCallback((section) => {
    setFilteredResults((current) => ({ ...current, [section]: false }))
    setResultsHidden((current) => ({ ...current, [section]: false }))
  }, [])

  const showFilteredResults = useCallback((section) => {
    setFilteredResults((current) => ({ ...current, [section]: true }))
    setResultsHidden((current) => ({ ...current, [section]: false }))
  }, [])

  function toggleResults(section) {
    setResultsHidden((current) => ({ ...current, [section]: !current[section] }))
  }

  function toggleCreateForm(section) {
    setShowCreateForm((current) => ({ ...current, [section]: !current[section] }))
  }

  const loadProfile = useCallback(async () => {
    await Promise.resolve()
    setLoading((current) => ({ ...current, profile: true }))
    setErrors((current) => ({ ...current, profile: '' }))

    try {
      const response = await api.get('/users/me', { suppressGlobalErrorToast: true })
      setProfile(response.data)
      return response.data
    } catch {
      setErrors((current) => ({
        ...current,
        profile: 'לא הצלחנו לטעון את פרטי המשתמש',
      }))
      return null
    } finally {
      setLoading((current) => ({ ...current, profile: false }))
    }
  }, [])

  const loadClients = useCallback(async () => {
    await Promise.resolve()
    resetResultView('clients')
    setLoading((current) => ({ ...current, clients: true }))
    setErrors((current) => ({ ...current, clients: '' }))

    try {
      const response = await api.get('/clients')
      setClients(response.data)
      return response.data
    } catch {
      setErrors((current) => ({
        ...current,
        clients: 'לא הצלחנו לטעון את הלקוחות',
      }))
      return []
    } finally {
      setLoading((current) => ({ ...current, clients: false }))
    }
  }, [resetResultView])

  const loadArchivedClients = useCallback(async () => {
    setLoading((current) => ({ ...current, clients: true }))
    setErrors((current) => ({ ...current, clients: '' }))
    try {
      const response = await api.get('/clients/archived')
      setArchivedClients(response.data)
      return response.data
    } catch {
      setErrors((current) => ({ ...current, clients: 'לא הצלחנו לטעון את ארכיון הלקוחות' }))
      return []
    } finally {
      setLoading((current) => ({ ...current, clients: false }))
    }
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      const [usersResponse, managersResponse] = await Promise.all([
        api.get('/users'),
        api.get('/users/social-managers'),
      ])
      setUsers(usersResponse.data)
      setSocialManagers(managersResponse.data)
    } catch {
      setUsers([])
      setSocialManagers([])
    }
  }, [])

  const loadContents = useCallback(async () => {
    await Promise.resolve()
    resetResultView('contents')
    setLoading((current) => ({ ...current, contents: true }))
    setErrors((current) => ({ ...current, contents: '' }))

    try {
      const response = await api.get('/contents')
      setContents(sortContentsNewest(response.data))
      return response.data
    } catch {
      setErrors((current) => ({
        ...current,
        contents: 'לא הצלחנו לטעון את התכנים',
      }))
      return []
    } finally {
      setLoading((current) => ({ ...current, contents: false }))
    }
  }, [resetResultView])

  const loadComments = useCallback(async () => {
    await Promise.resolve()
    resetResultView('comments')
    setLoading((current) => ({ ...current, comments: true }))
    setErrors((current) => ({ ...current, comments: '' }))

    try {
      const response = await api.get('/comments')
      setComments(response.data)
      return response.data
    } catch {
      setErrors((current) => ({
        ...current,
        comments: 'לא הצלחנו לטעון את התגובות',
      }))
      return []
    } finally {
      setLoading((current) => ({ ...current, comments: false }))
    }
  }, [resetResultView])

  useEffect(() => {
    let isMounted = true

    Promise.resolve().then(async () => {
      if (!isMounted) {
        return
      }

      const loadedProfile = await loadProfile()
      if (!isMounted || !loadedProfile) return
      await Promise.all([
        loadClients(),
        loadContents(),
        loadComments(),
        loadedProfile.role === 'ADMIN' ? loadUsers() : Promise.resolve(),
      ])
      if (loadedProfile.role !== 'ADMIN' && isMounted) {
        setUsers([])
        setSocialManagers([])
      }
    })

    return () => {
      isMounted = false
    }
  }, [loadClients, loadComments, loadContents, loadProfile, loadUsers])

  useEffect(() => {
    if (activeRoute !== 'dashboard') return
    const controller = new AbortController()
    Promise.resolve().then(async () => {
      setActivityLoading(true)
      setActivityUnavailable(false)
      try {
        setRecentActivity(await getActivity({ limit: 5, signal: controller.signal, suppressGlobalErrorToast: true }))
      } catch (requestError) {
        if (requestError?.code !== 'ERR_CANCELED') {
          setRecentActivity([])
          setActivityUnavailable(true)
        }
      } finally {
        setActivityLoading(false)
      }
    })
    return () => controller.abort()
  }, [activeRoute])

  useEffect(() => {
    if (isClient && activeRoute === 'clients') Promise.resolve().then(() => onNavigate('content'))
  }, [activeRoute, isClient, onNavigate])

  useEffect(() => {
    if (activeRoute !== 'content' || loading.profile || loading.clients) return

    if (isClient) {
      setContentFilter((current) => current.clientId ? { ...current, clientId: '' } : current)
      return
    }

    const requestedClientId = new URLSearchParams(location.search).get('clientId')
    if (!requestedClientId) {
      setContentFilter((current) => current.clientId ? { ...current, clientId: '' } : current)
      return
    }

    const requestedId = Number(requestedClientId)
    const authorizedClient = Number.isSafeInteger(requestedId) && requestedId > 0
      && [...clients, ...archivedClients].some((client) => Number(getClientId(client)) === requestedId)
    if (!authorizedClient) {
      setContentFilter((current) => current.clientId === '__invalid__'
        ? current
        : { ...current, clientId: '__invalid__' })
      setNotice('לא ניתן לסנן לפי הלקוח המבוקש. ייתכן שהוא אינו קיים או שאין לך הרשאה לצפות בו.')
      return
    }

    setContentFilter((current) => current.clientId === String(requestedId)
      ? current
      : { ...current, clientId: String(requestedId) })
  }, [activeRoute, archivedClients, clients, isClient, loading.clients, loading.profile, location.search])

  useEffect(() => {
    const contentMatch = location.pathname.match(/^\/content\/(\d+)\/?$/)
    if (!contentMatch) return undefined

    const params = new URLSearchParams(location.search)
    const highlightId = params.get('highlightId')
    const isCommentsTab = params.get('tab') === 'comments'
    if (loading.contents || (isCommentsTab && loading.comments)) return undefined

    const requestedContentId = Number(contentMatch[1])
    const requestedContent = contents.find((content) => Number(getContentId(content)) === requestedContentId)
    if (!requestedContent) {
      setHighlightedElementId('')
      setNotice('לא ניתן לפתוח את התוכן המבוקש. ייתכן שהוא נמחק או שאין לך הרשאה לצפות בו.')
      return undefined
    }

    if (isCommentsTab && highlightId && !comments.some((comment) => Number(comment.commentId) === Number(highlightId)
      && Number(comment.contentId) === requestedContentId)) {
      setHighlightedElementId('')
      setNotice('לא ניתן לפתוח את התגובה המבוקשת. ייתכן שהיא נמחקה או שאין לך הרשאה לצפות בה.')
      return undefined
    }

    if (isCommentsTab && !highlightId) return undefined
    const targetId = isCommentsTab
      ? `comment-${highlightId}`
      : `content-${highlightId || contentMatch[1]}`

    let frameId
    let highlightTimer
    let attempts = 0
    let cancelled = false

    const highlightWhenReady = () => {
      if (cancelled) return
      const target = document.getElementById(targetId)
      if (!target && attempts < 120) {
        attempts += 1
        frameId = window.requestAnimationFrame(highlightWhenReady)
        return
      }
      if (!target) return

      setHighlightedElementId(targetId)
      frameId = window.requestAnimationFrame(() => {
        if (cancelled) return
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        highlightTimer = window.setTimeout(() => {
          setHighlightedElementId((current) => current === targetId ? '' : current)
        }, 4500)
      })
    }

    frameId = window.requestAnimationFrame(highlightWhenReady)
    return () => {
      cancelled = true
      if (frameId) window.cancelAnimationFrame(frameId)
      if (highlightTimer) window.clearTimeout(highlightTimer)
    }
  }, [
    comments,
    contents,
    loading.comments,
    loading.contents,
    location.pathname,
    location.search,
  ])

  function showNotice(message) {
    setNotice(message)
  }

  function handleInstagramPublished(contentId, mediaId) {
    sessionInstagramPublications.set(String(contentId), mediaId)
    setInstagramPublications((current) => ({ ...current, [contentId]: mediaId }))
  }

  function handleClientFormChange(event) {
    const { name, value } = event.target

    setClientForm((current) => ({
      ...current,
      [name]: name === 'adminId' && value !== '' ? Number(value) : value,
    }))
    if (name === 'phone' || name === 'instagramUsername') {
      setClientValidation((current) => ({ ...current, [name]: '' }))
    }
  }

  async function handleCreateClient(event) {
    event.preventDefault()
    const validation = validateClientFields(clientForm)
    setClientValidation(validation)
    if (validation.phone || validation.instagramUsername) return
    setSaving((current) => ({ ...current, client: true }))
    setErrors((current) => ({ ...current, clients: '' }))

    try {
      await api.post('/clients', {
        ...clientForm,
        phone: normalizeIsraeliPhone(clientForm.phone),
        instagramUsername: normalizeInstagramUsername(clientForm.instagramUsername) || null,
      })
      setClientForm(emptyClientForm)
      setClientValidation({ phone: '', instagramUsername: '' })
      setShowCreateForm((current) => ({ ...current, clients: false }))
      await loadClients()
      showNotice('הלקוח נוצר בהצלחה')
    } catch {
      setErrors((current) => ({
        ...current,
        clients: 'לא הצלחנו ליצור את הלקוח',
      }))
    } finally {
      setSaving((current) => ({ ...current, client: false }))
    }
  }

  function startClientEdit(client) {
    setClientValidation({ phone: '', instagramUsername: '' })
    setEditingClientId(getClientId(client))
    setClientDraft({
      userId: client.user_id ?? '',
      adminId: client.admin_id ?? '',
      businessName: client.business_name ?? '',
      phone: client.phone ?? '',
      instagramUsername: client.instagramUsername ?? '',
    })
  }

  function handleClientDraftChange(event) {
    const { name, value } = event.target

    setClientDraft((current) => ({
      ...current,
      [name]: value,
    }))
    if (name === 'phone' || name === 'instagramUsername') {
      setClientValidation((current) => ({ ...current, [name]: '' }))
    }
  }

  async function handleUpdateClient(clientId) {
    const validation = validateClientFields(clientDraft)
    setClientValidation(validation)
    if (validation.phone || validation.instagramUsername) return
    const payload = {
      businessName: clientDraft.businessName,
      phone: normalizeIsraeliPhone(clientDraft.phone),
      instagramUsername: normalizeInstagramUsername(clientDraft.instagramUsername) || null,
    }

    if (clientDraft.userId !== '') {
      payload.userId = Number(clientDraft.userId)
    }

    if (clientDraft.adminId !== '') {
      payload.adminId = Number(clientDraft.adminId)
    } else {
      payload.clearAdminAssignment = true
    }

    setErrors((current) => ({ ...current, clients: '' }))

    try {
      await api.put(`/clients/${clientId}`, payload)
      setEditingClientId(null)
      setClientDraft(null)
      await loadClients()
      showNotice(`לקוח #${clientId} עודכן`)
    } catch {
      setErrors((current) => ({
        ...current,
        clients: 'לא הצלחנו לעדכן את הלקוח',
      }))
    }
  }

  async function handleDeleteClient(client) {
    const clientId = getClientId(client)
    setErrors((current) => ({ ...current, clients: '' }))
    try {
      const { data } = await api.get(`/clients/${clientId}/content-count`)
      if (Number(data.count) > 0) {
        setArchiveDialog({ clientId, businessName: client.business_name })
        return
      }
    } catch {
      setErrors((current) => ({ ...current, clients: 'לא הצלחנו לבדוק אם קיימים תכנים ללקוח' }))
      return
    }

    if (!window.confirm(`למחוק את לקוח #${clientId}?`)) {
      return
    }

    try {
      await api.delete(`/clients/${clientId}`)
      await loadClients()
      showNotice(`לקוח #${clientId} נמחק`)
    } catch {
      setErrors((current) => ({
        ...current,
        clients: 'לא הצלחנו למחוק את הלקוח',
      }))
    }
  }

  function handleContentFormChange(event) {
    const { name, value, files } = event.target

    if (name === 'files') {
      const selected = Array.from(files || []).map(normalizeSelectedMediaFile)
      const validationMessage = validateMediaSelection(contentForm.media_mode, selected, false)
      if (validationMessage) {
        setErrors((current) => ({ ...current, contents: validationMessage }))
        return
      }
      setErrors((current) => ({ ...current, contents: '' }))
      setVideoEdits(new Map())
    }

    setContentForm((current) => ({
      ...current,
      [name]: name === 'files' ? Array.from(files || []).map(normalizeSelectedMediaFile) : name === 'file' ? files[0] || null : value,
      ...(name === 'media_mode' ? {
        files: value === 'TEXT' ? [] : current.files,
        content_type: legacyContentType(value, value === 'TEXT' ? [] : current.files),
      } : {}),
    }))
  }

  async function handleCreateContent(event) {
    event.preventDefault()
    setSaving((current) => ({ ...current, content: true }))
    setErrors((current) => ({ ...current, contents: '' }))

    const validationMessage = validateMediaSelection(contentForm.media_mode, contentForm.files)
    if (validationMessage) {
      setErrors((current) => ({ ...current, contents: validationMessage }))
      setSaving((current) => ({ ...current, content: false }))
      return
    }

    const payload = new FormData()
    payload.append('clientId', contentForm.clientId)
    payload.append('title', contentForm.title)
    payload.append('description', contentForm.description)
    payload.append('contentType', legacyContentType(contentForm.media_mode, contentForm.files))

    if (contentForm.plannedPublishDate) {
      payload.append('plannedPublishDate', contentForm.plannedPublishDate)
    }
    if (contentForm.files.length) appendMediaFiles(payload, contentForm.files)
    else if (contentForm.file) payload.append('file', contentForm.file)
    appendVideoEdits(payload, contentForm.files, videoEdits)

    try {
      await api.post('/contents', payload)
      setContentForm(emptyContentForm)
      setVideoEdits(new Map())
      setShowCreateForm((current) => ({ ...current, contents: false }))
      await loadContents()
      showNotice('התוכן נוצר בהצלחה')
    } catch (error) {
      const backendMessage = typeof error.response?.data === 'string'
        ? error.response.data
        : error.response?.data?.message
      const statusMessage = error.response?.status
        ? `Request failed (${error.response.status})`
        : ''

      setErrors((current) => ({
        ...current,
        contents: backendMessage || statusMessage || error.message || 'לא הצלחנו ליצור את התוכן',
      }))
    } finally {
      setSaving((current) => ({ ...current, content: false }))
    }
  }

  function handleContentFilterChange(event) {
    const { name, value } = event.target

    setContentFilter((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleLoadContentsByClient(clientId) {
    if (!clientId) return
    setContentFilter({ ...emptyContentFilters, clientId: String(clientId) })
    navigate(`/content?clientId=${encodeURIComponent(clientId)}`)
  }

  function openRecentContent(content) {
    const contentId = getContentId(content)
    if (!contentId) return
    navigate(`/content/${contentId}?highlightId=${contentId}`)
  }

  function openCommentContent(comment, content) {
    if (!content || !comment.contentId || Number(getContentId(content)) !== Number(comment.contentId)) return
    navigate(`/content/${comment.contentId}?highlightId=${comment.contentId}`)
  }

  function handleCommentKeyDown(event, comment, content) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openCommentContent(comment, content)
    }
  }

  async function handleArchiveClient() {
    if (!archiveDialog.clientId) return
    setArchivingClient(true)
    setErrors((current) => ({ ...current, clients: '' }))
    try {
      await api.put(`/clients/${archiveDialog.clientId}/archive`)
      const archivedId = archiveDialog.clientId
      setArchiveDialog({ clientId: null, businessName: '' })
      await Promise.all([loadClients(), loadArchivedClients()])
      showNotice(`לקוח #${archivedId} הועבר לארכיון`)
    } catch {
      setErrors((current) => ({ ...current, clients: 'לא הצלחנו להעביר את הלקוח לארכיון' }))
    } finally {
      setArchivingClient(false)
    }
  }

  async function handleRestoreClient(clientId) {
    setErrors((current) => ({ ...current, clients: '' }))
    try {
      await api.put(`/clients/${clientId}/restore`)
      await Promise.all([loadClients(), loadArchivedClients()])
      showNotice(`לקוח #${clientId} שוחזר`)
    } catch {
      setErrors((current) => ({ ...current, clients: 'לא הצלחנו לשחזר את הלקוח' }))
    }
  }

  async function showClientView(view) {
    setClientView(view)
    setClientSearch('')
    if (view === 'archived') await loadArchivedClients()
    else await loadClients()
  }

  function startContentEdit(content) {
    setEditingContentId(getContentId(content))
    setContentDraft({
      clientId: content.clientId ?? content.client_id ?? '',
      title: content.title ?? '',
      description: content.description ?? '',
      file_url: content.file_url ?? '',
      content_type: content.content_type ?? 'IMAGE',
      plannedPublishDate: toInputDateTime(content.plannedPublishDate),
    })
    setReplacementMedia([])
    setVideoEdits(new Map())
  }

  function handleContentDraftChange(event) {
    const { name, value } = event.target

    setContentDraft((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function openImageEditor(scope, index, file) {
    if (!isEditableImage(file)) {
      setErrors((current) => ({ ...current, contents: 'פורמט התמונה אינו נתמך לעריכה' }))
      return
    }
    setImageEditor({ scope, index, file })
  }

  function saveEditedImage(editedFile) {
    if (imageEditor.scope === 'create') {
      setContentForm((current) => ({
        ...current,
        files: current.files.map((file, index) => index === imageEditor.index ? editedFile : file),
      }))
    } else {
      setReplacementMedia((current) => current.map((file, index) => index === imageEditor.index ? editedFile : file))
    }
    setImageEditor(null)
  }

  function openVideoEditor(scope, index, file) {
    const detection = getVideoEligibility(file)
    const probe = document.createElement('video')
    const canPlay = detection.detectedMime ? probe.canPlayType(detection.detectedMime) : ''
    console.info('[VideoEditor] eligibility', { detectedMime: detection.detectedMime, extension: detection.extension, eligible: detection.eligible, canPlayType: canPlay })
    if (!detection.eligible) {
      setErrors((current) => ({ ...current, contents: 'פורמט הווידאו אינו נתמך לעריכה. ניתן לבחור MP4 או MOV.' }))
      return
    }
    const editor = { scope, index, file, previewUrl: '', temporaryPublicId: '', normalizationAttempted: false, normalizing: false, normalizationError: '' }
    setVideoEditor(editor)
    if (detection.detectedMime === 'video/quicktime' && !canPlay) normalizeVideoForEditor(editor)
  }

  async function normalizeVideoForEditor(editor = videoEditor) {
    if (!editor || editor.normalizing || editor.normalizationAttempted) return
    const requestId = ++videoNormalizationId.current
    setVideoEditor((current) => current?.file === editor.file ? { ...current, normalizing: true, normalizationError: '' } : current)
    const form = new FormData()
    form.append('file', editor.file)
    let failureCode = 'VIDEO_NORMALIZATION_UPLOAD_FAILED'
    try {
      const response = await api.post('/contents/normalize-video', form)
      const { data } = response
      if (!data?.url || !data?.publicId) throw new Error('VIDEO_NORMALIZATION_INVALID_RESPONSE')
      if (requestId !== videoNormalizationId.current) {
        try { await api.delete('/contents/normalize-video', { params: { publicId: data.publicId } }) } catch { /* cleanup is best-effort */ }
        return
      }
      console.info('[VideoEditor] normalization stage', {
        stage: 'DIRECT_PREVIEW_READY', extension: getVideoEligibility(editor.file).extension,
        originalMime: editor.file.type || '', fileSize: editor.file.size, httpStatus: response.status ?? 200,
      })
      setVideoEditor({ ...editor, previewUrl: data.url, temporaryPublicId: data.publicId, normalizationAttempted: true, normalizing: false, normalizationError: '' })
    } catch (error) {
      const backendCode = error?.response?.data?.code
      const code = backendCode || failureCode
      console.error('[VideoEditor] normalization failed', {
        code,
        status: error?.response?.status ?? null,
        detectedMime: getVideoEligibility(editor.file).detectedMime,
        extension: getVideoEligibility(editor.file).extension,
      })
      if (requestId === videoNormalizationId.current) setVideoEditor((current) => current ? { ...current, normalizationAttempted: true, normalizing: false, normalizationError: 'לא הצלחנו להכין את הסרטון לעריכה. נסו סרטון אחר.' } : current)
    }
  }

  async function cleanupNormalizedPreview(editor) {
    if (!editor?.temporaryPublicId) return
    try {
      await api.delete('/contents/normalize-video', { params: { publicId: editor.temporaryPublicId } })
      console.info('[VideoEditor] normalization stage', { stage: 'TEMPORARY_PREVIEW_CLEANED' })
    } catch { /* cleanup is best-effort */ }
  }

  function closeVideoEditor() {
    videoNormalizationId.current += 1
    cleanupNormalizedPreview(videoEditor)
    setVideoEditor(null)
  }

  function saveEditedVideo(value) {
    setVideoEdits((current) => {
      const next = new Map(current)
      next.set(videoEditor.file, value)
      return next
    })
    cleanupNormalizedPreview(videoEditor)
    setVideoEditor(null)
  }

  async function handleUpdateContent(contentId) {
    const payload = {
      clientId: Number(contentDraft.clientId),
      title: contentDraft.title,
      description: contentDraft.description,
      file_url: contentDraft.file_url,
      content_type: contentDraft.content_type,
    }

    if (contentDraft.plannedPublishDate) {
      payload.plannedPublishDate = contentDraft.plannedPublishDate
    }

    setErrors((current) => ({ ...current, contents: '' }))

    try {
      if (replacementMedia.length > 0) {
        const form = new FormData()
        form.append('clientId', payload.clientId)
        form.append('title', payload.title)
        form.append('description', payload.description || '')
        form.append('contentType', replacementMedia[0].type.startsWith('video/') ? 'VIDEO' : 'IMAGE')
        if (payload.plannedPublishDate) form.append('plannedPublishDate', payload.plannedPublishDate)
        replacementMedia.forEach((file) => form.append('files', file))
        appendVideoEdits(form, replacementMedia, videoEdits)
        await api.put(`/contents/${contentId}`, form)
      } else {
        await api.put(`/contents/${contentId}`, payload)
      }
      setEditingContentId(null)
      setContentDraft(null)
      setReplacementMedia([])
      await loadContents()
      showNotice(`תוכן #${contentId} עודכן`)
    } catch {
      setErrors((current) => ({
        ...current,
        contents: 'לא הצלחנו לעדכן את התוכן',
      }))
    }
  }

  async function handleDeleteContent(contentId) {
    if (!window.confirm(`למחוק את תוכן #${contentId}?`)) {
      return
    }

    setErrors((current) => ({ ...current, contents: '' }))

    try {
      await api.delete(`/contents/${contentId}`, { suppressGlobalErrorToast: true })
      setContents((current) => current.filter((content) => getContentId(content) !== contentId))
      await Promise.all([loadContents(), loadComments()])
      showNotice(`תוכן #${contentId} נמחק`)
    } catch (requestError) {
      setErrors((current) => ({
        ...current,
        contents: getApiErrorMessage(requestError, 'לא הצלחנו למחוק את התוכן. אפשר לנסות שוב.'),
      }))
    }
  }

  async function handleUpdateStatus(contentId, status) {
    if (status === 'REJECTED') {
      setRejectionDialog({ contentId, reason: '' })
      return
    }

    const statusEndpointByValue = {
      WAITING_APPROVAL: 'send-for-approval',
      APPROVED: 'approve',
      REJECTED: 'reject',
      PUBLISHED: 'publish',
    }
    const endpoint = statusEndpointByValue[status]

    if (!endpoint) {
      return
    }

    setErrors((current) => ({ ...current, contents: '' }))

    try {
      await api.put(`/contents/${contentId}/${endpoint}`)
      await loadContents()
      showNotice(`סטטוס תוכן #${contentId} עודכן ל${statusLabelByValue[status]}`)
    } catch {
      setErrors((current) => ({
        ...current,
        contents: 'לא ניתן לבצע את מעבר הסטטוס הזה',
      }))
    }
  }

  async function handleRejectContent(event) {
    event.preventDefault()
    const reason = rejectionDialog.reason.trim()
    if (!reason) return

    setRejecting(true)
    setErrors((current) => ({ ...current, contents: '' }))
    try {
      await api.put(`/contents/${rejectionDialog.contentId}/reject`, { reason })
      const contentId = rejectionDialog.contentId
      setRejectionDialog({ contentId: null, reason: '' })
      await Promise.all([loadContents(), loadComments()])
      showNotice(`התוכן #${contentId} נדחה וסיבת הדחייה נשמרה כתגובה`)
    } catch {
      setErrors((current) => ({ ...current, contents: 'לא הצלחנו לדחות את התוכן. יש להזין סיבת דחייה.' }))
    } finally {
      setRejecting(false)
    }
  }

  function getStatusActions(status) {
    if (isAdmin && (status === 'DRAFT' || status === 'REJECTED')) {
      return [{ value: 'WAITING_APPROVAL', label: 'שליחה לאישור' }]
    }

    if (isClient && status === 'WAITING_APPROVAL') {
      return [
        { value: 'APPROVED', label: 'אישור' },
        { value: 'REJECTED', label: 'דחייה' },
      ]
    }

    if (isAdmin && status === 'APPROVED') {
      return [{ value: 'PUBLISHED', label: 'פרסם עכשיו' }]
    }

    return []
  }

  function handleCommentFormChange(event) {
    const { name, value } = event.target

    setCommentForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function handleLoadCommentsByContent(contentId = commentsContentId) {
    if (!contentId) {
      return
    }

    setLoading((current) => ({ ...current, comments: true }))
    setErrors((current) => ({ ...current, comments: '' }))

    try {
      const response = await api.get('/comments/by-content', {
        params: { contentId },
      })
      setComments(response.data)
      setCommentsContentId(String(contentId))
      setCommentForm((current) => ({
        ...current,
        contentId: String(contentId),
      }))
      navigateToPanel('comments')
      showFilteredResults('comments')
      showNotice(`נטענו תגובות לתוכן #${contentId}`)
    } catch {
      showFilteredResults('comments')
      setErrors((current) => ({
        ...current,
        comments: 'לא הצלחנו לטעון תגובות לתוכן',
      }))
    } finally {
      setLoading((current) => ({ ...current, comments: false }))
    }
  }

  async function handleCreateComment(event) {
    event.preventDefault()
    setSaving((current) => ({ ...current, comment: true }))
    setErrors((current) => ({ ...current, comments: '' }))

    try {
      await api.post('/comments', {
        contentId: Number(commentForm.contentId),
        commentText: commentForm.commentText,
      })

      setCommentForm((current) => ({
        ...current,
        commentText: '',
      }))

      if (commentForm.contentId) {
        await handleLoadCommentsByContent(commentForm.contentId)
      } else {
        await loadComments()
      }

      showNotice('התגובה נוספה')
    } catch {
      setErrors((current) => ({
        ...current,
        comments: 'לא הצלחנו לשמור את התגובה',
      }))
    } finally {
      setSaving((current) => ({ ...current, comment: false }))
    }
  }

  function getClientName(clientId) {
    const client = clientById.get(Number(clientId))
    return client?.business_name || `לקוח #${clientId}`
  }

  return (
    <PageShell activeRoute={activeRoute} routes={routes} onNavigate={onNavigate} isAuthenticated={isAuthenticated} onLogout={onLogout}>
      <section className="dashboard-layout">
        {activeRoute === 'dashboard' && <aside className="manager-panel dashboard-summary">
          <div className="manager-photo" aria-hidden="true">
            {getProfileInitials(profile)}
          </div>

          <p className="eyebrow">ניהול תוכן ולקוחות</p>
          <h2>{isClient && profile.clientId ? getClientName(profile.clientId) : (profile.fullName || 'משתמש מחובר')}</h2>
          <p>{profile.username || 'שם משתמש'}</p>
          <p>{profile.email || 'אימייל'}</p>
          {profile.role && (
            <span className="role-pill">
              {isAdmin ? 'מנהל' : 'לקוח'}
            </span>
          )}
          {errors.profile && <p className="inline-error">{errors.profile}</p>}

          {isAdmin && (
            <div className="summary-metrics">
              <div>
                <strong>{clients.length}</strong>
                <span>לקוחות</span>
              </div>
              <div>
                <strong>{dashboardContents.length}</strong>
                <span>תכנים</span>
              </div>
              <div>
                <strong>{waitingApprovalCount}</strong>
                <span>ממתינים</span>
              </div>
              <div>
                <strong>{statusCounts.APPROVED || 0}</strong>
                <span>מאושרים</span>
              </div>
              <div>
                <strong>{statusCounts.PUBLISHED || 0}</strong>
                <span>פורסמו</span>
              </div>
            </div>
          )}

          {isClient && (
            <div className="summary-metrics client-summary-metrics">
              <div>
                <strong>{waitingApprovalCount}</strong><span>ממתינים</span>
              </div>
              <div>
                <strong>{statusCounts.APPROVED || 0}</strong><span>מאושרים</span>
              </div>
              <div>
                <strong>{statusCounts.REJECTED || 0}</strong><span>נדחו</span>
              </div>
              <div>
                <strong>{statusCounts.PUBLISHED || 0}</strong><span>פורסמו</span>
              </div>
            </div>
          )}
        </aside>}

        <section className="workspace-panel">
          {activeRoute === 'dashboard' && <section className="dashboard-overview" aria-label="סקירת פעילות">
            <div className="overview-heading"><div><p className="eyebrow">סקירה מהירה</p><h2>{isAdmin ? 'מה קורה עכשיו' : `שלום, ${profile.fullName || 'טוב שחזרת'}`}</h2></div>{isAdmin && <button type="button" className="primary-button" onClick={() => { navigateToPanel('contents'); setShowCreateForm((current) => ({ ...current, contents: true })) }}>+ תוכן חדש</button>}</div>
            {isAdmin && <label className="dashboard-client-switcher">
              לוח לקוח
              <select value={dashboardClientId} onChange={(event) => setDashboardClientId(event.target.value)}>
                <option value="">כל הלקוחות</option>
                {clients.map((client) => <option key={getClientId(client)} value={getClientId(client)}>{client.business_name}</option>)}
              </select>
            </label>}
            <div className="dashboard-status-grid">
              <span>סה״כ <strong>{dashboardContents.length}</strong></span>
              <span>טיוטות <strong>{statusCounts.DRAFT || 0}</strong></span>
              <span>ממתינים <strong>{waitingApprovalCount}</strong></span>
              <span>מאושרים <strong>{statusCounts.APPROVED || 0}</strong></span>
              <span>נדחו <strong>{statusCounts.REJECTED || 0}</strong></span>
              <span>פורסמו <strong>{statusCounts.PUBLISHED || 0}</strong></span>
              <span>מתוזמנים <strong>{dashboardContents.filter((item) => item.plannedPublishDate).length}</strong></span>
            </div>
            <div className="overview-columns">
              <div className="overview-card"><h3>תוכן אחרון</h3>{recentContents.length ? recentContents.map((content) => {
                const contentId = getContentId(content)
                return <button type="button" className="recent-content-link" key={contentId} onClick={() => openRecentContent(content)} aria-label={`פתיחת התוכן ${content.title}`}><span>{content.title}</span><StatusBadge status={content.status} /></button>
              }) : <p>אין עדיין תכנים להצגה</p>}</div>
              <div className="overview-card"><h3>פרסומים קרובים</h3>{upcomingContents.length ? upcomingContents.map((content) => <button type="button" key={getContentId(content)} onClick={() => onNavigate('calendar')}><span>{content.title}</span><time>{new Date(content.plannedPublishDate).toLocaleDateString('he-IL')}</time></button>) : <p>אין פרסומים מתוכננים בקרוב</p>}</div>
              <div className="overview-card recent-activity-widget">
                <h3>פעילות אחרונה</h3>
                {activityLoading && <p>טוען פעילות...</p>}
                {!activityLoading && activityUnavailable && <p>הפעילות אינה זמינה כרגע</p>}
                {!activityLoading && !activityUnavailable && recentActivity.length === 0 && <p>אין עדיין פעילות להצגה</p>}
                {!activityLoading && !activityUnavailable && recentActivity.map((activity) => {
                  const design = getActivityDesign(activity.type)
                  return <div className="recent-activity-row" key={activity.activityId}>
                    <span className={`recent-activity-icon activity-icon-${activity.type}`}><ActivityIcon type={activity.type} /></span>
                    <span>{design.title}</span>
                    <time>{formatRelativeActivityTime(activity.occurredAt)}</time>
                  </div>
                })}
                <button type="button" className="activity-widget-link" onClick={() => onNavigate('activity')}>
                  לכל הפעילות <span aria-hidden="true">←</span>
                </button>
              </div>
            </div>
          </section>}
          {activeRoute !== 'dashboard' && notice && (
            <div className="notice-bar">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')}>
                סגירה
              </button>
            </div>
          )}

          {isAdmin && activeRoute === 'clients' && (
            <section className="management-section" aria-labelledby="clients-title">
              <div className="management-header">
                <div>
                  <p className="eyebrow">לקוחות</p>
                  <h2 id="clients-title">ניהול לקוחות</h2>
                </div>
                <div className="management-header-actions">
                  <button type="button" className={clientView === 'active' ? 'primary-button' : 'secondary-button'} onClick={() => showClientView('active')}>לקוחות פעילים</button>
                  <button type="button" className={clientView === 'archived' ? 'primary-button' : 'secondary-button'} onClick={() => showClientView('archived')}>ארכיון</button>
                  {clientView === 'active' && <button type="button" className="primary-button" onClick={() => toggleCreateForm('clients')}>
                    {showCreateForm.clients ? 'סגירת יצירת לקוח' : 'יצירת לקוח חדש'}
                  </button>}
                </div>
              </div>

              <div className="tool-row client-smart-search">
                <div className="filter-control compact-search">
                  <label>
                    חיפוש לקוחות
                    <input
                      type="search"
                      value={clientSearch}
                      onChange={(event) => setClientSearch(event.target.value)}
                      placeholder="שם עסק, טלפון, שם לקוח או תוכן"
                    />
                  </label>
                  {clientSearch && <button type="button" className="ghost-button" onClick={() => setClientSearch('')}>ניקוי</button>}
                </div>
              </div>

              {loading.clients && <Skeleton rows={3} />}
              {errors.clients && <p className="entity-state entity-state-error">{errors.clients}</p>}
              {!loading.clients && !errors.clients && visibleClients.length === 0 && (
                <EmptyState icon={Users} title={clientView === 'archived' ? 'הארכיון ריק' : 'עדיין אין לקוחות'} description={clientView === 'archived' ? 'לקוחות עם תוכן יופיעו כאן לאחר העברה לארכיון.' : 'הוסיפו את הלקוח הראשון כדי להתחיל לנהל עבורו תוכן.'} actionLabel={clientView === 'active' ? 'הוספת לקוח' : undefined} onAction={clientView === 'active' ? () => setShowCreateForm((current) => ({ ...current, clients: true })) : undefined} />
              )}

              {filteredResults.clients && !loading.clients && !errors.clients && visibleClients.length > 0 && (
                <div className="result-actions">
                  <button type="button" className="ghost-button" onClick={() => toggleResults('clients')}>
                    {resultsHidden.clients ? 'הצגת תוצאות' : 'הסתרת תוצאות'}
                  </button>
                </div>
              )}

              {!resultsHidden.clients && (
                <div className="entity-list">
                  {visibleClients.map((client) => {
                    const clientId = getClientId(client)
                    const isEditing = editingClientId === clientId

                    return (
                      <article className="entity-card" key={clientId}>
                        <div className="entity-details">
                          <div className="entity-title-row">
                            <h3>{client.business_name}</h3>
                            <span className="channel-pill">לקוח #{clientId}</span>
                            {clientView === 'archived' && <span className="archived-client-badge">בארכיון</span>}
                          </div>

                          {isEditing ? (
                            <div className="inline-edit-grid">
                              <label>
                                שם העסק
                                <input
                                  name="businessName"
                                  value={clientDraft.businessName}
                                  onChange={handleClientDraftChange}
                                />
                              </label>
                              <label>
                                טלפון
                                <input
                                  name="phone"
                                  inputMode="tel"
                                  value={clientDraft.phone}
                                  onChange={handleClientDraftChange}
                                  aria-invalid={Boolean(clientValidation.phone)}
                                  required
                                />
                                {clientValidation.phone && <span className="field-error">{clientValidation.phone}</span>}
                              </label>
                              <label>
                                חשבון Instagram
                                <input
                                  name="instagramUsername"
                                  value={clientDraft.instagramUsername}
                                  onChange={handleClientDraftChange}
                                  aria-invalid={Boolean(clientValidation.instagramUsername)}
                                />
                                {clientValidation.instagramUsername && <span className="field-error">{clientValidation.instagramUsername}</span>}
                              </label>
                              <label>
                                User ID
                                <input
                                  min="1"
                                  name="userId"
                                  type="number"
                                  value={clientDraft.userId}
                                  onChange={handleClientDraftChange}
                                />
                              </label>
                              <label>
                                מנהל סושיאל
                                <select
                                  name="adminId"
                                  value={clientDraft.adminId}
                                  onChange={handleClientDraftChange}
                                >
                                  <option value="">ללא מנהל משויך</option>
                                  {socialManagers.map((manager) => <option key={manager.adminId} value={manager.adminId}>{manager.fullName || manager.username}</option>)}
                                </select>
                              </label>
                            </div>
                          ) : (
                            <div className="metadata-row">
                              <span>User ID: {client.user_id ?? '-'}</span>
                              <span>מנהל סושיאל: {client.admin_id ? (managerByAdminId.get(Number(client.admin_id))?.fullName || managerByAdminId.get(Number(client.admin_id))?.username || `#${client.admin_id}`) : 'לא משויך'}</span>
                              <span className="phone-number">טלפון: {client.phone || '-'}</span>
                              {client.instagramUsername && <span className="instagram-username" dir="ltr">@{client.instagramUsername}</span>}
                            </div>
                          )}
                        </div>

                        <div className="entity-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="primary-button small-button"
                                onClick={() => handleUpdateClient(clientId)}
                              >
                                שמירה
                              </button>
                              <button
                                type="button"
                                className="ghost-button small-button"
                                onClick={() => {
                                  setEditingClientId(null)
                                  setClientDraft(null)
                                }}
                              >
                                ביטול
                              </button>
                            </>
                          ) : (
                            <>
                              {clientView === 'active' && <button
                                type="button"
                                className="secondary-button small-button"
                                onClick={() => startClientEdit(client)}
                              >
                                עריכה
                              </button>}
                              <button
                                type="button"
                                className="secondary-button small-button"
                                onClick={() => handleLoadContentsByClient(clientId)}
                              >
                                {clientView === 'archived' ? 'צפייה בתכנים' : 'תכנים'}
                              </button>
                              {clientView === 'active' ? <button
                                type="button"
                                className="danger-button small-button"
                                onClick={() => handleDeleteClient(client)}
                              >
                                מחיקה
                              </button> : <button type="button" className="primary-button small-button" onClick={() => handleRestoreClient(clientId)}>
                                שחזור לקוח
                              </button>}
                            </>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              {clientView === 'active' && socialManagers.length > 0 && (
                <section className="manager-client-summary" aria-labelledby="manager-client-summary-title">
                  <h3 id="manager-client-summary-title">לקוחות לפי מנהל סושיאל</h3>
                  <div className="manager-client-grid">
                    {socialManagers.map((manager) => {
                      const managed = clients.filter((client) => Number(client.admin_id) === Number(manager.adminId))
                      return <article key={manager.adminId}>
                        <strong>{manager.fullName || manager.username}</strong>
                        <span>{managed.length} לקוחות</span>
                        <p>{managed.length ? managed.map((client) => client.business_name).join(' · ') : 'אין לקוחות משויכים'}</p>
                      </article>
                    })}
                  </div>
                </section>
              )}

              <CreationModal
                open={showCreateForm.clients}
                titleId="create-client-dialog-title"
                closeLabel="סגירת יצירת לקוח"
                onClose={() => setShowCreateForm((current) => ({ ...current, clients: false }))}
              >
                <form className="entity-form" onSubmit={handleCreateClient}>
                  <h3 id="create-client-dialog-title">יצירת לקוח</h3>
                  <div className="form-grid">
                    <label>
                      שם העסק
                      <input
                        name="businessName"
                        value={clientForm.businessName}
                        onChange={handleClientFormChange}
                        required
                      />
                    </label>
                    <label>
                      שם מלא
                      <input
                        name="fullName"
                        value={clientForm.fullName}
                        onChange={handleClientFormChange}
                      />
                    </label>
                    <label>
                      אימייל
                      <input
                        name="email"
                        type="email"
                        value={clientForm.email}
                        onChange={handleClientFormChange}
                        required
                      />
                    </label>
                    <label>
                      שם משתמש
                      <input
                        name="username"
                        value={clientForm.username}
                        onChange={handleClientFormChange}
                        required
                      />
                    </label>
                    <label>
                      סיסמה
                      <input
                        name="password"
                        type="password"
                        value={clientForm.password}
                        onChange={handleClientFormChange}
                        required
                      />
                    </label>
                    <label>
                      טלפון
                      <input
                        name="phone"
                        inputMode="tel"
                        value={clientForm.phone}
                        onChange={handleClientFormChange}
                        aria-invalid={Boolean(clientValidation.phone)}
                        required
                      />
                      {clientValidation.phone && <span className="field-error">{clientValidation.phone}</span>}
                    </label>
                    <label>
                      חשבון Instagram
                      <input
                        name="instagramUsername"
                        value={clientForm.instagramUsername}
                        onChange={handleClientFormChange}
                        aria-invalid={Boolean(clientValidation.instagramUsername)}
                      />
                      {clientValidation.instagramUsername && <span className="field-error">{clientValidation.instagramUsername}</span>}
                    </label>
                    <label>
                      מנהל סושיאל
                      <select
                        name="adminId"
                        value={clientForm.adminId}
                        onChange={handleClientFormChange}
                      >
                        <option value="">ללא מנהל משויך</option>
                        {socialManagers.map((manager) => <option key={manager.adminId} value={manager.adminId}>{manager.fullName || manager.username}</option>)}
                      </select>
                    </label>
                  </div>
                  <button className="primary-button" type="submit" disabled={saving.client}>
                    {saving.client ? <><span className="button-spinner" />שומר...</> : 'שמירת לקוח'}
                  </button>
                </form>
              </CreationModal>
            </section>
          )}

          {activeRoute === 'content' && (
            <section className="management-section" aria-labelledby="contents-title">
              <div className="management-header">
                <div>
                  <p className="eyebrow">תכנים</p>
                  <h2 id="contents-title">ניהול תכנים</h2>
                </div>
                <div className="management-header-actions">
                  <button type="button" className="secondary-button" onClick={loadContents}>כל התכנים</button>
                  {isAdmin && <button type="button" className="primary-button" onClick={() => toggleCreateForm('contents')}>
                    {showCreateForm.contents ? 'סגירת יצירת תוכן' : 'יצירת תוכן חדש'}
                  </button>}
                </div>
              </div>

              <div className="tool-row tool-row-wide filter-grid">
                {isAdmin && (
                  <div className="filter-control">
                    <label>
                      לקוח
                      <select
                        name="clientId"
                        value={contentFilter.clientId}
                        onChange={handleContentFilterChange}
                      >
                        <option value="">כל הלקוחות</option>
                        {clients.map((client) => (
                          <option value={getClientId(client)} key={getClientId(client)}>
                            {client.business_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <div className="filter-control">
                  <label>
                    סטטוס
                    <select
                      name="status"
                      value={contentFilter.status}
                      onChange={handleContentFilterChange}
                    >
                      <option value="">כל הסטטוסים</option>
                      {statusOptions.map((status) => (
                        <option value={status.value} key={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="filter-control">
                  <label>סוג תוכן
                    <select name="contentType" value={contentFilter.contentType} onChange={handleContentFilterChange}>
                      <option value="">כל סוגי התוכן</option>
                      {contentTypeOptions.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
                    </select>
                  </label>
                </div>
                <div className="filter-control compact-search">
                  <label>חיפוש
                    <input name="search" type="search" value={contentFilter.search} onChange={handleContentFilterChange} placeholder="כותרת, תיאור, לקוח, סטטוס או סוג" />
                  </label>
                </div>
                <button type="button" className="ghost-button" onClick={() => setContentFilter(emptyContentFilters)}>נקה סינונים</button>
              </div>

              {loading.contents && <Skeleton rows={3} />}
              {errors.contents && <p className="entity-state entity-state-error">{errors.contents}</p>}
              {!loading.contents && !errors.contents && displayedContents.length === 0 && (
                <EmptyState icon={FilePlus2} title="עדיין אין תוכן" description="צרו תוכן חדש והתחילו לתכנן את הפרסום הבא." actionLabel="יצירת תוכן חדש" onAction={() => setShowCreateForm((current) => ({ ...current, contents: true }))} />
              )}

              {filteredResults.contents && !loading.contents && !errors.contents && contents.length > 0 && (
                <div className="result-actions">
                  <button type="button" className="ghost-button" onClick={() => toggleResults('contents')}>
                    {resultsHidden.contents ? 'הצגת תוצאות' : 'הסתרת תוצאות'}
                  </button>
                </div>
              )}

              {!resultsHidden.contents && (
                <div className="entity-list">
                  {displayedContents.map((content) => {
                    const contentId = getContentId(content)
                    const contentClientId = content.clientId ?? content.client_id
                    const isEditing = editingContentId === contentId
                    const statusActions = getStatusActions(content.status)
                    const rejectionReason = content.status === 'REJECTED'
                      ? comments
                        .filter((comment) => Number(comment.contentId) === Number(contentId))
                        .sort((first, second) => Number(second.commentId) - Number(first.commentId))[0]
                      : null

                    return (
                      <article id={`content-${contentId}`} className={`entity-card content-card ${highlightedElementId === `content-${contentId}` ? 'deep-link-highlight' : ''}`} key={contentId}>
                        <div className={`status-rail status-${content.status || 'DRAFT'}`} />
                        <div className="entity-details">
                          <div className="entity-title-row">
                            <h3>{content.title}</h3>
                            <StatusBadge status={content.status} />
                          </div>

                          {isEditing ? (
                            <div className="inline-edit-grid">
                              <label>
                                לקוח
                                <select
                                  name="clientId"
                                  value={contentDraft.clientId}
                                  onChange={handleContentDraftChange}
                                >
                                  {clients.map((client) => (
                                    <option value={getClientId(client)} key={getClientId(client)}>
                                      {client.business_name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                כותרת
                                <input
                                  name="title"
                                  value={contentDraft.title}
                                  onChange={handleContentDraftChange}
                                />
                              </label>
                              <label>
                                סוג
                                <select
                                  name="content_type"
                                  value={contentDraft.content_type}
                                  onChange={handleContentDraftChange}
                                >
                                  {contentTypeOptions.map((type) => (
                                    <option value={type.value} key={type.value}>
                                      {type.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                תאריך פרסום
                                <input
                                  name="plannedPublishDate"
                                  type="datetime-local"
                                  value={contentDraft.plannedPublishDate}
                                  onChange={handleContentDraftChange}
                                />
                              </label>
                              {isAdmin && (
                                <PublishingRecommendation
                                  key={`edit-recommendation-${contentId}-${contentDraft.clientId}-${contentDraft.title}-${contentDraft.content_type}-${contentDraft.plannedPublishDate}`}
                                  clientId={contentDraft.clientId}
                                  title={contentDraft.title}
                                  contentType={contentDraft.content_type}
                                  plannedPublishDate={contentDraft.plannedPublishDate}
                                  onApply={(recommendedDate) => setContentDraft((current) => ({ ...current, plannedPublishDate: recommendedDate }))}
                                />
                              )}
                              <label>
                                קישור
                                <input
                                  name="file_url"
                                  value={contentDraft.file_url}
                                  onChange={handleContentDraftChange}
                                />
                              </label>
                              <div className="wide-field replace-media-field">
                                <span>מדיה נוכחית</span>
                                {replacementMedia.length > 0 ? (
                                  <div className="selected-media-list">
                                    {replacementMedia.map((file, index) => (
                                      <div className="selected-media-item" key={`${file.name}-${file.lastModified}-${index}`} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                                        event.preventDefault()
                                        const from = Number(event.dataTransfer.getData('text/plain'))
                                        setReplacementMedia((current) => {
                                          const files = [...current]
                                          const [moved] = files.splice(from, 1)
                                          files.splice(index, 0, moved)
                                          return files
                                        })
                                      }}>
                                        <SelectedMediaPreview file={file} alt={`${file.name}, פריט ${index + 1}`} />
                                        <span>{index + 1}. {file.name}</span>
                                        {isEditableImage(file) && <button type="button" className="secondary-button small-button" onClick={() => openImageEditor('replacement', index, file)}>עריכת תמונה</button>}
                                        {getVideoEligibility(file).eligible && <button type="button" className="secondary-button small-button" onClick={() => openVideoEditor('replacement', index, file)}>עריכת וידאו</button>}
                                        <button type="button" aria-label={`הסרת ${file.name}`} onClick={() => setReplacementMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                                        <button type="button" disabled={index === 0} aria-label={`העברת ${file.name} למעלה`} onClick={() => setReplacementMedia((current) => current.map((item, itemIndex) => itemIndex === index - 1 ? current[index] : itemIndex === index ? current[index - 1] : item))}>↑</button>
                                        <button type="button" disabled={index === replacementMedia.length - 1} aria-label={`העברת ${file.name} למטה`} onClick={() => setReplacementMedia((current) => current.map((item, itemIndex) => itemIndex === index ? current[index + 1] : itemIndex === index + 1 ? current[index] : item))}>↓</button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <ContentMediaCarousel content={content} />
                                )}
                                <label>
                                  החלפת מדיה
                                  <input
                                    type="file"
                                    multiple
                                    accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                                    onChange={(event) => { setReplacementMedia(Array.from(event.target.files || []).slice(0, 10).map(normalizeSelectedMediaFile)); setVideoEdits(new Map()) }}
                                  />
                                </label>
                                <small>{replacementMedia.length}/10 פריטים נבחרו. סדר הרשימה הוא סדר הקרוסלה.</small>
                                <small>התוכן יעודכן רק לאחר שההעלאה תסתיים בהצלחה.</small>
                              </div>
                              <label className="wide-field">
                                תיאור
                                <textarea
                                  name="description"
                                  value={contentDraft.description}
                                  onChange={handleContentDraftChange}
                                />
                              </label>
                              {isAdmin && (
                                <CaptionGenerator
                                  key={`edit-caption-${contentId}`}
                                  title={contentDraft.title}
                                  contentType={contentDraft.content_type}
                                  description={contentDraft.description}
                                  onApply={(caption) => setContentDraft((current) => ({ ...current, description: caption }))}
                                />
                              )}
                            </div>
                          ) : (
                            <>
                              <p>{content.description || 'אין תיאור'}</p>
                              <div className="metadata-row">
                                <span>{getClientName(contentClientId)}</span>
                                <span>{typeLabelByValue[content.content_type] || content.content_type}</span>
                                <span>תוכן #{contentId}</span>
                                <span>
                                  פרסום:{' '}
                                  {content.plannedPublishDate
                                    ? toInputDateTime(content.plannedPublishDate).replace('T', ' ')
                                    : '-'}
                                </span>
                              </div>
                              {(content.media?.length || content.file_url) && <ContentMediaCarousel media={content.media} fallbackUrl={content.file_url} fallbackType={content.content_type} alt={content.title} />}
                              {isAdmin && rejectionReason && (
                                <aside className="rejection-reason" aria-label="סיבת דחייה">
                                  <strong>סיבת הדחייה</strong>
                                  <p>{rejectionReason.commentText}</p>
                                </aside>
                              )}
                            </>
                          )}
                        </div>

                        <div className="entity-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="primary-button small-button"
                                onClick={() => handleUpdateContent(contentId)}
                              >
                                שמירה
                              </button>
                              <button
                                type="button"
                                className="ghost-button small-button"
                                onClick={() => {
                                  setEditingContentId(null)
                                  setContentDraft(null)
                                }}
                              >
                                ביטול
                              </button>
                            </>
                          ) : (
                            <>
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="secondary-button small-button"
                                  onClick={() => startContentEdit(content)}
                                >
                                  עריכה
                                </button>
                              )}
                              {statusActions.map((action) => (
                                <button
                                  type="button"
                                  className={`${action.value === 'WAITING_APPROVAL' ? 'primary-button content-approval-action' : 'secondary-button'} small-button`}
                                  key={action.value}
                                  onClick={() => handleUpdateStatus(contentId, action.value)}
                                >
                                  {action.label}
                                </button>
                              ))}
                              <button
                                type="button"
                                className="secondary-button small-button"
                                onClick={() => handleLoadCommentsByContent(contentId)}
                              >
                                תגובות
                              </button>
                              {(isAdmin || isClient) && (
                                <button
                                  type="button"
                                  className="ghost-button small-button"
                                  onClick={() => setHistoryContent(content)}
                                >
                                  היסטוריית גרסאות
                                </button>
                              )}
                              <InstagramPublishAction
                                content={content}
                                role={profile.role}
                                publishedMediaId={instagramPublications[contentId]}
                                onPublished={handleInstagramPublished}
                              />
                              {isAdmin && (
                                <button
                                  type="button"
                                  className="content-delete-action small-button"
                                  onClick={() => handleDeleteContent(contentId)}
                                >
                                  מחיקה
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              {isAdmin && (
                <CreationModal
                  open={showCreateForm.contents}
                  titleId="create-content-dialog-title"
                  closeLabel="סגירת יצירת תוכן"
                  onClose={() => setShowCreateForm((current) => ({ ...current, contents: false }))}
                >
                    <form className="entity-form content-creation-form" onSubmit={handleCreateContent}>
                      <h3 id="create-content-dialog-title">יצירת תוכן</h3>
                      <div className="form-grid">
                        <label>
                          לקוח
                          <select
                            name="clientId"
                            value={contentForm.clientId}
                            onChange={handleContentFormChange}
                            required
                          >
                            <option value="">בחירת לקוח</option>
                            {clients.map((client) => (
                              <option value={getClientId(client)} key={getClientId(client)}>
                                {client.business_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          כותרת
                          <input
                            name="title"
                            value={contentForm.title}
                            onChange={handleContentFormChange}
                            required
                          />
                        </label>
                        <label>
                          סוג תוכן
                          <select
                            name="media_mode"
                            value={contentForm.media_mode}
                            onChange={handleContentFormChange}
                          >
                            {createContentTypeOptions.map((type) => (
                              <option value={type.value} key={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          תאריך פרסום מתוכנן
                          <input
                            name="plannedPublishDate"
                            type="datetime-local"
                            value={contentForm.plannedPublishDate}
                            onChange={handleContentFormChange}
                          />
                        </label>
                        {isAdmin && (
                          <PublishingRecommendation
                            key={`create-recommendation-${contentForm.clientId}-${contentForm.title}-${contentForm.content_type}-${contentForm.plannedPublishDate}`}
                            clientId={contentForm.clientId}
                            title={contentForm.title}
                            contentType={contentForm.content_type}
                            plannedPublishDate={contentForm.plannedPublishDate}
                            onApply={(recommendedDate) => setContentForm((current) => ({ ...current, plannedPublishDate: recommendedDate }))}
                          />
                        )}
                        <label>
                          קובץ תמונה או וידאו
                          <input
                            name="files"
                            type="file"
                            accept={mediaAcceptForMode(contentForm.media_mode)}
                            multiple
                            disabled={contentForm.media_mode === 'TEXT'}
                            onChange={handleContentFormChange}
                          />
                        </label>
                        <div className="wide-field carousel-file-list" aria-live="polite">
                          <strong>{contentForm.files.length} / 10 פריטי מדיה</strong>
                          {contentForm.files.map((file, index) => <div className="carousel-file-row" key={`${file.name}-${file.lastModified}`} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                            event.preventDefault(); const from=Number(event.dataTransfer.getData('text/plain')); setContentForm((current) => { const files=[...current.files]; const [moved]=files.splice(from,1); files.splice(index,0,moved); return {...current,files} })
                          }}><SelectedMediaPreview file={file} alt={`${file.name}, פריט ${index + 1}`} /><span className="carousel-file-name" title={file.name}>{index + 1}. {file.name}</span><div className="carousel-file-actions">{isEditableImage(file) && <button type="button" className="secondary-button small-button carousel-edit-action" onClick={() => openImageEditor('create', index, file)}>עריכת תמונה</button>}{getVideoEligibility(file).eligible && <button type="button" className="secondary-button small-button carousel-edit-action" onClick={() => openVideoEditor('create', index, file)}>עריכת וידאו</button>}<button type="button" aria-label={`הסרת ${file.name}`} onClick={() => setContentForm((current) => ({...current,files:current.files.filter((_,itemIndex)=>itemIndex!==index)}))}>×</button>
                          <button type="button" aria-label={`הזזת ${file.name} אחורה`} disabled={index===0} onClick={() => setContentForm((current)=>{const files=[...current.files];[files[index-1],files[index]]=[files[index],files[index-1]];return {...current,files}})}>↑</button>
                          <button type="button" aria-label={`הזזת ${file.name} קדימה`} disabled={index===contentForm.files.length-1} onClick={() => setContentForm((current)=>{const files=[...current.files];[files[index+1],files[index]]=[files[index],files[index+1]];return {...current,files}})}>↓</button></div></div>)}
                        </div>
                        <label className="wide-field">
                          תיאור
                          <textarea
                            name="description"
                            value={contentForm.description}
                            onChange={handleContentFormChange}
                          />
                        </label>
                        {isAdmin && (
                          <CaptionGenerator
                            key="create-caption"
                            title={contentForm.title}
                            contentType={contentForm.content_type}
                            description={contentForm.description}
                            onApply={(caption) => setContentForm((current) => ({ ...current, description: caption }))}
                          />
                        )}
                      </div>
                      <button className="primary-button" type="submit" disabled={saving.content}>
                        {saving.content ? <><span className="button-spinner" />שומר...</> : 'שמירת תוכן'}
                      </button>
                    </form>
                </CreationModal>
              )}
            </section>
          )}

          {activeRoute === 'messages' && (
            <section className="management-section" aria-labelledby="comments-title">
              <div className="management-header">
                <div>
                  <p className="eyebrow">תגובות</p>
                  <h2 id="comments-title">ניהול תגובות</h2>
                </div>
                <button type="button" className="secondary-button" onClick={loadComments}>
                  כל התגובות
                </button>
              </div>

              <div className="tool-row comments-global-search">
                <label>
                  חיפוש בכל התגובות
                  <input
                    type="search"
                    value={commentSearch}
                    onChange={(event) => setCommentSearch(event.target.value)}
                    placeholder="עסק, טלפון, תוכן, תגובה או משתמש"
                  />
                </label>
                {commentSearch && <button type="button" className="ghost-button small-button" onClick={() => setCommentSearch('')}>ניקוי</button>}
              </div>

              <div className="tool-row filter-grid">
                <div className="filter-control">
                  <label>
                    תוכן
                    <select
                      value={commentsContentId}
                      onChange={(event) => setCommentsContentId(event.target.value)}
                    >
                      <option value="">בחירת תוכן</option>
                      {contents.map((content) => (
                        <option value={getContentId(content)} key={getContentId(content)}>
                          {content.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleLoadCommentsByContent()}
                  >
                    הצגת תגובות לתוכן
                  </button>
                </div>
              </div>

              <form className="entity-form" onSubmit={handleCreateComment}>
                <h3>הוספת תגובה</h3>
                <div className="form-grid">
                  <label>
                    תוכן
                    <select
                      name="contentId"
                      value={commentForm.contentId}
                      onChange={handleCommentFormChange}
                      required
                    >
                      <option value="">בחירת תוכן</option>
                      {contents.map((content) => (
                        <option value={getContentId(content)} key={getContentId(content)}>
                          {content.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="wide-field">
                    תגובה
                    <textarea
                      name="commentText"
                      value={commentForm.commentText}
                      onChange={handleCommentFormChange}
                      required
                    />
                  </label>
                </div>
                <button className="primary-button" type="submit" disabled={saving.comment}>
                  {saving.comment ? <><span className="button-spinner" />שומר...</> : 'שמירת תגובה'}
                </button>
              </form>

              {loading.comments && <Skeleton rows={3} />}
              {errors.comments && <p className="entity-state entity-state-error">{errors.comments}</p>}
              {!loading.comments && !errors.comments && comments.length === 0 && (
                <EmptyState icon={MessageCircle} title="עדיין אין תגובות" description="תגובות ושיחות על התוכן יופיעו כאן." />
              )}

              {filteredResults.comments && !loading.comments && !errors.comments && comments.length > 0 && (
                <div className="result-actions">
                  <button type="button" className="ghost-button" onClick={() => toggleResults('comments')}>
                    {resultsHidden.comments ? 'הצגת תוצאות' : 'הסתרת תוצאות'}
                  </button>
                </div>
              )}

              {!resultsHidden.comments && (
                <div className="comment-list">
                  {visibleComments.map((comment) => {
                    const content = contents.find((item) => Number(getContentId(item)) === Number(comment.contentId))
                    const customer = clientById.get(Number(content?.clientId ?? content?.client_id))
                    const author = userById.get(Number(comment.userId))
                    const clickable = Boolean(content && comment.contentId && Number(getContentId(content)) === Number(comment.contentId))
                    return <article id={`comment-${comment.commentId}`} className={`comment-item ${clickable ? 'comment-item-clickable' : ''} ${highlightedElementId === `comment-${comment.commentId}` ? 'deep-link-highlight' : ''}`} key={comment.commentId}
                      role={clickable ? 'link' : undefined} tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => openCommentContent(comment, content) : undefined}
                      onKeyDown={clickable ? (event) => handleCommentKeyDown(event, comment, content) : undefined}>
                      <div>
                        <h3>{author?.full_name || author?.username || 'משתמש'}</h3>
                        <p>{comment.commentText}</p>
                      </div>
                      <div className="metadata-row">
                        <span>{author?.role === 'ADMIN' ? 'מנהל' : 'לקוח'}</span>
                        <span>{customer?.business_name || 'עסק לא ידוע'}</span>
                        <span>{content?.title || `תוכן #${comment.contentId}`}</span>
                        <time>{comment.createdAt ? new Date(comment.createdAt).toLocaleString('he-IL') : 'תאריך לא זמין'}</time>
                      </div>
                    </article>
                  })}
                </div>
              )}
            </section>
          )}
        </section>
      </section>
      {historyContent && (
        <ContentVersionHistoryModal
          key={getContentId(historyContent)}
          content={historyContent}
          role={profile.role}
          onClose={() => setHistoryContent(null)}
          onRestored={async (result) => {
            await loadContents()
            if (result?.content) setHistoryContent(result.content)
            showNotice(result?.changed
              ? `גרסה ${result.restoredFromVersionNumber} שוחזרה בהצלחה`
              : `התוכן כבר תואם לגרסה ${result?.restoredFromVersionNumber}`)
          }}
        />
      )}
      {imageEditor && <ImageEditorModal file={imageEditor.file} onCancel={() => setImageEditor(null)} onSave={saveEditedImage} />}
      {videoEditor && <VideoEditorModal key={`${videoEditor.file.name}-${videoEditor.file.lastModified}`} file={videoEditor.file} previewUrl={videoEditor.previewUrl} initialValue={videoEdits.get(videoEditor.file)} onCancel={closeVideoEditor} onSave={saveEditedVideo} normalizing={videoEditor.normalizing} externalError={videoEditor.normalizationError} onDecodeFailure={videoEditor.normalizationAttempted ? undefined : () => normalizeVideoForEditor(videoEditor)} />}
      {archiveDialog.clientId !== null && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card client-archive-confirmation" role="dialog" aria-modal="true" aria-labelledby="archive-client-dialog-title">
            <h2 id="archive-client-dialog-title">העברת לקוח לארכיון</h2>
            <p>ללקוח {archiveDialog.businessName} קיימים תכנים במערכת.</p>
            <p>לא ניתן למחוק אותו לצמיתות מבלי לפגוע בהיסטוריית המערכת. הלקוח וכל התכנים שלו יועברו לארכיון.</p>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setArchiveDialog({ clientId: null, businessName: '' })} disabled={archivingClient}>ביטול</button>
              <button type="button" className="primary-button" onClick={handleArchiveClient} disabled={archivingClient}>
                {archivingClient ? <><span className="button-spinner dark-spinner" />מעביר...</> : 'העבר לארכיון'}
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectionDialog.contentId !== null && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reject-dialog-title">
            <form onSubmit={handleRejectContent}>
              <h2 id="reject-dialog-title">דחיית תוכן</h2>
              <p>נא להסביר מדוע התוכן נדחה. הסיבה תישמר כתגובה ותוצג למנהל.</p>
              <label>
                סיבת דחייה
                <textarea
                  autoFocus
                  value={rejectionDialog.reason}
                  onChange={(event) => setRejectionDialog((current) => ({ ...current, reason: event.target.value }))}
                  required
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setRejectionDialog({ contentId: null, reason: '' })} disabled={rejecting}>
                  ביטול
                </button>
                <button className="danger-button" type="submit" disabled={rejecting || !rejectionDialog.reason.trim()}>
                  {rejecting ? <><span className="button-spinner" />דוחה...</> : 'דחיית התוכן'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  )
}

export default DashboardPage
