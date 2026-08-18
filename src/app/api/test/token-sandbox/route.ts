/**
 * GET /api/test/token-sandbox
 *
 * Test getting OAuth token dari BCA Sandbox (Standard OAuth2, bukan SNAP).
 * Ini untuk sandbox.bca.co.id, bukan devapi.klikbca.com
 */

import { NextResponse } from 'next/server'

export async function GET() {
  const startTime = Date.now()

  try {
    const clientId = process.env.BCA_CLIENT_ID
    const clientSecret = process.env.BCA_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({
        success: false,
        error: 'Missing BCA_CLIENT_ID or BCA_CLIENT_SECRET',
      }, { status: 500 })
    }

    // Standard OAuth2 Basic Auth
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const url = 'https://sandbox.bca.co.id/api/oauth/token'

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    }

    const body = 'grant_type=client_credentials'

    console.log('[Sandbox Token] Requesting token from:', url)

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    })

    const responseText = await response.text()
    const duration = Date.now() - startTime

    console.log('[Sandbox Token] Response status:', response.status)
    console.log('[Sandbox Token] Response:', responseText.substring(0, 200))

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
        authType: 'Basic (OAuth2)',
      },
      response: data.access_token
        ? { ...data, access_token: data.access_token.substring(0, 20) + '...[MASKED]' }
        : data,
    })
  } catch (error) {
    console.error('[Sandbox Token] Error:', error)
    return NextResponse.json({
      success: false,
      duration: `${Date.now() - startTime}ms`,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
