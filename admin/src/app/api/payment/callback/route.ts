import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { parsePaymentResult } from '@/lib/easycheck';

interface Kiosk {
  project_id: string;
}

/**
 * Payment callback handler for KICC EasyCheck
 *
 * This endpoint is called when returning from the EasyCheck payment app.
 * It parses the payment result and redirects to the appropriate kiosk screen.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Parse payment result from URL parameters
  const result = parsePaymentResult(searchParams);

  // Get tracking parameters
  const transactionNo = searchParams.get('txn') || result.transactionNo;
  const kioskId = searchParams.get('kiosk');
  const reservationId = searchParams.get('reservation');

  console.log('Payment callback received:', {
    transactionNo,
    kioskId,
    reservationId,
    result,
  });

  try {
    // Get project_id from kiosk if available
    let projectId: string | null = null;
    if (kioskId) {
      const kiosk = await queryOne<Kiosk>(
        'SELECT project_id FROM kiosks WHERE id = $1',
        [kioskId]
      );
      projectId = kiosk?.project_id || null;
    }

    // Store payment record in database
    if (result.success) {
      // Insert successful payment record
      try {
        await execute(
          `INSERT INTO payments (
            project_id, transaction_no, approval_num, approval_date, approval_time,
            card_num, card_name, amount, installment, status, kiosk_id, reservation_id, raw_response
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10, $11, $12)`,
          [
            projectId,
            transactionNo,
            result.approvalNum,
            result.approvalDate,
            result.approvalTime,
            result.cardNum,
            result.cardName,
            result.amount,
            result.installment,
            kioskId || null,
            reservationId || null,
            JSON.stringify(result.rawParams),
          ]
        );
      } catch (insertError) {
        console.error('Error storing payment record:', insertError);
        // Continue anyway - we don't want to block the user flow
      }

      // Update reservation status if applicable
      if (reservationId) {
        await execute(
          `UPDATE reservations 
           SET status = 'paid', payment_status = 'completed', updated_at = NOW()
           WHERE id = $1`,
          [reservationId]
        );
      }
    } else {
      // Store failed payment attempt
      try {
        await execute(
          `INSERT INTO payments (
            project_id, transaction_no, status, error_code, error_message,
            kiosk_id, reservation_id, raw_response
          ) VALUES ($1, $2, 'failed', $3, $4, $5, $6, $7)`,
          [
            projectId,
            transactionNo,
            result.errorCode,
            result.errorMessage,
            kioskId || null,
            reservationId || null,
            JSON.stringify(result.rawParams),
          ]
        );
      } catch (insertError) {
        console.error('Error storing failed payment record:', insertError);
      }
    }
  } catch (error) {
    console.error('Error processing payment callback:', error);
  }

  // Build redirect URL back to kiosk
  // Include payment result status so the kiosk can show appropriate screen
  const redirectUrl = new URL('/kiosk', request.nextUrl.origin);

  if (result.success) {
    redirectUrl.searchParams.set('payment', 'success');
    redirectUrl.searchParams.set('txn', transactionNo);
    if (result.approvalNum) {
      redirectUrl.searchParams.set('approval', result.approvalNum);
    }
  } else {
    redirectUrl.searchParams.set('payment', 'failed');
    if (result.errorCode) {
      redirectUrl.searchParams.set('error', result.errorCode);
    }
    if (result.errorMessage) {
      redirectUrl.searchParams.set('message', result.errorMessage);
    }
  }

  // Redirect back to kiosk
  return NextResponse.redirect(redirectUrl);
}

// Also handle POST in case EasyCheck sends data via POST
export async function POST(request: NextRequest) {
  // Parse form data if sent via POST
  try {
    const formData = await request.formData();
    const searchParams = new URLSearchParams();

    formData.forEach((value, key) => {
      if (typeof value === 'string') {
        searchParams.set(key, value);
      }
    });

    // Create a new request with the form data as query params
    const url = new URL(request.url);
    url.search = searchParams.toString();

    const newRequest = new NextRequest(url, {
      method: 'GET',
    });

    return GET(newRequest);
  } catch {
    // If form parsing fails, try to handle as regular GET
    return GET(request);
  }
}
