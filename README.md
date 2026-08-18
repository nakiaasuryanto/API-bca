# App-BCA: BCA SNAP API Integration Service

Service integrasi BCA API (SNAP) untuk automasi rekonsiliasi pembayaran dan auto-journaling. Service ini berdiri terpisah dari repo Obrola (Chat360).

## Fitur

- **Virtual Account Management**: Generate VA unik untuk setiap prospecting yang status-nya `Closing`
- **BCA SNAP Integration**: VA Inquiry, VA Payment Flag (webhook), VA Payment Status
- **Automatic Reconciliation**: Match pembayaran ke closing terkait secara otomatis
- **Idempotent Processing**: Handle duplicate notification dari BCA dengan aman
- **Audit Trail**: Log semua API call ke BCA untuk debugging dan audit
- **Journal Integration**: Push jurnal ke Digital360 setelah pembayaran terverifikasi (pending implementation)

## Tech Stack

- Next.js 16 + TypeScript
- Prisma ORM + MySQL
- BCA SNAP API (Virtual Account for Biller)

## Setup

### 1. Clone dan Install Dependencies

```bash
cd app-bca
npm install
```

### 2. Setup Environment

Copy `.env.example` ke `.env` dan isi credential yang diperlukan:

```bash
cp .env.example .env
```

Credential yang perlu diisi:
- `DATABASE_URL` atau `DATABASE_PAYMENT_URL`: MySQL connection untuk vg_payment
- `DATABASE_PROSPECT_URL`: MySQL connection untuk vg_prospect (read-only)
- `BCA_CLIENT_ID`, `BCA_CLIENT_SECRET`: OAuth credentials dari BCA
- `BCA_PARTNER_ID`, `BCA_CHANNEL_ID`: Partner info dari BCA
- `BCA_VA_PARTNER_SERVICE_ID`: 5-digit company code
- `BCA_PRIVATE_KEY_PATH` atau `BCA_PRIVATE_KEY_BASE64`: RSA private key untuk signature
- `INTERNAL_API_KEY`: API key untuk internal service calls

### 3. Setup RSA Keys

Generate RSA key pair untuk BCA SNAP authentication:

```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

Upload public key ke BCA Developer Portal.

### 4. Setup Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema ke database (development)
npm run db:push

# Atau gunakan migrations (production)
npm run db:migrate
```

### 5. Run Development Server

```bash
npm run dev
```

## API Endpoints

### Internal APIs (requires `X-API-KEY` header)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check (no auth required) |
| `/api/va/create` | POST | Create VA untuk prospecting |
| `/api/test/bca-auth` | GET | Test BCA authentication |

### BCA Webhook Endpoints (called by BCA)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bca-webhook/va-inquiry` | POST | BCA inquiry VA details |
| `/api/bca-webhook/va-payment` | POST | BCA payment notification |

## Create VA Example

```bash
curl -X POST http://localhost:3000/api/va/create \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-internal-api-key" \
  -d '{
    "prospectingId": 12345,
    "amount": 1500000,
    "ubPrefix": "01",
    "expiresInDays": 7
  }'
```

Response:
```json
{
  "success": true,
  "message": "VA created successfully",
  "data": {
    "vaNumber": "1234500000000000012345",
    "customerNo": "0100000000000012345",
    "amount": "1500000",
    "status": "ACTIVE",
    "expiresAt": "2024-01-22T00:00:00.000Z"
  }
}
```

## Database Schema

### vg_payment (service database)

- `virtual_accounts`: Mapping VA ↔ prospecting
- `va_payments`: Record pembayaran dari BCA
- `journal_entries`: Log jurnal ke Digital360
- `bca_api_logs`: Audit trail API calls
- `oauth_tokens`: Cache OAuth token BCA

### vg_prospect (CRM database, read-only)

- `prospectings`: Source data closing (cross-DB query via raw SQL)

## VA Number Format

```
| partnerServiceId (5) | ubPrefix (2) | prospectingId (16) |
|---------------------|--------------|---------------------|
|        12345        |      01      |  0000000000012345   |
```

Total: 23 digit VA number

## Flow Diagram

```
1. Prospecting status = 'Closing'
   ↓
2. Admin/System call POST /api/va/create
   ↓
3. VA created: 12345 + 01 + {prospecting_id}
   ↓
4. Customer pays via BCA channel
   ↓
5. BCA calls POST /api/bca-webhook/va-inquiry (optional)
   ↓
6. BCA calls POST /api/bca-webhook/va-payment
   ↓
7. Service validates & updates VA status = PAID
   ↓
8. Service creates journal entry
   ↓
9. (Pending) Push journal to Digital360
```

## TODO

- [ ] Implement Digital360 journal API integration
- [ ] Add signature verification for BCA webhooks (production)
- [ ] Add admin dashboard for VA management
- [ ] Add retry queue for failed journal pushes
- [ ] Add VA expiry cron job
- [ ] Add unit tests

## Security Notes

- Semua internal endpoint wajib authenticated via API key
- BCA webhook endpoint akan verify signature di production
- Private key tidak boleh di-commit ke repo
- Semua credential via environment variables
