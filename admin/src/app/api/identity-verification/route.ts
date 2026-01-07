import { NextResponse } from 'next/server';
import {
  performIDCardOCR,
  performFaceAuth,
  performOCRAndFaceAuth,
  verifyIdStatus,
  matchSignatureWithVerifiedNames,
  IDCardOCRResult,
  FaceAuthResult,
  IDStatusVerificationResult,
} from '@/lib/useb';
import { query, queryOne, execute } from '@/lib/db';

interface IdentityVerification {
  id: string;
  project_id: string;
  reservation_id: string | null;
  guest_index: number;
  guest_name: string | null;
  id_type: string | null;
  ocr_success: boolean;
  status_verified: boolean;
  status_verification_transaction_id: string | null;
  id_verified: boolean;
  face_matched: boolean;
  similarity_score: number | null;
  is_adult: boolean;
  status: string;
  failure_reason: string | null;
  verified_at: string | null;
  signature_name: string | null;
  signature_matched: boolean | null;
  created_at: string;
}

interface ReservationVerificationData {
  verification_data: unknown[];
  verified_guests: { name: string; verified_at: string; verification_id: string }[];
}

/**
 * POST /api/identity-verification
 *
 * Perform identity verification for hotel check-in
 * Flow: OCR + 진위확인 (Status Verification) + 안면인증 (Face Authentication)
 *
 * Request body:
 * - idCardImage: base64 encoded ID card image (required)
 * - faceImage: base64 encoded face photo from camera (required for 'full' action)
 * - action: 'full' | 'ocr' | 'face' | 'status' (default: 'full')
 *   - 'full': OCR + 진위확인 + Face Authentication (complete flow)
 *   - 'ocr': ID card OCR only
 *   - 'status': OCR + 진위확인 (verify ID against government database)
 *   - 'face': Face authentication only (compare face with ID card photo)
 * - projectId?: string (required for storing results)
 * - reservationId?: string (to link verification to reservation)
 * - guestIndex?: number (for multiple guests, 0-indexed)
 * - guestCount?: number (total number of guests to verify)
 * - signatureName?: string (name from consent form to match against verified IDs)
 *
 * Response:
 * - success: boolean
 * - data: OCR results + 진위확인 results + face auth results
 * - signatureMatched?: boolean (true if signature matches a verified guest)
 * - error?: string
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      idCardImage,
      faceImage,
      action = 'full',
      confirmedOcrData, // User-confirmed/edited OCR data from kiosk
      projectId,
      reservationId,
      guestIndex = 0,
      guestCount = 1,
      signatureName,
    } = body;

    const isLastGuest = guestIndex === guestCount - 1;

    // Validate required fields
    if (!idCardImage) {
      return NextResponse.json(
        { success: false, error: '신분증 이미지가 필요합니다' },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    let ocrResult: IDCardOCRResult | undefined;
    let faceAuthResult: FaceAuthResult | undefined;
    let statusVerificationResult: IDStatusVerificationResult | undefined;

    switch (action) {
      case 'ocr':
        // Just OCR the ID card
        ocrResult = await performIDCardOCR(idCardImage);
        result = {
          success: ocrResult.success,
          ocrResult,
          error: ocrResult.error,
        };
        break;

      case 'face':
        // Just face authentication (requires both images)
        if (!faceImage) {
          return NextResponse.json(
            { success: false, error: '얼굴 사진이 필요합니다' },
            { status: 400 }
          );
        }
        faceAuthResult = await performFaceAuth(faceImage, idCardImage);
        result = {
          success: faceAuthResult.success && faceAuthResult.matched,
          faceAuthResult,
          error: faceAuthResult.matched ? undefined : '안면인증 실패 - 얼굴이 일치하지 않습니다',
        };
        break;

      case 'status':
        // Just 진위확인 (requires OCR first)
        ocrResult = await performIDCardOCR(idCardImage);
        if (ocrResult.success && ocrResult.data) {
          statusVerificationResult = await verifyIdStatus(ocrResult.data);
          result = {
            success: statusVerificationResult.success && statusVerificationResult.verified,
            ocrResult,
            statusVerificationResult,
            error: statusVerificationResult.error,
          };
        } else {
          // OCR failed - check if it's an unsupported ID type
          const isUnsupportedIdType = ocrResult.errorCode === 'O003' ||
                                       (ocrResult.error && ocrResult.error.includes('주민등록번호 없음'));

          result = {
            success: false,
            ocrResult,
            error: isUnsupportedIdType
              ? '지원하지 않는 신분증 형식입니다. 주민등록증 또는 운전면허증을 사용해주세요.'
              : (ocrResult.error || 'OCR 실패로 진위확인을 수행할 수 없습니다'),
          };
        }
        break;

      case 'status-and-face':
        // 진위확인 + Face Auth using user-confirmed OCR data (no re-OCR)
        if (!faceImage) {
          return NextResponse.json(
            { success: false, error: '얼굴 사진이 필요합니다' },
            { status: 400 }
          );
        }

        if (!confirmedOcrData) {
          return NextResponse.json(
            { success: false, error: '신분증 정보가 필요합니다' },
            { status: 400 }
          );
        }

        // Use the confirmed OCR data directly for status verification
        ocrResult = {
          success: true,
          data: {
            idType: confirmedOcrData.idType || '1',
            name: confirmedOcrData.name,
            juminNo1: confirmedOcrData.juminNo1,
            juminNo2: confirmedOcrData.juminNo2,
            issueDate: confirmedOcrData.issueDate,
            driverNo: confirmedOcrData.driverNo,
          },
        };

        // Perform 진위확인 with confirmed data
        statusVerificationResult = await verifyIdStatus(ocrResult.data);

        if (!statusVerificationResult.success || !statusVerificationResult.verified) {
          result = {
            success: false,
            ocrResult,
            statusVerificationResult,
            error: statusVerificationResult.error || '진위확인에 실패했습니다. 신분증 정보를 확인해주세요.',
          };
          break;
        }

        // Perform face authentication
        faceAuthResult = await performFaceAuth(faceImage, idCardImage);

        if (!faceAuthResult.success || !faceAuthResult.matched) {
          result = {
            success: false,
            ocrResult,
            statusVerificationResult,
            faceAuthResult,
            error: '안면인증 실패 - 얼굴이 신분증 사진과 일치하지 않습니다',
          };
          break;
        }

        // Calculate if adult (based on juminNo1 and juminNo2)
        const birthYear = parseInt(confirmedOcrData.juminNo1.substring(0, 2));
        const genderDigit = parseInt(confirmedOcrData.juminNo2.charAt(0));
        const fullYear = (genderDigit <= 2) ? 1900 + birthYear : 2000 + birthYear;
        const birthMonth = parseInt(confirmedOcrData.juminNo1.substring(2, 4));
        const birthDay = parseInt(confirmedOcrData.juminNo1.substring(4, 6));
        const birthDate = new Date(fullYear, birthMonth - 1, birthDay);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        const isAdult = age >= 19;

        if (!isAdult) {
          result = {
            success: false,
            ocrResult,
            statusVerificationResult,
            faceAuthResult,
            isAdult: false,
            error: '만 19세 미만은 체크인이 불가합니다.',
          };
          break;
        }

        result = {
          success: true,
          ocrResult,
          statusVerificationResult,
          faceAuthResult,
          isAdult: true,
        };
        break;

      case 'full':
      default:
        // Full flow: OCR + 진위확인 + Face Authentication
        if (!faceImage) {
          return NextResponse.json(
            { success: false, error: '얼굴 사진이 필요합니다' },
            { status: 400 }
          );
        }

        const fullResult = await performOCRAndFaceAuth(idCardImage, faceImage);
        ocrResult = fullResult.ocrResult;
        faceAuthResult = fullResult.faceAuthResult;
        statusVerificationResult = fullResult.statusVerificationResult;

        result = {
          success: fullResult.success,
          ocrResult: fullResult.ocrResult,
          statusVerificationResult: fullResult.statusVerificationResult,
          faceAuthResult: fullResult.faceAuthResult,
          isAdult: fullResult.isAdult,
          error: fullResult.error,
        };
        break;
    }

    // Store verification result in database
    if (projectId) {
      try {
        const verificationRecord = {
          project_id: projectId,
          reservation_id: reservationId || null,
          guest_index: guestIndex,
          guest_name: ocrResult?.data?.name || null,
          id_type: ocrResult?.data?.idType || null,
          ocr_success: ocrResult?.success || false,
          status_verified: statusVerificationResult?.verified || false,
          status_verification_transaction_id: statusVerificationResult?.transactionId || null,
          id_verified: faceAuthResult?.matched || false,
          face_matched: faceAuthResult?.matched || false,
          similarity_score: faceAuthResult?.similarity || null,
          is_adult: result.isAdult || false,
          status: result.success ? 'verified' : 'failed',
          failure_reason: result.success ? null : (result.error as string) || null,
          verified_at: result.success ? new Date().toISOString() : null,
          signature_name: isLastGuest ? signatureName || null : null,
          signature_matched: null as boolean | null,
        };

        const insertedVerification = await queryOne<IdentityVerification>(
          `INSERT INTO identity_verifications (
            project_id, reservation_id, guest_index, guest_name, id_type,
            ocr_success, status_verified, status_verification_transaction_id,
            id_verified, face_matched, similarity_score, is_adult, status,
            failure_reason, verified_at, signature_name, signature_matched
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING *`,
          [
            verificationRecord.project_id,
            verificationRecord.reservation_id,
            verificationRecord.guest_index,
            verificationRecord.guest_name,
            verificationRecord.id_type,
            verificationRecord.ocr_success,
            verificationRecord.status_verified,
            verificationRecord.status_verification_transaction_id,
            verificationRecord.id_verified,
            verificationRecord.face_matched,
            verificationRecord.similarity_score,
            verificationRecord.is_adult,
            verificationRecord.status,
            verificationRecord.failure_reason,
            verificationRecord.verified_at,
            verificationRecord.signature_name,
            verificationRecord.signature_matched,
          ]
        );

        if (!insertedVerification) {
          console.error('Failed to insert verification record');
        } else {
          result.verificationId = insertedVerification.id;
        }

        // If verification successful and reservationId provided, update reservation
        if (result.success && reservationId) {
          const currentReservation = await queryOne<ReservationVerificationData>(
            'SELECT verification_data, verified_guests FROM reservations WHERE id = $1',
            [reservationId]
          );

          const currentData = (currentReservation?.verification_data as unknown[]) || [];
          const currentVerifiedGuests = (currentReservation?.verified_guests as { name: string; verified_at: string; verification_id: string }[]) || [];

          const newVerificationEntry = {
            verification_id: insertedVerification?.id,
            guest_index: guestIndex,
            guest_name: ocrResult?.data?.name,
            verified_at: new Date().toISOString(),
          };

          // Add verified guest to the verified_guests array
          const newVerifiedGuest = ocrResult?.data?.name ? {
            name: ocrResult.data.name,
            verified_at: new Date().toISOString(),
            verification_id: insertedVerification?.id || '',
          } : null;

          const updatedVerifiedGuests = newVerifiedGuest
            ? [...currentVerifiedGuests, newVerifiedGuest]
            : currentVerifiedGuests;

          await execute(
            `UPDATE reservations 
             SET verification_data = $1, verified_guests = $2, updated_at = NOW()
             WHERE id = $3`,
            [
              JSON.stringify([...currentData, newVerificationEntry]),
              JSON.stringify(updatedVerifiedGuests),
              reservationId,
            ]
          );
        }

        // After last guest verification, check if signature matches any verified guest
        if (result.success && isLastGuest && signatureName && projectId) {
          // Get all verified guest names for this reservation/session
          let verifiedGuests: { guest_name: string }[];
          
          if (reservationId) {
            verifiedGuests = await query<{ guest_name: string }>(
              `SELECT guest_name FROM identity_verifications 
               WHERE reservation_id = $1 AND status = 'verified' AND guest_name IS NOT NULL`,
              [reservationId]
            );
          } else {
            verifiedGuests = await query<{ guest_name: string }>(
              `SELECT guest_name FROM identity_verifications 
               WHERE project_id = $1 AND status = 'verified' AND guest_name IS NOT NULL
               AND created_at >= $2`,
              [projectId, new Date(Date.now() - 30 * 60 * 1000).toISOString()]
            );
          }

          const verifiedNames = verifiedGuests
            .map((g) => g.guest_name)
            .filter(Boolean);

          // Include the current guest's name
          if (ocrResult?.data?.name) {
            verifiedNames.push(ocrResult.data.name);
          }

          const signatureMatch = matchSignatureWithVerifiedNames(signatureName, verifiedNames);

          if (!signatureMatch.matched) {
            // Signature doesn't match any verified guest
            result.success = false;
            result.signatureMatched = false;
            result.error = `서명 이름(${signatureName})이 인증된 투숙객 이름과 일치하지 않습니다`;

            // Update the verification record to failed with signature match info
            if (insertedVerification?.id) {
              await execute(
                `UPDATE identity_verifications 
                 SET status = 'failed', failure_reason = $1, signature_matched = false
                 WHERE id = $2`,
                [result.error, insertedVerification.id]
              );
            }
          } else {
            result.signatureMatched = true;
            result.matchedGuestName = signatureMatch.matchedName;

            // Update the verification record with signature match success
            if (insertedVerification?.id) {
              await execute(
                'UPDATE identity_verifications SET signature_matched = true WHERE id = $1',
                [insertedVerification.id]
              );
            }
          }
        }
      } catch (dbError) {
        console.error('Database error:', dbError);
        // Don't fail the verification just because DB save failed
      }
    }

    return NextResponse.json({
      success: result.success,
      data: result,
      signatureMatched: result.signatureMatched,
      error: result.success ? undefined : result.error,
    });
  } catch (error) {
    console.error('Identity verification error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '인증 처리 중 오류가 발생했습니다',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/identity-verification
 *
 * Get verification records
 *
 * Query params:
 * - projectId: filter by project
 * - reservationId: filter by reservation
 * - status: filter by status
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const reservationId = searchParams.get('reservationId');
    const status = searchParams.get('status');

    let sql = 'SELECT * FROM identity_verifications WHERE 1=1';
    const params: (string | null)[] = [];
    let paramIndex = 1;

    if (projectId) {
      sql += ` AND project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    if (reservationId) {
      sql += ` AND reservation_id = $${paramIndex++}`;
      params.push(reservationId);
    }

    if (status) {
      sql += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';

    const verifications = await query<IdentityVerification>(sql, params);

    return NextResponse.json({ success: true, verifications });
  } catch (error) {
    console.error('Get verifications error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch verifications' },
      { status: 500 }
    );
  }
}
