'use client';

import { useState, useEffect } from 'react';
import { PaymentButton } from '@/components/payment';

export default function TestPaymentPage() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Payment System Test
          </h1>
          <p className="text-gray-500 mb-8">
            Testing Hanuriit VtrRestServer integration
          </p>
          
          <div className="space-y-6">
            {/* Test Case 1: Basic Payment */}
            <div className="border border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Test 1: Basic Payment</h2>
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">Amount:</span>
                  <span className="ml-2 font-semibold">50,000원</span>
                </div>
                <div>
                  <span className="text-gray-500">Room:</span>
                  <span className="ml-2 font-semibold">201</span>
                </div>
                <div>
                  <span className="text-gray-500">Guest:</span>
                  <span className="ml-2 font-semibold">홍길동</span>
                </div>
                <div>
                  <span className="text-gray-500">Res ID:</span>
                  <span className="ml-2 font-semibold">TEST123</span>
                </div>
              </div>
              <PaymentButton
                amount={50000}
                reservationId="TEST123"
                roomNumber="201"
                guestName="홍길동"
                onPaymentSuccess={async (result) => {
                  console.log('✅ Payment Success:', result);
                  
                  // Save to database
                  try {
                    const response = await fetch('/api/payment', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        reservation_id: null, // Test payment - no real reservation
                        transaction_id: result.transaction_id,
                        amount: result.amount,
                        payment_type: 'credit',
                        status: 'approved',
                        approval_no: result.approval_no,
                        auth_date: result.auth_date,
                        auth_time: result.auth_time,
                        card_no: result.card_no,
                        card_name: result.card_name,
                      }),
                    });
                    const data = await response.json();
                    console.log('💾 Saved to database:', data);
                  } catch (error) {
                    console.error('❌ Database save failed:', error);
                  }
                  
                  alert(
                    '결제 성공!\n\n' +
                    `승인번호: ${result.approval_no}\n` +
                    `카드번호: ${result.card_no}\n` +
                    `카드사: ${result.card_name}\n` +
                    `금액: ${result.amount.toLocaleString('ko-KR')}원`
                  );
                }}
                onPaymentError={(result) => {
                  console.error('❌ Payment Error:', result);
                  alert(`결제 실패:\n${result.message}\n\n오류코드: ${result.error_code}`);
                }}
                className="w-full"
              >
                💳 결제하기 (50,000원)
              </PaymentButton>
            </div>
            
            {/* Test Case 2: Large Amount */}
            <div className="border border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Test 2: Large Amount</h2>
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">Amount:</span>
                  <span className="ml-2 font-semibold">500,000원</span>
                </div>
                <div>
                  <span className="text-gray-500">Room:</span>
                  <span className="ml-2 font-semibold">VIP-101</span>
                </div>
                <div>
                  <span className="text-gray-500">Guest:</span>
                  <span className="ml-2 font-semibold">김철수</span>
                </div>
                <div>
                  <span className="text-gray-500">Res ID:</span>
                  <span className="ml-2 font-semibold">TEST456</span>
                </div>
              </div>
              <PaymentButton
                amount={500000}
                reservationId="TEST456"
                roomNumber="VIP-101"
                guestName="김철수"
                onPaymentSuccess={(result) => {
                  console.log('✅ Large Payment Success:', result);
                  alert(`대규모 결제 성공!\n승인번호: ${result.approval_no}`);
                }}
                onPaymentError={(result) => {
                  console.error('❌ Large Payment Error:', result);
                  alert(`결제 실패: ${result.message}`);
                }}
                className="w-full"
              >
                💎 결제하기 (500,000원)
              </PaymentButton>
            </div>
            
            {/* Test Case 3: Small Amount */}
            <div className="border border-gray-200 rounded-xl p-6">
              <h2 className="text-xl font-semibold mb-4">Test 3: Small Amount</h2>
              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">Amount:</span>
                  <span className="ml-2 font-semibold">10,000원</span>
                </div>
                <div>
                  <span className="text-gray-500">Room:</span>
                  <span className="ml-2 font-semibold">305</span>
                </div>
                <div>
                  <span className="text-gray-500">Guest:</span>
                  <span className="ml-2 font-semibold">이영희</span>
                </div>
                <div>
                  <span className="text-gray-500">Res ID:</span>
                  <span className="ml-2 font-semibold">TEST789</span>
                </div>
              </div>
              <PaymentButton
                amount={10000}
                reservationId="TEST789"
                roomNumber="305"
                guestName="이영희"
                onPaymentSuccess={(result) => {
                  console.log('✅ Small Payment Success:', result);
                }}
                onPaymentError={(result) => {
                  console.error('❌ Small Payment Error:', result);
                }}
                className="w-full"
              >
                🏪 결제하기 (10,000원)
              </PaymentButton>
            </div>
          </div>
          
          {/* Instructions */}
          <div className="mt-8 p-6 bg-blue-50 rounded-xl border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3">📝 Testing Instructions</h3>
            <ol className="space-y-2 text-sm text-blue-800">
              <li>1. Make sure mock server is running: <code className="bg-blue-100 px-2 py-1 rounded">node mock-payment-server-http.js</code></li>
              <li>2. Click any payment button above</li>
              <li>3. Watch the payment flow animation</li>
              <li>4. Check console logs for detailed info</li>
              <li>5. Check mock server terminal for API call logs</li>
            </ol>
          </div>
          
          {/* Debug Info */}
          <div className="mt-6 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3">🔍 Debug Info</h3>
            <div className="space-y-2 text-sm text-gray-700 font-mono">
              <div>Payment Agent: <span className="text-blue-600">http://localhost:8085</span></div>
              <div>Node Env: <span className="text-green-600">{process.env.NODE_ENV}</span></div>
              <div suppressHydrationWarning>
                Timestamp: <span className="text-purple-600">{mounted ? new Date().toISOString() : 'Loading...'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
