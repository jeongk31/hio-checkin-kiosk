import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { execute } from '@/lib/db';

/**
 * POST /api/payment/cancel-result
 *
 * Receive cancel result from kiosk after executing VAN cancel locally
 * Called by kiosk after processing cancel_payment command
 */
export async function POST(request: Request) {
  try {
    // Authenticate - kiosk role can report results
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allow kiosk, call_only, and admin roles
    const allowedRoles = ['kiosk', 'call_only', 'super_admin', 'project_admin', 'manager'];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const {
      paymentId,
      transactionId,
      success,
      cancelApprovalNo,
      cancelAuthDate,
      cancelAuthTime,
      errorMessage,
      commandId,
    } = body;

    console.log('[Payment Cancel Result] Received from kiosk:', {
      paymentId,
      transactionId,
      success,
      cancelApprovalNo,
      commandId,
    });

    if (success) {
      // Update payment_transactions record to cancelled
      if (paymentId) {
        await execute(
          `UPDATE payment_transactions
           SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [paymentId]
        );
      } else if (transactionId) {
        await execute(
          `UPDATE payment_transactions
           SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
           WHERE transaction_id = $1`,
          [transactionId]
        );
      }

      console.log('[Payment Cancel Result] Payment cancelled successfully:', {
        paymentId,
        transactionId,
        cancelApprovalNo,
      });

      return NextResponse.json({
        success: true,
        message: '결제가 취소되었습니다',
        cancelApprovalNo,
        cancelAuthDate,
        cancelAuthTime,
      });
    } else {
      console.error('[Payment Cancel Result] Cancel failed:', errorMessage);
      return NextResponse.json({
        success: false,
        error: errorMessage || '결제 취소에 실패했습니다',
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Payment Cancel Result] Error:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to process cancel result', details: errorMessage },
      { status: 500 }
    );
  }
}
