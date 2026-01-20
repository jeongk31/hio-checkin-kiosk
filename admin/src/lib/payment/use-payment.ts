'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PaymentStatus,
  PaymentResult,
  InstallmentMonth,
  CancelReason,
} from './payment-types';
import {
  processPayment,
  cancelPayment,
  checkAgentStatus,
} from './payment-agent';

interface UsePaymentOptions {
  onSuccess?: (result: PaymentResult) => void;
  onError?: (result: PaymentResult) => void;
  onStatusChange?: (status: PaymentStatus) => void;
  autoCheckAgent?: boolean;
}

interface UsePaymentReturn {
  status: PaymentStatus;
  result: PaymentResult | null;
  isAgentAvailable: boolean;
  isProcessing: boolean;
  
  // Actions
  startPayment: (
    amount: number,
    reservationId: string,
    roomNumber?: string,
    guestName?: string,
    installmentMonths?: InstallmentMonth
  ) => Promise<PaymentResult>;
  
  startCancellation: (
    amount: number,
    originalApprovalNo: string,
    originalAuthDate: string,
    reservationId: string,
    cancelReason?: CancelReason
  ) => Promise<PaymentResult>;
  
  reset: () => void;
  checkAgent: () => Promise<boolean>;
}

/**
 * React hook for payment operations
 * 
 * @example
 * ```tsx
 * function PaymentScreen() {
 *   const { status, result, startPayment, isProcessing } = usePayment({
 *     onSuccess: (result) => {
 *       console.log('Payment successful:', result.approval_no);
 *     },
 *     onError: (result) => {
 *       console.error('Payment failed:', result.message);
 *     },
 *   });
 * 
 *   const handlePayment = async () => {
 *     await startPayment(50000, 'RES123', '201', '홍길동');
 *   };
 * 
 *   return (
 *     <div>
 *       {status === 'reading_card' && <p>카드를 삽입해주세요...</p>}
 *       {status === 'processing' && <p>결제 처리 중...</p>}
 *       {status === 'success' && <p>결제 완료! 승인번호: {result?.approval_no}</p>}
 *       {status === 'error' && <p>결제 실패: {result?.message}</p>}
 *       <button onClick={handlePayment} disabled={isProcessing}>
 *         결제하기
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePayment(options: UsePaymentOptions = {}): UsePaymentReturn {
  const {
    onSuccess,
    onError,
    onStatusChange,
    autoCheckAgent = true,
  } = options;
  
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [isAgentAvailable, setIsAgentAvailable] = useState(false);
  
  const isProcessingRef = useRef(false);
  
  // Update status and notify
  const updateStatus = useCallback((newStatus: PaymentStatus) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);
  
  // Check agent availability
  const checkAgent = useCallback(async (): Promise<boolean> => {
    try {
      const available = await checkAgentStatus();
      setIsAgentAvailable(available);
      return available;
    } catch {
      setIsAgentAvailable(false);
      return false;
    }
  }, []);
  
  // Auto-check agent on mount
  useEffect(() => {
    if (autoCheckAgent) {
      checkAgent();
    }
  }, [autoCheckAgent, checkAgent]);
  
  // Start payment process
  const startPayment = useCallback(async (
    amount: number,
    reservationId: string,
    roomNumber?: string,
    guestName?: string,
    installmentMonths: InstallmentMonth = InstallmentMonth.LUMP_SUM
  ): Promise<PaymentResult> => {
    if (isProcessingRef.current) {
      const errorResult: PaymentResult = {
        success: false,
        amount,
        message: '이미 결제가 진행 중입니다',
        error_code: 'BUSY',
        transaction_id: '',
      };
      return errorResult;
    }
    
    isProcessingRef.current = true;
    setResult(null);
    
    try {
      const paymentResult = await processPayment(
        amount,
        reservationId,
        roomNumber,
        guestName,
        installmentMonths,
        (status: string) => updateStatus(status as PaymentStatus)
      );
      
      setResult(paymentResult);
      
      if (paymentResult.success) {
        updateStatus('success');
        onSuccess?.(paymentResult);
      } else {
        updateStatus('error');
        onError?.(paymentResult);
      }
      
      return paymentResult;
    } finally {
      isProcessingRef.current = false;
    }
  }, [updateStatus, onSuccess, onError]);
  
  // Start cancellation process
  const startCancellation = useCallback(async (
    amount: number,
    originalApprovalNo: string,
    originalAuthDate: string,
    reservationId: string,
    cancelReason: CancelReason = CancelReason.CUSTOMER_REQUEST
  ): Promise<PaymentResult> => {
    if (isProcessingRef.current) {
      const errorResult: PaymentResult = {
        success: false,
        amount,
        message: '이미 처리가 진행 중입니다',
        error_code: 'BUSY',
        transaction_id: '',
      };
      return errorResult;
    }
    
    isProcessingRef.current = true;
    setResult(null);
    updateStatus('processing');
    
    try {
      const cancelResult = await cancelPayment(
        amount,
        originalApprovalNo,
        originalAuthDate,
        reservationId,
        cancelReason
      );
      
      setResult(cancelResult);
      
      if (cancelResult.success) {
        updateStatus('cancelled');
        onSuccess?.(cancelResult);
      } else {
        updateStatus('error');
        onError?.(cancelResult);
      }
      
      return cancelResult;
    } finally {
      isProcessingRef.current = false;
    }
  }, [updateStatus, onSuccess, onError]);
  
  // Reset state
  const reset = useCallback(() => {
    if (!isProcessingRef.current) {
      setStatus('idle');
      setResult(null);
    }
  }, []);
  
  return {
    status,
    result,
    isAgentAvailable,
    isProcessing: status === 'reading_card' || status === 'processing',
    startPayment,
    startCancellation,
    reset,
    checkAgent,
  };
}

export default usePayment;
