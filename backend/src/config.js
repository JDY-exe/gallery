import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let cachedConfig = null

const toOptional = (schema) =>
  z.preprocess((value) => {
    if (value === '' || value == null) return undefined
    return value
  }, schema.optional())

const boolFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  }
  return value
}, z.boolean())

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(8787),
  API_PUBLIC_URL: z.string().url().default('http://localhost:8787'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  ENABLE_MOCK_AUTH: boolFromEnv.default(true),
  MOCK_USER_HEADER: z.string().default('x-demo-user-id'),
  ENCRYPTION_KEY: toOptional(z.string()),
  DATABASE_URL: toOptional(z.string()),
  SUPABASE_URL: toOptional(z.string().url()),
  SUPABASE_ANON_KEY: toOptional(z.string()),
  SUPABASE_SERVICE_ROLE_KEY: toOptional(z.string()),
  X_CLIENT_ID: toOptional(z.string()),
  X_CLIENT_SECRET: toOptional(z.string()),
  X_REDIRECT_URI: z
    .string()
    .url()
    .default('http://localhost:8787/api/x/connect/callback'),
  X_SCOPES: z
    .string()
    .default('tweet.read users.read bookmark.read offline.access users.read'),
  X_API_BASE_URL: z.string().url().default('https://api.x.com/2'),
  X_OAUTH_AUTHORIZE_URL: z
    .string()
    .url()
    .default('https://twitter.com/i/oauth2/authorize'),
  X_OAUTH_TOKEN_URL: z
    .string()
    .url()
    .default('https://api.x.com/2/oauth2/token'),
  X_ENABLE_MOCK_OAUTH: boolFromEnv.default(true),
})

function loadEnvFiles() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
  ]

  const loaded = []
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue
    loadDotenv({ path: filePath, override: false })
    loaded.push(filePath)
  }

  return loaded
}

export function loadConfig() {
  if (cachedConfig) return cachedConfig

  const dotenvFilesLoaded = loadEnvFiles()
  const parsed = envSchema.parse(process.env)
  const xScopes = Array.from(
    new Set(
      parsed.X_SCOPES.split(/[,\s]+/)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  )

  cachedConfig = {
    runtime: {
      nodeEnv: parsed.NODE_ENV,
      host: parsed.API_HOST,
      port: parsed.API_PORT,
      apiPublicUrl: parsed.API_PUBLIC_URL,
      frontendUrl: parsed.FRONTEND_URL,
      logLevel: parsed.LOG_LEVEL,
      enableMockAuth: parsed.ENABLE_MOCK_AUTH,
      mockUserHeader: parsed.MOCK_USER_HEADER.toLowerCase(),
      dotenvFilesLoaded,
    },
    supabase: {
      url: parsed.SUPABASE_URL,
      anonKey: parsed.SUPABASE_ANON_KEY,
      serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    },
    database: {
      url: parsed.DATABASE_URL,
    },
    x: {
      clientId: parsed.X_CLIENT_ID,
      clientSecret: parsed.X_CLIENT_SECRET,
      redirectUri: parsed.X_REDIRECT_URI,
      scopes: xScopes,
      apiBaseUrl: parsed.X_API_BASE_URL,
      authorizeUrl: parsed.X_OAUTH_AUTHORIZE_URL,
      tokenUrl: parsed.X_OAUTH_TOKEN_URL,
      enableMockOAuth: parsed.X_ENABLE_MOCK_OAUTH,
    },
    security: {
      encryptionKey: parsed.ENCRYPTION_KEY,
    },
  }

  return cachedConfig
}
