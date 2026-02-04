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

    // super_admin, project_admin, or manager can cancel payments
    const allowedRoles = ['super_admin', 'project_admin', 'manager'];
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden - admin/manager only' }, { status: 403 });
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
      paymentAgentUrl: providedAgentUrl,
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

    // Get payment_agent_url from kiosk if not provided
    let paymentAgentUrl = providedAgentUrl;
    if (!paymentAgentUrl && projectId) {
      const kiosk = await queryOne<{ payment_agent_url: string }>(
        'SELECT payment_agent_url FROM kiosks WHERE project_id = $1 LIMIT 1',
        [projectId]
      );
      paymentAgentUrl = kiosk?.payment_agent_url;
    }

    // Generate new transaction ID for the cancellation
    const cancelTransactionId = generateTransactionId(reservationId || 'ADMIN-CANCEL');

    console.log('[Payment Cancel] Starting cancellation:', {
      originalApprovalNo: approvalNo,
      originalAuthDate: authDate,
      amount,
      cancelTransactionId,
      paymentAgentUrl,
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
      // cancelCreditCard throws PaymentError on failure, returns ApprovalResponse on success
      try {
        const cancelResult = await cancelCreditCard(
          amount,
          approvalNo,
          authDate,
          cancelTransactionId,
          CancelReason.CUSTOMER_REQUEST,
          paymentAgentUrl
        );

        console.log('[Payment Cancel] VAN response:', cancelResult);

        // Use correct property names from ApprovalResponse (capital letters)
        cancelApprovalNo = cancelResult.Approval_no || approvalNo;
        cancelAuthDate = cancelResult.Auth_date || authDate;
        cancelAuthTime = cancelResult.Auth_time || '';
      } catch (vanError) {
        // PaymentError from VAN API
        const errorMessage = vanError instanceof Error ? vanError.message : '결제 취소에 실패했습니다';
        console.error('[Payment Cancel] VAN error:', vanError);

        // Check if it's a network error (payment agent not reachable)
        const isNetworkError = errorMessage.includes('fetch failed') ||
                               errorMessage.includes('ECONNREFUSED') ||
                               errorMessage.includes('ETIMEDOUT') ||
                               errorMessage.includes('network');

        if (isNetworkError) {
          return NextResponse.json(
            {
              error: '결제 단말기에 연결할 수 없습니다. 키오스크에서 직접 취소하거나 단말기 연결을 확인해주세요.',
              details: `Payment agent URL: ${paymentAgentUrl || 'not configured'}`,
              networkError: true,
            },
            { status: 503 }
          );
        }

        return NextResponse.json(
          { error: errorMessage },
          { status: 500 }
        );
      }
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
