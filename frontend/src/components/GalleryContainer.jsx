import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  CloudDownload,
  Grid,
  Link2,
  LoaderCircle,
  Maximize2,
  RefreshCw,
} from 'lucide-react'
import { SingleImageView } from './SingleImageView'
import { GridGalleryView } from './GridGalleryView'
import { SearchBar } from './SearchBar'
import { galleryApi, getApiBaseUrl } from '../lib/api'

const LOCAL_STORAGE_AUTH_SESSION_KEY = 'gallery.authSession'
const LOCAL_STORAGE_ADMIN_PANEL_OPEN_KEY = 'gallery.adminPanelOpen'
const MANUAL_X_SYNC_MAX_RESULTS = 20
const AUTO_X_SYNC_MAX_RESULTS = 10
const AUTO_X_SYNC_INTERVAL_MS = 15 * 60 * 1000

function readInitialAuthSession() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(LOCAL_STORAGE_AUTH_SESSION_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) return null
    return {
      accessToken: parsed.accessToken.trim(),
      refreshToken:
        typeof parsed.refreshToken === 'string' && parsed.refreshToken.trim()
          ? parsed.refreshToken.trim()
          : null,
      expiresAt:
        typeof parsed.expiresAt === 'string' && parsed.expiresAt.trim()
          ? parsed.expiresAt.trim()
          : null,
      user:
        parsed.user && typeof parsed.user === 'object' && typeof parsed.user.id === 'string'
          ? parsed.user
          : null,
    }
  } catch {
    return null
  }
}

function readInitialAdminPanelOpen() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(LOCAL_STORAGE_ADMIN_PANEL_OPEN_KEY) === '1'
}

function describeError(error) {
  if (!error) return 'Unknown error'
  const providerBody = error.body
  if (providerBody && typeof providerBody === 'object') {
    if (typeof providerBody.message === 'string' && providerBody.message.trim()) {
      return providerBody.message
    }
    if (typeof providerBody.error === 'string' && providerBody.error.trim()) {
      return providerBody.error
    }
  }
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function parseXConnectStatusFromUrl() {
  if (typeof window === 'undefined') return null

  const url = new URL(window.location.href)
  const status = url.searchParams.get('x_connect')
  if (!status) return null

  const payload = {
    status,
    xUsername: url.searchParams.get('x_username'),
    reason: url.searchParams.get('reason'),
    providerError: url.searchParams.get('provider_error'),
  }

  const keys = ['x_connect', 'x_username', 'reason', 'provider_error']
  keys.forEach((key) => url.searchParams.delete(key))
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)

  return payload
}

function statusBannerFromCallback(callbackStatus) {
  if (!callbackStatus) return null

  if (callbackStatus.status === 'success') {
    return {
      kind: 'success',
      text: callbackStatus.xUsername
        ? `X account connected: @${callbackStatus.xUsername}`
        : 'X account connected successfully.',
    }
  }

  return {
    kind: 'error',
    text: `X connect failed${callbackStatus.reason ? ` (${callbackStatus.reason})` : ''}.`,
  }
}

function buttonClass(active = false) {
  return `inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs md:text-sm transition-colors ${
    active
      ? 'bg-white text-black border-white'
      : 'bg-white/5 text-white border-white/10 hover:bg-white/10'
  }`
}

function parseCreatedAtTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

function sortItemsByCreatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const timestampDiff =
      parseCreatedAtTimestamp(b?.createdAt) - parseCreatedAtTimestamp(a?.createdAt)
    if (timestampDiff !== 0) return timestampDiff

    const aId = typeof a?.id === 'string' ? a.id : ''
    const bId = typeof b?.id === 'string' ? b.id : ''
    return bId.localeCompare(aId)
  })
}

