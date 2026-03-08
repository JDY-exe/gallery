import React, { useEffect, useMemo, useRef, useState } from 'react'
import { galleryApi, getApiBaseUrl } from '../lib/api'
import { AdminPanel } from './gallery/AdminPanel'
import { GalleryContent } from './gallery/GalleryContent'
import { GalleryHeader } from './gallery/GalleryHeader'
import { useAdminPanelState } from './gallery/hooks/useAdminPanelState'
import { useAuthSessionState } from './gallery/hooks/useAuthSessionState'
import { useGalleryData } from './gallery/hooks/useGalleryData'
import {
  AUTO_X_SYNC_INTERVAL_MS,
  AUTO_X_SYNC_MAX_RESULTS,
  MANUAL_X_SYNC_MAX_RESULTS,
  describeError,
  parseXConnectStatusFromUrl,
  statusBannerFromCallback,
} from './gallery/utils'

export function GalleryContainer() {
  const [viewMode, setViewMode] = useState('grid')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [activeTags, setActiveTags] = useState([])
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showLoginForm, setShowLoginForm] = useState(false)
  const { adminPanelOpen, setAdminPanelOpen } = useAdminPanelState()

  const [busyAction, setBusyAction] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const busyActionRef = useRef(null)

  const [statusBanner, setStatusBanner] = useState(null)

  const {
    setAuthSession,
    setViewer,
    authOptions,
    isSignedIn,
    effectiveViewer,
    hasResolvedViewer,
    isAdmin,
  } = useAuthSessionState({ reloadToken, setStatusBanner })

  const {
    boards,
    activeBoardId,
    activeBoard,
    items,
    backendHealth,
    isLoadingBoards,
    isLoadingItems,
    dataError,
  } = useGalleryData({ reloadToken, authOptions })

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
        item.tags?.some((itemTag) => itemTag.toLowerCase().includes(tag.toLowerCase())),
      ),
    )
  }, [items, activeTags])

  useEffect(() => {
    busyActionRef.current = busyAction
  }, [busyAction])

  useEffect(() => {
    const callbackStatus = parseXConnectStatusFromUrl()
    if (!callbackStatus) return

    setStatusBanner(statusBannerFromCallback(callbackStatus))
    setReloadToken((prev) => prev + 1)
  }, [])

  useEffect(() => {
    setCurrentIndex((prev) => {
      if (filteredItems.length === 0) return 0
      return Math.min(prev, filteredItems.length - 1)
    })
  }, [filteredItems.length])

  useEffect(() => {
    if (!isSignedIn || !hasResolvedViewer || isAdmin) return
    setStatusBanner({
      kind: 'error',
      text: 'This account is authenticated but not configured as admin.',
    })
  }, [isSignedIn, hasResolvedViewer, isAdmin])

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
    const filteredIndex = filteredItems.findIndex((filteredItem) => filteredItem.id === item.id)
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
        setViewer(response?.user ?? null)
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
          setViewer(response.user)
          setAuthSession((previous) =>
            previous
              ? {
                  ...previous,
                  user: response.user,
                }
              : previous,
          )
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
  const roleLabel = effectiveViewer?.id ? (isAdmin ? 'admin' : 'viewer') : null

  return (
    <div
      className={`bg-neutral-900 text-white flex flex-col ${viewMode === 'single' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
    >
      <GalleryHeader
        onToggleAdminPanel={() => setAdminPanelOpen((prev) => !prev)}
        activeTags={activeTags}
        onTagsChange={handleTagsChange}
        allTags={allTags}
        viewMode={viewMode}
        onSetViewMode={setViewMode}
      />

      <AdminPanel
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        isSignedIn={isSignedIn}
        busyAction={busyAction}
        onLogout={handleLogout}
        onToggleLoginForm={() => setShowLoginForm((prev) => !prev)}
        isAdmin={isAdmin}
        hasResolvedViewer={hasResolvedViewer}
        onAdminBootstrap={handleAdminBootstrap}
        onRefresh={handleRefresh}
        onConnectX={handleConnectX}
        onSyncX={handleSyncX}
        showLoginForm={showLoginForm}
        loginEmail={loginEmail}
        onLoginEmailChange={setLoginEmail}
        loginPassword={loginPassword}
        onLoginPasswordChange={setLoginPassword}
        onLogin={handleLogin}
        apiBaseUrl={getApiBaseUrl()}
        backendStorage={backendHealth?.storage ?? 'unknown'}
        roleLabel={roleLabel}
        activeBoardTitle={activeBoard?.title ?? null}
        statusBanner={statusBanner}
        dataError={dataError}
      />

      <GalleryContent
        viewMode={viewMode}
        isLoading={isLoading}
        hasBoards={hasBoards}
        hasItems={hasItems}
        hasFilteredItems={hasFilteredItems}
        isSignedIn={isSignedIn}
        filteredItems={filteredItems}
        currentIndex={currentIndex}
        onNext={handleNext}
        onPrev={handlePrev}
        onSelectFromGrid={handleSelectFromGrid}
      />
    </div>
  )
}
