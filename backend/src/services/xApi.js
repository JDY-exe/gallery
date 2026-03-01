function encodeBasicAuth(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')
}

function withQuery(urlString, params) {
  const url = new URL(urlString)
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url
}

async function parseErrorResponse(response) {
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

function rateLimitHeaders(headers) {
  const limit = headers.get('x-rate-limit-limit')
  const remaining = headers.get('x-rate-limit-remaining')
  const reset = headers.get('x-rate-limit-reset')
  if (!limit && !remaining && !reset) return null

  return {
    limit: limit ? Number(limit) : null,
    remaining: remaining ? Number(remaining) : null,
    reset: reset ? Number(reset) : null,
  }
}

function normalizeTokenPayload(payload) {
  const scope =
    typeof payload.scope === 'string'
      ? payload.scope.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
      : Array.isArray(payload.scope)
        ? payload.scope
        : []

  const expiresIn =
    typeof payload.expires_in === 'number'
      ? payload.expires_in
      : Number.isFinite(Number(payload.expires_in))
        ? Number(payload.expires_in)
        : null

  const tokenType =
    typeof payload.token_type === 'string' ? payload.token_type : 'bearer'

  const issuedAt = new Date()
  const expiresAt =
    expiresIn != null ? new Date(issuedAt.getTime() + expiresIn * 1000).toISOString() : null

  return {
    accessToken: payload.access_token ?? null,
    refreshToken: payload.refresh_token ?? null,
    tokenType,
    scope,
    expiresIn,
    expiresAt,
    raw: payload,
  }
}

export function createXApiService(config) {
  const xConfig = config.x

  async function exchangeToken(grantParams) {
    if (!xConfig.clientId) {
      throw new Error('X_CLIENT_ID is missing.')
    }

    const headers = {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    }

    if (xConfig.clientSecret) {
      headers.authorization = `Basic ${encodeBasicAuth(
        xConfig.clientId,
        xConfig.clientSecret,
      )}`
    }

    const body = new URLSearchParams({
      client_id: xConfig.clientId,
      ...grantParams,
    })

    const response = await fetch(xConfig.tokenUrl, {
      method: 'POST',
      headers,
      body,
    })

    if (!response.ok) {
      const details = await parseErrorResponse(response)
      const error = new Error('X token exchange failed.')
      error.statusCode = response.status
      error.details = details
      throw error
    }

    const payload = await response.json()
    return normalizeTokenPayload(payload)
  }

  async function getJson(url, { accessToken }) {
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      const details = await parseErrorResponse(response)
      const error = new Error('X API request failed.')
      error.statusCode = response.status
      error.details = details
      error.rateLimit = rateLimitHeaders(response.headers)
      throw error
    }

    const json = await response.json()
    return {
      data: json,
      rateLimit: rateLimitHeaders(response.headers),
    }
  }

  return {
    async exchangeAuthorizationCode({ code, redirectUri, codeVerifier }) {
      return exchangeToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      })
    },

    async refreshAccessToken({ refreshToken }) {
      return exchangeToken({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      })
    },

    async getCurrentUser({ accessToken }) {
      const url = withQuery(`${xConfig.apiBaseUrl}/users/me`, {
        'user.fields': 'id,username,name,profile_image_url',
      })
      return getJson(url.toString(), { accessToken })
    },

    async listLikedTweets({ xUserId, accessToken, maxResults = 20, paginationToken }) {
      const url = withQuery(`${xConfig.apiBaseUrl}/users/${xUserId}/liked_tweets`, {
        max_results: Math.min(Math.max(Number(maxResults) || 20, 10), 20),
        expansions: 'attachments.media_keys,author_id',
        'tweet.fields':
          'id,text,created_at,author_id,attachments,public_metrics,lang',
        'user.fields': 'id,username,name',
        'media.fields': 'media_key,type,url,width,height,alt_text',
        pagination_token: paginationToken,
      })

      return getJson(url.toString(), { accessToken })
    },
  }
}
