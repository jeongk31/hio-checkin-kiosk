# Payment System Testing Guide

**Complete guide for testing VtrRestServer payment integration**

---

## Testing Locally (Mock Server)

### Prerequisites
- Windows 10/11
- Node.js installed
- PostgreSQL with kiosk database
- Kiosk admin project cloned

### Step 1: Database Setup

Run the migration to create payment_transactions table:

```powershell
cd d:\Github\Hotel\hio-checkin-kiosk
$env:PGPASSWORD='00oo00oo'
psql -U orange -d kiosk -c "CREATE TABLE IF NOT EXISTS payment_transactions (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL, project_id UUID REFERENCES projects(id) ON DELETE SET NULL, transaction_id VARCHAR(100) NOT NULL UNIQUE, amount INTEGER NOT NULL, tax INTEGER DEFAULT 0, payment_type VARCHAR(20) DEFAULT 'credit', status VARCHAR(20) DEFAULT 'pending', approval_no VARCHAR(50), auth_date VARCHAR(10), auth_time VARCHAR(10), card_no VARCHAR(50), card_name VARCHAR(100), installment_months INTEGER DEFAULT 0, error_code VARCHAR(20), error_message TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), cancelled_at TIMESTAMP WITH TIME ZONE);"

psql -U orange -d kiosk -c "CREATE INDEX IF NOT EXISTS idx_payment_transactions_reservation_id ON payment_transactions(reservation_id); CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status); CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);"
```

### Step 2: Environment Configuration

Verify `.env.local` has these settings:

```env
# Database
DATABASE_URL=postgresql://orange:00oo00oo@localhost:5432/kiosk

# Payment Agent (Mock server for testing)
NEXT_PUBLIC_PAYMENT_AGENT_URL=http://localhost:8085

# PMS Sync
PMS_SYNC_SECRET=pms-kiosk-sync-2026
```

### Step 3: Start Mock Payment Server

Open **Terminal 1** (PowerShell):

```powershell
cd d:\Github\Hotel\hio-checkin-kiosk\admin
node mock-payment-server-http.js
```

You should see:
```
╔════════════════════════════════════════════════════════╗
║     Mock VtrRestServer for Testing (HTTP)              ║
╚════════════════════════════════════════════════════════╝

🚀 Server running at: http://localhost:8085
```

**Keep this terminal running!**

### Step 4: Start Kiosk Dev Server

Open **Terminal 2** (PowerShell):

```powershell
cd d:\Github\Hotel\hio-checkin-kiosk\admin
npm run dev
```

Wait for:
```
✓ Ready in 2s
- Local: http://localhost:3001
```

**Keep this terminal running!**

### Step 5: Test Payment Flow

#### Option A: Test Page (Quick Test)

1. Open browser: http://localhost:3001/test-payment
2. Click **"💳 결제하기 (50,000원)"**
3. Click **"결제 시작"** in the modal
4. Watch the animation:
   - "카드를 삽입해주세요" (2 seconds)
   - "결제 처리 중" (1-3 seconds)
   - "결제 완료" with approval details
5. Check the alert shows approval number and card info
6. Check Terminal 1 (mock server) logs:
   ```
   [2026-01-20T...] VTR_APP_GetCreditToken
   [2026-01-20T...] ApprovalServerSec
   Approval No: 12345678
   ```

#### Option B: Full Kiosk Flow (Real Test)

1. Open browser: http://localhost:3001/kiosk
2. Complete check-in flow:
   
   **For Walk-in:**
   - Click "체크인" (Check-in)
   - Select a room
   - Accept terms & conditions
   - Skip ID verification (or fill mock data)
   - Skip amenities (or select some)
   - Review payment confirmation
   - Click "다음" to proceed to payment screen

   **For Pre-reservation:**
   - Click "체크인" (Check-in)
   - Enter reservation number
   - Accept terms & conditions
   - Skip ID verification
   - Skip amenities (or select some)
   - Review payment confirmation
   - Click "다음" to proceed to payment screen

3. On payment screen, you'll see:
   ```
   총 결제 금액
   50,000원

   [💳 카드 결제] ← Click this

   📱 태블릿 결제 (이지체크)
   ```

4. Click **"💳 카드 결제"**
5. Modal opens with payment flow
6. Click **"결제 시작"**
7. Wait for payment to complete
8. System auto-advances to room info screen

### Step 6: Verify Database Records

Check payment was saved:

```powershell
$env:PGPASSWORD='00oo00oo'
psql -U orange -d kiosk -c "SELECT transaction_id, amount, status, approval_no, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as payment_time FROM payment_transactions ORDER BY created_at DESC LIMIT 5;"
```

Expected output:
```
       transaction_id       | amount |  status  | approval_no |   payment_time
----------------------------+--------+----------+-------------+---------------------
 EST123_20260120_XXXX       |  50000 | approved | 12345678    | 2026-01-20 14:30:00
```