export function GalleryContainer() {
  const [viewMode, setViewMode] = useState('grid')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [activeTags, setActiveTags] = useState([])
  const [authSession, setAuthSession] = useState(readInitialAuthSession)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [adminPanelOpen, setAdminPanelOpen] = useState(readInitialAdminPanelOpen)

  const [boards, setBoards] = useState([])
  const [activeBoardId, setActiveBoardId] = useState(null)
  const [items, setItems] = useState([])
  const [backendHealth, setBackendHealth] = useState(null)
  const [viewer, setViewer] = useState(null)

  const [isLoadingBoards, setIsLoadingBoards] = useState(true)
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [busyAction, setBusyAction] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const busyActionRef = useRef(null)

  const [dataError, setDataError] = useState(null)
  const [statusBanner, setStatusBanner] = useState(null)

  const accessToken = authSession?.accessToken ?? null
  const authOptions = useMemo(
    () => (accessToken ? { accessToken } : {}),
    [accessToken],
  )

  const activeBoard = useMemo(
    () => boards.find((board) => board.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  )
  const isSignedIn = Boolean(accessToken)
  const isAdmin = Boolean(viewer?.isAdmin)

  const allTags = useMemo(() => {
    const tagSet = new Set()
    items.forEach((item) => {
      item.tags?.forEach((tag) => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    if (activeTags.length === 0) return items
    return items.filter((item) =>
      activeTags.every((tag) =>
        item.tags?.some((itemTag) =>
          itemTag.toLowerCase().includes(tag.toLowerCase()),
        ),
      ),
    )
  }, [items, activeTags])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (authSession) {
      window.localStorage.setItem(LOCAL_STORAGE_AUTH_SESSION_KEY, JSON.stringify(authSession))
    } else {
      window.localStorage.removeItem(LOCAL_STORAGE_AUTH_SESSION_KEY)
    }
  }, [authSession])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      LOCAL_STORAGE_ADMIN_PANEL_OPEN_KEY,
      adminPanelOpen ? '1' : '0',
    )
  }, [adminPanelOpen])

  useEffect(() => {
    busyActionRef.current = busyAction
  }, [busyAction])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleKeyDown = (event) => {
      const isToggleHotkey =
        event.shiftKey && String(event.key).toLowerCase() === 'a'
      if (!isToggleHotkey) return

      const target = event.target
      const tagName = typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : ''
      if (tagName === 'input' || tagName === 'textarea' || target?.isContentEditable) {
        return
      }

      event.preventDefault()
      setAdminPanelOpen((prev) => !prev)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    const callbackStatus = parseXConnectStatusFromUrl()
    if (!callbackStatus) return

    setStatusBanner(statusBannerFromCallback(callbackStatus))
    setReloadToken((prev) => prev + 1)
  }, [])

  useEffect(() => {
    let isCancelled = false

    async function loadHealth() {
      try {
        const health = await galleryApi.getHealth()
        if (!isCancelled) {
          setBackendHealth(health)
        }
      } catch {
        if (!isCancelled) {
          setBackendHealth(null)
        }
      }
    }

    loadHealth()

    return () => {
      isCancelled = true
    }
  }, [reloadToken])

  useEffect(() => {
    let isCancelled = false

    async function loadViewer() {
      if (!accessToken) {
        if (!isCancelled) setViewer(null)
        return
      }
      try {
        const response = await galleryApi.getAccountMe(authOptions)
        if (!isCancelled) {
          setViewer(response?.user ?? null)
        }
      } catch {
        if (!isCancelled) {
          setViewer(null)
        }
      }
    }

    loadViewer()

    return () => {
      isCancelled = true
    }
  }, [reloadToken, authOptions, accessToken])

  useEffect(() => {
    let isCancelled = false

    async function loadBoards() {
      setIsLoadingBoards(true)
      setDataError(null)

      try {
        const response = await galleryApi.listBoards(authOptions)
        const nextBoards = Array.isArray(response?.boards) ? response.boards : []

        if (isCancelled) return

        setBoards(nextBoards)
        setActiveBoardId(nextBoards[0]?.id ?? null)

        if (nextBoards.length === 0) {
          setItems([])
        }
      } catch (error) {
        if (isCancelled) return
        setBoards([])
        setActiveBoardId(null)
        setItems([])
        setDataError(describeError(error))
      } finally {
        if (!isCancelled) {
          setIsLoadingBoards(false)
        }
      }
    }

    loadBoards()

    return () => {
      isCancelled = true
    }
  }, [reloadToken, authOptions])

  useEffect(() => {
    if (!activeBoardId) return undefined

    let isCancelled = false

    async function loadBoardItems() {
      setIsLoadingItems(true)
      setDataError(null)

      try {
        const response = await galleryApi.getBoardItems(activeBoardId, authOptions)
        const nextItems = Array.isArray(response?.items)
          ? sortItemsByCreatedAtDesc(response.items)
          : []

        if (!isCancelled) {
          setItems(nextItems)
        }
      } catch (error) {
        if (!isCancelled) {
          setItems([])
          setDataError(describeError(error))
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingItems(false)
        }
      }
    }

    loadBoardItems()

    return () => {
      isCancelled = true
    }
  }, [activeBoardId, reloadToken, authOptions])

  useEffect(() => {
    setCurrentIndex((prev) => {
      if (filteredItems.length === 0) return 0
      return Math.min(prev, filteredItems.length - 1)
    })
  }, [filteredItems.length])

  useEffect(() => {
    if (!isSignedIn || !viewer || isAdmin) return
    setStatusBanner({
      kind: 'error',
      text: 'This account is authenticated but not configured as admin.',
    })
  }, [isSignedIn, viewer, isAdmin])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!isAdmin) return undefined

    const intervalId = window.setInterval(async () => {
      if (window.document.visibilityState === 'hidden') return
      if (busyActionRef.current) return

      try {
        const response = await galleryApi.runXSync(
          {
            maxResults: AUTO_X_SYNC_MAX_RESULTS,
            triggeredBy: 'poll',
            boardId: activeBoardId ?? undefined,
          },
          authOptions,
        )
        const processed = response?.summary?.processedItems ?? 0
        if (processed > 0) {
          setStatusBanner({
            kind: 'success',
            text: `Auto-sync imported ${processed} new liked post(s).`,
          })
          setReloadToken((prev) => prev + 1)
        }
      } catch (error) {
        if (error?.body?.error === 'x_not_connected') return
        console.warn('Auto X sync failed', error)
      }
    }, AUTO_X_SYNC_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [authOptions, activeBoardId, isAdmin])

  const handleTagsChange = (newTags) => {
    setActiveTags(newTags)
    if (newTags.length > 0 && viewMode === 'single') {
      setViewMode('grid')
    }
  }

  const handleNext = () => {
    if (filteredItems.length === 0) return
    setCurrentIndex((prev) => (prev + 1) % filteredItems.length)
  }

  const handlePrev = () => {
    if (filteredItems.length === 0) return
    setCurrentIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length)
  }

  const handleSelectFromGrid = (item) => {
    const filteredIndex = filteredItems.findIndex((fi) => fi.id === item.id)
    if (filteredIndex < 0) return
    setCurrentIndex(filteredIndex)
    setViewMode('single')
  }

  const triggerReload = () => {
    setReloadToken((prev) => prev + 1)
  }

  const withBusyAction = async (actionName, fn) => {
    if (busyAction) return
    setBusyAction(actionName)
    try {
      await fn()
    } finally {
      setBusyAction(null)
    }
  }

  const handleRefresh = async () => {
    await withBusyAction('refresh', async () => {
      triggerReload()
      setStatusBanner({
        kind: 'info',
        text: 'Refreshing boards and items from backend...',
      })
    })
  }

  const handleLogin = async () => {
    const email = loginEmail.trim()
    const password = loginPassword
    if (!email || !password) {
      setStatusBanner({
        kind: 'error',
        text: 'Enter both email and password to sign in.',
      })
      return
    }

    await withBusyAction('login', async () => {
      try {
        const response = await galleryApi.login({ email, password })
        const session = response?.session
        if (!session?.accessToken) {
          throw new Error('Login succeeded but no access token was returned.')
        }

        setAuthSession({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken ?? null,
          expiresAt: session.expiresAt ?? null,
          user: response?.user ?? null,
        })
        setLoginPassword('')
        setShowLoginForm(false)
        setStatusBanner({
          kind: 'success',
          text: 'Signed in.',
        })
        triggerReload()
      } catch (error) {
        setStatusBanner({
          kind: 'error',
          text: `Sign in failed: ${describeError(error)}`,
        })
      }
    })
  }

  const handleAdminBootstrap = async () => {
    await withBusyAction('bootstrap_admin', async () => {
      try {
        const response = await galleryApi.bootstrapAdmin(authOptions)
        if (response?.user?.isAdmin) {
          setStatusBanner({
            kind: 'success',
            text: 'Admin role granted to your account.',
          })
          triggerReload()
          return
        }
        setStatusBanner({
          kind: 'info',
          text: 'Admin bootstrap completed.',
        })
      } catch (error) {
        setStatusBanner({
          kind: 'error',
          text: `Admin bootstrap failed: ${describeError(error)}`,
        })
      }
    })
  }

  const handleLogout = () => {
    setAuthSession(null)
    setViewer(null)
    setBusyAction(null)
    setLoginPassword('')
    setShowLoginForm(false)
    setStatusBanner({
      kind: 'info',
      text: 'Signed out.',
    })
    triggerReload()
  }

  const handleConnectX = async () => {
    await withBusyAction('connect_x', async () => {
      try {
        const response = await galleryApi.startXConnect(authOptions)
        if (!response?.authorizationUrl) {
          throw new Error('Backend did not return an authorization URL.')
        }

        setStatusBanner({
          kind: 'info',
          text: 'Redirecting to X for authorization...',
        })

        window.location.assign(response.authorizationUrl)
      } catch (error) {
        setStatusBanner({
          kind: 'error',
          text: `X connect start failed: ${describeError(error)}`,
        })
      }
    })
  }

  const handleSyncX = async () => {
    await withBusyAction('sync_x', async () => {
      try {
        const response = await galleryApi.runXSync(
          {
            maxResults: MANUAL_X_SYNC_MAX_RESULTS,
            boardId: activeBoardId ?? undefined,
          },
          authOptions,
        )
        const processed = response?.summary?.processedItems ?? 0
        const remaining = response?.summary?.rateLimit?.remaining
        setStatusBanner({
          kind: 'success',
          text:
            remaining != null
              ? `X likes sync complete. Imported ${processed} item(s). X API remaining: ${remaining}.`
              : `X likes sync complete. Imported ${processed} item(s).`,
        })
        triggerReload()
      } catch (error) {
        setStatusBanner({
          kind: 'error',
          text: `X sync failed: ${describeError(error)}`,
        })
      }
    })
  }

  const hasBoards = boards.length > 0
  const hasItems = items.length > 0
  const hasFilteredItems = filteredItems.length > 0
  const isLoading = isLoadingBoards || (activeBoardId && isLoadingItems && !hasItems)

  return (
    <div
      className={`bg-neutral-900 text-white flex flex-col ${viewMode === 'single' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
    >
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 py-6 bg-gradient-to-b from-[#0a0a0a]/90 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <button
            onClick={() => setAdminPanelOpen((prev) => !prev)}
            type="button"
            className="text-4xl font-serif tracking-tighter text-white italic"
            title="Toggle admin panel (Shift + A)"
          >
            Taito
          </button>
        </div>

        <SearchBar
          activeTags={activeTags}
          onTagsChange={handleTagsChange}
          allTags={allTags}
        />

        <nav className="pointer-events-auto flex items-center gap-2 bg-white/5 backdrop-blur-md rounded-full p-1 border border-white/10">
          <button
            onClick={() => setViewMode('single')}
            className={`p-2 rounded-full transition-all duration-300 ${viewMode === 'single' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            aria-label="Single View"
          >
            <Maximize2 size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-full transition-all duration-300 ${viewMode === 'grid' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
            aria-label="Grid View"
          >
            <Grid size={14} strokeWidth={1.5} />
          </button>
        </nav>
      </header>

      <div className="fixed left-4 right-4 bottom-4 z-40 pointer-events-none md:left-12 md:right-auto md:max-w-4xl">
        {adminPanelOpen ? (
          <div className="pointer-events-auto rounded-2xl border border-white/10 bg-black/65 backdrop-blur-xl p-3 md:p-4 shadow-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAdminPanelOpen(false)}
              className={buttonClass()}
              type="button"
            >
              Hide Panel
            </button>

            {isSignedIn ? (
              <button
                onClick={handleLogout}
                className={buttonClass()}
                disabled={Boolean(busyAction)}
                type="button"
              >
                Sign Out
              </button>
            ) : (
              <button
                onClick={() => setShowLoginForm((prev) => !prev)}
                className={buttonClass()}
                disabled={Boolean(busyAction)}
                type="button"
              >
                Sign In
              </button>
            )}

            {isAdmin ? (
              <>
                <button
                  onClick={handleRefresh}
                  className={buttonClass()}
                  disabled={Boolean(busyAction)}
                  type="button"
                >
                  {busyAction === 'refresh' ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  Refresh
                </button>

                <button
                  onClick={handleConnectX}
                  className={buttonClass()}
                  disabled={Boolean(busyAction)}
                  type="button"
                >
                  {busyAction === 'connect_x' ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <Link2 size={14} />
                  )}
                  Connect X
                </button>

                <button
                  onClick={handleSyncX}
                  className={buttonClass(true)}
                  disabled={Boolean(busyAction)}
                  type="button"
                >
                  {busyAction === 'sync_x' ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <CloudDownload size={14} />
                  )}
                  Sync Likes
                </button>
              </>
            ) : isSignedIn && viewer && !isAdmin ? (
              <button
                onClick={handleAdminBootstrap}
                className={buttonClass()}
                disabled={Boolean(busyAction)}
                type="button"
              >
                {busyAction === 'bootstrap_admin' ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Claim Admin (First User)
              </button>
            ) : (
              <span className="text-xs text-gray-400">
                Sign in as admin to manage sync and X connection.
              </span>
            )}
          </div>

          {!isSignedIn && showLoginForm ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className="h-9 min-w-[220px] rounded-full border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/40"
                placeholder="Email"
                autoComplete="username"
              />
              <input
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                className="h-9 min-w-[220px] rounded-full border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-white/40"
                placeholder="Password"
                type="password"
                autoComplete="current-password"
              />
              <button
                onClick={handleLogin}
                className={buttonClass(true)}
                disabled={Boolean(busyAction)}
                type="button"
              >
                {busyAction === 'login' ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : null}
                Continue
              </button>
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
            <span>API: {getApiBaseUrl()}</span>
            <span>Storage: {backendHealth?.storage ?? 'unknown'}</span>
            {viewer?.id ? <span>Role: {isAdmin ? 'admin' : 'viewer'}</span> : null}
            {activeBoard ? <span>Moodboard: {activeBoard.title}</span> : null}
            {isAdmin ? <span>Auto-like sync: every 15 min (10 posts max)</span> : null}
            <span>Toggle: logo or Shift + A</span>
          </div>

          {statusBanner ? (
            <div
              className={`mt-2 rounded-xl px-3 py-2 text-xs ${
                statusBanner.kind === 'error'
                  ? 'bg-red-500/15 text-red-200 border border-red-400/20'
                  : statusBanner.kind === 'success'
                    ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20'
                    : 'bg-white/5 text-gray-200 border border-white/10'
              }`}
            >
              {statusBanner.text}
            </div>
          ) : null}

          {dataError ? (
            <div className="mt-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              Backend error: {dataError}
            </div>
          ) : null}
          </div>
        ) : null}
      </div>

      <main className={`flex-1 ${viewMode === 'single' ? '' : 'pt-24'} pb-44 md:pb-36`}>
        {isLoading ? (
          <div className="h-full min-h-[50vh] flex items-center justify-center px-6">
            <div className="flex items-center gap-3 text-gray-300">
              <LoaderCircle size={18} className="animate-spin" />
              <span>Loading boards and images from backend...</span>
            </div>
          </div>
        ) : !hasBoards ? (
          <div className="h-full min-h-[50vh] flex items-center justify-center px-6">
            <div className="max-w-xl text-center">
              <h2 className="text-2xl md:text-3xl font-serif mb-3">No Boards Yet</h2>
              <p className="text-gray-400 text-sm md:text-base">
                {isSignedIn
                  ? 'Your moodboard is being initialized. Refresh if it does not appear.'
                  : 'No public moodboard is available yet.'}
              </p>
            </div>
          </div>
        ) : !hasFilteredItems ? (
          <div className="h-full min-h-[50vh] flex items-center justify-center px-6">
            <div className="max-w-xl text-center">
              <h2 className="text-2xl md:text-3xl font-serif mb-3">
                {hasItems ? 'No Matches' : 'Board Is Empty'}
              </h2>
              <p className="text-gray-400 text-sm md:text-base">
                {hasItems
                  ? 'Clear or change the active tags to see images again.'
                  : 'Run X sync to import likes into your moodboard.'}
              </p>
            </div>
          </div>
        ) : viewMode === 'single' ? (
          <div className="h-full w-full">
            <SingleImageView
              item={filteredItems[currentIndex]}
              onNext={handleNext}
              onPrev={handlePrev}
              currentIndex={currentIndex}
              totalItems={filteredItems.length}
            />
          </div>
        ) : (
          <div className="min-h-screen w-full">
            <GridGalleryView items={filteredItems} onSelect={handleSelectFromGrid} />
          </div>
        )}
      </main>
    </div>
  )
}
