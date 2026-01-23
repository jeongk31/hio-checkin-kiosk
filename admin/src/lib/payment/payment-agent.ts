/**
 * Payment Agent Client for Hanuriit VtrRestServer
 * 
 * This module provides a TypeScript interface to communicate with the
 * VtrRestServer payment agent running on localhost:8085
 */

import {
  TokenRequest,
  TokenResponse,
  ApprovalRequest,
  ApprovalResponse,
  PaymentAgentResponse,
  PaymentMessageType,
  InstallmentMonth,
  CancelReason,
  PaymentError,
  PaymentResult,
  getErrorMessage,
} from './payment-types';

// Default configuration - can be overridden per request
// Note: VtrRestServer typically runs with HTTPS (see RestApi.ini: Https=1)
// But browsers may block self-signed certs, so we support both http and https
const DEFAULT_PAYMENT_AGENT_URL = process.env.NEXT_PUBLIC_PAYMENT_AGENT_URL || 'http://localhost:8085';
const DEFAULT_TIMEOUT = 60000; // 60 seconds for card reading

/**
 * Make a request to the payment agent
 * Note: Content-Type must be "text/plain" not "application/json"
 */
async function agentRequest<T extends PaymentAgentResponse>(
  endpoint: string,
  data?: unknown,
  timeout: number = DEFAULT_TIMEOUT,
  paymentAgentUrl: string = DEFAULT_PAYMENT_AGENT_URL
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(`${paymentAgentUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain', // Important: NOT application/json
      },
      body: data ? JSON.stringify(data) : '',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new PaymentError('NETWORK_ERROR', `HTTP ${response.status}`);
    }
    
    const result = await response.json() as T;
    
    // Check for -888 error (VTR terminal not responding)
    // Result can be either uppercase Result or lowercase result field
    const resultObj = result as Record<string, unknown>;
    const resultCode = resultObj.result || resultObj.Result;
    if (resultCode === -888 || resultCode === '-888') {
      throw new PaymentError('-888', '결제 단말기가 응답하지 않습니다. VTR 단말기와 VtrRestServer를 확인해 주세요.');
    }
    
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof PaymentError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new PaymentError('TIMEOUT', '결제 시간이 초과되었습니다');
      }
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new PaymentError('AGENT_NOT_RUNNING', '결제 에이전트에 연결할 수 없습니다');
      }
    }
    
    throw new PaymentError('9999', String(error));
  }
}

/**
 * Check if payment agent is running
 */
export async function checkAgentStatus(paymentAgentUrl?: string): Promise<boolean> {
  try {
    // VTR_APP_Check does an integrity check
    const response = await agentRequest<PaymentAgentResponse>(
      'VTR_APP_Check', 
      undefined, 
      5000,
      paymentAgentUrl
    );
    return response.Result === '0000';
  } catch {
    return false;
  }
}

/**
 * Get credit card token (read card from terminal)
 * This will display "Insert Card" on the terminal
 */
export async function getCreditToken(amount: number, paymentAgentUrl?: string): Promise<TokenResponse> {
  const request: TokenRequest = {
    Term_div: 'P',
    Term_id: '',
    Trade_serial_no: '',
    m_Certify_no: '',
    Van_index: '0',
    Amount: amount.toString(),
  };
  
  const response = await agentRequest<TokenResponse>(
    'VTR_APP_GetCreditToken', 
    request, 
    90000,
    paymentAgentUrl
  );
  
  if (response.Result !== '0000') {
    throw new PaymentError(response.Result, response.Message || getErrorMessage(response.Result));
  }
  
  return response;
}

/**
 * Process credit card approval
 */
export async function approveCreditCard(
  amount: number,
  trackData: string,
  emvData: string = '',
  transactionId: string,
  installmentMonths: InstallmentMonth = InstallmentMonth.LUMP_SUM,
  remarks?: string[],
  paymentAgentUrl?: string
): Promise<ApprovalResponse> {
  const tax = Math.round(amount / 11); // 10% VAT
  
  const request: ApprovalRequest = {
    sbuffer: {
      Msg_type: PaymentMessageType.CREDIT_APPROVAL,
      Cancel_reason: '',
      Keyin: '',
      Track_data: trackData,
      Halbu: installmentMonths,
      Pay_amount: amount.toString(),
      Tax: tax.toString(),
      Svrcharge: '0',
      Amount: amount.toString(),
      Org_approval_no: '',
      Org_auth_date: '',
      Term_id: '',
      Trade_serial_no: transactionId,
      Vcode: '',
      Esign_div: '0',
    },
    perbuffer: { bufferdata: '' },
    emvbuffer: { bufferdata: emvData },
    subbuffer: remarks ? {
      Remark_Count: Math.min(remarks.length, 12).toString(),
      Remark_01: remarks[0] || '',
      Remark_02: remarks[1] || '',
      Remark_03: remarks[2] || '',
      Remark_04: remarks[3] || '',
      Remark_05: remarks[4] || '',
      Remark_06: remarks[5] || '',
    } : {},
    signbuffer: { bufferdata: '' },
    resbuffer: { bufferdata: '' },
  };
  
  const response = await agentRequest<ApprovalResponse>(
    'ApprovalServerSec', 
    request,
    DEFAULT_TIMEOUT,
    paymentAgentUrl
  );
  
  if (response.Result !== '0000') {
    throw new PaymentError(response.Result, response.Message || getErrorMessage(response.Result));
  }
  
  return response;
}

/**
 * Cancel a previous credit card transaction
 */
export async function cancelCreditCard(
  amount: number,
  originalApprovalNo: string,
  originalAuthDate: string,
  transactionId: string,
  cancelReason: CancelReason = CancelReason.CUSTOMER_REQUEST,
  paymentAgentUrl?: string
): Promise<ApprovalResponse> {
  const tax = Math.round(amount / 11);
  
  const request: ApprovalRequest = {
    sbuffer: {
      Msg_type: PaymentMessageType.CREDIT_CANCEL,
      Cancel_reason: cancelReason,
      Keyin: '',
      Track_data: '',
      Halbu: '00',
      Pay_amount: amount.toString(),
      Tax: tax.toString(),
      Svrcharge: '0',
      Amount: amount.toString(),
      Org_approval_no: originalApprovalNo,
      Org_auth_date: originalAuthDate,
      Term_id: '',
      Trade_serial_no: transactionId,
      Vcode: '',
      Esign_div: '0',
    },
    perbuffer: { bufferdata: '' },
    emvbuffer: { bufferdata: '' },
    subbuffer: {},
    signbuffer: { bufferdata: '' },
    resbuffer: { bufferdata: '' },
  };
  
  const response = await agentRequest<ApprovalResponse>(
    'ApprovalServerSec', 
    request,
    DEFAULT_TIMEOUT,
    paymentAgentUrl
  );
  
  if (response.Result !== '0000') {
    throw new PaymentError(response.Result, response.Message || getErrorMessage(response.Result));
  }
  
  return response;
}

/**
 * Print receipt for last transaction
 */
export async function printReceipt(paymentAgentUrl?: string): Promise<void> {
  const response = await agentRequest<PaymentAgentResponse>(
    'VTR_APP_Print', 
    undefined, 
    10000,
    paymentAgentUrl
  );
  
  if (response.Result !== '0000') {
    console.warn('Receipt print failed:', response.Message);
  }
}

/**
 * Print custom text receipt
 */
export async function printCustomReceipt(text: string, paymentAgentUrl?: string): Promise<void> {
  const response = await agentRequest<PaymentAgentResponse>('VTR_APP_Print_Text', {
    print_text: text,
  }, 10000, paymentAgentUrl);
  
  if (response.Result !== '0000') {
    console.warn('Custom receipt print failed:', response.Message);
  }
}

/**
 * Generate unique transaction ID
 */
export function generateTransactionId(reservationId: string): string {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${reservationId.slice(-6)}_${dateStr}_${random}`;
}

/**
 * High-level function: Process complete payment flow
 */
export async function processPayment(
  amount: number,
  reservationId: string,
  roomNumber?: string,
  guestName?: string,
  installmentMonths: InstallmentMonth = InstallmentMonth.LUMP_SUM,
  onStatusChange?: (status: string) => void,
  paymentAgentUrl?: string
): Promise<PaymentResult> {
  const transactionId = generateTransactionId(reservationId);
  
  try {
    // Step 1: Read card
    onStatusChange?.('reading_card');
    const tokenResponse = await getCreditToken(amount, paymentAgentUrl);
    
    // Step 2: Process approval
    onStatusChange?.('processing');
    const remarks = [
      `호텔 체크인 결제`,
      roomNumber ? `객실: ${roomNumber}` : '',
      guestName ? `고객명: ${guestName}` : '',
    ].filter(Boolean);
    
    const approvalResponse = await approveCreditCard(
      amount,
      tokenResponse.Track_data || '',
      tokenResponse.Emv_data || '',
      transactionId,
      installmentMonths,
      remarks,
      paymentAgentUrl
    );
    
    // Step 3: Print receipt
    onStatusChange?.('printing');
    try {
      await printReceipt(paymentAgentUrl);
    } catch (e) {
      console.warn('Receipt print failed, continuing:', e);
    }
    
    onStatusChange?.('success');
    
    return {
      success: true,
      approval_no: approvalResponse.Approval_no,
      auth_date: approvalResponse.Auth_date,
      auth_time: approvalResponse.Auth_time,
      card_no: approvalResponse.Card_no,
      card_name: approvalResponse.Card_name,
      amount,
      message: approvalResponse.Message || '결제가 완료되었습니다',
      transaction_id: transactionId,
    };
  } catch (error) {
    onStatusChange?.('error');
    
    if (error instanceof PaymentError) {
      return {
        success: false,
        amount,
        message: error.message,
        error_code: error.code,
        transaction_id: transactionId,
      };
    }
    
    return {
      success: false,
      amount,
      message: '알 수 없는 오류가 발생했습니다',
      error_code: '9999',
      transaction_id: transactionId,
    };
  }
}

/**
 * High-level function: Cancel/refund a payment
 */
export async function cancelPayment(
  amount: number,
  originalApprovalNo: string,
  originalAuthDate: string,
  reservationId: string,
  cancelReason: CancelReason = CancelReason.CUSTOMER_REQUEST,
  paymentAgentUrl?: string
): Promise<PaymentResult> {
  const transactionId = generateTransactionId(reservationId);
  
  try {
    const response = await cancelCreditCard(
      amount,
      originalApprovalNo,
      originalAuthDate,
      transactionId,
      cancelReason,
      paymentAgentUrl
    );
    
    return {
      success: true,
      approval_no: response.Approval_no,
      auth_date: response.Auth_date,
      auth_time: response.Auth_time,
      amount,
      message: response.Message || '결제가 취소되었습니다',
      transaction_id: transactionId,
    };
  } catch (error) {
    if (error instanceof PaymentError) {
      return {
        success: false,
        amount,
        message: error.message,
        error_code: error.code,
        transaction_id: transactionId,
      };
    }
    
    return {
      success: false,
      amount,
      message: '취소 처리 중 오류가 발생했습니다',
      error_code: '9999',
      transaction_id: transactionId,
    };
  }
}
