# Payment Integration Guide (Hanuriit VtrRestServer)

## Overview

This document describes how to integrate the Hanuriit VtrRestServer payment agent with the hotel kiosk system.

## Quick Start

### 1. Install VtrRestServer on Kiosk Machine

```powershell
# Copy the agent to C:\Hanuriit
Copy-Item -Path "path\to\VtrRestServer" -Destination "C:\Hanuriit\VtrRestServer" -Recurse

# Trust the SSL certificate (Run as Administrator)
cd C:\Hanuriit\VtrRestServer\cert
certutil -addstore "Root" server.crt
```

### 2. Run the Agent

```powershell
# Start VtrRestServer
Start-Process "C:\Hanuriit\VtrRestServer\VtrRestServer.exe"

# Verify it's running (should return some response)
Invoke-WebRequest -Uri "https://localhost:8085/VTR_APP_Check" -Method POST -ContentType "text/plain"
```

### 3. Add Database Table

```powershell
# Run migration on kiosk database
psql -U orange -d kiosk -f database/add_payment_transactions.sql
```

### 4. Use Payment Components

```tsx
import { PaymentButton } from '@/components/payment';

function CheckoutScreen() {
  return (
    <PaymentButton
      amount={50000}
      reservationId="RES123"
      roomNumber="201"
      guestName="홍길동"
      onPaymentSuccess={(result) => {
        console.log('Payment success:', result.approval_no);
      }}
    />
  );
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Kiosk Machine (Windows)                          │
│                                                                          │
│  ┌──────────────────┐         ┌──────────────────┐                      │
│  │   Kiosk Web App  │  HTTPS  │  VtrRestServer   │                      │
│  │   (Next.js)      │◄───────►│  (localhost:8085)│                      │
│  │   Browser/Electron│         │  Payment Agent   │                      │
│  └──────────────────┘         └────────┬─────────┘                      │
│                                        │                                 │
│                                        │ Serial/USB                      │
│                                        ▼                                 │
│                               ┌──────────────────┐                      │
│                               │  Payment Terminal │                      │
│                               │  (Card Reader)    │                      │
│                               └──────────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ VAN Network
                                        ▼
                               ┌──────────────────┐
                               │   VAN Server      │
                               │   (NICE/KICC/etc) │
                               └──────────────────┘
```

## Prerequisites

### 1. Install VtrRestServer

1. Copy `VtrRestServer` folder to `C:\Hanuriit\` (or your preferred location)
2. Run `VtrRestServer.exe` as Administrator
3. The agent will run in system tray (hidden mode)

### 2. Configure RestApi.ini

```ini
[VtrRestApi]
Port=8085           # HTTPS port (default: 8085)
Https=1             # Enable HTTPS (required)
StartRun=1          # Auto-start with Windows
AutoHidden=1        # Run minimized to tray
StartRegist=1       # Register as startup program
AgentExec=1         # Auto-execute VTR on start

[Log]
LogWriteFlag=3      # Log level: 0=None, 1=Error, 2=Info, 3=Debug
LogDeleteFlag=2     # Auto-delete logs: 0=Never, 1=7days, 2=30days

[AlimTalk]
AutoMsgid=1         # Auto-generate message IDs
AutoExpDate=1       # Auto-calculate expiry dates
```

### 3. Install SSL Certificate

The VtrRestServer uses a self-signed certificate. To avoid browser security warnings:

**Option A: Trust the certificate (Recommended for development)**
```powershell
# Run as Administrator
cd C:\Hanuriit\VtrRestServer\cert
certutil -addstore "Root" server.crt
```

**Option B: For Chrome/Edge (Development only)**
1. Navigate to `chrome://flags/#allow-insecure-localhost`
2. Enable "Allow invalid certificates for resources loaded from localhost"

**Option C: For Production (Electron app)**
```javascript
// In Electron main process
app.commandLine.appendSwitch('ignore-certificate-errors', 'true');
```

### 4. Verify Agent is Running

Open browser and navigate to:
```
https://localhost:8085/
```

If working, you'll see a response or connection (even if it's an error page, the agent is running).

## API Reference

### Base URL
```
https://localhost:8085/
```

### Request Format
- **Method**: POST
- **Content-Type**: `text/plain` (NOT application/json!)
- **Body**: JSON string

### Response Format
- **Content-Type**: application/json
- **Result Codes**: "0000" = Success, others = Error

---

## Payment Flow

### 1. Credit Card Payment (101R)

