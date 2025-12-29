/**
 * useB API Service Layer
 *
 * APIs:
 * 1. ID Card OCR - Extract text from ID cards (주민등록증, 운전면허증)
 * 2. Face Authentication - Compare face photo with ID card photo (안면인증)
 */

// API Endpoints
const USEB_AUTH_URL = 'https://auth.useb.co.kr';
const USEB_API_URL = 'https://api3.useb.co.kr';
const FACE_AUTH_URL = 'https://face-auth.useb.co.kr';
const FACE_API_URL = 'https://face.useb.co.kr';

// Credentials from environment or defaults for testing
const USEB_EMAIL = process.env.USEB_EMAIL || 'test_stayg.dev@gmail.com';
const USEB_PASSWORD = process.env.USEB_PASSWORD || 'stayg.dev251215!@#';

// Face API credentials (separate from OCR credentials)
const FACE_CLIENT_ID = process.env.FACE_CLIENT_ID || '6tm6s6pts8lo3tks5lksjpbb5h';
const FACE_CLIENT_SECRET = process.env.FACE_CLIENT_SECRET || '1tddlv9krucj399s4njr6kc57th2ithi9bubj2r5hoa3u0olbq2m';

// Types
export interface IDCardOCRResult {
  success: boolean;
  data?: {
    idType: string;           // "1" = 주민등록증, "2" = 운전면허증
    name: string;             // 이름
    juminNo1: string;         // 주민번호 앞자리 (YYMMDD)
    juminNo2: string;         // 주민번호 뒷자리
    issueDate: string;        // 발급일자 (YYYYMMDD)
    // Driver's license specific
    driverNo?: string;        // 운전면허번호 (e.g., "11-16-044390-60")
    serialNo?: string;        // 암호일련번호 (serial_mode=true 필요)
    licenseType?: string;     // 면허종류 (driver_type=true 필요)
    expiryDate1?: string;     // 적성검사 시작일
    expiryDate2?: string;     // 적성검사 마감일
  };
  error?: string;
  errorCode?: string;
  rawResponse?: unknown;
}

export interface FaceAuthResult {
  success: boolean;
  matched: boolean;
  similarity?: number;        // 유사도 (0~1)
  error?: string;
  errorCode?: string;
  rawResponse?: unknown;
}

export interface IDStatusVerificationResult {
  success: boolean;
  verified: boolean;          // 진위확인 결과
  message?: string;           // 결과 메시지
  transactionId?: string;     // API 로그용 추적 아이디
  error?: string;
  errorCode?: string;         // A001, A002, etc.
  rawResponse?: unknown;
}

// Token cache for useB API (OCR)
let usebToken: string | null = null;
let usebTokenExpiry: Date | null = null;
let usebClientId: string | null = null;
let usebClientSecret: string | null = null;

// Token cache for Face API (separate auth system)
let faceToken: string | null = null;
let faceTokenExpiry: Date | null = null;

/**
 * Step 1: Get client_id and client_secret from useB
 * POST https://auth.useb.co.kr/oauth/get-client-secret
 */
async function getUsebClientCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  if (usebClientId && usebClientSecret) {
    return { clientId: usebClientId, clientSecret: usebClientSecret };
  }

  console.log('[useB Auth] Getting client credentials...');

  const response = await fetch(`${USEB_AUTH_URL}/oauth/get-client-secret`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: USEB_EMAIL,
      password: USEB_PASSWORD,
    }),
  });

  const data = await response.json();
  console.log('[useB Auth] Credentials response:', response.status, data.success);

  if (!response.ok || !data.success) {
    throw new Error(`Failed to get credentials: ${data.message || response.status}`);
  }

  usebClientId = data.data.client_id;
  usebClientSecret = data.data.client_secret;

  return { clientId: usebClientId!, clientSecret: usebClientSecret! };
}

/**
 * Step 2: Get JWT token using client credentials
 * POST https://auth.useb.co.kr/oauth/token
 */
