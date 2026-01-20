'use client';

import React from 'react';
import { PaymentStatus, PaymentResult } from '@/lib/payment';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  reservationId: string;
  roomNumber?: string;
  guestName?: string;
  status: PaymentStatus;
  result: PaymentResult | null;
  onStartPayment: () => void;
  onRetry?: () => void;
}

/**
 * Payment Modal Component
 * Displays the payment flow UI: card reading → processing → result
 */
export function PaymentModal({
  isOpen,
  onClose,
  amount,
  roomNumber,
  guestName,
  status,
  result,
  onStartPayment,
  onRetry,
}: PaymentModalProps) {
  if (!isOpen) return null;
  
  const canClose = status === 'idle' || status === 'success' || status === 'error' || status === 'cancelled';
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">카드 결제</h2>
            {canClose && (
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {/* Amount Display */}
          <div className="text-center mb-6 pb-6 border-b">
            <p className="text-gray-500 text-sm mb-1">결제 금액</p>
            <p className="text-4xl font-bold text-gray-900">
              {amount.toLocaleString('ko-KR')}
              <span className="text-2xl font-normal text-gray-600 ml-1">원</span>
            </p>
            {roomNumber && (
              <p className="text-gray-500 mt-2">객실: {roomNumber}</p>
            )}
            {guestName && (
              <p className="text-gray-500">고객명: {guestName}</p>
            )}
          </div>
          
          {/* Status Display */}
          <div className="min-h-[200px] flex flex-col items-center justify-center">
            {status === 'idle' && (
              <IdleScreen onStart={onStartPayment} />
            )}
            
            {status === 'reading_card' && (
              <CardReadingScreen />
            )}
            
            {status === 'processing' && (
              <ProcessingScreen />
            )}
            
            {status === 'success' && result && (
              <SuccessScreen result={result} onClose={onClose} />
            )}
            
            {(status === 'error' || status === 'cancelled') && result && (
              <ErrorScreen result={result} onRetry={onRetry} onClose={onClose} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sub-components

function IdleScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center">
      <div className="w-24 h-24 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
        <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      </div>
      <p className="text-gray-600 mb-6">결제를 시작하시겠습니까?</p>
      <button
        onClick={onStart}
        className="px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-lg"
      >
        결제 시작
      </button>
    </div>
  );
}

function CardReadingScreen() {
  return (
    <div className="text-center">
      <div className="w-32 h-32 mx-auto mb-6 relative">
        {/* Card animation */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl transform rotate-6 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center">
          <div className="w-10 h-8 bg-yellow-400 rounded-sm" />
        </div>
        {/* Arrow animation */}
        <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 animate-bounce">
          <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 4l-8 8h5v8h6v-8h5z" transform="rotate(180 12 12)" />
          </svg>
        </div>
      </div>
      <p className="text-xl font-semibold text-gray-800 mb-2">
        카드를 삽입해주세요
      </p>
      <p className="text-gray-500">
        IC칩이 위로 향하도록 카드를 넣어주세요
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

function ProcessingScreen() {
  return (
    <div className="text-center">
      <div className="w-24 h-24 mx-auto mb-6 relative">
        {/* Spinner */}
        <div className="absolute inset-0 border-4 border-blue-200 rounded-full" />
        <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 rounded-full animate-spin" />
        <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>
      <p className="text-xl font-semibold text-gray-800 mb-2">
        결제 처리 중
      </p>
      <p className="text-gray-500">
        잠시만 기다려주세요...
      </p>
    </div>
  );
}

function SuccessScreen({ result, onClose }: { result: PaymentResult; onClose: () => void }) {
  return (
    <div className="text-center">
      <div className="w-24 h-24 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
        <svg className="w-14 h-14 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-2xl font-bold text-green-600 mb-4">
        결제 완료
      </p>
      <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-500">승인번호</span>
          <span className="font-mono font-semibold">{result.approval_no}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">카드번호</span>
          <span className="font-mono">{result.card_no}</span>
        </div>
        {result.card_name && (
          <div className="flex justify-between">
            <span className="text-gray-500">카드사</span>
            <span>{result.card_name}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">결제금액</span>
          <span className="font-semibold">{result.amount.toLocaleString('ko-KR')}원</span>
        </div>
      </div>
      <button
        onClick={onClose}
        className="px-8 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
      >
        확인
      </button>
    </div>
  );
}

function ErrorScreen({ 
  result, 
  onRetry, 
  onClose 
}: { 
  result: PaymentResult; 
  onRetry?: () => void; 
  onClose: () => void;
}) {
  return (
    <div className="text-center">
      <div className="w-24 h-24 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
        <svg className="w-14 h-14 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <p className="text-2xl font-bold text-red-600 mb-2">
        결제 실패
      </p>
      <p className="text-gray-600 mb-6">
        {result.message}
      </p>
      {result.error_code && (
        <p className="text-sm text-gray-400 mb-4">
          오류 코드: {result.error_code}
        </p>
      )}
      <div className="flex gap-3 justify-center">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            다시 시도
          </button>
        )}
        <button
          onClick={onClose}
          className="px-6 py-3 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

export default PaymentModal;
