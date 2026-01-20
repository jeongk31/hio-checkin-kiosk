/**
 * Mock VtrRestServer for Testing
 * This simulates the Hanuriit payment agent API for development/testing
 * 
 * Run: node mock-payment-server.js
 * Then test from kiosk: https://localhost:8085
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Mock responses
const mockResponses = {
  'VTR_APP_Check': {
    Result: '0000',
    Message: '정상'
  },
  
  'VTR_APP_GetCreditToken': {
    Result: '0000',
    Message: '정상',
    Track_data: 'MOCK_ENCRYPTED_CARD_DATA_' + Date.now(),
    Card_no: '1234-56**-****-7890',
    Card_name: '신한카드',
    Emv_data: 'MOCK_EMV_DATA'
  },
  
  'ApprovalServerSec': (body) => {
    const sbuffer = body?.sbuffer || {};
    const isCancel = sbuffer.Msg_type === '102R';
    
    // Simulate processing delay
    const delay = Math.random() * 2000 + 1000; // 1-3 seconds
    
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          Result: '0000',
          Message: isCancel ? '취소승인' : '정상승인',
          Approval_no: '1234' + Math.floor(Math.random() * 10000),
          Auth_date: new Date().toISOString().slice(2, 10).replace(/-/g, '').slice(0, 6), // YYMMDD
          Auth_time: new Date().toTimeString().slice(0, 8).replace(/:/g, ''), // HHMMSS
          Card_no: '1234-56**-****-7890',
          Card_name: '신한카드',
          Acquirer_name: '신한카드',
          Merchant_no: '1234567890',
          Halbu: sbuffer.Halbu || '00',
          Amount: sbuffer.Amount || '0'
        });
      }, delay);
    });
  },
  
  'VTR_APP_Print': {
    Result: '0000',
    Message: '출력완료'
  }
};

// Self-signed certificate (for testing only)
const serverOptions = {
  key: `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7VJTUt9Us8cKj
MzEfYyjiWA4R4/M2bS1+fWIcPm15A8BQvU8wP4TlJHt6hcYx7KZBvZhPu9tQQqiX
cQo0VLECQWQkZZ6OhYGHj+O3P5h/WtvPJGiVJNHqKr6W8FUQZHjr9fCOVZqy8rBY
xN5xJBQKLkLd9VmF0phZ6rQj0xrxqYD3Xy+W0gJaBYkVhvxPXxXrgjfDtYvYCPPM
xqmSL5Hb/nP5qVQCnMZqW6SqPLdhJqiNShAaJhJM3K5sxXPVTKLYJNdvPRWCFkLh
E3kgjd3lIcG/bxuW9T8wqfXFvPPKxL9DcjVWABGbgSpVBALqD5SiOJZJYaWLuBhf
SIHc9fPlAgMBAAECggEACGAJIvHAXmKLu3jVEPBJx3h1hZ3jCHoB6xSkZJJW9U2l
R8qRvBdYK8e3qZvXLQghTK4oNR6RfEBhKGlLEQQqMfBGMnYNNlNqnRSKXLKLJdPv
-----END PRIVATE KEY-----`,
  cert: `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoWZEVhN5MQMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTcwODI3MDkxNzE4WhcNMjcwODI1MDkxNzE4WjBF
-----END CERTIFICATE-----`
};

// Create HTTPS server
const server = https.createServer(serverOptions, async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ Result: '9999', Message: 'Method not allowed' }));
    return;
  }
  
  // Get endpoint from URL
  const endpoint = req.url.replace('/', '');
  console.log(`[${new Date().toISOString()}] ${endpoint}`);
  
  // Read body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      const parsedBody = body ? JSON.parse(body) : {};
      console.log('  Body:', JSON.stringify(parsedBody, null, 2).split('\n').slice(0, 5).join('\n'));
      
      // Get mock response
      let response = mockResponses[endpoint];
      
      if (typeof response === 'function') {
        response = await response(parsedBody);
      } else if (!response) {
        response = {
          Result: '9999',
          Message: `Unknown endpoint: ${endpoint}`
        };
      }
      
      console.log('  Response:', response.Result, response.Message);
      console.log('');
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      console.error('Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        Result: '9999',
        Message: 'Internal server error'
      }));
    }
  });
});

const PORT = 8085;

server.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Mock VtrRestServer for Testing                     ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running at: https://localhost:${PORT}`);
  console.log('');
  console.log('⚠️  Using self-signed certificate - browser will show warning');
  console.log('   Click "Advanced" → "Proceed to localhost" to continue');
  console.log('');
  console.log('📝 Available endpoints:');
  console.log('   - VTR_APP_Check (health check)');
  console.log('   - VTR_APP_GetCreditToken (read card)');
  console.log('   - ApprovalServerSec (approve/cancel)');
  console.log('   - VTR_APP_Print (print receipt)');
  console.log('');
  console.log('🔍 Requests will be logged below:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

// Handle errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
    console.error('   Either:');
    console.error('   1. Stop the existing VtrRestServer process');
    console.error('   2. Or change the PORT in this file');
  } else {
    console.error('❌ Server error:', error);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down mock server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
