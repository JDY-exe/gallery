export async function healthRoutes(app) {
  const handler = async () => ({
    ok: true,
    service: 'gallery-backend',
    storage: app.store.kind ?? 'in-memory',
    env: app.appConfig.runtime.nodeEnv,
    time: new Date().toISOString(),
    config: {
      mockAuthEnabled: app.appConfig.runtime.enableMockAuth,
      supabaseConfigured: Boolean(
        app.appConfig.supabase.url && app.appConfig.supabase.anonKey,
      ),
      supabaseServiceRoleConfigured: Boolean(
        app.appConfig.supabase.url && app.appConfig.supabase.serviceRoleKey,
      ),
      xConfigured: Boolean(app.appConfig.x.clientId),
      xMockOAuthEnabled: app.appConfig.x.enableMockOAuth,
      tokenEncryptionConfigured: Boolean(app.appConfig.security.encryptionKey),
      dotenvFilesLoaded: app.appConfig.runtime.dotenvFilesLoaded,
    },
  })

  app.get('/health', handler)
  app.get('/api/health', handler)
}
