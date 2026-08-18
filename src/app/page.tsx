'use client'

import { useEffect, useState } from 'react'

interface Stats {
  totalVa: number
  activeVa: number
  paidVa: number
  expiredVa: number
  totalRevenue: number
}

interface VA {
  id: string
  vaNumber: string
  customerName: string | null
  amount: number
  status: string
  createdAt: string
  paidAt: string | null
  expiresAt: string | null
}

interface Payment {
  id: string
  bcaTrxId: string
  vaNumber: string
  customerName: string | null
  amountPaid: number
  status: string
  paymentDate: string
  createdAt: string
}

interface HealthCheck {
  status: string
  checks: {
    server: string
    database: string
    crm: string
  }
}

interface BcaToken {
  success: boolean
  status: number
  duration: string
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [vas, setVas] = useState<VA[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [bcaStatus, setBcaStatus] = useState<BcaToken | null>(null)
  const [loading, setLoading] = useState(true)
  const [testingBca, setTestingBca] = useState(false)

  const loadData = async () => {
    try {
      // Load health
      const healthRes = await fetch('/api/health')
      const healthData = await healthRes.json()
      setHealth(healthData)

      // Load dashboard data
      const dashRes = await fetch('/api/dashboard')
      const dashData = await dashRes.json()
      if (dashData.success) {
        setStats(dashData.data.stats)
        setVas(dashData.data.recentVas)
        setPayments(dashData.data.recentPayments)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const testBcaConnection = async () => {
    setTestingBca(true)
    try {
      const res = await fetch('/api/test/token-sandbox')
      const data = await res.json()
      setBcaStatus(data)
    } catch (error) {
      console.error('BCA test failed:', error)
    } finally {
      setTestingBca(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-blue-100 text-blue-800',
      PAID: 'bg-green-100 text-green-800',
      EXPIRED: 'bg-gray-100 text-gray-800',
      COMPLETED: 'bg-green-100 text-green-800',
      PENDING: 'bg-yellow-100 text-yellow-800',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">BCA VA Dashboard</h1>
              <p className="text-sm text-gray-500">Sandbox Testing Environment</p>
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* System Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Health Check */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">System Status</h2>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    health?.checks.server === 'ok' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm">Server</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    health?.checks.database === 'ok' ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm">Database</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    health?.checks.crm === 'ok'
                      ? 'bg-green-500'
                      : health?.checks.crm === 'dev'
                      ? 'bg-yellow-500'
                      : health?.checks.crm === 'not_configured'
                      ? 'bg-gray-400'
                      : 'bg-red-500'
                  }`}
                />
                <span className="text-sm">
                  CRM {health?.checks.crm === 'dev' && '(dev mode)'}
                  {health?.checks.crm === 'not_configured' && '(not configured)'}
                </span>
              </div>
            </div>
          </div>

          {/* BCA Connection */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-medium text-gray-500 mb-3">BCA Connection</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={testBcaConnection}
                disabled={testingBca}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {testingBca ? 'Testing...' : 'Test Connection'}
              </button>
              {bcaStatus && (
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      bcaStatus.success ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-sm text-gray-600">
                    {bcaStatus.success ? `OK (${bcaStatus.duration})` : 'Failed'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total VA</p>
            <p className="text-2xl font-bold text-gray-900">{stats?.totalVa || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-2xl font-bold text-blue-600">{stats?.activeVa || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Paid</p>
            <p className="text-2xl font-bold text-green-600">{stats?.paidVa || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Expired</p>
            <p className="text-2xl font-bold text-gray-500">{stats?.expiredVa || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-xl font-bold text-green-600">
              {formatCurrency(stats?.totalRevenue || 0)}
            </p>
          </div>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Virtual Accounts */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Virtual Accounts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      VA Number
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {vas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No virtual accounts yet
                      </td>
                    </tr>
                  ) : (
                    vas.map((va) => (
                      <tr key={va.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-mono text-gray-900">
                          {va.vaNumber}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {va.customerName || '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">
                          {formatCurrency(va.amount)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${getStatusBadge(
                              va.status
                            )}`}
                          >
                            {va.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Payments</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Trx ID
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Customer
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No payments yet
                      </td>
                    </tr>
                  ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm font-mono text-gray-900">
                          {p.bcaTrxId.substring(0, 15)}...
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">
                          {p.customerName || '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-green-600 font-medium">
                          {formatCurrency(p.amountPaid)}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {formatDate(p.paymentDate)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-center text-sm text-gray-400">
          <p>BCA VA Integration - Sandbox Mode</p>
          <p>sandbox.bca.co.id</p>
        </div>
      </main>
    </div>
  )
}
