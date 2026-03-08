import { useEffect, useMemo, useState } from 'react'
import { galleryApi } from '../../../lib/api'

const LOCAL_STORAGE_AUTH_SESSION_KEY = 'gallery.authSession'
const AUTH_SESSION_EXPIRY_GRACE_MS = 30 * 1000

function readInitialAuthSession() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(LOCAL_STORAGE_AUTH_SESSION_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) return null
    const expiresAt =
      typeof parsed.expiresAt === 'string' && parsed.expiresAt.trim()
        ? parsed.expiresAt.trim()
        : null
    if (expiresAt) {
      const expiresAtMs = Date.parse(expiresAt)
      if (
        !Number.isNaN(expiresAtMs) &&
        expiresAtMs <= Date.now() + AUTH_SESSION_EXPIRY_GRACE_MS
      ) {
        return null
      }
    }

    return {
      accessToken: parsed.accessToken.trim(),
      refreshToken:
        typeof parsed.refreshToken === 'string' && parsed.refreshToken.trim()
          ? parsed.refreshToken.trim()
          : null,
      expiresAt,
      user:
        parsed.user && typeof parsed.user === 'object' && typeof parsed.user.id === 'string'
          ? parsed.user
          : null,
    }
  } catch {
    return null
  }
}

export function useAuthSessionState({ reloadToken, setStatusBanner }) {
  const [authSession, setAuthSession] = useState(readInitialAuthSession)
  const [viewer, setViewer] = useState(null)

  const accessToken = authSession?.accessToken ?? null
  const authOptions = useMemo(
    () => (accessToken ? { accessToken } : {}),
    [accessToken],
  )

  const isSignedIn = Boolean(accessToken)
  const effectiveViewer = viewer ?? authSession?.user ?? null
  const hasResolvedViewer = Boolean(effectiveViewer?.id)
  const isAdmin = Boolean(effectiveViewer?.isAdmin)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (authSession) {
      window.localStorage.setItem(LOCAL_STORAGE_AUTH_SESSION_KEY, JSON.stringify(authSession))
    } else {
      window.localStorage.removeItem(LOCAL_STORAGE_AUTH_SESSION_KEY)
    }
  }, [authSession])

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
          const nextUser = response?.user ?? null
          setViewer(nextUser)
          setAuthSession((previous) => {
            if (!previous || !nextUser?.id) return previous
            if (
              previous.user?.id === nextUser.id &&
              previous.user?.isAdmin === nextUser.isAdmin
            ) {
              return previous
            }
            return {
              ...previous,
              user: nextUser,
            }
          })
        }
      } catch (error) {
        if (isCancelled) return
        if (error?.statusCode === 401) {
          setAuthSession(null)
          setViewer(null)
          setStatusBanner({
            kind: 'info',
            text: 'Session expired. Sign in again.',
          })
        }
      }
    }

    loadViewer()

    return () => {
      isCancelled = true
    }
  }, [reloadToken, authOptions, accessToken, setStatusBanner])

  return {
    authSession,
    setAuthSession,
    viewer,
    setViewer,
    accessToken,
    authOptions,
    isSignedIn,
    effectiveViewer,
    hasResolvedViewer,
    isAdmin,
  }
}
