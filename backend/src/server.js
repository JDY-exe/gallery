import { buildApp } from './app.js'

async function main() {
  const app = buildApp()

  try {
    await app.listen({
      host: app.appConfig.runtime.host,
      port: app.appConfig.runtime.port,
    })

    app.log.info(
      {
        host: app.appConfig.runtime.host,
        port: app.appConfig.runtime.port,
        frontendUrl: app.appConfig.runtime.frontendUrl,
        mockAuthEnabled: app.appConfig.runtime.enableMockAuth,
      },
      'Gallery backend started',
    )
  } catch (error) {
    app.log.error(error, 'Failed to start server')
    process.exitCode = 1
  }

  const shutdown = async (signal) => {
    app.log.info({ signal }, 'Shutting down')
    try {
      await app.close()
    } finally {
      process.exit(0)
    }
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

void main()
