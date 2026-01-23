// Payment Agent Types for Hanuriit VtrRestServer

/**
 * Base response from payment agent
 */
export interface PaymentAgentResponse {
  Result: string;  // "0000" = success
  Message: string;
}

/**
 * Token acquisition response (card reading)
 */
export interface TokenResponse extends PaymentAgentResponse {
  Track_data?: string;
  Card_no?: string;
  Emv_data?: string;
  Card_name?: string;
}

/**
 * Payment approval response
 */
export interface ApprovalResponse extends PaymentAgentResponse {
  Approval_no?: string;      // 승인번호
  Auth_date?: string;        // 승인일자 (YYMMDD)
  Auth_time?: string;        // 승인시간 (HHMMSS)
  Card_no?: string;          // 마스킹된 카드번호
  Card_name?: string;        // 카드사명
  Acquirer_name?: string;    // 매입사명
  Merchant_no?: string;      // 가맹점번호
  Halbu?: string;           // 할부개월
  Amount?: string;          // 승인금액
}

/**
 * Token request parameters
 */
export interface TokenRequest {
  Term_div: string;         // 단말기구분 (P: POS)
  Term_id?: string;         // 단말기ID
  Trade_serial_no?: string; // 거래일련번호
  m_Certify_no?: string;    // 인증번호
  Van_index?: string;       // VAN 인덱스
  Amount: string;           // 금액
}

/**
 * Main buffer for approval requests
 */
export interface ApprovalSBuffer {
  Msg_type: string;         // 전문유형 (101R, 102R, etc.)
  Cancel_reason?: string;   // 취소사유 (1: 고객요청, 2: 오류)
  Keyin?: string;          // 키인구분
  Track_data?: string;      // 트랙데이터 (토큰)
  Halbu?: string;          // 할부개월 (00: 일시불)
  Pay_amount: string;       // 결제금액
  Tax?: string;            // 세금
  Svrcharge?: string;      // 봉사료
  Amount: string;          // 총금액
  Org_approval_no?: string; // 원거래 승인번호 (취소시)
  Org_auth_date?: string;   // 원거래 승인일자 (취소시)
  Term_id?: string;        // 단말기ID
  Trade_serial_no?: string; // 거래일련번호
  Vcode?: string;          // 인증코드
  Esign_div?: string;      // 전자서명구분
}

/**
 * Sub buffer for remarks (receipt lines)
 */
export interface ApprovalSubBuffer {
  Remark_Count?: string;
  Remark_01?: string;
  Remark_02?: string;
  Remark_03?: string;
  Remark_04?: string;
  Remark_05?: string;
  Remark_06?: string;
  Remark_07?: string;
  Remark_08?: string;
  Remark_09?: string;
  Remark_10?: string;
  Remark_11?: string;
  Remark_12?: string;
}

/**
 * Full approval request
 */
export interface ApprovalRequest {
  sbuffer: ApprovalSBuffer;
  perbuffer?: { bufferdata: string };
  emvbuffer?: { bufferdata: string };
  subbuffer?: ApprovalSubBuffer;
  signbuffer?: { bufferdata: string };
  resbuffer?: { bufferdata: string };
}

/**
 * Message types for different payment operations
 */
export enum PaymentMessageType {
  // Credit Card
  CREDIT_APPROVAL = '101R',
  CREDIT_CANCEL = '102R',
  
  // UnionPay
  UNIONPAY_APPROVAL = '121R',
  UNIONPAY_CANCEL = '122R',
  
  // Cash Receipt
  CASH_RECEIPT_APPROVAL = '201R',
  CASH_RECEIPT_CANCEL = '202R',
  
  // Cash IC (Debit)
  CASH_IC_APPROVAL = '401R',
  CASH_IC_CANCEL = '402R',
  
  // Simple Pay (KakaoPay, NaverPay, etc.)
  SIMPLE_PAY_APPROVAL = '801R',
  SIMPLE_PAY_CANCEL = '802R',
}

/**
 * Installment options
 */
export enum InstallmentMonth {
  LUMP_SUM = '00',
  TWO_MONTHS = '02',
  THREE_MONTHS = '03',
  SIX_MONTHS = '06',
  TWELVE_MONTHS = '12',
}

/**
 * Cancel reasons
 */
export enum CancelReason {
  CUSTOMER_REQUEST = '1',
  TRANSACTION_ERROR = '2',
  OTHER = '3',
}

/**
 * Payment status for UI
 */
export type PaymentStatus = 
  | 'idle'
  | 'reading_card'
  | 'processing'
  | 'success'
  | 'cancelled'
  | 'error'
  | 'timeout';

/**
 * Payment result to store in database
 */
export interface PaymentResult {
  success: boolean;
  approval_no?: string;
  auth_date?: string;
  auth_time?: string;
  card_no?: string;
  card_name?: string;
  amount: number;
  message: string;
  error_code?: string;
  transaction_id: string;
}

/**
 * Payment transaction for database storage
 */
export interface PaymentTransaction {
  id?: string;
  reservation_id: string;
  transaction_id: string;
  amount: number;
  tax: number;
  payment_type: 'credit' | 'debit' | 'cash_receipt' | 'simple_pay';
  status: 'pending' | 'approved' | 'cancelled' | 'failed';
  approval_no?: string;
  auth_date?: string;
  auth_time?: string;
  card_no?: string;
  card_name?: string;
  installment_months: number;
  error_code?: string;
  error_message?: string;
  created_at?: string;
  cancelled_at?: string;
}

/**
 * Payment error class
 */
export class PaymentError extends Error {
  code: string;
  
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PaymentError';
  }
}

/**
 * Error code descriptions (Korean)
 */
export const ERROR_MESSAGES: Record<string, string> = {
  '0000': '정상',
  '-888': '결제 단말기가 응답하지 않습니다. VTR 단말기와 VtrRestServer를 확인해 주세요.',
  '9001': '카드를 읽어주세요',
  '9002': '카드 읽기 오류',
  '9003': '거래 시간 초과',
  '9004': '단말기 연결 오류',
  '9005': 'VAN 서버 연결 오류',
  '9999': '시스템 오류',
  'NETWORK_ERROR': '네트워크 오류',
  'TIMEOUT': '응답 시간 초과',
  'AGENT_NOT_RUNNING': '결제 에이전트가 실행되지 않았습니다',
};

/**
 * Get human-readable error message
 */
export function getErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] || `알 수 없는 오류 (${code})`;
}
