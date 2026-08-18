/**
 * BCA SNAP Signature Generation
 *
 * Dua jenis signature yang dibutuhkan:
 * 1. signature-auth: RSA-SHA256 untuk request OAuth token
 * 2. signature-service: HMAC-SHA512 untuk transactional API
 */

import crypto from 'crypto'
import fs from 'fs'
import { getBcaConfig } from './config'

/**
 * Load private key dari file atau base64 env
 */
export function loadPrivateKey(): string {
  const config = getBcaConfig()

  if (config.privateKeyBase64) {
    return Buffer.from(config.privateKeyBase64, 'base64').toString('utf-8')
  }

  if (config.privateKeyPath) {
    return fs.readFileSync(config.privateKeyPath, 'utf-8')
  }

  throw new Error('No private key configured')
}

/**
 * Load public key dari file atau base64 env
 */
export function loadPublicKey(): string {
  const config = getBcaConfig()

  if (config.publicKeyBase64) {
    return Buffer.from(config.publicKeyBase64, 'base64').toString('utf-8')
  }

  if (config.publicKeyPath) {
    return fs.readFileSync(config.publicKeyPath, 'utf-8')
  }

  throw new Error('No public key configured')
}

/**
 * Generate timestamp dalam format ISO 8601 yang dibutuhkan BCA SNAP
 * Format: yyyy-MM-ddTHH:mm:ssXXX (e.g., 2024-01-15T10:30:00+07:00)
 *
 * Note: BCA SNAP uses format without milliseconds
 */
export function generateTimestamp(): string {
  const now = new Date()

  // Convert to WIB (UTC+7)
  const wibOffset = 7 * 60 // minutes
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000
  const wibTime = new Date(utcTime + wibOffset * 60000)

  // Format: 2024-01-15T10:30:00+07:00 (no milliseconds)
  const year = wibTime.getFullYear()
  const month = String(wibTime.getMonth() + 1).padStart(2, '0')
  const day = String(wibTime.getDate()).padStart(2, '0')
  const hours = String(wibTime.getHours()).padStart(2, '0')
  const minutes = String(wibTime.getMinutes()).padStart(2, '0')
  const seconds = String(wibTime.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`
}

/**
 * Generate signature-auth untuk OAuth token request
 *
 * StringToSign = clientId + "|" + timestamp
 * Signature = RSA-SHA256(StringToSign, privateKey)
 * Result = Base64(Signature)
 */
export function generateSignatureAuth(timestamp: string): string {
  const config = getBcaConfig()
  const privateKey = loadPrivateKey()

  const stringToSign = `${config.clientId}|${timestamp}`

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(stringToSign)
  sign.end()

  const signature = sign.sign(privateKey, 'base64')
  return signature
}

/**
 * Generate signature-service untuk transactional API request
 *
 * StringToSign = HTTPMethod + ":" + RelativePath + ":" + AccessToken + ":" +
 *                SHA256(minify(RequestBody)) + ":" + Timestamp
 * Signature = HMAC-SHA512(StringToSign, clientSecret)
 * Result = Base64(Signature)
 *
 * @param method HTTP method (POST, GET, etc.)
 * @param relativePath API path tanpa base URL (e.g., "/openapi/v1.0/transfer-va/inquiry")
 * @param accessToken OAuth access token
 * @param requestBody Request body object (akan di-minify untuk hashing)
 * @param timestamp Timestamp dalam format ISO 8601
 */
export function generateSignatureService(
  method: string,
  relativePath: string,
  accessToken: string,
  requestBody: object | string,
  timestamp: string
): string {
  const config = getBcaConfig()

  // Minify request body (remove whitespace)
  const bodyString = typeof requestBody === 'string'
    ? requestBody
    : JSON.stringify(requestBody)

  // SHA256 hash of minified body (lowercase hex)
  const bodyHash = crypto
    .createHash('sha256')
    .update(bodyString)
    .digest('hex')
    .toLowerCase()

  // Construct string to sign
  const stringToSign = [
    method.toUpperCase(),
    relativePath,
    accessToken,
    bodyHash,
    timestamp,
  ].join(':')

  // HMAC-SHA512 dengan client secret
  const signature = crypto
    .createHmac('sha512', config.clientSecret)
    .update(stringToSign)
    .digest('base64')

  return signature
}

/**
 * Verify signature dari BCA (untuk webhook/callback)
 *
 * Useful untuk memverifikasi bahwa request benar-benar dari BCA
 */
export function verifySignatureService(
  method: string,
  relativePath: string,
  accessToken: string,
  requestBody: object | string,
  timestamp: string,
  receivedSignature: string
): boolean {
  const expectedSignature = generateSignatureService(
    method,
    relativePath,
    accessToken,
    requestBody,
    timestamp
  )

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(receivedSignature),
    Buffer.from(expectedSignature)
  )
}

/**
 * Generate External ID unik untuk setiap request
 * Format: partnerId + timestamp + random
 */
export function generateExternalId(): string {
  const config = getBcaConfig()
  const timestamp = Date.now().toString()
  const random = crypto.randomBytes(4).toString('hex')
  return `${config.partnerId}${timestamp}${random}`
}
