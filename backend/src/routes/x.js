import crypto from 'node:crypto'
import { requireAuth } from '../lib/auth.js'

const X_SYNC_MIN_RESULTS = 10
const X_SYNC_MAX_RESULTS = 20
const X_SYNC_DEFAULT_RESULTS = 20

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createPkceVerifier() {
  return base64Url(crypto.randomBytes(32))
}

function createPkceChallenge(verifier) {
  return base64Url(crypto.createHash('sha256').update(verifier).digest())
}

function createState() {
  return base64Url(crypto.randomBytes(16))
}

function isExpiredSoon(isoTimestamp, windowMs = 60_000) {
  if (!isoTimestamp) return false
  const ms = Date.parse(isoTimestamp)
  if (!Number.isFinite(ms)) return false
  return ms - windowMs <= Date.now()
}

function safeConnection(connection) {
  if (!connection) return null
  return {
    id: connection.id,
    userId: connection.userId,
    xUserId: connection.xUserId,
    xUsername: connection.xUsername,
    scopes: connection.scopes ?? [],
    status: connection.status,
    tokenType: connection.tokenType ?? 'bearer',
    tokenExpiresAt: connection.tokenExpiresAt ?? null,
    createdAt: connection.createdAt ?? null,
    updatedAt: connection.updatedAt ?? null,
    revokedAt: connection.revokedAt ?? null,
  }
}

