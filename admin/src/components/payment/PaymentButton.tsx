'use client';

import React, { useState, useCallback } from 'react';
import { PaymentModal } from './PaymentModal';
import { usePayment, InstallmentMonth, PaymentResult } from '@/lib/payment';

interface PaymentButtonProps {
  amount: number;
  reservationId: string;
  roomNumber?: string;
  guestName?: string;
  className?: string;
  disabled?: boolean;
  onPaymentSuccess?: (result: PaymentResult) => void;
  onPaymentError?: (result: PaymentResult) => void;
  children?: React.ReactNode;
}

/**
 * Payment Button with integrated modal
 * 
 * @example
 * ```tsx
 * <PaymentButton
 *   amount={50000}
 *   reservationId="RES123"
 *   roomNumber="201"
 *   guestName="홍길동"
 *   onPaymentSuccess={(result) => {
 *     // Update reservation as paid
 *   }}
 * >
 *   카드 결제
 * </PaymentButton>
 * ```
 */
export function PaymentButton({
  amount,
  reservationId,
  roomNumber,
  guestName,
  className = '',
  disabled = false,
  onPaymentSuccess,
  onPaymentError,
  children,
}: PaymentButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const {
    status,
    result,
    isProcessing,
    startPayment,
    reset,
  } = usePayment({
    onSuccess: onPaymentSuccess,
    onError: onPaymentError,
  });
  
  const handleOpenModal = useCallback(() => {
    reset();
    setIsModalOpen(true);
  }, [reset]);
  
  const handleCloseModal = useCallback(() => {
    if (!isProcessing) {
      setIsModalOpen(false);
      reset();
    }
  }, [isProcessing, reset]);
  
  const handleStartPayment = useCallback(async () => {
    await startPayment(
      amount,
      reservationId,
      roomNumber,
      guestName,
      InstallmentMonth.LUMP_SUM
    );
  }, [startPayment, amount, reservationId, roomNumber, guestName]);
  
  const handleRetry = useCallback(() => {
    reset();
  }, [reset]);
  
  return (
    <>
      <button
        onClick={handleOpenModal}
        disabled={disabled || amount <= 0}
        className={`
          px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl
          hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
          transition-colors shadow-lg
          ${className}
        `}
      >
        {children || '카드 결제'}
      </button>
      
      <PaymentModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        amount={amount}
        reservationId={reservationId}
        roomNumber={roomNumber}
        guestName={guestName}
        status={status}
        result={result}
        onStartPayment={handleStartPayment}
        onRetry={handleRetry}
      />
    </>
  );
}

export default PaymentButton;
