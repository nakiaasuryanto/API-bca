/**
 * GET /api/dashboard
 *
 * Get dashboard data: stats, VAs, payments
 */

import { NextResponse } from 'next/server'
import { getPrismaClient } from '@/lib/database'

export async function GET() {
  try {
    const prisma = getPrismaClient()

    // Get VA stats
    const [totalVa, activeVa, paidVa, expiredVa] = await Promise.all([
      prisma.virtualAccount.count(),
      prisma.virtualAccount.count({ where: { status: 'ACTIVE' } }),
      prisma.virtualAccount.count({ where: { status: 'PAID' } }),
      prisma.virtualAccount.count({ where: { status: 'EXPIRED' } }),
    ])

    // Get recent VAs
    const recentVas = await prisma.virtualAccount.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        payments: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    // Get recent payments
    const recentPayments = await prisma.vaPayment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        virtualAccount: {
          select: {
            vaNumber: true,
            customerName: true,
          },
        },
      },
    })

    // Calculate total revenue
    const totalRevenue = await prisma.vaPayment.aggregate({
      _sum: { amountPaid: true },
      where: { status: 'COMPLETED' },
    })

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalVa,
          activeVa,
          paidVa,
          expiredVa,
          totalRevenue: totalRevenue._sum.amountPaid || 0,
        },
        recentVas: recentVas.map((va) => ({
          id: va.id,
          vaNumber: va.vaNumber,
          customerName: va.customerName,
          amount: va.amount,
          status: va.status,
          createdAt: va.createdAt,
          paidAt: va.paidAt,
          expiresAt: va.expiresAt,
        })),
        recentPayments: recentPayments.map((p) => ({
          id: p.id,
          bcaTrxId: p.bcaTrxId,
          vaNumber: p.virtualAccount.vaNumber,
          customerName: p.virtualAccount.customerName,
          amountPaid: p.amountPaid,
          status: p.status,
          paymentDate: p.paymentDate,
          createdAt: p.createdAt,
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
