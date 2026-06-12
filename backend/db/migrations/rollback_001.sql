-- ============================================================
-- Rollback Migration 001: Add Multi-Channel Support
-- ============================================================

-- 1. Remove columns from messages table
ALTER TABLE messages DROP COLUMN IF EXISTS channel;
ALTER TABLE messages DROP COLUMN IF EXISTS phone_number;
ALTER TABLE messages DROP COLUMN IF EXISTS character_count;
ALTER TABLE messages DROP COLUMN IF EXISTS channel_specific_data;

-- 2. Drop channel_rules table
DROP TABLE IF EXISTS channel_rules;

-- 3. Drop enum type (Note: only do if no columns depend on it)
DROP TYPE IF EXISTS message_channel;
