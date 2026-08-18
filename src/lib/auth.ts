/**
 * Internal API Authentication
 *
 * Semua endpoint di service ini wajib authenticated.
 * Ini bukan untuk BCA webhook (yang pakai signature verification),
 * tapi untuk internal service-to-service calls dan admin API.
 */

import { NextRequest, NextResponse } from 'next/server'

export interface AuthResult {
  authenticated: boolean
  error?: string
  source?: string // e.g., "api-key", "jwt"
}

/**
 * Verify API key dari header
 */
export function verifyApiKey(request: NextRequest): AuthResult {
  const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '')

  if (!apiKey) {
    return {
      authenticated: false,
      error: 'Missing API key. Provide X-API-KEY header or Authorization: Bearer <key>',
    }
  }

  const validApiKey = process.env.INTERNAL_API_KEY

  if (!validApiKey) {
    console.error('[Auth] INTERNAL_API_KEY not configured!')
    return {
      authenticated: false,
      error: 'Server misconfigured: API key not set',
    }
  }

  if (apiKey !== validApiKey) {
    return {
      authenticated: false,
      error: 'Invalid API key',
    }
  }

  return {
    authenticated: true,
    source: 'api-key',
  }
}

/**
 * Middleware wrapper untuk protected API routes
 */
export function withAuth(
  handler: (request: NextRequest) => Promise<NextResponse>
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    const authResult = verifyApiKey(request)

    if (!authResult.authenticated) {
      return NextResponse.json(
        {
          success: false,
          error: authResult.error,
        },
        { status: 401 }
      )
    }

    return handler(request)
  }
}

/**
 * Helper untuk response error standar
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 401 }
  )
}

export function badRequestResponse(message: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 400 }
  )
}

export function serverErrorResponse(message: string = 'Internal server error'): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status: 500 }
  )
}

export function successResponse<T>(data: T, message?: string): NextResponse {
  return NextResponse.json({
    success: true,
    message,
    data,
  })
}
