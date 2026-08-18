/**
 * GET /api/test/bca-auth
 *
 * Test endpoint untuk verify BCA auth flow (sandbox).
 * Requires internal API key.
 *
 * Flow yang ditest:
 * 1. Generate signature-auth
 * 2. Get OAuth token
 * 3. Return token info (without exposing full token)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '@/lib/auth'
import { getAccessToken, clearTokenCache } from '@/lib/bca/auth'
import { generateSignatureAuth, generateTimestamp } from '@/lib/bca/signature'
import { getBcaConfig } from '@/lib/bca/config'

export async function GET(request: NextRequest) {
  // Auth check
  const auth = verifyApiKey(request)
  if (!auth.authenticated) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const config = getBcaConfig()
    const timestamp = generateTimestamp()

    // Test signature generation
    const signature = generateSignatureAuth(timestamp)

    // Test token acquisition
    const startTime = Date.now()
    const token = await getAccessToken()
    const tokenTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: 'BCA auth test successful',
      data: {
        config: {
          baseUrl: config.baseUrl,
          partnerId: config.partnerId,
          channelId: config.channelId,
          vaPartnerServiceId: config.vaPartnerServiceId,
          hasPrivateKey: !!(config.privateKeyPath || config.privateKeyBase64),
        },
        signature: {
          timestamp,
          signaturePreview: signature.substring(0, 20) + '...',
          signatureLength: signature.length,
        },
        token: {
          preview: token.substring(0, 20) + '...',
          length: token.length,
          acquisitionTimeMs: tokenTime,
        },
      },
    })
  } catch (error) {
    console.error('[Test BCA Auth] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/test/bca-auth
 *
 * Clear token cache and re-authenticate.
 * Useful for testing token refresh.
 */
export async function POST(request: NextRequest) {
  const auth = verifyApiKey(request)
  if (!auth.authenticated) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    await clearTokenCache()

    const startTime = Date.now()
    const token = await getAccessToken()
    const tokenTime = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: 'Token cache cleared and new token acquired',
      data: {
        token: {
          preview: token.substring(0, 20) + '...',
          length: token.length,
          acquisitionTimeMs: tokenTime,
        },
      },
    })
  } catch (error) {
    console.error('[Test BCA Auth] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