async function getUsebToken(): Promise<string> {
  if (usebToken && usebTokenExpiry && new Date() < usebTokenExpiry) {
    return usebToken;
  }

  const { clientId, clientSecret } = await getUsebClientCredentials();

  console.log('[useB Auth] Getting JWT token...');

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${USEB_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${basicAuth}`,
    },
  });

  const data = await response.json();
  console.log('[useB Auth] Token response:', response.status, data.success);

  if (!response.ok || !data.success || !data.jwt) {
    throw new Error(`Failed to get token: ${data.message || response.status}`);
  }

  usebToken = data.jwt;
  usebTokenExpiry = data.expires_in ? new Date(data.expires_in) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  console.log('[useB Auth] Token obtained, expires:', usebTokenExpiry);

  return usebToken!;
}

/**
 * Get Face API token using OAuth2 client credentials
 * POST https://face-auth-swagger.useb.co.kr/oauth2/token
 *
 * Face API uses separate credentials from OCR API
 * Token validity: 1 day
 */
async function getFaceToken(): Promise<string> {
  if (faceToken && faceTokenExpiry && new Date() < faceTokenExpiry) {
    return faceToken;
  }

  console.log('[Face Auth] Getting Face API token...');

  const response = await fetch(`${FACE_AUTH_URL}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: FACE_CLIENT_ID,
      client_secret: FACE_CLIENT_SECRET,
    }),
  });

  const data = await response.json();
  console.log('[Face Auth] Token response:', response.status, data.access_token ? 'token received' : 'no token');

  if (!response.ok || !data.access_token) {
    throw new Error(`Failed to get Face API token: ${JSON.stringify(data)}`);
  }

  faceToken = data.access_token;
  // Token expires in 1 day, set expiry to 23 hours for safety
  faceTokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);

  console.log('[Face Auth] Face API token obtained, expires:', faceTokenExpiry);

  return faceToken!;
}

/**
 * ID Card OCR - Extract text from ID card image
 * Supports: 주민등록증 (idType=1), 운전면허증 (idType=2)
 *
 * POST https://api3.useb.co.kr/ocr/idcard-driver
 */
