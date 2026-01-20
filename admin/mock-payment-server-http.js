/**
 * Mock VtrRestServer for Testing (HTTP version)
 * This simulates the Hanuriit payment agent API for development/testing
 * 
 * Run: node mock-payment-server-http.js
 * Then test from kiosk: http://localhost:8085
 */

const http = require('http');

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

// Create HTTP server
const server = http.createServer(async (req, res) => {
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
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${endpoint}`);
  
  // Read body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      const parsedBody = body ? JSON.parse(body) : {};
      
      // Log body (first few lines only)
      const bodyPreview = JSON.stringify(parsedBody, null, 2)
        .split('\n')
        .slice(0, 5)
        .join('\n');
      console.log('  Body:', bodyPreview);
      
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
      if (response.Approval_no) {
        console.log('  Approval No:', response.Approval_no);
      }
      console.log('');
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (error) {
      console.error('❌ Error:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        Result: '9999',
        Message: 'Internal server error: ' + error.message
      }));
    }
  });
});

const PORT = 8085;

server.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║     Mock VtrRestServer for Testing (HTTP)              ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`🚀 Server running at: http://localhost:${PORT}`);
  console.log('');
  console.log('📝 Available endpoints:');
  console.log('   - VTR_APP_Check (health check)');
  console.log('   - VTR_APP_GetCreditToken (read card)');
  console.log('   - ApprovalServerSec (approve/cancel)');
  console.log('   - VTR_APP_Print (print receipt)');
  console.log('');
  console.log('⚙️  Update kiosk .env.local:');
  console.log(`   NEXT_PUBLIC_PAYMENT_AGENT_URL=http://localhost:${PORT}`);
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
    console.error('   1. Stop the existing process on port 8085');
    console.error('   2. Or change the PORT in this file');
    console.error('');
    console.error('   To find what\'s using the port:');
    console.error(`   netstat -ano | findstr :${PORT}`);
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
