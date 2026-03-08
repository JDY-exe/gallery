export const MANUAL_X_SYNC_MAX_RESULTS = 20
export const AUTO_X_SYNC_MAX_RESULTS = 10
export const AUTO_X_SYNC_INTERVAL_MS = 15 * 60 * 1000

export function describeError(error) {
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

export function parseXConnectStatusFromUrl() {
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

export function statusBannerFromCallback(callbackStatus) {
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

function parseCreatedAtTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

export function sortItemsByCreatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const timestampDiff =
      parseCreatedAtTimestamp(b?.createdAt) - parseCreatedAtTimestamp(a?.createdAt)
    if (timestampDiff !== 0) return timestampDiff

    const aId = typeof a?.id === 'string' ? a.id : ''
    const bId = typeof b?.id === 'string' ? b.id : ''
    return bId.localeCompare(aId)
  })
}
