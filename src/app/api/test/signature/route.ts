/**
 * GET /api/test/signature
 *
 * Test BCA signature generation (tanpa database).
 * Ini untuk verify bahwa RSA key dan signature algorithm benar.
 */

import { NextResponse } from 'next/server'
import { generateSignatureAuth, generateTimestamp } from '@/lib/bca/signature'
import { getBcaConfig } from '@/lib/bca/config'

export async function GET() {
  try {
    const config = getBcaConfig()
    const timestamp = generateTimestamp()
    const signature = generateSignatureAuth(timestamp)

    return NextResponse.json({
      success: true,
      message: 'Signature generation test successful',
      data: {
        timestamp,
        signaturePreview: signature.substring(0, 50) + '...',
        signatureLength: signature.length,
        config: {
          clientId: config.clientId,
          baseUrl: config.baseUrl,
          hasPrivateKey: !!(config.privateKeyPath || config.privateKeyBase64),
        },
      },
    })
  } catch (error) {
    console.error('[Signature Test] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
