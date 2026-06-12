-- ============================================================
-- Migration 002: Add Order Attribution Tracking
-- ============================================================

-- 1. Create enum for attribution method if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attribution_method_type') THEN
    CREATE TYPE attribution_method_type AS ENUM ('last_touch', 'none');
  END IF;
END$$;

-- 2. Add columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attributed_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attributed_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution_window_hours INT DEFAULT 48;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS attribution_method attribution_method_type DEFAULT 'last_touch';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;

-- 3. Add indexes for faster attribution queries
CREATE INDEX IF NOT EXISTS idx_orders_attributed_campaign ON orders (attributed_campaign_id);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders (idempotency_key);
