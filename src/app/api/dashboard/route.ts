/**
 * GET /api/dashboard
 *
 * Get dashboard data: stats, VAs, payments (from PKL MySQL)
 */

import { NextResponse } from 'next/server'
import { getDashboardStats, getAllVAs, getRecentPayments } from '@/lib/crm-database'

export async function GET() {
  try {
    // Get all data from PKL MySQL
    const [stats, recentVas, recentPayments] = await Promise.all([
      getDashboardStats(),
      getAllVAs(),
      getRecentPayments(10),
    ])

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalVa: stats.va.total,
          activeVa: stats.va.active,
          paidVa: stats.va.paid,
          expiredVa: 0, // Not tracked currently
          totalRevenue: stats.va.totalRevenue,
          totalProspecting: stats.prospecting.total,
          closingProspecting: stats.prospecting.closing,
          closedProspecting: stats.prospecting.closed,
        },
        recentVas: recentVas.map((va) => ({
          id: va.id,
          vaNumber: va.va_number,
          customerName: va.customer_name || va.kontak_nama,
          amount: va.amount,
          status: va.status,
          createdAt: va.created_at,
          paidAt: va.paid_at,
          prospectingStatus: va.prospecting_status,
        })),
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          bcaTrxId: p.bca_trx_id,
          vaNumber: p.va_number,
          customerName: p.customer_name,
          amountPaid: p.amount_paid,
          paymentDate: p.payment_date,
        })),
      },
    })
  } catch (error) {
    console.error('[Dashboard] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to load dashboard data' },
      { status: 500 }
    )
  }
}
