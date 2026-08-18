/**
 * BCA OAuth Token Management
 *
 * Supports two modes:
 * 1. Standard Sandbox (sandbox.bca.co.id) - Basic Auth
 * 2. SNAP (devapi.klikbca.com) - RSA Signature (for production)
 */

import { getBcaConfig, BCA_ENDPOINTS } from './config'
import { generateSignatureAuth, generateTimestamp } from './signature'
import { logBcaApiCall } from './logger'

interface TokenResponse {
  accessToken: string
  tokenType: string
  expiresIn: number
}

interface CachedToken {
  accessToken: string
  tokenType: string
  expiresAt: Date
}

// In-memory cache
let memoryCache: CachedToken | null = null

/**
 * Detect which sandbox mode to use based on BASE_URL
 */
function isSnapMode(): boolean {
  const config = getBcaConfig()
  return config.baseUrl.includes('devapi.klikbca.com') || config.baseUrl.includes('api.klikbca.com')
}

/**
 * Request token using Standard Sandbox (Basic Auth)
 */
async function requestTokenStandard(): Promise<TokenResponse> {
  const config = getBcaConfig()

  // Standard sandbox URL
  const url = 'https://sandbox.bca.co.id/api/oauth/token'

  // Basic Auth: base64(client_id:client_secret)
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${credentials}`,
  }

  const body = 'grant_type=client_credentials'

  const startTime = Date.now()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    })

    const responseText = await response.text()

    await logBcaApiCall({
      endpoint: '/api/oauth/token',
      method: 'POST',
      requestBody: body,
      responseStatus: response.status,
      responseBody: responseText,
      durationMs: Date.now() - startTime,
      operation: 'GET_TOKEN_STANDARD',
      isError: !response.ok,
    })

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status} - ${responseText}`)
    }

    const data = JSON.parse(responseText)

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'Bearer',
      expiresIn: data.expires_in || 3600,
    }
  } catch (error) {
    await logBcaApiCall({
      endpoint: '/api/oauth/token',
      method: 'POST',
      requestBody: body,
      durationMs: Date.now() - startTime,
      operation: 'GET_TOKEN_STANDARD',
      isError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Request token using SNAP (RSA Signature)
 */
async function requestTokenSnap(): Promise<TokenResponse> {
  const config = getBcaConfig()
  const timestamp = generateTimestamp()
  const signature = generateSignatureAuth(timestamp)

  const url = `${config.baseUrl}${BCA_ENDPOINTS.ACCESS_TOKEN}`

  const headers = {
    'Content-Type': 'application/json',
    'X-CLIENT-KEY': config.clientId,
    'X-TIMESTAMP': timestamp,
    'X-SIGNATURE': signature,
  }

  const body = { grantType: 'client_credentials' }

  const startTime = Date.now()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const responseText = await response.text()

    await logBcaApiCall({
      endpoint: BCA_ENDPOINTS.ACCESS_TOKEN,
      method: 'POST',
      requestHeaders: JSON.stringify(headers),
      requestBody: JSON.stringify(body),
      responseStatus: response.status,
      responseBody: responseText,
      durationMs: Date.now() - startTime,
      operation: 'GET_TOKEN_SNAP',
      isError: !response.ok,
    })

    if (!response.ok) {
      throw new Error(`SNAP Token request failed: ${response.status} - ${responseText}`)
    }

    const data = JSON.parse(responseText)

    return {
      accessToken: data.accessToken,
      tokenType: data.tokenType || 'Bearer',
      expiresIn: data.expiresIn || 900,
    }
  } catch (error) {
    await logBcaApiCall({
      endpoint: BCA_ENDPOINTS.ACCESS_TOKEN,
      method: 'POST',
      requestBody: JSON.stringify(body),
      durationMs: Date.now() - startTime,
      operation: 'GET_TOKEN_SNAP',
      isError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Request fresh OAuth token (auto-detect mode)
 */
async function requestNewToken(): Promise<TokenResponse> {
  if (isSnapMode()) {
    console.log('[BCA Auth] Using SNAP mode (RSA signature)')
    return requestTokenSnap()
  } else {
    console.log('[BCA Auth] Using Standard Sandbox mode (Basic Auth)')
    return requestTokenStandard()
  }
}

/**
 * Check if token is still valid (with 1 minute buffer)
 */
function isTokenValid(token: CachedToken): boolean {
  const bufferMs = 60 * 1000
  return token.expiresAt.getTime() > Date.now() + bufferMs
}

/**
 * Get valid OAuth access token
 */
export async function getAccessToken(): Promise<string> {
  // Check memory cache
  if (memoryCache && isTokenValid(memoryCache)) {
    return memoryCache.accessToken
  }

  // Request new token
  console.log('[BCA Auth] Requesting new OAuth token...')
  const newToken = await requestNewToken()

  // Cache in memory
  memoryCache = {
    accessToken: newToken.accessToken,
    tokenType: newToken.tokenType,
    expiresAt: new Date(Date.now() + newToken.expiresIn * 1000),
  }

  console.log('[BCA Auth] Token obtained, expires in', newToken.expiresIn, 'seconds')

  return newToken.accessToken
}

/**
 * Force refresh token
 */
export async function refreshAccessToken(): Promise<string> {
  memoryCache = null
  console.log('[BCA Auth] Force refreshing OAuth token...')
  const newToken = await requestNewToken()

  memoryCache = {
    accessToken: newToken.accessToken,
    tokenType: newToken.tokenType,
    expiresAt: new Date(Date.now() + newToken.expiresIn * 1000),
  }

  return newToken.accessToken
}

/**
 * Clear token cache
 */
export async function clearTokenCache(): Promise<void> {
  memoryCache = null
}

/**
 * Get current auth mode
 */
export function getAuthMode(): 'snap' | 'standard' {
  return isSnapMode() ? 'snap' : 'standard'
}
