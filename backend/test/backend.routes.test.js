import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from '../src/app.js'

const MOCK_HEADER = 'x-demo-user-id'

function createTestConfig({ frontendUrl = 'http://localhost:5173' } = {}) {
  return {
    runtime: {
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 0,
      apiPublicUrl: 'http://127.0.0.1:8787',
      frontendUrl,
      logLevel: 'silent',
      enableMockAuth: true,
      mockUserHeader: MOCK_HEADER,
      dotenvFilesLoaded: [],
    },
    supabase: {
      url: null,
      anonKey: null,
      serviceRoleKey: null,
    },
    database: {
      url: null,
    },
    x: {
      clientId: null,
      clientSecret: null,
      redirectUri: 'http://127.0.0.1:8787/api/x/connect/callback',
      scopes: ['tweet.read', 'users.read', 'like.read', 'offline.access'],
      apiBaseUrl: 'https://api.x.com/2',
      authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.x.com/2/oauth2/token',
      enableMockOAuth: true,
    },
    security: {
      encryptionKey: null,
    },
  }
}

async function createTestApp(options = {}) {
  const app = buildApp({
    appConfig: createTestConfig(options),
  })
  await app.ready()
  return app
}

function parseJson(response) {
  return response.body ? JSON.parse(response.body) : null
}

async function withApp(run, options = {}) {
  const app = await createTestApp(options)
  try {
    await run(app)
  } finally {
    await app.close()
  }
}

test('GET / returns service metadata', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 200)
    const payload = parseJson(response)
    assert.equal(payload.service, 'gallery-backend')
    assert.equal(payload.status, 'ok')
    assert.equal(payload.docs.health, '/api/health')
  })
})

test('GET /api/health reports runtime + feature flags', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    assert.equal(response.statusCode, 200)
    const payload = parseJson(response)
    assert.equal(payload.ok, true)
    assert.equal(payload.env, 'test')
    assert.equal(payload.config.mockAuthEnabled, true)
    assert.equal(payload.config.supabaseConfigured, false)
    assert.equal(payload.config.xMockOAuthEnabled, true)
  })
})

test('CORS allows localhost and 127.0.0.1 variants of frontend origin', async () => {
  await withApp(async (app) => {
    const allowed = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'http://127.0.0.1:5173',
      },
    })

    assert.equal(allowed.statusCode, 200)
    assert.equal(
      allowed.headers['access-control-allow-origin'],
      'http://127.0.0.1:5173',
    )

    const blocked = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: {
        origin: 'http://malicious.example',
      },
    })

    assert.equal(blocked.statusCode, 200)
    assert.equal(blocked.headers['access-control-allow-origin'], undefined)
  })
})

test('GET /api/boards returns public admin boards when unauthenticated', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/boards',
    })

    assert.equal(response.statusCode, 200)
    const payload = parseJson(response)
    assert.ok(Array.isArray(payload.boards))
    assert.ok(payload.boards.length >= 1)
    assert.ok(payload.boards.every((board) => board.isPublic === true))
    assert.ok(payload.boards.every((board) => board.ownerUserId === 'demo-user'))
  })
})

test('POST /api/boards requires auth', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/boards',
      headers: {
        'content-type': 'application/json',
      },
      payload: { title: 'Should fail' },
    })

    assert.equal(response.statusCode, 401)
    const payload = parseJson(response)
    assert.equal(payload.error, 'unauthorized')
    assert.match(payload.hint, /x-demo-user-id/i)
  })
})

test('POST /api/boards enforces one board per user', async () => {
  await withApp(async (app) => {
    const createFirst = await app.inject({
      method: 'POST',
      url: '/api/boards',
      headers: {
        [MOCK_HEADER]: 'alice',
        'content-type': 'application/json',
      },
      payload: {
        title: 'Alice Board',
      },
    })

    assert.equal(createFirst.statusCode, 201)
    const firstPayload = parseJson(createFirst)
    assert.equal(firstPayload.board.ownerUserId, 'alice')

    const createSecond = await app.inject({
      method: 'POST',
      url: '/api/boards',
      headers: {
        [MOCK_HEADER]: 'alice',
        'content-type': 'application/json',
      },
      payload: {
        title: 'Alice Board 2',
      },
    })

    assert.equal(createSecond.statusCode, 409)
    const secondPayload = parseJson(createSecond)
    assert.equal(secondPayload.error, 'single_board_enforced')
  })
})

test('private boards are hidden from unauthenticated requests', async () => {
  await withApp(async (app) => {
    const createBoard = await app.inject({
      method: 'POST',
      url: '/api/boards',
      headers: {
        [MOCK_HEADER]: 'bob',
        'content-type': 'application/json',
      },
      payload: {
        title: 'Bob Private',
        isPublic: false,
      },
    })
    assert.equal(createBoard.statusCode, 201)
    const boardId = parseJson(createBoard).board.id

    const unauthRead = await app.inject({
      method: 'GET',
      url: `/api/boards/${boardId}`,
    })

    assert.equal(unauthRead.statusCode, 404)
    assert.equal(parseJson(unauthRead).error, 'board_not_found')

    const authRead = await app.inject({
      method: 'GET',
      url: `/api/boards/${boardId}`,
      headers: {
        [MOCK_HEADER]: 'bob',
      },
    })

    assert.equal(authRead.statusCode, 200)
    assert.equal(parseJson(authRead).board.id, boardId)
  })
})

