import crypto from 'node:crypto'

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') return null
  const [scheme, token] = authorizationHeader.split(' ')
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== 'bearer') return null
  return token.trim() || null
}

async function withAdminFlag(request, user) {
  if (!user) return null
  let isAdmin = false
  if (typeof request.server.store.isAdminUser === 'function') {
    isAdmin = Boolean(await request.server.store.isAdminUser(user.id))
  }
  return {
    ...user,
    isAdmin,
  }
}

async function trySupabaseAuth(request) {
  const token = extractBearerToken(request.headers.authorization)
  if (!token) return null

  const anonClient = request.server.services.supabase.anonClient
  if (!anonClient) return null

  try {
    const { data, error } = await anonClient.auth.getUser(token)
    if (error || !data?.user) {
      request.log.warn(
        { error: error?.message ?? 'unknown_supabase_auth_error' },
        'Supabase token validation failed',
      )
      return null
    }

    const user = data.user
    await request.server.store.ensureProfile(user.id, {
      displayName:
        user.user_metadata?.display_name ??
        user.user_metadata?.name ??
        user.email ??
        'Supabase User',
      email: user.email ?? null,
      username:
        user.user_metadata?.username ??
        (user.email ? user.email.split('@')[0] : null),
    })

    return await withAdminFlag(request, {
      id: user.id,
      email: user.email ?? null,
      source: 'supabase',
    })
  } catch (error) {
    request.log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Supabase auth request failed',
    )
    return null
  }
}

async function tryMockAuth(request) {
  const { enableMockAuth, mockUserHeader } = request.server.appConfig.runtime
  if (!enableMockAuth) return null

  const rawValue = request.headers[mockUserHeader]
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null
  }

  const headerValue = rawValue.trim()
  const userId = normalizeMockUserIdForStore(headerValue, request.server.store.kind)
  await request.server.store.ensureProfile(userId, {
    displayName: `Mock ${headerValue}`,
    username: headerValue.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || null,
  })

  return await withAdminFlag(request, {
    id: userId,
    email: null,
    source: 'mock-header',
    rawMockUserId: headerValue,
  })
}

function normalizeMockUserIdForStore(value, storeKind) {
  if (storeKind !== 'supabase') return value
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return value
  }

  const hash = crypto.createHash('sha256').update(value, 'utf8').digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export async function getAuthUser(request) {
  const supabaseUser = await trySupabaseAuth(request)
  if (supabaseUser) return supabaseUser

  const mockUser = await tryMockAuth(request)
  if (mockUser) return mockUser

  return null
}

export async function requireAuth(request, reply) {
  const user = await getAuthUser(request)
  if (!user) {
    return reply.code(401).send({
      error: 'unauthorized',
      message:
        'Provide a Supabase Bearer token or set the mock auth header while ENABLE_MOCK_AUTH=true.',
      hint: `Mock header: ${request.server.appConfig.runtime.mockUserHeader}`,
    })
  }

  request.authUser = user
  return user
}
