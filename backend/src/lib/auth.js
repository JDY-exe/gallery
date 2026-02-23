function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') return null
  const [scheme, token] = authorizationHeader.split(' ')
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== 'bearer') return null
  return token.trim() || null
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
    request.server.store.ensureProfile(user.id, {
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

    return {
      id: user.id,
      email: user.email ?? null,
      source: 'supabase',
    }
  } catch (error) {
    request.log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Supabase auth request failed',
    )
    return null
  }
}

function tryMockAuth(request) {
  const { enableMockAuth, mockUserHeader } = request.server.appConfig.runtime
  if (!enableMockAuth) return null

  const rawValue = request.headers[mockUserHeader]
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null
  }

  const userId = rawValue.trim()
  request.server.store.ensureProfile(userId, {
    displayName: `Mock ${userId}`,
    username: userId.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || null,
  })

  return {
    id: userId,
    email: null,
    source: 'mock-header',
  }
}

export async function getAuthUser(request) {
  const supabaseUser = await trySupabaseAuth(request)
  if (supabaseUser) return supabaseUser

  const mockUser = tryMockAuth(request)
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