test('PATCH /api/boards/:id validates patch fields and ownership', async () => {
  await withApp(async (app) => {
    const createBoard = await app.inject({
      method: 'POST',
      url: '/api/boards',
      headers: {
        [MOCK_HEADER]: 'carol',
        'content-type': 'application/json',
      },
      payload: {
        title: 'Carol Board',
      },
    })
    assert.equal(createBoard.statusCode, 201)
    const boardId = parseJson(createBoard).board.id

    const invalidPatch = await app.inject({
      method: 'PATCH',
      url: `/api/boards/${boardId}`,
      headers: {
        [MOCK_HEADER]: 'carol',
        'content-type': 'application/json',
      },
      payload: {},
    })
    assert.equal(invalidPatch.statusCode, 400)
    assert.equal(parseJson(invalidPatch).error, 'validation_error')

    const wrongOwner = await app.inject({
      method: 'PATCH',
      url: `/api/boards/${boardId}`,
      headers: {
        [MOCK_HEADER]: 'mallory',
        'content-type': 'application/json',
      },
      payload: { title: 'Hijacked' },
    })
    assert.equal(wrongOwner.statusCode, 404)
    assert.equal(parseJson(wrongOwner).error, 'board_not_found')

    const validPatch = await app.inject({
      method: 'PATCH',
      url: `/api/boards/${boardId}`,
      headers: {
        [MOCK_HEADER]: 'carol',
        'content-type': 'application/json',
      },
      payload: { title: 'Carol Board Updated', description: '  still mine  ' },
    })
    assert.equal(validPatch.statusCode, 200)
    const patchedPayload = parseJson(validPatch)
    assert.equal(patchedPayload.board.title, 'Carol Board Updated')
    assert.equal(patchedPayload.board.description, 'still mine')
  })
})

test('GET /api/account/me requires auth and returns mock auth identity', async () => {
  await withApp(async (app) => {
    const unauth = await app.inject({
      method: 'GET',
      url: '/api/account/me',
    })
    assert.equal(unauth.statusCode, 401)
    assert.equal(parseJson(unauth).error, 'unauthorized')

    const auth = await app.inject({
      method: 'GET',
      url: '/api/account/me',
      headers: {
        [MOCK_HEADER]: 'alice',
      },
    })
    assert.equal(auth.statusCode, 200)
    const payload = parseJson(auth)
    assert.equal(payload.user.id, 'alice')
    assert.equal(payload.user.source, 'mock-header')
    assert.equal(payload.user.isAdmin, false)
  })
})

test('POST /api/account/admin/bootstrap handles already-admin and existing-admin states', async () => {
  await withApp(async (app) => {
    const alreadyAdmin = await app.inject({
      method: 'POST',
      url: '/api/account/admin/bootstrap',
      headers: {
        [MOCK_HEADER]: 'demo-user',
      },
    })
    assert.equal(alreadyAdmin.statusCode, 200)
    const alreadyPayload = parseJson(alreadyAdmin)
    assert.equal(alreadyPayload.bootstrapped, false)
    assert.equal(alreadyPayload.alreadyAdmin, true)

    const blockedBootstrap = await app.inject({
      method: 'POST',
      url: '/api/account/admin/bootstrap',
      headers: {
        [MOCK_HEADER]: 'alice',
      },
    })
    assert.equal(blockedBootstrap.statusCode, 409)
    assert.equal(parseJson(blockedBootstrap).error, 'admin_already_exists')
  })
})

test('X connect start requires admin', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/x/connect/start',
      headers: {
        [MOCK_HEADER]: 'alice',
      },
    })

    assert.equal(response.statusCode, 403)
    assert.equal(parseJson(response).error, 'forbidden')
  })
})

test('mock X OAuth callback validates state and consumes successful state', async () => {
  await withApp(async (app) => {
    const missingState = await app.inject({
      method: 'GET',
      url: '/api/x/connect/callback?code=demo&return=json',
    })
    assert.equal(missingState.statusCode, 400)
    assert.equal(parseJson(missingState).error, 'missing_state')

    const invalidState = await app.inject({
      method: 'GET',
      url: '/api/x/connect/callback?state=missing&code=demo&return=json',
    })
    assert.equal(invalidState.statusCode, 400)
    assert.equal(parseJson(invalidState).error, 'invalid_state')

    const start = await app.inject({
      method: 'POST',
      url: '/api/x/connect/start',
      headers: {
        [MOCK_HEADER]: 'demo-user',
      },
    })
    assert.equal(start.statusCode, 200)
    const startPayload = parseJson(start)
    assert.equal(startPayload.mode, 'mock-ready')
    assert.ok(startPayload.state)
    assert.ok(startPayload.authorizationUrl.includes('state='))

    const callback = await app.inject({
      method: 'GET',
      url: `/api/x/connect/callback?state=${encodeURIComponent(startPayload.state)}&code=demo&return=json`,
    })
    assert.equal(callback.statusCode, 200)
    const callbackPayload = parseJson(callback)
    assert.equal(callbackPayload.connected, true)
    assert.equal(callbackPayload.mode, 'mock')
    assert.equal(callbackPayload.connection.userId, 'demo-user')
    assert.equal(callbackPayload.connection.status, 'mock_connected')
    assert.equal(callbackPayload.connection.xUserId, 'mock-x-demo-user')
    assert.equal(callbackPayload.connection.tokenExpiresAt, null)

    const reusedState = await app.inject({
      method: 'GET',
      url: `/api/x/connect/callback?state=${encodeURIComponent(startPayload.state)}&code=demo&return=json`,
    })
    assert.equal(reusedState.statusCode, 400)
    assert.equal(parseJson(reusedState).error, 'invalid_state')
  })
})

test('POST /api/x/sync/run returns x_not_connected when no connection exists', async () => {
  await withApp(async (app) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/x/sync/run',
      headers: {
        [MOCK_HEADER]: 'demo-user',
      },
      payload: {},
    })

    assert.equal(response.statusCode, 400)
    const payload = parseJson(response)
    assert.equal(payload.error, 'x_not_connected')
  })
})