```
┌─────────┐     ┌───────────────┐     ┌──────────────┐     ┌───────────┐
│  Kiosk  │     │ VtrRestServer │     │   Terminal   │     │ VAN Server│
└────┬────┘     └───────┬───────┘     └──────┬───────┘     └─────┬─────┘
     │                  │                    │                   │
     │ 1. GetCreditToken│                    │                   │
     │─────────────────►│                    │                   │
     │                  │ 2. Display "Insert Card"               │
     │                  │───────────────────►│                   │
     │                  │                    │ User inserts card │
     │                  │ 3. Card Data       │◄──────────────────│
     │                  │◄───────────────────│                   │
     │ 4. Token Response│                    │                   │
     │◄─────────────────│                    │                   │
     │                  │                    │                   │
     │ 5. ApprovalServerSec (101R)           │                   │
     │─────────────────►│                    │                   │
     │                  │ 6. Send Approval Request               │
     │                  │───────────────────────────────────────►│
     │                  │ 7. Approval Response                   │
     │                  │◄───────────────────────────────────────│
     │ 8. Result        │                    │                   │
     │◄─────────────────│                    │                   │
     │                  │                    │                   │
     │ 9. Print Receipt │                    │                   │
     │─────────────────►│                    │                   │
     │                  │ 10. Print          │                   │
     │                  │───────────────────►│                   │
     │                  │                    │ Receipt printed   │
```

### 2. Payment Cancellation (102R)

```
┌─────────┐     ┌───────────────┐     ┌───────────┐
│  Kiosk  │     │ VtrRestServer │     │ VAN Server│
└────┬────┘     └───────┬───────┘     └─────┬─────┘
     │                  │                   │
     │ 1. ApprovalServerSec (102R)          │
     │  + Org_approval_no                   │
     │  + Org_auth_date                     │
     │─────────────────►│                   │
     │                  │ 2. Cancel Request │
     │                  │──────────────────►│
     │                  │ 3. Cancel Response│
     │                  │◄──────────────────│
     │ 4. Result        │                   │
     │◄─────────────────│                   │
```

---

## Message Types

| Code | Description | Usage |
|------|-------------|-------|
| 101R | Credit Card Approval | Normal payment |
| 102R | Credit Card Cancel | Refund/void |
| 121R | UnionPay Approval | Chinese cards |
| 122R | UnionPay Cancel | Chinese card refund |
| 201R | Cash Receipt Approval | Tax receipt |
| 202R | Cash Receipt Cancel | Cancel tax receipt |
| 401R | Cash IC Approval | Debit card |
| 402R | Cash IC Cancel | Debit card refund |
| 801R | Simple Pay Approval | KakaoPay, NaverPay |
| 802R | Simple Pay Cancel | Simple pay refund |

---

## API Examples

### 1. Get Credit Token (Read Card)

**Endpoint**: `POST /VTR_APP_GetCreditToken`

**Request**:
```json
{
  "Term_div": "P",
  "Term_id": "",
  "Trade_serial_no": "",
  "m_Certify_no": "",
  "Van_index": "0",
  "Amount": "50000"
}
```

**Response**:
```json
{
  "Result": "0000",
  "Message": "정상",
  "Track_data": "ENCRYPTED_CARD_DATA...",
  "Card_no": "1234-56**-****-7890",
  "Emv_data": "..."
}
```

### 2. Credit Card Approval (101R)

**Endpoint**: `POST /ApprovalServerSec`

**Request**:
```json
{
  "sbuffer": {
    "Msg_type": "101R",
    "Cancel_reason": "",
    "Keyin": "",
    "Track_data": "FROM_TOKEN_RESPONSE",
    "Halbu": "00",
    "Pay_amount": "50000",
    "Tax": "4545",
    "Svrcharge": "0",
    "Amount": "50000",
    "Org_approval_no": "",
    "Org_auth_date": "",
    "Term_id": "",
    "Trade_serial_no": "RES20260120001",
    "Vcode": "",
    "Esign_div": "0"
  },
  "perbuffer": {"bufferdata": ""},
  "emvbuffer": {"bufferdata": "FROM_TOKEN_IF_IC"},
  "subbuffer": {
    "Remark_Count": "2",
    "Remark_01": "Hotel Check-in",
    "Remark_02": "Room 201"
  },
  "signbuffer": {"bufferdata": ""},
  "resbuffer": {"bufferdata": ""}
}
```

**Response (Success)**:
```json
{
  "Result": "0000",
  "Message": "정상승인",
  "Approval_no": "12345678",
  "Auth_date": "260120",
  "Auth_time": "143052",
  "Card_no": "1234-56**-****-7890",
  "Card_name": "신한카드",
  "Acquirer_name": "신한카드",
  "Merchant_no": "1234567890",
  "Halbu": "00",
  "Amount": "50000"
}
```

**Response (Error)**:
```json
{
  "Result": "9001",
  "Message": "카드를 읽어주세요",
  "Approval_no": "",
  "Auth_date": ""
}
```

### 3. Credit Card Cancel (102R)

**Endpoint**: `POST /ApprovalServerSec`

