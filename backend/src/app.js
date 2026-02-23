import Fastify from 'fastify'
import cors from '@fastify/cors'
import { loadConfig } from './config.js'
import { createInMemoryStore } from './lib/inMemoryStore.js'
import { createSupabaseServices } from './services/supabase.js'
import { healthRoutes } from './routes/health.js'
import { boardRoutes } from './routes/boards.js'
import { xRoutes } from './routes/x.js'
import { accountRoutes } from './routes/account.js'

export function buildApp(options = {}) {
  const appConfig = options.appConfig ?? loadConfig()
  const store = options.store ?? createInMemoryStore()
  const services = options.services ?? createSupabaseServices(appConfig)

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

      const allowedOrigins = new Set([appConfig.runtime.frontendUrl])
      callback(null, allowedOrigins.has(origin))
    },
    credentials: true,
  })

  app.get('/', async () => ({
    service: 'gallery-backend',
    status: 'ok',
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
