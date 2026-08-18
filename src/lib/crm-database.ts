/**
 * PKL Database Connection
 *
 * Koneksi ke PKL MySQL database untuk:
 * - prospectings (CRM data)
 * - virtual_accounts (VA data)
 * - va_payments (payment records)
 *
 * Semua data disimpan di PKL MySQL agar bisa dilihat di PKL dashboard.
 */

import mysql from 'mysql2/promise'

let pool: mysql.Pool | null = null

/**
 * Get MySQL connection pool untuk PKL database
 */
export function getPklPool(): mysql.Pool {
  if (!pool) {
    const config = {
      host: process.env.PKL_DB_HOST || '127.0.0.1',
      port: parseInt(process.env.PKL_DB_PORT || '3306'),
      user: process.env.PKL_DB_USER || 'u705828172_pklproject',
      password: process.env.PKL_DB_PASSWORD || 'Bismillah9',
      database: process.env.PKL_DB_NAME || 'u705828172_pklproject',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    }

    pool = mysql.createPool(config)
    console.log(`[PKL DB] MySQL pool created for ${config.database}`)
  }

  return pool
}

// =============================================================================
// PROSPECTING FUNCTIONS
// =============================================================================

/**
 * Update prospecting status to 'Closed' when VA is paid (VG-style with tanggal_closing)
 */
export async function closeProspecting(prospectingId: number): Promise<boolean> {
  try {
    const pool = getPklPool()

    const [result] = await pool.execute(
      `UPDATE prospectings
       SET status = 'Closed',
           tanggal_closing = CURDATE(),
           closed = 'Paid',
           updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [prospectingId]
    )

    const affectedRows = (result as mysql.ResultSetHeader).affectedRows

    if (affectedRows > 0) {
      console.log(`[PKL DB] Prospecting ${prospectingId} status updated to 'Closed' with tanggal_closing`)
      return true
    } else {
      console.warn(`[PKL DB] Prospecting ${prospectingId} not found or already deleted`)
      return false
    }
  } catch (error) {
    console.error(`[PKL DB] Failed to close prospecting ${prospectingId}:`, error)
    return false
  }
}

/**
 * Get prospecting info by ID (VG structure with JOINs)
 */
export async function getProspecting(prospectingId: number): Promise<{
  id: number
  status: string | null
  kontak_nama: string | null
  kontak_telepon: string | null
  kontak_email: string | null
  instansi_nama: string | null
  unit_bisnis: string | null
  produk: string | null
  bahan: string | null
  jumlah: number | null
  harga_satuan: number
  omzet: number
} | null> {
  try {
    const pool = getPklPool()

    const [rows] = await pool.execute(
      `SELECT
         p.id, p.status, p.produk, p.bahan, p.jumlah, p.harga_satuan, p.omzet,
         k.nama as kontak_nama, k.telepon as kontak_telepon, k.email as kontak_email,
         i.nama as instansi_nama, i.unit_bisnis
       FROM prospectings p
       LEFT JOIN kontaks k ON k.id = p.kontak_id
       LEFT JOIN instansis i ON i.id = k.instansi_id
       WHERE p.id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [prospectingId]
    )

    const results = rows as mysql.RowDataPacket[]
    return results[0] || null
  } catch (error) {
    console.error(`[PKL DB] Failed to get prospecting ${prospectingId}:`, error)
    return null
  }
}

// =============================================================================
// VIRTUAL ACCOUNT FUNCTIONS
// =============================================================================

interface CreateVAParams {
  id: string
  vaNumber: string
  customerNo: string
  prospectingId: number
  customerName?: string
  customerPhone?: string
  unitBisnis?: string
  amount: number
  expiresAt?: Date
  createdBy?: string
  notes?: string
}

/**
 * Create Virtual Account in PKL MySQL
 */
export async function createVirtualAccount(params: CreateVAParams): Promise<boolean> {
  try {
    const pool = getPklPool()

    await pool.execute(
      `INSERT INTO virtual_accounts
       (id, va_number, customer_no, prospecting_id, customer_name, customer_phone,
        unit_bisnis, amount, status, expires_at, created_by, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, NOW(), NOW())`,
      [
        params.id,
        params.vaNumber,
        params.customerNo,
        params.prospectingId,
        params.customerName || null,
        params.customerPhone || null,
        params.unitBisnis || null,
        params.amount,
        params.expiresAt || null,
        params.createdBy || null,
        params.notes || null,
      ]
    )

    console.log(`[PKL DB] VA created: ${params.vaNumber}`)
    return true
  } catch (error) {
    console.error(`[PKL DB] Failed to create VA:`, error)
    return false
  }
}

