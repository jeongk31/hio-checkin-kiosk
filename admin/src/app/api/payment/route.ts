import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'kiosk',
  user: process.env.POSTGRES_USER || 'orange',
  password: process.env.POSTGRES_PASSWORD || '00oo00oo',
});

/**
 * GET /api/payment - List payment transactions
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reservationId = searchParams.get('reservation_id');
    const projectId = searchParams.get('project_id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    let query = `
      SELECT 
        pt.*,
        r.reservation_number,
        r.room_number,
        r.guest_name
      FROM payment_transactions pt
      LEFT JOIN reservations r ON pt.reservation_id = r.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];
    let paramIndex = 1;
    
    if (reservationId) {
      query += ` AND pt.reservation_id = $${paramIndex++}`;
      params.push(reservationId);
    }
    
    if (projectId) {
      query += ` AND pt.project_id = $${paramIndex++}`;
      params.push(projectId);
    }
    
    query += ` ORDER BY pt.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    return NextResponse.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('[Payment API] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch payment transactions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payment - Create payment transaction record
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const {
      reservation_id,
      project_id,
      transaction_id,
      amount,
      tax = 0,
      payment_type = 'credit',
      status,
      approval_no,
      auth_date,
      auth_time,
      card_no,
      card_name,
      installment_months = 0,
      error_code,
      error_message,
    } = body;
    
    if (!amount) {
      return NextResponse.json(
        { success: false, error: 'amount is required' },
        { status: 400 }
      );
    }
    
    const id = randomUUID();
    const now = new Date().toISOString();
    
    const query = `
      INSERT INTO payment_transactions (
        id, reservation_id, project_id, transaction_id, amount, tax,
        payment_type, status, approval_no, auth_date, auth_time,
        card_no, card_name, installment_months, error_code, error_message,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING *
    `;
    
    const result = await pool.query(query, [
      id,
      reservation_id,
      project_id,
      transaction_id || `TXN_${Date.now()}`,
      amount,
      tax,
      payment_type,
      status || 'pending',
      approval_no,
      auth_date,
      auth_time,
      card_no,
      card_name,
      installment_months,
      error_code,
      error_message,
      now,
    ]);
    
    console.log('[Payment API] Created transaction:', result.rows[0].id);
    
    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[Payment API] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create payment transaction' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/payment - Update payment transaction status
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    
    const {
      id,
      transaction_id,
      status,
      approval_no,
      auth_date,
      auth_time,
      card_no,
      card_name,
      error_code,
      error_message,
    } = body;
    
    if (!id && !transaction_id) {
      return NextResponse.json(
        { success: false, error: 'id or transaction_id is required' },
        { status: 400 }
      );
    }
    
    const updates: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;
    
    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (approval_no) {
      updates.push(`approval_no = $${paramIndex++}`);
      params.push(approval_no);
    }
    if (auth_date) {
      updates.push(`auth_date = $${paramIndex++}`);
      params.push(auth_date);
    }
    if (auth_time) {
      updates.push(`auth_time = $${paramIndex++}`);
      params.push(auth_time);
    }
    if (card_no) {
      updates.push(`card_no = $${paramIndex++}`);
      params.push(card_no);
    }
    if (card_name) {
      updates.push(`card_name = $${paramIndex++}`);
      params.push(card_name);
    }
    if (error_code) {
      updates.push(`error_code = $${paramIndex++}`);
      params.push(error_code);
    }
    if (error_message) {
      updates.push(`error_message = $${paramIndex++}`);
      params.push(error_message);
    }
    
    if (status === 'cancelled') {
      updates.push(`cancelled_at = $${paramIndex++}`);
      params.push(new Date().toISOString());
    }
    
    updates.push(`updated_at = $${paramIndex++}`);
    params.push(new Date().toISOString());
    
    let whereClause = '';
    if (id) {
      whereClause = `id = $${paramIndex++}`;
      params.push(id);
    } else {
      whereClause = `transaction_id = $${paramIndex++}`;
      params.push(transaction_id);
    }
    
    const query = `
      UPDATE payment_transactions
      SET ${updates.join(', ')}
      WHERE ${whereClause}
      RETURNING *
    `;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    console.log('[Payment API] Updated transaction:', result.rows[0].id);
    
    return NextResponse.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('[Payment API] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update payment transaction' },
      { status: 500 }
    );
  }
}
