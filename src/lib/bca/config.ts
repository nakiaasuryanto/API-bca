/**
 * BCA SNAP API Configuration
 *
 * Semua config dibaca dari environment variables.
 * Tidak ada default value untuk credential — wajib di-set.
 */

export interface BcaConfig {
  // OAuth credentials
  clientId: string
  clientSecret: string

  // Partner info
  partnerId: string
  channelId: string

  // VA config
  vaPartnerServiceId: string // 5 digit company code

  // API base URL
  baseUrl: string

  // RSA keys
  privateKeyPath?: string
  publicKeyPath?: string
  privateKeyBase64?: string
  publicKeyBase64?: string
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

let cachedConfig: BcaConfig | null = null

export function getBcaConfig(): BcaConfig {
  if (cachedConfig) return cachedConfig

  cachedConfig = {
    clientId: getEnvOrThrow('BCA_CLIENT_ID'),
    clientSecret: getEnvOrThrow('BCA_CLIENT_SECRET'),
    partnerId: getEnvOrThrow('BCA_PARTNER_ID'),
    channelId: getEnvOrThrow('BCA_CHANNEL_ID'),
    vaPartnerServiceId: getEnvOrThrow('BCA_VA_PARTNER_SERVICE_ID'),
    baseUrl: process.env.BCA_BASE_URL || 'https://devapi.klikbca.com',
    privateKeyPath: process.env.BCA_PRIVATE_KEY_PATH,
    publicKeyPath: process.env.BCA_PUBLIC_KEY_PATH,
    privateKeyBase64: process.env.BCA_PRIVATE_KEY_BASE64,
    publicKeyBase64: process.env.BCA_PUBLIC_KEY_BASE64,
  }

  // Validate that we have at least one way to get private key
  if (!cachedConfig.privateKeyPath && !cachedConfig.privateKeyBase64) {
    throw new Error('Must provide either BCA_PRIVATE_KEY_PATH or BCA_PRIVATE_KEY_BASE64')
  }

  return cachedConfig
}

/**
 * BCA SNAP API Endpoints
 */
export const BCA_ENDPOINTS = {
  // OAuth
  ACCESS_TOKEN: '/openapi/v1.0/access-token/b2b',

  // Virtual Account for Biller
  VA_INQUIRY: '/openapi/v1.0/transfer-va/inquiry',
  VA_PAYMENT: '/openapi/v1.0/transfer-va/payment',
  VA_PAYMENT_STATUS: '/openapi/v1.0/transfer-va/status',
} as const

/**
 * BCA SNAP Response Codes
 */
export const BCA_RESPONSE_CODES = {
  SUCCESS: '2002400',
  INVALID_TOKEN: '4012400',
  UNAUTHORIZED: '4012401',
  VA_NOT_FOUND: '4042412',
  VA_ALREADY_PAID: '4092400',
  DUPLICATE_REQUEST: '4092401',
} as const