/**
 * Get VA by VA number
 */
export async function getVAByNumber(vaNumber: string): Promise<{
  id: string
  va_number: string
  customer_no: string
  prospecting_id: number
  customer_name: string | null
  amount: number
  status: string
} | null> {
  try {
    const pool = getPklPool()

    const [rows] = await pool.execute(
      `SELECT id, va_number, customer_no, prospecting_id, customer_name, amount, status
       FROM virtual_accounts
       WHERE va_number = ?
       LIMIT 1`,
      [vaNumber]
    )

    const results = rows as mysql.RowDataPacket[]
    return results[0] || null
  } catch (error) {
    console.error(`[PKL DB] Failed to get VA ${vaNumber}:`, error)
    return null
  }
}

/**
 * Get VA by prospecting ID
 */
export async function getVAByProspectingId(prospectingId: number): Promise<{
  id: string
  va_number: string
  amount: number
  status: string
} | null> {
  try {
    const pool = getPklPool()

    const [rows] = await pool.execute(
      `SELECT id, va_number, amount, status
       FROM virtual_accounts
       WHERE prospecting_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [prospectingId]
    )

    const results = rows as mysql.RowDataPacket[]
    return results[0] || null
  } catch (error) {
    console.error(`[PKL DB] Failed to get VA for prospecting ${prospectingId}:`, error)
    return null
  }
}

/**
 * Update VA status to PAID
 */
export async function markVAPaid(vaNumber: string, paidAt: Date = new Date()): Promise<boolean> {
  try {
    const pool = getPklPool()

    const [result] = await pool.execute(
      `UPDATE virtual_accounts
       SET status = 'PAID',
           paid_at = ?,
           updated_at = NOW()
       WHERE va_number = ?`,
      [paidAt, vaNumber]
    )

    const affectedRows = (result as mysql.ResultSetHeader).affectedRows
    return affectedRows > 0
  } catch (error) {
    console.error(`[PKL DB] Failed to mark VA paid ${vaNumber}:`, error)
    return false
  }
}

// =============================================================================
// VA PAYMENT FUNCTIONS
// =============================================================================

interface CreatePaymentParams {
  id: string
  vaId: string
  bcaTrxId: string
  amountPaid: number
  paymentDate: Date
  customerNo: string
  partnerServiceId: string
  paymentChannel?: string
  sourceBankCode?: string
  bcaRequestBody?: string
  bcaResponseBody?: string
}

/**
 * Create VA Payment record
 */
export async function createVAPayment(params: CreatePaymentParams): Promise<boolean> {
  try {
    const pool = getPklPool()

    await pool.execute(
      `INSERT INTO va_payments
       (id, va_id, bca_trx_id, amount_paid, payment_date, customer_no,
        partner_service_id, payment_channel, source_bank_code, status,
        bca_request_body, bca_response_body, created_at, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSED', ?, ?, NOW(), NOW())`,
      [
        params.id,
        params.vaId,
        params.bcaTrxId,
        params.amountPaid,
        params.paymentDate,
        params.customerNo,
        params.partnerServiceId,
        params.paymentChannel || null,
        params.sourceBankCode || null,
        params.bcaRequestBody || null,
        params.bcaResponseBody || null,
      ]
    )

    console.log(`[PKL DB] Payment recorded: ${params.bcaTrxId}`)
    return true
  } catch (error) {
    console.error(`[PKL DB] Failed to create payment:`, error)
    return false
  }
}

/**
 * Check if payment already exists (idempotency)
 */
export async function paymentExists(bcaTrxId: string): Promise<boolean> {
  try {
    const pool = getPklPool()

    const [rows] = await pool.execute(
      `SELECT id FROM va_payments WHERE bca_trx_id = ? LIMIT 1`,
      [bcaTrxId]
    )

    return (rows as mysql.RowDataPacket[]).length > 0
  } catch (error) {
    console.error(`[PKL DB] Failed to check payment ${bcaTrxId}:`, error)
    return false
  }
}

// =============================================================================
// DASHBOARD / STATS FUNCTIONS
// =============================================================================

/**
 * Get dashboard stats
 */
export async function getDashboardStats(): Promise<{
  va: {
    total: number
    active: number
    paid: number
    totalRevenue: number
  }
  prospecting: {
    total: number
    closing: number
    closed: number
  }
}> {
  try {
    const pool = getPklPool()

    const [vaStats] = await pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paid,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0) as totalRevenue
      FROM virtual_accounts
    `)

    const [prospectingStats] = await pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'Closing' THEN 1 ELSE 0 END) as closing,
        SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) as closed
      FROM prospectings
      WHERE deleted_at IS NULL
    `)

    const va = (vaStats as mysql.RowDataPacket[])[0]
    const p = (prospectingStats as mysql.RowDataPacket[])[0]

    return {
      va: {
        total: Number(va.total) || 0,
        active: Number(va.active) || 0,
        paid: Number(va.paid) || 0,
        totalRevenue: Number(va.totalRevenue) || 0,
      },
      prospecting: {
        total: Number(p.total) || 0,
        closing: Number(p.closing) || 0,
        closed: Number(p.closed) || 0,
      },
    }
  } catch (error) {
    console.error(`[PKL DB] Failed to get dashboard stats:`, error)
    return {
      va: { total: 0, active: 0, paid: 0, totalRevenue: 0 },
      prospecting: { total: 0, closing: 0, closed: 0 },
    }
  }
}

