import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';
import { execute, queryOne } from '@/lib/db';
import { cancelCreditCard, generateTransactionId } from '@/lib/payment/payment-agent';
import { CancelReason } from '@/lib/payment/payment-types';

/**
 * POST /api/payment/cancel
 *
 * Cancel/refund a kiosk payment (admin only)
 *
 * Request Body:
 *   paymentId: string - payment_transactions.id
 *   transactionId: string - original transaction ID
 *   approvalNo: string - original approval number
 *   authDate: string - original auth date (YYMMDD)
 *   amount: number - amount to refund
 *   reservationId?: string - optional reservation ID
 *   projectId: string - project ID for authorization
 */
export async function POST(request: Request) {
  try {
    // Authenticate admin user
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only super_admin or project_admin can cancel payments
    if (profile.role !== 'super_admin' && profile.role !== 'project_admin') {
      return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
    }

    const body = await request.json();
    const {
      paymentId,
      transactionId,
      approvalNo,
      authDate,
      amount,
      reservationId,
      projectId,
    } = body;

    // Validate required fields
    if (!approvalNo || !authDate || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: approvalNo, authDate, amount' },
        { status: 400 }
      );
    }

    // Project admins can only cancel their own project's payments
    if (profile.role === 'project_admin' && projectId !== profile.project_id) {
      return NextResponse.json(
        { error: 'Cannot cancel payments for other projects' },
        { status: 403 }
      );
    }

    // Check if payment exists and is approved (not already cancelled)
    if (paymentId) {
      const existingPayment = await queryOne<{ status: string }>(
        'SELECT status FROM payment_transactions WHERE id = $1',
        [paymentId]
      );

      if (!existingPayment) {
        return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
      }

      if (existingPayment.status === 'cancelled') {
        return NextResponse.json(
          { error: 'Payment is already cancelled' },
          { status: 400 }
        );
      }
    }

    // Generate new transaction ID for the cancellation
    const cancelTransactionId = generateTransactionId(reservationId || 'ADMIN-CANCEL');

    console.log('[Payment Cancel] Starting cancellation:', {
      originalApprovalNo: approvalNo,
      originalAuthDate: authDate,
      amount,
      cancelTransactionId,
    });

    // Check if this is a test/mock payment (skip VAN call)
    const isTestPayment = approvalNo?.startsWith('TEST') || transactionId?.startsWith('MOCK_');

    let cancelApprovalNo = approvalNo;
    let cancelAuthDate = authDate;
    let cancelAuthTime = '';

    if (isTestPayment) {
      // Mock payment - skip VAN API call, just update database
      console.log('[Payment Cancel] Test payment detected, skipping VAN API call');
      const now = new Date();
      cancelAuthDate = now.toISOString().slice(2, 10).replace(/-/g, '');
      cancelAuthTime = now.toTimeString().slice(0, 8).replace(/:/g, '');
    } else {
      // Real payment - call VAN to cancel
      const cancelResult = await cancelCreditCard(
        amount,
        approvalNo,
        authDate,
        cancelTransactionId,
        CancelReason.CUSTOMER_REQUEST
      );

      console.log('[Payment Cancel] VAN response:', cancelResult);

      if (!cancelResult.success) {
        return NextResponse.json(
          {
            error: cancelResult.message || '결제 취소에 실패했습니다',
            errorCode: cancelResult.error_code,
          },
          { status: 500 }
        );
      }

      cancelApprovalNo = cancelResult.approval_no;
      cancelAuthDate = cancelResult.auth_date;
      cancelAuthTime = cancelResult.auth_time;
    }

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

    // Log the cancellation
    console.log('[Payment Cancel] Success:', {
      originalApprovalNo: approvalNo,
      cancelApprovalNo,
      amount,
      isTestPayment,
    });

    return NextResponse.json({
      success: true,
      message: isTestPayment ? '테스트 결제가 취소되었습니다' : '결제가 취소되었습니다',
      cancelApprovalNo,
      cancelAuthDate,
      cancelAuthTime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Payment Cancel] Error:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to cancel payment', details: errorMessage },
      { status: 500 }
    );
  }
}
