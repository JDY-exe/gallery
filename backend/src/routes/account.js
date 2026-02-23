import { requireAuth } from '../lib/auth.js'

export async function accountRoutes(app) {
  app.delete('/api/account', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const deletion = app.store.deleteUserData(user.id)

    return {
      deleted: true,
      userId: user.id,
      storage: 'in-memory',
      result: deletion,
      supabaseAuthDeletion: app.services.supabase.serviceClient
        ? 'pending_implementation'
        : 'not_configured',
      note:
        'This currently deletes only in-memory data. Add DB cascades + Supabase admin user deletion next.',
    }
  })
}
