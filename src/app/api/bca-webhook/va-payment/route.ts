/**
 * POST /api/bca-webhook/va-payment
 *
 * Endpoint yang dipanggil BCA setelah customer berhasil bayar VA.
 * Ini adalah "Payment Flag" notification.
 *
 * CRITICAL: Harus idempotent! BCA bisa mengirim notifikasi yang sama berkali-kali.
 *
 * Flow:
 * 1. Verify signature dari BCA
 * 2. Check idempotency (bcaTrxId sudah pernah diproses?)
 * 3. Lookup VA dan update status ke PAID
 * 4. Create VaPayment record
 * 5. Auto-close prospecting in PKL MySQL
 * 6. Return success response ke BCA
 */

import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { BCA_RESPONSE_CODES } from '@/lib/bca/config'
import { generateTimestamp } from '@/lib/bca/signature'
import {
  getVAByNumber,
  markVAPaid,
  createVAPayment,
  paymentExists,
  closeProspecting,
  findOrCreateCustomer,
  createSaleTransaction,
  getProspectingForTransaction,
} from '@/lib/crm-database'

interface VaPaymentRequest {
  partnerServiceId: string
  customerNo: string
  virtualAccountNo: string
  virtualAccountName?: string
  trxId: string // BCA transaction ID - key untuk idempotency
  paymentRequestId?: string
  paidAmount: {
    value: string
    currency: string
  }
  paidBills?: string
  totalAmount?: {
    value: string
    currency: string
  }
  trxDateTime?: string
  referenceNo?: string
  journalNum?: string
  paymentType?: string
  flagAdvise?: string
  subCompany?: string
  billDetails?: Array<{
    billCode?: string
    billNo?: string
    billName?: string
    billShortName?: string
    billDescription?: {
      english?: string
      indonesian?: string
    }
    billSubCompany?: string
    billAmount?: {
      value: string
      currency: string
    }
  }>
  freeTexts?: Array<{
    english?: string
    indonesian?: string
  }>
  additionalInfo?: Record<string, unknown>
}

interface VaPaymentResponse {
  responseCode: string
  responseMessage: string
  virtualAccountData?: {
    partnerServiceId: string
    customerNo: string
    virtualAccountNo: string
    virtualAccountName: string
    paymentRequestId?: string
    paidAmount: {
      value: string
      currency: string
    }
    paidBills?: string
    totalAmount?: {
      value: string
      currency: string
    }
  }
}

