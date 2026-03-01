import crypto from 'node:crypto'

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64')
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest()
}

export function createTokenCrypto(config) {
  const secret = config.security.encryptionKey ?? null
  const enabled = Boolean(secret)
  const key = secret ? deriveKey(secret) : null

  return {
    enabled,

    encrypt(plainText) {
      if (!enabled || !key) {
        throw new Error('ENCRYPTION_KEY is required for token encryption.')
      }

      if (typeof plainText !== 'string' || !plainText) {
        throw new Error('Cannot encrypt empty token value.')
      }

      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final(),
      ])
      const tag = cipher.getAuthTag()

      return `v1.${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(ciphertext)}`
    },

    decrypt(payload) {
      if (!enabled || !key) {
        throw new Error('ENCRYPTION_KEY is required for token decryption.')
      }

      if (typeof payload !== 'string' || !payload) return null

      const parts = payload.split('.')
      if (parts.length !== 4 || parts[0] !== 'v1') {
        throw new Error('Unsupported encrypted token format.')
      }

      const [, ivRaw, tagRaw, ciphertextRaw] = parts
      const iv = fromBase64Url(ivRaw)
      const tag = fromBase64Url(tagRaw)
      const ciphertext = fromBase64Url(ciphertextRaw)

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)

      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ])
      return plaintext.toString('utf8')
    },
  }
}