**Request**:
```json
{
  "sbuffer": {
    "Msg_type": "102R",
    "Cancel_reason": "1",
    "Keyin": "",
    "Track_data": "",
    "Halbu": "00",
    "Pay_amount": "50000",
    "Tax": "4545",
    "Svrcharge": "0",
    "Amount": "50000",
    "Org_approval_no": "12345678",
    "Org_auth_date": "260120",
    "Term_id": "",
    "Trade_serial_no": "RES20260120001",
    "Vcode": "",
    "Esign_div": "0"
  },
  "perbuffer": {"bufferdata": ""},
  "emvbuffer": {"bufferdata": ""},
  "subbuffer": {},
  "signbuffer": {"bufferdata": ""},
  "resbuffer": {"bufferdata": ""}
}
```

### 4. Print Receipt

**Endpoint**: `POST /VTR_APP_Print`

**Request**: (empty or no body)

**Response**:
```json
{
  "Result": "0000",
  "Message": "출력완료"
}
```

---

## Installment Options (Halbu)

| Value | Description |
|-------|-------------|
| 00 | 일시불 (Lump sum) |
| 02 | 2개월 (2 months) |
| 03 | 3개월 (3 months) |
| 06 | 6개월 (6 months) |
| 12 | 12개월 (12 months) |

**Note**: Installments typically available for amounts ≥ 50,000 KRW

---

## Cancel Reason Codes

| Value | Description |
|-------|-------------|
| 1 | 고객요청 (Customer request) |
| 2 | 거래오류 (Transaction error) |
| 3 | 기타 (Other) |

---

## Error Codes

| Code | Description | Action |
|------|-------------|--------|
| 0000 | Success | - |
| 9001 | Card read required | Prompt user to insert card |
| 9002 | Card read error | Retry or use different card |
| 9003 | Transaction timeout | Retry |
| 9004 | Terminal not connected | Check terminal connection |
| 9005 | VAN connection error | Check network |
| 9999 | System error | Contact support |

For full error code list, see: `02.문서/issue_code_20250115.xlsx`

---

## Kiosk Integration

### File Structure

```
hio-checkin-kiosk/admin/src/
├── lib/
│   └── payment/
│       ├── payment-agent.ts      # REST API client
│       ├── payment-types.ts      # TypeScript types
│       └── use-payment.ts        # React hook
├── components/
│   └── payment/
│       ├── PaymentModal.tsx      # Payment UI modal
│       ├── CardReadingScreen.tsx # "Insert card" screen
│       ├── ProcessingScreen.tsx  # "Processing" screen
│       └── ResultScreen.tsx      # Success/error screen
└── app/api/
    └── payment/
        ├── route.ts              # Payment proxy (optional)
        └── history/route.ts      # Payment history
```

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_PAYMENT_AGENT_URL=https://localhost:8085
PAYMENT_AGENT_TIMEOUT=60000
```

---

## Testing

### 1. Test with Sample HTML

1. Open `VtrSample_js_RestAPI.html` in browser
2. Select function from dropdown
3. Modify parameters if needed
4. Click "Send" to test

### 2. Test Card Numbers (Development)

Contact your VAN provider for test card numbers. Common test scenarios:
- Approval: Should return 0000
- Decline: Should return error code
- Timeout: Wait > 60 seconds

### 3. Test Without Terminal

You can test the API structure without a physical terminal by using mock responses. The agent will return error codes but the API format is validated.

---

## Production Checklist

- [ ] VtrRestServer installed and running as service
- [ ] SSL certificate trusted on kiosk machine
- [ ] Terminal connected and powered on
- [ ] VAN credentials configured (Term_id, merchant info)
- [ ] Firewall allows localhost:8085
- [ ] Payment history database table created
- [ ] Error logging configured
- [ ] Receipt printer connected and tested
- [ ] Refund workflow tested

---

## Troubleshooting

### Agent not responding
```powershell
# Check if process is running
Get-Process | Where-Object {$_.ProcessName -like "*VtrRest*"}

# Restart agent
Stop-Process -Name "VtrRestServer" -Force
Start-Process "C:\Hanuriit\VtrRestServer\VtrRestServer.exe"
```

### SSL Certificate errors
```powershell
# View installed certificates
certutil -store "Root" | findstr /i "vtr"

# Remove and reinstall
certutil -delstore "Root" "VtrRestServer"
certutil -addstore "Root" "C:\Hanuriit\VtrRestServer\cert\server.crt"
```

### Terminal not detected
1. Check USB/Serial connection
2. Restart terminal (power off/on)
3. Check Device Manager for COM port
4. Verify terminal settings in VTR configuration

---

## Support

- **Payment Agent**: Hanuriit (한우리IT)
- **Documentation**: `payment/01. 에이전트/02.문서/`
- **Error Codes**: `issue_code_20250115.xlsx`
- **Protocol Spec**: `스마트 알파 보안 전문(v.2.3)_DCC 추가.xlsx`
