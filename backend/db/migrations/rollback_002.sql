-- ============================================================
-- Rollback Migration 002: Add Order Attribution Tracking
-- ============================================================

-- 1. Drop indexes
DROP INDEX IF EXISTS idx_orders_attributed_campaign;
DROP INDEX IF EXISTS idx_orders_idempotency_key;

-- 2. Drop columns
ALTER TABLE orders DROP COLUMN IF EXISTS order_date;
ALTER TABLE orders DROP COLUMN IF EXISTS attributed_campaign_id;
ALTER TABLE orders DROP COLUMN IF EXISTS attributed_message_id;
ALTER TABLE orders DROP COLUMN IF EXISTS attribution_window_hours;
ALTER TABLE orders DROP COLUMN IF EXISTS attribution_method;
ALTER TABLE orders DROP COLUMN IF EXISTS idempotency_key;

-- 3. Drop enum type
DROP TYPE IF EXISTS attribution_method_type;
