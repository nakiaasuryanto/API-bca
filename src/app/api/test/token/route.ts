/**
 * GET /api/test/token
 *
 * Test getting OAuth token dari BCA sandbox (tanpa database caching).
 */

import { NextResponse } from 'next/server'
import { generateSignatureAuth, generateTimestamp } from '@/lib/bca/signature'
import { getBcaConfig, BCA_ENDPOINTS } from '@/lib/bca/config'

export async function GET() {
  const startTime = Date.now()

  try {
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

    const body = {
      grantType: 'client_credentials',
    }

    console.log('[Token Test] Requesting token from:', url)
    console.log('[Token Test] Headers:', {
      ...headers,
      'X-SIGNATURE': headers['X-SIGNATURE'].substring(0, 20) + '...',
    })

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const responseText = await response.text()
    const duration = Date.now() - startTime

    console.log('[Token Test] Response status:', response.status)
    console.log('[Token Test] Response body:', responseText.substring(0, 200))

    let data
    try {
      data = JSON.parse(responseText)
    } catch {
      data = { raw: responseText }
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      duration: `${duration}ms`,
      request: {
        url,
        timestamp,
        signaturePreview: signature.substring(0, 30) + '...',
      },
      response: {
        // Mask token if present
        ...(data.accessToken
          ? {
              ...data,
              accessToken: data.accessToken.substring(0, 20) + '...[MASKED]',
            }
          : data),
      },
    })
  } catch (error) {
    console.error('[Token Test] Error:', error)
    return NextResponse.json(
      {
        success: false,
        duration: `${Date.now() - startTime}ms`,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
