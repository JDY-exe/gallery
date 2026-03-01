const DEFAULT_API_BASE_URL = 'http://localhost:8787'
const DEFAULT_MOCK_HEADER = 'x-demo-user-id'

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL
  if (typeof configured === 'string' && configured.trim()) {
    return trimTrailingSlash(configured.trim())
  }
  return DEFAULT_API_BASE_URL
}

export function getMockAuthHeaderName() {
  const configured = import.meta.env.VITE_MOCK_AUTH_HEADER
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().toLowerCase()
  }
  return DEFAULT_MOCK_HEADER
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  try {
    const text = await response.text()
    return text || null
  } catch {
    return null
  }
}

function buildHeaders({ mockUserId, accessToken = null, headers = {} } = {}) {
  const result = new Headers(headers)
  result.set('accept', 'application/json')

  if (mockUserId && !result.has(getMockAuthHeaderName())) {
    result.set(getMockAuthHeaderName(), mockUserId)
  }

  if (accessToken && !result.has('authorization')) {
    result.set('authorization', `Bearer ${accessToken}`)
  }

  return result
}

export async function apiRequest(path, options = {}) {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders({
      mockUserId: options.mockUserId,
      accessToken: options.accessToken,
      headers: options.headers,
    }),
  })

  const body = await parseResponse(response)

  if (!response.ok) {
    const error = new Error(
      (body && typeof body === 'object' && body.message) ||
        `Request failed (${response.status})`,
    )
    error.statusCode = response.status
    error.body = body
    throw error
  }

  return body
}

export const galleryApi = {
  getHealth(options = {}) {
    return apiRequest('/api/health', options)
  },

  login(payload, options = {}) {
    return apiRequest('/api/account/login', {
      ...options,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(payload),
    })
  },

  bootstrapAdmin(options = {}) {
    return apiRequest('/api/account/admin/bootstrap', {
      ...options,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: JSON.stringify({}),
    })
  },

  getAccountMe(options = {}) {
    return apiRequest('/api/account/me', options)
  },

  listBoards(options = {}) {
    return apiRequest('/api/boards', options)
  },

  getBoardItems(boardId, options = {}) {
    return apiRequest(`/api/boards/${boardId}/items`, options)
  },

  createBoard(payload, options = {}) {
    return apiRequest('/api/boards', {
      ...options,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(payload),
    })
  },

  startXConnect(options = {}) {
    return apiRequest('/api/x/connect/start', {
      ...options,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: JSON.stringify({}),
    })
  },

  runXSync(payload = {}, options = {}) {
    return apiRequest('/api/x/sync/run', {
      ...options,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: JSON.stringify(payload),
    })
  },
}
