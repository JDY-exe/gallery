import Fastify from 'fastify'
import cors from '@fastify/cors'
import { loadConfig } from './config.js'
import { createInMemoryStore } from './lib/inMemoryStore.js'
import { createSupabaseStore } from './lib/supabaseStore.js'
import { createTokenCrypto } from './lib/tokenCrypto.js'
import { createSupabaseServices } from './services/supabase.js'
import { createXApiService } from './services/xApi.js'
import { healthRoutes } from './routes/health.js'
import { boardRoutes } from './routes/boards.js'
import { xRoutes } from './routes/x.js'
import { accountRoutes } from './routes/account.js'

function deriveAllowedOrigins(frontendUrl) {
  const allowed = new Set([frontendUrl])

  try {
    const parsed = new URL(frontendUrl)
    if (parsed.hostname === '127.0.0.1') {
      parsed.hostname = 'localhost'
      allowed.add(parsed.toString().replace(/\/$/, ''))
    } else if (parsed.hostname === 'localhost') {
      parsed.hostname = '127.0.0.1'
      allowed.add(parsed.toString().replace(/\/$/, ''))
    }
  } catch {
    // Ignore malformed FRONTEND_URL; validation normally prevents this.
  }

  return allowed
}

export function buildApp(options = {}) {
  const appConfig = options.appConfig ?? loadConfig()
  const baseServices = options.services ?? createSupabaseServices(appConfig)
  const services = {
    ...baseServices,
    xApi: baseServices.xApi ?? createXApiService(appConfig),
    tokenCrypto: baseServices.tokenCrypto ?? createTokenCrypto(appConfig),
  }
  const store =
    options.store ??
    (services.supabase?.serviceClient
      ? createSupabaseStore({ serviceClient: services.supabase.serviceClient })
      : createInMemoryStore())

  const app = Fastify({
    logger: {
      level: appConfig.runtime.logLevel,
    },
  })

  app.decorate('appConfig', appConfig)
  app.decorate('store', store)
  app.decorate('services', services)

  app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true)
        return
      }

      const allowedOrigins = deriveAllowedOrigins(appConfig.runtime.frontendUrl)
      callback(null, allowedOrigins.has(origin))
    },
    credentials: true,
  })

  app.get('/', async () => ({
    service: 'gallery-backend',
    status: 'ok',
    storage: app.store.kind ?? 'in-memory',
    docs: {
      health: '/api/health',
      boards: '/api/boards',
      xConnectStart: '/api/x/connect/start',
    },
  }))

  app.register(healthRoutes)
  app.register(boardRoutes)
  app.register(xRoutes)
  app.register(accountRoutes)

  return app
}