export async function performIDCardOCR(imageBase64: string): Promise<IDCardOCRResult> {
  try {
    const token = await getUsebToken();

    console.log('[OCR] Requesting OCR, image size:', imageBase64.length, 'chars');

    const response = await fetch(`${USEB_API_URL}/ocr/idcard-driver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        image_base64: imageBase64,
        serial_mode: true,   // 운전면허증 암호일련번호 추가
        driver_type: true,   // 운전면허증 종류 추가
      }),
    });

    const data = await response.json();
    console.log('[OCR] Response:', response.status, JSON.stringify(data).substring(0, 500));

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.message || `OCR failed: ${response.status}`,
        errorCode: data.error_code,
        rawResponse: data,
      };
    }

    const ocrData = data.data;

    return {
      success: true,
      data: {
        idType: ocrData.idType,
        name: ocrData.userName,
        juminNo1: ocrData.juminNo1,
        juminNo2: ocrData.juminNo2,
        issueDate: ocrData.issueDate,
        // Driver's license specific fields
        driverNo: ocrData.driverNo,
        serialNo: ocrData.serialNo,
        licenseType: ocrData.driverType,
        expiryDate1: ocrData.expiryDate1,
        expiryDate2: ocrData.expiryDate2,
      },
      rawResponse: data,
    };
  } catch (error) {
    console.error('[OCR] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown OCR error',
    };
  }
}

/**
 * Face Authentication - Compare live face with ID card photo
 * POST https://face.useb.co.kr/compare
 *
 * Uses separate Face API credentials and token
 *
 * @param faceImageBase64 - Live face photo from camera (base64)
 * @param idCardImageBase64 - ID card image (base64) - will extract face from it
 */
export async function performFaceAuth(
  faceImageBase64: string,
  idCardImageBase64: string
): Promise<FaceAuthResult> {
  try {
    const token = await getFaceToken();

    console.log('[Face Auth] Requesting face authentication...');
    console.log('[Face Auth] Face image size:', faceImageBase64.length, 'chars');
    console.log('[Face Auth] ID card image size:', idCardImageBase64.length, 'chars');

    // Remove data URL prefix if present
    const face1Base64 = faceImageBase64.includes(',') ? faceImageBase64.split(',')[1] : faceImageBase64;
    const face2Base64 = idCardImageBase64.includes(',') ? idCardImageBase64.split(',')[1] : idCardImageBase64;

    // Convert base64 to Buffer for file upload
    const faceBuffer = Buffer.from(face1Base64, 'base64');
    const idCardBuffer = Buffer.from(face2Base64, 'base64');

    // Create File objects (Node.js 20+ supports native File)
    const faceFile = new File([faceBuffer], 'face.jpg', { type: 'image/jpeg' });
    const idCardFile = new File([idCardBuffer], 'idcard.jpg', { type: 'image/jpeg' });

    // Create multipart form data with correct field names (image_a, image_b)
    const formData = new FormData();
    formData.append('image_a', faceFile);
    formData.append('image_b', idCardFile);

    const response = await fetch(`${FACE_API_URL}/compare`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();
    console.log('[Face Auth] Response:', response.status, JSON.stringify(data).substring(0, 500));

    // Alchera API returns:
    // - similarity_confidence: float (0~1 or 0~10)
    // - match_result: 0 (no match) or 1 (match)
    // - return_msg: { return_code, return_msg }

    if (!response.ok || (data.return_msg?.return_code && !data.return_msg.return_code.startsWith('SUCC'))) {
      return {
        success: false,
        matched: false,
        error: data.return_msg?.return_msg || `Face auth failed: ${response.status}`,
        errorCode: data.return_msg?.return_code,
        rawResponse: data,
      };
    }

    const similarity = data.similarity_confidence;

    // Apply our own similarity threshold for stricter matching
    // The API might return match_result=1 even with low similarity
    // Require at least 70% similarity for a match
    const SIMILARITY_THRESHOLD = 0.7;
    const apiMatched = data.match_result === 1;
    const similarityCheck = similarity >= SIMILARITY_THRESHOLD;
    const matched = apiMatched && similarityCheck;

    console.log('[Face Auth] Result:', {
      apiMatched,
      similarity,
      similarityCheck,
      finalMatched: matched,
      threshold: SIMILARITY_THRESHOLD
    });

    if (apiMatched && !similarityCheck) {
      console.log('[Face Auth] API said match but similarity too low:', similarity);
    }

    return {
      success: true,
      matched,
      similarity,
      rawResponse: data,
    };
  } catch (error) {
    console.error('[Face Auth] Error:', error);
    return {
      success: false,
      matched: false,
      error: error instanceof Error ? error.message : 'Unknown face auth error',
    };
  }
}

/**
 * Normalize Korean name for comparison
 * - Removes whitespace
 * - Converts to lowercase (for any English characters)
 */
function normalizeKoreanName(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase().trim();
}

/**
 * Compare two Korean names for matching
 * Returns true if names match (case-insensitive, whitespace-insensitive)
 *
 * @param name1 - First name to compare
 * @param name2 - Second name to compare
 * @param strict - If false, allows partial matching (one name contains the other)
 */
export function matchKoreanNames(name1: string, name2: string, strict: boolean = true): boolean {
  if (!name1 || !name2) return false;

  const normalized1 = normalizeKoreanName(name1);
  const normalized2 = normalizeKoreanName(name2);

  if (strict) {
    return normalized1 === normalized2;
  }

  // Partial matching - one name contains the other
  return normalized1.includes(normalized2) || normalized2.includes(normalized1);
}

/**
 * Check if a signature name matches any of the verified guest names
 *
 * @param signatureName - Name entered in consent form
 * @param verifiedNames - Array of names from OCR verification
 * @param strict - If false, allows partial matching
 * @returns Object with match status and matched name
 */
export function matchSignatureWithVerifiedNames(
  signatureName: string,
  verifiedNames: string[],
  strict: boolean = false
): { matched: boolean; matchedName?: string } {
  if (!signatureName || !verifiedNames.length) {
    return { matched: false };
  }

  for (const verifiedName of verifiedNames) {
    if (matchKoreanNames(signatureName, verifiedName, strict)) {
      return { matched: true, matchedName: verifiedName };
    }
  }

  return { matched: false };
}

/**
 * Check if person is adult (19+) based on Korean ID number
 */
export function isAdult(juminNo1: string, juminNo2: string): boolean {
  if (!juminNo1 || juminNo1.length < 6 || !juminNo2 || juminNo2.length < 1) {
    return false;
  }

  const birthYY = parseInt(juminNo1.substring(0, 2), 10);
  const genderDigit = parseInt(juminNo2.charAt(0), 10);

  // Determine century based on gender digit
  // 1,2,5,6: 1900s, 3,4,7,8: 2000s, 9,0: 1800s
  let birthYear: number;
  if (genderDigit === 1 || genderDigit === 2 || genderDigit === 5 || genderDigit === 6) {
    birthYear = 1900 + birthYY;
  } else if (genderDigit === 3 || genderDigit === 4 || genderDigit === 7 || genderDigit === 8) {
    birthYear = 2000 + birthYY;
  } else {
    birthYear = 1800 + birthYY;
  }

  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  return age >= 19;
}

/**
 * ID Status Verification (진위확인) - Resident ID Card (주민등록증)
 * Verifies the ID card data against the government database
 *
 * POST https://api3.useb.co.kr/status/idcard
 *
 * @param identity - 주민등록번호 (13 digits, e.g., "8811211056911")
 * @param issueDate - 발급일자 (YYYYMMDD, e.g., "20000301")
 * @param userName - 이름 (e.g., "홍길동")
 */
export async function verifyIdCardStatus(
  identity: string,
  issueDate: string,
  userName: string
): Promise<IDStatusVerificationResult> {
  try {
    const token = await getUsebToken();

    console.log('[진위확인] Verifying resident ID card...');
    console.log('[진위확인] Name:', userName, 'Identity:', identity.substring(0, 6) + '*******');

    const response = await fetch(`${USEB_API_URL}/status/idcard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        identity,
        issueDate,
        userName,
      }),
    });

    const data = await response.json();
    console.log('[진위확인] Response:', response.status, JSON.stringify(data).substring(0, 300));

    if (!response.ok || !data.success) {
      // Map error codes to user-friendly messages
      const errorMessages: Record<string, string> = {
        'A001': '주민등록번호가 올바르지 않습니다',
        'A002': '발급일자 형식이 올바르지 않습니다',
        'A003': '필수 정보가 누락되었습니다',
        'A004': '신분증 정보가 일치하지 않습니다 (이름 또는 발급일자 오류)',
        'A005': '발급일자 입력 오류 5회 초과 - www.gov.kr에서 잠김 해제 필요',
        'A006': '분실 신고된 신분증입니다',
      };

      return {
        success: false,
        verified: false,
        message: data.message,
        transactionId: data.transaction_id,
        error: errorMessages[data.error_code] || data.message || `진위확인 실패: ${response.status}`,
        errorCode: data.error_code,
        rawResponse: data,
      };
    }

    return {
      success: true,
      verified: true,
      message: data.message,
      transactionId: data.transaction_id,
      rawResponse: data,
    };
  } catch (error) {
    console.error('[진위확인] Error:', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : '진위확인 중 오류가 발생했습니다',
    };
  }
}

