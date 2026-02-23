export async function healthRoutes(app) {
  const handler = async () => ({
    ok: true,
    service: 'gallery-backend',
    env: app.appConfig.runtime.nodeEnv,
    time: new Date().toISOString(),
    config: {
      mockAuthEnabled: app.appConfig.runtime.enableMockAuth,
      supabaseConfigured: Boolean(
        app.appConfig.supabase.url && app.appConfig.supabase.anonKey,
      ),
      xConfigured: Boolean(app.appConfig.x.clientId),
      dotenvFilesLoaded: app.appConfig.runtime.dotenvFilesLoaded,
    },
  })

  app.get('/health', handler)
  app.get('/api/health', handler)
}
