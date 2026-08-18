/**
 * POST /api/va/create
 *
 * Create Virtual Account untuk prospecting yang status = Closing
 * Data disimpan di PKL MySQL database.
 *
 * Request body:
 * {
 *   prospectingId: number,
 *   amount: number,
 *   ubPrefix?: string,  // default "00"
 *   notes?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { verifyApiKey, badRequestResponse, serverErrorResponse, successResponse } from '@/lib/auth'
import { generateVaNumber } from '@/lib/bca'
import {
  getProspecting,
  getVAByProspectingId,
  createVirtualAccount,
} from '@/lib/crm-database'

interface CreateVaRequest {
  prospectingId: number
  amount: number
  ubPrefix?: string
  unitBisnisId?: string
  expiresInDays?: number
  notes?: string
  createdBy?: string
}

export async function POST(request: NextRequest) {
  // 1. Auth check
  const auth = verifyApiKey(request)
  if (!auth.authenticated) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    // 2. Parse request body
    const body: CreateVaRequest = await request.json()

    if (!body.prospectingId || typeof body.prospectingId !== 'number') {
      return badRequestResponse('prospectingId is required and must be a number')
    }

    if (!body.amount || typeof body.amount !== 'number' || body.amount <= 0) {
      return badRequestResponse('amount is required and must be a positive number')
    }

    const ubPrefix = body.ubPrefix || body.unitBisnisId || '00'
    const expiresInDays = body.expiresInDays ?? 7 // Default 7 hari

    // 3. Verify prospecting exists dari PKL MySQL
    const prospecting = await getProspecting(body.prospectingId)

    if (!prospecting) {
      return badRequestResponse(`Prospecting ID ${body.prospectingId} not found`)
    }

    if (prospecting.status !== 'Closing') {
      return badRequestResponse(
        `Prospecting status must be 'Closing', but got '${prospecting.status}'`
      )
    }

    // 4. Check apakah VA sudah ada untuk prospecting ini
    const existingVa = await getVAByProspectingId(body.prospectingId)

    if (existingVa && existingVa.status === 'ACTIVE') {
      // Return existing VA instead of creating new one
      return successResponse(
        {
          vaNumber: existingVa.va_number,
          amount: existingVa.amount,
          status: existingVa.status,
          alreadyExists: true,
        },
        'VA already exists for this prospecting'
      )
    }

    // 5. Generate VA number
    const vaNumber = generateVaNumber(body.prospectingId, ubPrefix)
    const customerNo = vaNumber.substring(5) // Remove partnerServiceId

    // 6. Calculate expiry date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expiresInDays)

    // 7. Create VA record di PKL MySQL (VG structure)
    const vaId = uuidv4()
    const created = await createVirtualAccount({
      id: vaId,
      vaNumber,
      customerNo,
      prospectingId: body.prospectingId,
      customerName: prospecting.kontak_nama || undefined,
      customerPhone: prospecting.kontak_telepon || undefined,
      unitBisnis: prospecting.unit_bisnis || prospecting.instansi_nama || 'Unknown',
      amount: body.amount,
      expiresAt,
      createdBy: body.createdBy,
      notes: body.notes,
    })

    if (!created) {
      return serverErrorResponse('Failed to create VA in database')
    }

    console.log(`[VA] Created VA ${vaNumber} for prospecting ${body.prospectingId} (${prospecting.kontak_nama} - ${prospecting.instansi_nama})`)

    return successResponse(
      {
        id: vaId,
        vaNumber,
        customerNo,
        prospectingId: body.prospectingId,
        customerName: prospecting.kontak_nama,
        customerPhone: prospecting.kontak_telepon,
        instansiNama: prospecting.instansi_nama,
        unitBisnis: prospecting.unit_bisnis,
        produk: prospecting.produk,
        omzet: prospecting.omzet,
        amount: body.amount.toString(),
        status: 'ACTIVE',
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
      },
      'VA created successfully'
    )
  } catch (error) {
    console.error('[VA Create] Error:', error)
    return serverErrorResponse(
      error instanceof Error ? error.message : 'Failed to create VA'
    )
  }
}
