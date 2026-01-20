-- Payment Transactions Table Migration
-- Run this on the kiosk database to add payment support
-- Database: kiosk, User: orange

-- Create ENUM types if not exists
DO $$ BEGIN
    CREATE TYPE payment_type AS ENUM ('credit', 'debit', 'cash_receipt', 'simple_pay');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'approved', 'cancelled', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create payment_transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    transaction_id VARCHAR(100) NOT NULL,  -- Unique transaction ID for VAN
    amount INTEGER NOT NULL,               -- Payment amount in KRW
    tax INTEGER DEFAULT 0,                 -- VAT amount
    payment_type payment_type DEFAULT 'credit',
    status payment_status DEFAULT 'pending',
    
    -- Approval info from VAN
    approval_no VARCHAR(50),               -- 승인번호
    auth_date VARCHAR(10),                 -- 승인일자 (YYMMDD)
    auth_time VARCHAR(10),                 -- 승인시간 (HHMMSS)
    card_no VARCHAR(50),                   -- 마스킹된 카드번호
    card_name VARCHAR(100),                -- 카드사명
    installment_months INTEGER DEFAULT 0,  -- 할부개월 (0 = 일시불)
    
    -- Error info
    error_code VARCHAR(20),
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT unique_transaction_id UNIQUE(transaction_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reservation_id ON payment_transactions(reservation_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_project_id ON payment_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_approval_no ON payment_transactions(approval_no);

-- Create trigger function
CREATE OR REPLACE FUNCTION update_payment_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS set_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER set_payment_transactions_updated_at
    BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION update_payment_transactions_updated_at();

-- Verify
SELECT 'payment_transactions table created successfully' as status;
\dt payment_transactions
