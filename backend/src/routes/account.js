import { requireAuth } from '../lib/auth.js'

function mapUser(user, isAdmin = false) {
  return {
    id: user.id,
    email: user.email ?? null,
    source: user.source ?? 'supabase',
    isAdmin: Boolean(isAdmin),
  }
}

function isoFromEpochSeconds(epochSeconds) {
  if (!Number.isFinite(epochSeconds)) return null
  return new Date(Number(epochSeconds) * 1000).toISOString()
}

export async function accountRoutes(app) {
  app.post('/api/account/login', async (request, reply) => {
    const email =
      typeof request.body?.email === 'string' ? request.body.email.trim() : ''
    const password =
      typeof request.body?.password === 'string' ? request.body.password : ''

    if (!email || !password) {
      return reply.code(400).send({
        error: 'validation_error',
        message: '`email` and `password` are required.',
      })
    }

    const anonClient = app.services.supabase?.anonClient
    if (!anonClient) {
      return reply.code(500).send({
        error: 'supabase_not_configured',
        message: 'Supabase anon client is not configured on the backend.',
      })
    }

    const { data, error } = await anonClient.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data?.session || !data?.user) {
      return reply.code(401).send({
        error: 'invalid_credentials',
        message: error?.message ?? 'Login failed.',
      })
    }

    await app.store.ensureProfile(data.user.id, {
      displayName:
        data.user.user_metadata?.display_name ??
        data.user.user_metadata?.name ??
        data.user.email ??
        'Supabase User',
      email: data.user.email ?? null,
      username:
        data.user.user_metadata?.username ??
        (data.user.email ? data.user.email.split('@')[0] : null),
    })

    const isAdmin =
      typeof app.store.isAdminUser === 'function'
        ? await app.store.isAdminUser(data.user.id)
        : false

    return {
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token ?? null,
        tokenType: data.session.token_type ?? 'bearer',
        expiresAt:
          data.session.expires_at != null
            ? isoFromEpochSeconds(Number(data.session.expires_at))
            : null,
      },
      user: mapUser(
        {
          id: data.user.id,
          email: data.user.email ?? null,
          source: 'supabase',
        },
        isAdmin,
      ),
    }
  })

  app.post('/api/account/admin/bootstrap', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    if (user.isAdmin) {
      return {
        bootstrapped: false,
        alreadyAdmin: true,
        user: mapUser(user, true),
      }
    }

    const hasAdminUsers =
      typeof app.store.hasAdminUsers === 'function'
        ? await app.store.hasAdminUsers()
        : false

    if (hasAdminUsers) {
      return reply.code(409).send({
        error: 'admin_already_exists',
        message: 'An admin user is already configured.',
      })
    }

    if (typeof app.store.grantAdminUser !== 'function') {
      return reply.code(500).send({
        error: 'admin_store_not_supported',
        message: 'Storage backend does not support admin role assignment.',
      })
    }

    await app.store.grantAdminUser(user.id)

    return {
      bootstrapped: true,
      user: mapUser(user, true),
    }
  })

  app.get('/api/account/me', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    return {
      user: mapUser(user, user.isAdmin),
    }
  })

  app.delete('/api/account', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const deletion = await app.store.deleteUserData(user.id)

    let supabaseAuthDeletion = 'not_configured'
    if (app.services.supabase.serviceClient) {
      supabaseAuthDeletion = 'skipped'
      const shouldDeleteSupabaseAuthUser =
        request.query?.delete_auth_user === 'true' ||
        request.query?.deleteAuthUser === 'true'

      if (shouldDeleteSupabaseAuthUser) {
        const { error } = await app.services.supabase.serviceClient.auth.admin.deleteUser(
          user.id,
        )
        if (error) {
          supabaseAuthDeletion = `failed:${error.message}`
        } else {
          supabaseAuthDeletion = 'deleted'
        }
      }
    }

    return {
      deleted: true,
      userId: user.id,
      storage: app.store.kind ?? 'in-memory',
      result: deletion,
      supabaseAuthDeletion,
      note:
        'Pass ?delete_auth_user=true to also delete the Supabase Auth user via service role.',
    }
  })
}