export async function POST(request: NextRequest) {
  let requestBody: VaPaymentRequest | null = null
  let vaNumber: string | undefined

  try {
    // 1. Parse request
    const rawBody = await request.text()
    requestBody = JSON.parse(rawBody)

    if (!requestBody) {
      return createResponse('4000000', 'Invalid request body', 400)
    }

    vaNumber = requestBody.virtualAccountNo?.trim()
    const bcaTrxId = requestBody.trxId?.trim()

    if (!vaNumber) {
      return createResponse('4000001', 'Missing virtualAccountNo', 400)
    }

    if (!bcaTrxId) {
      return createResponse('4000002', 'Missing trxId', 400)
    }

    // 2. TODO: Verify signature dari BCA (wajib di production)
    // const signature = request.headers.get('X-SIGNATURE')
    // const timestamp = request.headers.get('X-TIMESTAMP')
    // ...

    // 3. Idempotency check - apakah trxId ini sudah pernah diproses?
    const alreadyProcessed = await paymentExists(bcaTrxId)

    if (alreadyProcessed) {
      // Sudah pernah diproses - return success (idempotent)
      console.log(`[VA Payment] Duplicate notification ignored: trxId=${bcaTrxId}`)
      return createSuccessResponse(requestBody)
    }

    // 4. Lookup VA dari PKL MySQL
    const va = await getVAByNumber(vaNumber)

    if (!va) {
      console.log(`[VA Payment] VA not found: ${vaNumber}`)
      return createResponse(BCA_RESPONSE_CODES.VA_NOT_FOUND, 'Virtual Account not found', 404)
    }

    // VA sudah paid sebelumnya
    if (va.status === 'PAID') {
      console.log(`[VA Payment] VA already paid: ${vaNumber}`)
      return createSuccessResponse(requestBody)
    }

    // 5. Parse paid amount
    const paidAmountStr = requestBody.paidAmount?.value || '0'
    const paidAmount = parseFloat(paidAmountStr.replace(/[^0-9.-]/g, ''))
    const paymentDate = requestBody.trxDateTime
      ? new Date(requestBody.trxDateTime)
      : new Date()

    // 6. Create payment record di PKL MySQL
    const paymentId = uuidv4()
    const paymentCreated = await createVAPayment({
      id: paymentId,
      vaId: va.id,
      bcaTrxId,
      amountPaid: paidAmount,
      paymentDate,
      customerNo: requestBody.customerNo || va.customer_no,
      partnerServiceId: requestBody.partnerServiceId || '',
      paymentChannel: requestBody.paymentType,
      bcaRequestBody: rawBody,
    })

    if (!paymentCreated) {
      return createResponse('5000001', 'Failed to record payment', 500)
    }

    // 7. Update VA status ke PAID
    await markVAPaid(vaNumber, paymentDate)

    console.log(
      `[VA Payment] SUCCESS: VA=${vaNumber}, trxId=${bcaTrxId}, amount=${paidAmount}, paymentId=${paymentId}`
    )

    // 8. Auto-close prospecting in PKL MySQL
    try {
      const closed = await closeProspecting(va.prospecting_id)
      if (closed) {
        console.log(`[VA Payment] Prospecting ${va.prospecting_id} auto-closed`)
      }
    } catch (crmError) {
      // Log but don't fail - payment already recorded
      console.error(`[VA Payment] Failed to close prospecting:`, crmError)
    }

    // 9. Auto-create Customer & Sale Transaction (Sales & Finance integration)
    try {
      const prospectingData = await getProspectingForTransaction(va.prospecting_id)

      if (prospectingData) {
        // Create or find customer
        const customerId = await findOrCreateCustomer({
          kontakNama: prospectingData.kontakNama,
          kontakTelepon: prospectingData.kontakTelepon,
          kontakEmail: prospectingData.kontakEmail,
          instansiNama: prospectingData.instansiNama,
          instansiAlamat: prospectingData.instansiAlamat,
        })

        if (customerId) {
          // Create sale transaction
          const transactionId = await createSaleTransaction({
            customerId,
            prospectingId: va.prospecting_id,
            amount: paidAmount,
            paymentDate,
            kontakNama: prospectingData.kontakNama,
            produk: prospectingData.produk,
            bahan: prospectingData.bahan,
            jumlah: prospectingData.jumlah,
            hargaSatuan: prospectingData.hargaSatuan,
            vaNumber,
            bcaTrxId,
          })

          if (transactionId) {
            console.log(`[VA Payment] Auto-created: Customer=${customerId}, Transaction=${transactionId}`)
          }
        }
      }
    } catch (integrationError) {
      // Log but don't fail - payment already recorded
      console.error(`[VA Payment] Failed to create customer/transaction:`, integrationError)
    }

    // 10. Return success to BCA
    return createSuccessResponse(requestBody)
  } catch (error) {
    console.error('[VA Payment] Error:', error)
    return createResponse('5000000', 'Internal server error', 500)
  }
}

function createResponse(
  responseCode: string,
  responseMessage: string,
  httpStatus: number
): NextResponse {
  return NextResponse.json(
    { responseCode, responseMessage },
    {
      status: httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': generateTimestamp(),
      },
    }
  )
}

function createSuccessResponse(request: VaPaymentRequest): NextResponse {
  const response: VaPaymentResponse = {
    responseCode: BCA_RESPONSE_CODES.SUCCESS,
    responseMessage: 'Success',
    virtualAccountData: {
      partnerServiceId: request.partnerServiceId,
      customerNo: request.customerNo,
      virtualAccountNo: request.virtualAccountNo,
      virtualAccountName: request.virtualAccountName || 'Customer',
      paymentRequestId: request.paymentRequestId,
      paidAmount: request.paidAmount,
      paidBills: request.paidBills,
      totalAmount: request.totalAmount,
    },
  }

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': generateTimestamp(),
    },
  })
}