/**
 * ID Status Verification (진위확인) - Driver's License (운전면허증)
 * Verifies the driver's license data against the government database
 *
 * POST https://api3.useb.co.kr/status/driver
 *
 * @param userName - 이름 (e.g., "홍길동")
 * @param birthDate - 생년월일 (YYYYMMDD, e.g., "19821120")
 * @param licenseNo - 운전면허번호 (e.g., "11-16-044391-61")
 * @param serialNo - 암호일련번호 (optional, e.g., "9WSWRQ")
 * @param juminNo - 주민등록번호 (optional, for additional validation)
 */
export async function verifyDriverLicenseStatus(
  userName: string,
  birthDate: string,
  licenseNo: string,
  serialNo?: string,
  juminNo?: string
): Promise<IDStatusVerificationResult> {
  try {
    const token = await getUsebToken();

    console.log('[진위확인] Verifying driver license...');
    console.log('[진위확인] Name:', userName, 'License:', licenseNo);

    const requestBody: Record<string, string> = {
      userName,
      birthDate,
      licenseNo,
    };

    // Add optional fields if provided
    if (serialNo) {
      requestBody.serialNo = serialNo;
    }
    if (juminNo) {
      requestBody.juminNo = juminNo;
    }

    const response = await fetch(`${USEB_API_URL}/status/driver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    console.log('[진위확인] Response:', response.status, JSON.stringify(data).substring(0, 300));

    if (!response.ok || !data.success) {
      // Map error codes to user-friendly messages
      const errorMessages: Record<string, string> = {
        'A011': '주민등록번호 유효성 검사 실패',
        'A013': '운전면허 정보가 올바르지 않습니다 (면허번호, 생년월일, 이름 확인)',
        'A014': '암호일련번호가 일치하지 않습니다',
        'A015': '진위확인 서비스 일시 오류',
        'A016': '현재 유효하지 않은 예전 운전면허번호입니다',
      };

      return {
        success: false,
        verified: false,
        message: data.message,
        transactionId: data.transaction_id,
        error: errorMessages[data.error_code] || data.message || `진위확인 실패: ${response.status}`,
        errorCode: data.error_code,
        rawResponse: data,
      };
    }

    return {
      success: true,
      verified: true,
      message: data.message,
      transactionId: data.transaction_id,
      rawResponse: data,
    };
  } catch (error) {
    console.error('[진위확인] Error:', error);
    return {
      success: false,
      verified: false,
      error: error instanceof Error ? error.message : '진위확인 중 오류가 발생했습니다',
    };
  }
}

/**
 * Verify ID status based on OCR results
 * Auto-detects ID type and calls the appropriate verification function
 *
 * @param ocrData - OCR result data from performIDCardOCR
 */
export async function verifyIdStatus(
  ocrData: IDCardOCRResult['data']
): Promise<IDStatusVerificationResult> {
  if (!ocrData) {
    return {
      success: false,
      verified: false,
      error: 'OCR 데이터가 없습니다',
    };
  }

  const { idType, name, juminNo1, juminNo2, issueDate, driverNo, serialNo } = ocrData;

  if (idType === '1') {
    // 주민등록증
    const identity = juminNo1 + juminNo2;
    return verifyIdCardStatus(identity, issueDate, name);
  } else if (idType === '2') {
    // 운전면허증
    if (!driverNo) {
      return {
        success: false,
        verified: false,
        error: '운전면허번호가 OCR에서 인식되지 않았습니다',
      };
    }

    // birthDate needs to be in YYYYMMDD format
    // juminNo1 is YYMMDD, we need to determine the century
    const birthYY = juminNo1.substring(0, 2);
    const birthMMDD = juminNo1.substring(2, 6);
    const genderDigit = parseInt(juminNo2.charAt(0), 10);

    let century: string;
    if (genderDigit === 1 || genderDigit === 2 || genderDigit === 5 || genderDigit === 6) {
      century = '19';
    } else if (genderDigit === 3 || genderDigit === 4 || genderDigit === 7 || genderDigit === 8) {
      century = '20';
    } else {
      century = '18';
    }

    const birthDate = century + birthYY + birthMMDD;
    const juminNo = juminNo1 + juminNo2;

    return verifyDriverLicenseStatus(name, birthDate, driverNo, serialNo, juminNo);
  } else {
    return {
      success: false,
      verified: false,
      error: `지원하지 않는 신분증 유형입니다: ${idType}`,
    };
  }
}

/**
 * Full verification flow: OCR + 진위확인 + Face Authentication
 *
 * Flow:
 * 1. OCR - Extract data from ID card
 * 2. 진위확인 - Verify ID authenticity with government database
 * 3. Face Authentication - Compare live face with ID card photo
 * 4. Adult Check - Verify age is 19+
 */
export async function performOCRAndFaceAuth(
  idCardImageBase64: string,
  faceImageBase64: string,
  options?: {
    skipStatusVerification?: boolean;  // Skip 진위확인 if not needed
  }
): Promise<{
  success: boolean;
  ocrResult: IDCardOCRResult;
  statusVerificationResult?: IDStatusVerificationResult;
  faceAuthResult?: FaceAuthResult;
  isAdult?: boolean;
  error?: string;
}> {
  // Step 1: OCR the ID card
  console.log('[Full Verification] Step 1: OCR');
  const ocrResult = await performIDCardOCR(idCardImageBase64);

  // Check if OCR failed due to unsupported ID type
  const isUnsupportedIdType = ocrResult.errorCode === 'O003' || 
                               (ocrResult.error && ocrResult.error.includes('주민등록번호 없음'));

  if (!ocrResult.success || !ocrResult.data) {
    // If it's an unsupported ID type, still try face authentication
    if (isUnsupportedIdType) {
      console.log('[Full Verification] Unsupported ID type, proceeding with face auth only');
      const faceAuthResult = await performFaceAuth(faceImageBase64, idCardImageBase64);
      
      return {
        success: faceAuthResult.success && faceAuthResult.matched,
        ocrResult,
        faceAuthResult,
        error: faceAuthResult.matched 
          ? '지원하지 않는 신분증입니다. 주민등록증이나 운전면허증을 사용해주세요. (안면인증만 완료)' 
          : ocrResult.error || 'OCR 실패',
      };
    }
    
    return {
      success: false,
      ocrResult,
      error: ocrResult.error || 'OCR 실패',
    };
  }

  // Step 2: 진위확인 (ID Status Verification)
  let statusVerificationResult: IDStatusVerificationResult | undefined;
  if (!options?.skipStatusVerification) {
    console.log('[Full Verification] Step 2: 진위확인');
    statusVerificationResult = await verifyIdStatus(ocrResult.data);

    if (!statusVerificationResult.success || !statusVerificationResult.verified) {
      return {
        success: false,
        ocrResult,
        statusVerificationResult,
        error: statusVerificationResult.error || '신분증 진위확인 실패',
      };
    }
  }

  // Step 3: Check if adult
  console.log('[Full Verification] Step 3: Adult check');
  const adultCheck = isAdult(ocrResult.data.juminNo1, ocrResult.data.juminNo2);

  // Step 4: Face authentication
  console.log('[Full Verification] Step 4: Face authentication');
  const faceAuthResult = await performFaceAuth(faceImageBase64, idCardImageBase64);

  if (!faceAuthResult.success || !faceAuthResult.matched) {
    return {
      success: false,
      ocrResult,
      statusVerificationResult,
      faceAuthResult,
      isAdult: adultCheck,
      error: faceAuthResult.error || '안면인증 실패 - 얼굴이 일치하지 않습니다',
    };
  }

  return {
    success: adultCheck,
    ocrResult,
    statusVerificationResult,
    faceAuthResult,
    isAdult: adultCheck,
    error: adultCheck ? undefined : '미성년자는 체크인이 불가합니다',
  };
}