### Common Issues (Mock Server)

**Issue: "결제 에이전트에 연결할 수 없습니다"**
- **Cause:** Mock server not running
- **Fix:** Start mock server in Terminal 1

**Issue: Payment modal doesn't open**
- **Cause:** Browser console shows network error
- **Fix:** Check `NEXT_PUBLIC_PAYMENT_AGENT_URL` in `.env.local`

**Issue: Payment success but not saved to database**
- **Cause:** `DATABASE_URL` not set
- **Fix:** Add `DATABASE_URL` to `.env.local`, restart dev server

---

## Testing on Production

### Prerequisites
- Physical payment terminal (VtrRestServer hardware)
- Kiosk machine (Windows)
- Production database configured
- SSL certificates installed

### Step 1: Install VtrRestServer

1. Copy VtrRestServer software to kiosk machine:
   ```
   C:\Hanuriit\VtrRestServer\
   ```

2. Run as Administrator:
   ```powershell
   cd C:\Hanuriit\VtrRestServer
   .\VtrRestServer.exe
   ```

3. Configure VAN terminal settings:
   - Merchant ID
   - Terminal ID
   - VAN provider credentials
   - Network settings

4. Trust SSL certificate:
   ```powershell
   cd C:\Hanuriit\VtrRestServer\cert
   certutil -addstore "Root" server.crt
   ```

### Step 2: Update Environment Configuration

Edit `.env.local` on kiosk machine:

```env
# Database (Production)
DATABASE_URL=postgresql://orange:00oo00oo@54.180.144.32:5432/kiosk

# Payment Agent (Production HTTPS)
NEXT_PUBLIC_PAYMENT_AGENT_URL=https://localhost:8085

# PMS Sync (Production)
PMS_SYNC_SECRET=your-production-secret
```

### Step 3: Deploy Kiosk Application

```powershell
cd d:\Github\Hotel\hio-checkin-kiosk\admin
npm run build
npm start
```

Or use production server (PM2, etc.)

### Step 4: Test with Real Payment Cards

**Test Card 1: Credit Card (Approval)**
1. Complete check-in flow to payment screen
2. Click "💳 카드 결제"
3. **Insert physical card** into terminal
4. Terminal reads card (2-5 seconds)
5. Enter PIN if required
6. Wait for approval (3-10 seconds)
7. Receipt prints automatically
8. System shows success and advances

**Expected Result:**
- Approval number: 8-digit number
- Card number: 1234-56**-****-7890 (masked)
- Card name: Actual card issuer (신한카드, KB국민카드, etc.)
- Amount: Correct total
- Transaction saved to database

**Test Card 2: Test Timeout**
1. Start payment flow
2. Don't insert card
3. Wait 60 seconds
4. System shows: "카드 읽기 실패"
5. Click "다시 시도" to retry

**Test Card 3: Declined Card**
1. Use card with insufficient balance
2. Terminal rejects card
3. System shows: "결제에 실패했습니다"
4. Error message: Card-specific error
5. Click "다시 시도" or call staff

### Step 5: Verify Production Database

Connect to production database:

```powershell
$env:PGPASSWORD='00oo00oo'
psql -U orange -h 54.180.144.32 -d kiosk -c "SELECT transaction_id, amount, status, approval_no, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as payment_time FROM payment_transactions WHERE created_at > NOW() - INTERVAL '1 hour' ORDER BY created_at DESC;"
```

### Step 6: Monitor Production Logs

Check VtrRestServer logs:
```
C:\Hanuriit\VtrRestServer\logs\
```

Check kiosk application logs for payment errors.

### Production Checklist

Before going live:
- [ ] VtrRestServer installed and running
- [ ] SSL certificate trusted
- [ ] VAN terminal configured with merchant credentials
- [ ] Database migration run (payment_transactions table exists)
- [ ] `.env.local` configured with HTTPS URL
- [ ] Test with real credit card (small amount)
- [ ] Test with real debit card
- [ ] Test timeout scenario
- [ ] Test declined card scenario
- [ ] Verify receipt printing
- [ ] Verify database recording
- [ ] Test cancellation/refund (if needed)

### Common Issues (Production)

**Issue: "결제 에이전트에 연결할 수 없습니다"**
- **Cause:** VtrRestServer not running or certificate not trusted
- **Fix 1:** Check VtrRestServer is running: https://localhost:8085
- **Fix 2:** Install certificate: `certutil -addstore "Root" server.crt`
- **Fix 3:** Check firewall allows localhost:8085

**Issue: "카드 읽기 실패"**
- **Cause:** Terminal not connected or card reader error
- **Fix 1:** Check USB cable to terminal
- **Fix 2:** Check terminal power
- **Fix 3:** Restart VtrRestServer
- **Fix 4:** Check terminal configuration in VtrRestServer settings