/**
 * Get all VAs with prospecting info (VG structure)
 */
export async function getAllVAs(): Promise<Array<{
  id: string
  va_number: string
  prospecting_id: number
  customer_name: string | null
  amount: number
  status: string
  created_at: Date
  paid_at: Date | null
  kontak_nama: string | null
  instansi_nama: string | null
  prospecting_status: string | null
}>> {
  try {
    const pool = getPklPool()

    const [rows] = await pool.execute(`
      SELECT
        va.id,
        va.va_number,
        va.prospecting_id,
        va.customer_name,
        va.amount,
        va.status,
        va.created_at,
        va.paid_at,
        k.nama as kontak_nama,
        i.nama as instansi_nama,
        p.status as prospecting_status
      FROM virtual_accounts va
      LEFT JOIN prospectings p ON p.id = va.prospecting_id
      LEFT JOIN kontaks k ON k.id = p.kontak_id
      LEFT JOIN instansis i ON i.id = k.instansi_id
      ORDER BY va.created_at DESC
      LIMIT 100
    `)

    return rows as mysql.RowDataPacket[] as any[]
  } catch (error) {
    console.error(`[PKL DB] Failed to get VAs:`, error)
    return []
  }
}

/**
 * Get recent payments
 */
export async function getRecentPayments(limit: number = 10): Promise<Array<{
  id: string
  bca_trx_id: string
  amount_paid: number
  payment_date: Date
  va_number: string
  customer_name: string | null
}>> {
  try {
    const pool = getPklPool()

    const [rows] = await pool.execute(`
      SELECT
        vp.id,
        vp.bca_trx_id,
        vp.amount_paid,
        vp.payment_date,
        va.va_number,
        va.customer_name
      FROM va_payments vp
      JOIN virtual_accounts va ON va.id = vp.va_id
      ORDER BY vp.payment_date DESC
      LIMIT ?
    `, [limit])

    return rows as mysql.RowDataPacket[] as any[]
  } catch (error) {
    console.error(`[PKL DB] Failed to get recent payments:`, error)
    return []
  }
}

// =============================================================================
// CUSTOMER FUNCTIONS (for Sales integration)
// =============================================================================

/**
 * Find or create customer from prospecting kontak/instansi
 */
export async function findOrCreateCustomer(params: {
  kontakNama: string
  kontakTelepon?: string | null
  kontakEmail?: string | null
  instansiNama?: string | null
  instansiAlamat?: string | null
}): Promise<number | null> {
  try {
    const pool = getPklPool()

    // Try to find existing customer by phone or email
    if (params.kontakTelepon || params.kontakEmail) {
      const [existing] = await pool.execute(
        `SELECT id FROM customers
         WHERE (phone = ? AND phone IS NOT NULL AND phone != '')
            OR (email = ? AND email IS NOT NULL AND email != '')
         LIMIT 1`,
        [params.kontakTelepon || '', params.kontakEmail || '']
      )
      const results = existing as mysql.RowDataPacket[]
      if (results.length > 0) {
        console.log(`[PKL DB] Found existing customer: ${results[0].id}`)
        return results[0].id
      }
    }

    // Generate customer code
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as count FROM customers`
    )
    const count = (countResult as mysql.RowDataPacket[])[0].count + 1
    const customerCode = `CUST-${String(count).padStart(5, '0')}`

    // Create new customer
    const [result] = await pool.execute(
      `INSERT INTO customers
       (customer_code, name, company_name, email, phone, address, customer_type, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
      [
        customerCode,
        params.kontakNama,
        params.instansiNama || null,
        params.kontakEmail || null,
        params.kontakTelepon || null,
        params.instansiAlamat || null,
        params.instansiNama ? 'COMPANY' : 'INDIVIDUAL'
      ]
    )

    const customerId = (result as mysql.ResultSetHeader).insertId
    console.log(`[PKL DB] Created new customer: ${customerId} (${customerCode})`)
    return customerId
  } catch (error) {
    console.error(`[PKL DB] Failed to find/create customer:`, error)
    return null
  }
}

