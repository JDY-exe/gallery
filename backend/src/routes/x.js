import crypto from 'node:crypto'
import { requireAuth } from '../lib/auth.js'

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

export async function xRoutes(app) {
  app.post('/api/x/connect/start', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const state = createState()
    const codeVerifier = createPkceVerifier()
    const codeChallenge = createPkceChallenge(codeVerifier)
    const clientId = app.appConfig.x.clientId || 'mock-client-id'
    const requestedScopes = app.appConfig.x.scopes

    app.store.createXOAuthState({
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
        : 'Live OAuth start URL generated. Token exchange callback is still a stub.',
    }
  })

  app.get('/api/x/connect/callback', async (request, reply) => {
    const { state, code, error, error_description: errorDescription } =
      request.query ?? {}

    if (typeof error === 'string' && error) {
      return reply.code(400).send({
        error: 'x_oauth_error',
        providerError: error,
        providerErrorDescription:
          typeof errorDescription === 'string' ? errorDescription : null,
      })
    }

    if (typeof state !== 'string' || !state) {
      return reply.code(400).send({
        error: 'missing_state',
        message: 'Expected OAuth `state` query parameter.',
      })
    }

    const pendingState = app.store.consumeXOAuthState(state)
    if (!pendingState) {
      return reply.code(400).send({
        error: 'invalid_state',
        message: 'OAuth state was not found or already used.',
      })
    }

    if (typeof code !== 'string' || !code) {
      return reply.code(400).send({
        error: 'missing_code',
        message: 'Expected OAuth `code` query parameter.',
      })
    }

    if (app.appConfig.x.enableMockOAuth) {
      const mockConnection = app.store.upsertXConnection({
        userId: pendingState.userId,
        xUserId: `mock-x-${pendingState.userId}`,
        xUsername: `mock_${pendingState.userId.replace(/[^a-zA-Z0-9_]/g, '')}`,
        scopes: pendingState.requestedScopes,
        status: 'mock_connected',
      })

      return {
        connected: true,
        mode: 'mock',
        connection: mockConnection,
        note: 'Mock OAuth callback accepted. Replace this with real token exchange + user lookup.',
      }
    }

    return reply.code(501).send({
      error: 'not_implemented',
      message:
        'OAuth callback token exchange is not implemented yet. Next step: POST the code + code_verifier to X token endpoint and store encrypted tokens.',
      received: {
        userId: pendingState.userId,
        hasCode: Boolean(code),
      },
    })
  })

  app.post('/api/x/sync/run', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const connection = app.store.getXConnection(user.id)
    if (!connection) {
      return reply.code(400).send({
        error: 'x_not_connected',
        message: 'Connect an X account before running sync.',
      })
    }

    const run = app.store.recordXSyncRun({
      userId: user.id,
      triggeredBy: 'manual',
    })

    return reply.code(202).send({
      queued: true,
      run,
      connection,
      note: 'Sync worker is not implemented yet. This endpoint currently records a queued run only.',
    })
  })
}