function hashtagTags(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  const matches = text.match(/#[\p{L}\p{N}_-]+/gu) ?? []
  return Array.from(new Set(matches.map((tag) => tag.slice(1).toLowerCase()).filter(Boolean)))
}

function maxSnowflakeId(a, b) {
  if (!a) return b ?? null
  if (!b) return a ?? null
  try {
    return BigInt(a) >= BigInt(b) ? a : b
  } catch {
    return a > b ? a : b
  }
}

function sourcePostUrl(username, postId) {
  if (username) return `https://x.com/${username}/status/${postId}`
  return `https://x.com/i/web/status/${postId}`
}

function shouldRedirectBrowserCallback(request) {
  if (request.query?.return === 'json') return false
  const accept = String(request.headers.accept ?? '')
  return accept.includes('text/html')
}

function requireAdmin(user, reply) {
  if (user?.isAdmin) return true
  reply.code(403).send({
    error: 'forbidden',
    message: 'Admin privileges are required for this action.',
  })
  return false
}

function buildFrontendCallbackUrl(app, status, extras = {}) {
  const url = new URL(app.appConfig.runtime.frontendUrl)
  url.searchParams.set('x_connect', status)

  for (const [key, value] of Object.entries(extras)) {
    if (value == null || value === '') continue
    url.searchParams.set(key, String(value))
  }

  return url.toString()
}

async function ensureUsableXAccessToken(app, connection) {
  const tokenCrypto = app.services.tokenCrypto
  const xApi = app.services.xApi

  if (!tokenCrypto?.enabled) {
    throw new Error('ENCRYPTION_KEY must be set to use live X integration.')
  }
  if (!xApi) {
    throw new Error('X API service is not configured.')
  }
  if (!connection?.accessTokenEncrypted) {
    throw new Error('No stored X access token found for user.')
  }

  let accessToken = tokenCrypto.decrypt(connection.accessTokenEncrypted)
  let refreshToken = connection.refreshTokenEncrypted
    ? tokenCrypto.decrypt(connection.refreshTokenEncrypted)
    : null
  let activeConnection = connection
  let refreshed = false

  if (refreshToken && isExpiredSoon(connection.tokenExpiresAt)) {
    const refreshedToken = await xApi.refreshAccessToken({ refreshToken })
    activeConnection = await app.store.upsertXConnection({
      userId: connection.userId,
      xUserId: connection.xUserId,
      xUsername: connection.xUsername,
      scopes: refreshedToken.scope.length ? refreshedToken.scope : connection.scopes,
      status: 'connected',
      tokenType: refreshedToken.tokenType,
      accessTokenEncrypted: tokenCrypto.encrypt(refreshedToken.accessToken),
      refreshTokenEncrypted: refreshedToken.refreshToken
        ? tokenCrypto.encrypt(refreshedToken.refreshToken)
        : connection.refreshTokenEncrypted,
      tokenExpiresAt: refreshedToken.expiresAt,
    })

    accessToken = refreshedToken.accessToken
    refreshToken = refreshedToken.refreshToken ?? refreshToken
    refreshed = true
  }

  return {
    accessToken,
    refreshToken,
    connection: activeConnection,
    refreshed,
  }
}

function resolveLikeSinceId(syncState) {
  if (!syncState) return null
  return syncState.likeSinceId ?? syncState.bookmarkSinceId ?? null
}

function normalizeLikedRows(payload, { stopAtTweetId = null } = {}) {
  const tweets = Array.isArray(payload?.data) ? payload.data : []
  const includes = payload?.includes ?? {}
  const users = Array.isArray(includes.users) ? includes.users : []
  const media = Array.isArray(includes.media) ? includes.media : []

  const usersById = new Map(users.map((user) => [user.id, user]))
  const mediaByKey = new Map(media.map((item) => [item.media_key, item]))

  const rows = []
  let newestTweetId = null
  let reachedKnownTweet = false

  for (const tweet of tweets) {
    newestTweetId = maxSnowflakeId(newestTweetId, tweet?.id ?? null)

    // Stop once we hit the most recent like we have already seen in a prior run.
    if (stopAtTweetId && tweet?.id === stopAtTweetId) {
      reachedKnownTweet = true
      break
    }

    const mediaKeys = tweet?.attachments?.media_keys ?? []
    if (!Array.isArray(mediaKeys) || mediaKeys.length === 0) continue

    const photoMedia = mediaKeys
      .map((key) => mediaByKey.get(key))
      .filter((item) => item && item.type === 'photo' && item.url)
      .map((item) => ({
        mediaKey: item.media_key ?? null,
        mediaType: item.type ?? 'photo',
        srcUrl: item.url,
        width: item.width ?? null,
        height: item.height ?? null,
        altText: item.alt_text ?? null,
        aspectRatio:
          item.width && item.height ? Number(item.width) / Number(item.height) : null,
        status: 'active',
      }))

    if (!photoMedia.length) continue

    const author = usersById.get(tweet.author_id) ?? null

    rows.push({
      tweet,
      author,
      photoMedia,
      tags: hashtagTags(tweet.text ?? ''),
    })
  }

  return {
    rows,
    newestTweetId,
    reachedKnownTweet,
    tweetsReturned: tweets.length,
  }
}

async function ingestLikedPayload(app, { userId, boardId, payload, stopAtTweetId = null }) {
  const normalized = normalizeLikedRows(payload, { stopAtTweetId })
  let processed = 0
  let newestProcessedTweetId = null

  for (const row of normalized.rows) {
    const { tweet, author, photoMedia, tags } = row
    newestProcessedTweetId = maxSnowflakeId(newestProcessedTweetId, tweet.id)

    await app.store.upsertBoardItemWithMedia({
      boardId,
      addedByUserId: userId,
      sourceType: 'x_like',
      sourcePostId: tweet.id,
      sourcePostUrl: sourcePostUrl(author?.username ?? null, tweet.id),
      sourceAuthorId: author?.id ?? null,
      sourceAuthorUsername: author?.username ?? null,
      sourceAuthorDisplayName: author?.name ?? null,
      title: author?.username ? `@${author.username}` : 'X like',
      caption: tweet.text ?? null,
      media: photoMedia,
      tags: ['twitter', 'x', 'liked', ...tags],
      createdAt: tweet.created_at ?? null,
    })

    processed += 1
  }

  return {
    processedItems: processed,
    newestProcessedTweetId,
    newestSeenTweetId: normalized.newestTweetId,
    normalizedRows: normalized.rows.length,
    reachedKnownTweet: normalized.reachedKnownTweet,
    tweetsReturned: normalized.tweetsReturned,
  }
}

export async function xRoutes(app) {
  app.post('/api/x/connect/start', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    if (!requireAdmin(user, reply)) return

    if (!app.appConfig.x.enableMockOAuth && !app.appConfig.x.clientId) {
      return reply.code(500).send({
        error: 'x_not_configured',
        message: 'Set X_CLIENT_ID (and usually X_CLIENT_SECRET) in backend/.env.',
      })
    }

    const state = createState()
    const codeVerifier = createPkceVerifier()
    const codeChallenge = createPkceChallenge(codeVerifier)
    const clientId = app.appConfig.x.clientId || 'mock-client-id'
    const requestedScopes = app.appConfig.x.scopes

    await app.store.createXOAuthState({
      state,
      userId: user.id,
      codeVerifier,
      requestedScopes,
    })

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: app.appConfig.x.redirectUri,
      scope: requestedScopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    const authorizationUrl = `${app.appConfig.x.authorizeUrl}?${params.toString()}`

    return {
      mode: app.appConfig.x.enableMockOAuth ? 'mock-ready' : 'live',
      authorizationUrl,
      state,
      callbackUrl: app.appConfig.x.redirectUri,
      note: app.appConfig.x.enableMockOAuth
        ? 'Mock OAuth is enabled. You can hit the callback endpoint manually with any `code` and this `state` to simulate a connection.'
        : 'Open the authorizationUrl in a browser, approve access, then X will redirect back to the callback endpoint.',
    }
  })

  app.get('/api/x/connect/callback', async (request, reply) => {
    const { state, code, error, error_description: errorDescription } =
      request.query ?? {}
    const redirectBrowser = shouldRedirectBrowserCallback(request)

    if (typeof error === 'string' && error) {
      if (redirectBrowser) {
        return reply.redirect(
          buildFrontendCallbackUrl(app, 'error', {
            reason: 'provider_error',
            provider_error: error,
          }),
        )
      }
      return reply.code(400).send({
        error: 'x_oauth_error',
        providerError: error,
        providerErrorDescription:
          typeof errorDescription === 'string' ? errorDescription : null,
      })
    }

    if (typeof state !== 'string' || !state) {
      if (redirectBrowser) {
        return reply.redirect(
          buildFrontendCallbackUrl(app, 'error', {
            reason: 'missing_state',
          }),
        )
      }
      return reply.code(400).send({
        error: 'missing_state',
        message: 'Expected OAuth `state` query parameter.',
      })
    }

    const pendingState = await app.store.consumeXOAuthState(state)
    if (!pendingState) {
      if (redirectBrowser) {
        return reply.redirect(
          buildFrontendCallbackUrl(app, 'error', {
            reason: 'invalid_state',
          }),
        )
      }
      return reply.code(400).send({
        error: 'invalid_state',
        message: 'OAuth state was not found, expired, or already used.',
      })
    }

    if (typeof code !== 'string' || !code) {
      if (redirectBrowser) {
        return reply.redirect(
          buildFrontendCallbackUrl(app, 'error', {
            reason: 'missing_code',
          }),
        )
      }
      return reply.code(400).send({
        error: 'missing_code',
        message: 'Expected OAuth `code` query parameter.',
      })
    }

    if (app.appConfig.x.enableMockOAuth) {
      const mockConnection = await app.store.upsertXConnection({
        userId: pendingState.userId,
        xUserId: `mock-x-${pendingState.userId}`,
        xUsername: `mock_${pendingState.userId.replace(/[^a-zA-Z0-9_]/g, '')}`,
        scopes: pendingState.requestedScopes,
        status: 'mock_connected',
      })

      if (redirectBrowser) {
        return reply.redirect(
          buildFrontendCallbackUrl(app, 'success', {
            x_username: mockConnection.xUsername ?? '',
          }),
        )
      }

      return {
        connected: true,
        mode: 'mock',
        connection: safeConnection(mockConnection),
        note: 'Mock OAuth callback accepted.',
      }
    }

    try {
      const tokenCrypto = app.services.tokenCrypto
      if (!tokenCrypto?.enabled) {
        if (redirectBrowser) {
          return reply.redirect(
            buildFrontendCallbackUrl(app, 'error', {
              reason: 'missing_encryption_key',
            }),
          )
        }
        return reply.code(500).send({
          error: 'encryption_key_required',
          message: 'Set ENCRYPTION_KEY in backend/.env before connecting a live X account.',
        })
      }

      const tokenSet = await app.services.xApi.exchangeAuthorizationCode({
        code,
        redirectUri: app.appConfig.x.redirectUri,
        codeVerifier: pendingState.codeVerifier,
      })

      if (!tokenSet.accessToken) {
        if (redirectBrowser) {
          return reply.redirect(
            buildFrontendCallbackUrl(app, 'error', {
              reason: 'token_exchange_failed',
            }),
          )
        }
        return reply.code(502).send({
          error: 'x_token_exchange_failed',
          message: 'X token response did not include an access token.',
          details: tokenSet.raw ?? null,
        })
      }

      const meResponse = await app.services.xApi.getCurrentUser({
        accessToken: tokenSet.accessToken,
      })
      const xUser = meResponse.data?.data

      if (!xUser?.id) {
        if (redirectBrowser) {
          return reply.redirect(
            buildFrontendCallbackUrl(app, 'error', {
              reason: 'x_user_lookup_failed',
            }),
          )
        }
        return reply.code(502).send({
          error: 'x_user_lookup_failed',
          message: 'X /users/me response did not include a user id.',
          details: meResponse.data ?? null,
        })
      }

      const connection = await app.store.upsertXConnection({
        userId: pendingState.userId,
        xUserId: xUser.id,
        xUsername: xUser.username ?? `user_${xUser.id}`,
        scopes: tokenSet.scope.length ? tokenSet.scope : pendingState.requestedScopes,
        status: 'connected',
        tokenType: tokenSet.tokenType,
        accessTokenEncrypted: tokenCrypto.encrypt(tokenSet.accessToken),
        refreshTokenEncrypted: tokenSet.refreshToken
          ? tokenCrypto.encrypt(tokenSet.refreshToken)
          : null,
        tokenExpiresAt: tokenSet.expiresAt,
      })

      if (redirectBrowser) {
        return reply.redirect(
          buildFrontendCallbackUrl(app, 'success', {
            x_username: xUser.username ?? '',
          }),
        )
      }

      return {
        connected: true,
        mode: 'live',
        connection: safeConnection(connection),
        xUser: {
          id: xUser.id,
          username: xUser.username ?? null,
          name: xUser.name ?? null,
        },
        note: 'X account connected and tokens stored (encrypted).',
      }
    } catch (providerError) {
      request.log.error(
        {
          error:
            providerError instanceof Error ? providerError.message : String(providerError),
          statusCode: providerError?.statusCode ?? null,
          details: providerError?.details ?? null,
        },
        'X OAuth callback failed',
      )

      if (redirectBrowser) {
        return reply.redirect(
          buildFrontendCallbackUrl(app, 'error', {
            reason: 'x_connect_failed',
          }),
        )
      }

      return reply.code(providerError?.statusCode ?? 500).send({
        error: 'x_connect_failed',
        message:
          providerError instanceof Error ? providerError.message : 'Unknown X connect error.',
        details: providerError?.details ?? null,
      })
    }
  })

  app.post('/api/x/sync/run', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    if (!requireAdmin(user, reply)) return

    const connection = await app.store.getXConnection(user.id)
    if (!connection) {
      return reply.code(400).send({
        error: 'x_not_connected',
        message: 'Connect an X account before running sync.',
      })
    }

    const run = await app.store.recordXSyncRun({
      userId: user.id,
      triggeredBy: request.body?.triggeredBy === 'poll' ? 'poll' : 'manual',
    })

    try {
      await app.store.updateXSyncRun?.(run.id, { status: 'running' })

      let tokenState = await ensureUsableXAccessToken(app, connection)
      const syncState = (await app.store.getXSyncState?.(user.id)) ?? null
      const targetBoard = await app.store.ensureDefaultBoard(user.id)
      const requestedBoardId =
        typeof request.body?.boardId === 'string' && request.body.boardId.trim()
          ? request.body.boardId.trim()
          : null

      if (requestedBoardId && requestedBoardId !== targetBoard.id) {
        return reply.code(400).send({
          error: 'single_board_enforced',
          message:
            'One moodboard per user is enabled. Sync always targets your default board.',
          boardId: targetBoard.id,
        })
      }
      const requestedMaxResults = request.body?.maxResults
      const maxResults =
        Math.min(
          Math.max(
            typeof requestedMaxResults === 'number'
              ? requestedMaxResults
              : Number.isFinite(Number(requestedMaxResults))
                ? Number(requestedMaxResults)
                : X_SYNC_DEFAULT_RESULTS,
            X_SYNC_MIN_RESULTS,
          ),
          X_SYNC_MAX_RESULTS,
        )
      const likeSinceId = resolveLikeSinceId(syncState)

      let likesResponse
      try {
        likesResponse = await app.services.xApi.listLikedTweets({
          xUserId: tokenState.connection.xUserId,
          accessToken: tokenState.accessToken,
          maxResults,
        })
      } catch (error) {
        if (
          error?.statusCode === 401 &&
          tokenState.refreshToken &&
          !tokenState.refreshed
        ) {
          const refreshed = await app.services.xApi.refreshAccessToken({
            refreshToken: tokenState.refreshToken,
          })
          const tokenCrypto = app.services.tokenCrypto
          const updatedConnection = await app.store.upsertXConnection({
            userId: connection.userId,
            xUserId: connection.xUserId,
            xUsername: connection.xUsername,
            scopes: refreshed.scope.length ? refreshed.scope : connection.scopes,
            status: 'connected',
            tokenType: refreshed.tokenType,
            accessTokenEncrypted: tokenCrypto.encrypt(refreshed.accessToken),
            refreshTokenEncrypted: refreshed.refreshToken
              ? tokenCrypto.encrypt(refreshed.refreshToken)
              : connection.refreshTokenEncrypted,
            tokenExpiresAt: refreshed.expiresAt,
          })

          tokenState = {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken ?? tokenState.refreshToken,
            connection: updatedConnection,
            refreshed: true,
          }

          likesResponse = await app.services.xApi.listLikedTweets({
            xUserId: tokenState.connection.xUserId,
            accessToken: tokenState.accessToken,
            maxResults,
          })
        } else {
          throw error
        }
      }

      const ingestResult = await ingestLikedPayload(app, {
        userId: user.id,
        boardId: targetBoard.id,
        payload: likesResponse.data,
        stopAtTweetId: likeSinceId,
      })

      const nextSinceId = maxSnowflakeId(
        likeSinceId,
        ingestResult.newestSeenTweetId,
      )

      const syncPatch = {
        likeSinceId: nextSinceId,
        likeNextToken: likesResponse.data?.meta?.next_token ?? null,
        // Keep legacy bookmark fields in sync for backward compatibility.
        bookmarkSinceId: nextSinceId,
        bookmarkNextToken: likesResponse.data?.meta?.next_token ?? null,
        lastLikeSyncAt: new Date().toISOString(),
        lastBookmarkSyncAt: new Date().toISOString(),
        lastSyncStatus: 'success',
        lastError: null,
      }

      await app.store.upsertXSyncState?.(user.id, syncPatch)

      const completedRun = (await app.store.updateXSyncRun?.(run.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        itemsCreated: ingestResult.processedItems,
        itemsUpdated: 0,
        rawResult: {
          processedItems: ingestResult.processedItems,
          normalizedRows: ingestResult.normalizedRows,
          tweetsReturned: ingestResult.tweetsReturned,
          reachedKnownTweet: ingestResult.reachedKnownTweet,
          nextSinceId,
          xRateLimit: likesResponse.rateLimit,
          maxResults,
          source: 'likes',
          cursorMode: 'global',
          boardId: targetBoard.id,
        },
        errorMessage: null,
      })) ?? run

      return reply.code(202).send({
        queued: false,
        synced: true,
        boardId: targetBoard.id,
        run: completedRun,
        connection: safeConnection(tokenState.connection),
        summary: {
          processedItems: ingestResult.processedItems,
          newestTweetId: ingestResult.newestSeenTweetId,
          newestProcessedTweetId: ingestResult.newestProcessedTweetId,
          rateLimit: likesResponse.rateLimit,
          maxResults,
        },
        note: 'Likes sync completed synchronously for MVP. Move this into a worker next.',
      })
    } catch (syncError) {
      request.log.error(
        {
          error: syncError instanceof Error ? syncError.message : String(syncError),
          statusCode: syncError?.statusCode ?? null,
          details: syncError?.details ?? null,
        },
        'X sync failed',
      )

      await app.store.upsertXSyncState?.(user.id, {
        lastLikeSyncAt: new Date().toISOString(),
        lastBookmarkSyncAt: new Date().toISOString(),
        lastSyncStatus: 'failed',
        lastError:
          syncError instanceof Error ? syncError.message : 'Unknown sync error',
      })

      const failedRun = (await app.store.updateXSyncRun?.(run.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage:
          syncError instanceof Error ? syncError.message : 'Unknown sync error',
        rawResult: syncError?.details ?? null,
      })) ?? run

      return reply.code(syncError?.statusCode ?? 500).send({
        error: 'x_sync_failed',
        message:
          syncError instanceof Error ? syncError.message : 'Unknown X sync error.',
        details: syncError?.details ?? null,
        run: failedRun,
      })
    }
  })
}