// =============================================================================
// TRANSACTION FUNCTIONS (for Sales integration)
// =============================================================================

interface CreateTransactionParams {
  customerId: number
  prospectingId: number
  amount: number
  paymentDate: Date
  kontakNama: string
  produk?: string | null
  bahan?: string | null
  jumlah?: number | null
  hargaSatuan?: number | null
  vaNumber?: string
  bcaTrxId?: string
}

/**
 * Create sale transaction when VA is paid
 */
export async function createSaleTransaction(params: CreateTransactionParams): Promise<number | null> {
  try {
    const pool = getPklPool()

    // Generate reference number
    const dateStr = params.paymentDate.toISOString().split('T')[0].replace(/-/g, '')
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as count FROM transactions WHERE DATE(transaction_date) = DATE(?)`,
      [params.paymentDate]
    )
    const count = (countResult as mysql.RowDataPacket[])[0].count + 1
    const refNumber = `INV-${dateStr}-${String(count).padStart(4, '0')}`

    // Build items JSON
    const items = [{
      name: params.produk || 'Produk Custom',
      material: params.bahan || null,
      quantity: params.jumlah || 1,
      price: params.hargaSatuan || params.amount,
      subtotal: params.amount
    }]

    // Create transaction
    const [result] = await pool.execute(
      `INSERT INTO transactions
       (transaction_type, transaction_date, customer_id, total_amount,
        payment_method, payment_status, pic, notes, items, reference_number, created_at)
       VALUES ('SALE', ?, ?, ?, 'BANK_TRANSFER', 'PAID', 'System (VA Auto)', ?, ?, ?, NOW())`,
      [
        params.paymentDate,
        params.customerId,
        params.amount,
        `Auto-created from VA payment. VA: ${params.vaNumber || '-'}, TrxID: ${params.bcaTrxId || '-'}, Prospecting ID: ${params.prospectingId}`,
        JSON.stringify(items),
        refNumber
      ]
    )

    const transactionId = (result as mysql.ResultSetHeader).insertId
    console.log(`[PKL DB] Created sale transaction: ${transactionId} (${refNumber}) - Rp ${params.amount.toLocaleString()}`)

    // Update customer stats
    await pool.execute(
      `UPDATE customers
       SET last_purchase_date = ?,
           total_purchases = total_purchases + 1,
           total_spent = total_spent + ?
       WHERE id = ?`,
      [params.paymentDate, params.amount, params.customerId]
    )

    return transactionId
  } catch (error) {
    console.error(`[PKL DB] Failed to create transaction:`, error)
    return null
  }
}

/**
 * Get full prospecting data for transaction creation
 */
export async function getProspectingForTransaction(prospectingId: number): Promise<{
  id: number
  kontakNama: string
  kontakTelepon: string | null
  kontakEmail: string | null
  instansiNama: string | null
  instansiAlamat: string | null
  produk: string | null
  bahan: string | null
  jumlah: number | null
  hargaSatuan: number
  omzet: number
} | null> {
  try {
    const pool = getPklPool()

    const [rows] = await pool.execute(
      `SELECT
         p.id, p.produk, p.bahan, p.jumlah, p.harga_satuan as hargaSatuan, p.omzet,
         k.nama as kontakNama, k.telepon as kontakTelepon, k.email as kontakEmail,
         i.nama as instansiNama, i.alamat as instansiAlamat
       FROM prospectings p
       LEFT JOIN kontaks k ON k.id = p.kontak_id
       LEFT JOIN instansis i ON i.id = k.instansi_id
       WHERE p.id = ?
       LIMIT 1`,
      [prospectingId]
    )

    const results = rows as mysql.RowDataPacket[]
    return results[0] || null
  } catch (error) {
    console.error(`[PKL DB] Failed to get prospecting for transaction:`, error)
    return null
  }
}

// =============================================================================
// CONNECTION CHECK
// =============================================================================

/**
 * Check if PKL database is connected
 */
export async function checkPklConnection(): Promise<boolean> {
  try {
    const pool = getPklPool()
    await pool.query('SELECT 1')
    return true
  } catch (error) {
    console.error('[PKL DB] Connection check failed:', error)
    return false
  }
}

/**
 * Legacy alias for backward compatibility
 */
export const checkCrmConnection = checkPklConnection
export const isCrmDevMode = () => false // Always use MySQL now