**Issue: "승인 거절"**
- **Cause:** Card declined by VAN/bank
- **Reasons:** Insufficient balance, invalid card, expired card, PIN error
- **Fix:** Use different card or call staff

**Issue: Payment approved but not saved to database**
- **Cause:** Database connection error
- **Fix 1:** Check `DATABASE_URL` in `.env.local`
- **Fix 2:** Check database is accessible: `psql -U orange -h 54.180.144.32 -d kiosk`
- **Fix 3:** Check network firewall rules

---

## Testing Checklist

### Functionality Testing

- [ ] **Basic Payment Flow**
  - [ ] Click payment button
  - [ ] Card reading animation works
  - [ ] Processing animation works
  - [ ] Success screen shows approval details
  - [ ] Auto-advance to next screen

- [ ] **Amount Calculation**
  - [ ] Room price correct
  - [ ] Amenity charges added correctly
  - [ ] Total displayed correctly

- [ ] **Database Recording**
  - [ ] Transaction ID generated uniquely
  - [ ] Approval number saved
  - [ ] Card info saved (masked)
  - [ ] Timestamps correct
  - [ ] Reservation ID linked (if applicable)

- [ ] **Error Handling**
  - [ ] Agent unavailable → Shows error message
  - [ ] Card read timeout → Shows retry option
  - [ ] Payment declined → Shows error + retry
  - [ ] Network error → Shows error + retry

- [ ] **UI/UX**
  - [ ] Modal animations smooth
  - [ ] Status messages clear
  - [ ] Korean text correct
  - [ ] Buttons responsive
  - [ ] Can't close modal during processing

### Integration Testing

- [ ] **Pre-reservation Check-in**
  - [ ] Payment amount includes reservation details
  - [ ] Reservation ID linked to payment record
  - [ ] Guest name displayed correctly
  - [ ] Room number correct

- [ ] **Walk-in Check-in**
  - [ ] Payment amount based on selected room
  - [ ] Room assignment works after payment
  - [ ] Guest info captured correctly

- [ ] **Amenity Add-ons**
  - [ ] Amenity prices added to total
  - [ ] Multiple amenities calculated correctly
  - [ ] Amenity details saved

- [ ] **EasyCheck Fallback**
  - [ ] EasyCheck button still works
  - [ ] Both payment methods available
  - [ ] No conflicts between methods

### Performance Testing

- [ ] **Payment Speed**
  - [ ] Card reading: 2-5 seconds
  - [ ] Approval: 3-10 seconds
  - [ ] Total time: < 15 seconds
  - [ ] Database save: < 1 second

- [ ] **Multiple Payments**
  - [ ] Can process back-to-back payments
  - [ ] No memory leaks
  - [ ] No hanging connections

### Security Testing

- [ ] **Card Data**
  - [ ] Card number masked (XX**-****-XXXX)
  - [ ] Full number not stored
  - [ ] PIN not stored
  - [ ] CVV not stored

- [ ] **Network Security**
  - [ ] HTTPS used in production
  - [ ] Certificate valid
  - [ ] No cleartext card data

---

## Quick Reference Commands

### Mock Server Testing
```powershell
# Start mock server
cd d:\Github\Hotel\hio-checkin-kiosk\admin
node mock-payment-server-http.js

# Start dev server
npm run dev

# Check database
$env:PGPASSWORD='00oo00oo'
psql -U orange -d kiosk -c "SELECT COUNT(*) FROM payment_transactions;"

# View recent payments
psql -U orange -d kiosk -c "SELECT transaction_id, amount, status, approval_no FROM payment_transactions ORDER BY created_at DESC LIMIT 10;"
```

### Production Testing
```powershell
# Check VtrRestServer status
Invoke-WebRequest -Uri "https://localhost:8085/VTR_APP_Check" -Method POST -SkipCertificateCheck

# View production payments
$env:PGPASSWORD='00oo00oo'
psql -U orange -h 54.180.144.32 -d kiosk -c "SELECT transaction_id, amount, status, approval_no, TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') FROM payment_transactions WHERE DATE(created_at) = CURRENT_DATE ORDER BY created_at DESC;"

# Check today's total revenue
psql -U orange -h 54.180.144.32 -d kiosk -c "SELECT COUNT(*) as total_payments, SUM(amount) as total_revenue FROM payment_transactions WHERE DATE(created_at) = CURRENT_DATE AND status = 'approved';"
```

---

## Support

**Documentation:**
- Full integration guide: `PAYMENT_INTEGRATION.md`
- Technical details: `PAYMENT_TEST_RESULTS.md`
- Kiosk integration: `KIOSK_PAYMENT_INTEGRATION.md`

**Test Resources:**
- Mock server: `mock-payment-server-http.js`
- Test page: http://localhost:3001/test-payment
- Kiosk flow: http://localhost:3001/kiosk

**Database Schema:**
- Migration script: `database/add_payment_transactions.sql`
- Full schema: `database/schema.sql`
