-- ============================================================
-- Migration 001: Add Multi-Channel Support
-- ============================================================

-- 1. Create enum for message channels if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_channel') THEN
    CREATE TYPE message_channel AS ENUM ('sms', 'whatsapp', 'email', 'rcs');
  END IF;
END$$;

-- 2. Add columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel message_channel DEFAULT 'email';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS character_count INT DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_specific_data JSONB DEFAULT '{}'::jsonb;

-- 3. Create channel_rules table
CREATE TABLE IF NOT EXISTS channel_rules (
  id SERIAL PRIMARY KEY,
  segment_type VARCHAR(50) NOT NULL UNIQUE,
  preferred_channel VARCHAR(20) NOT NULL,
  character_limit INTEGER NOT NULL,
  delivery_speed_ms INTEGER NOT NULL
);

-- 4. Seed default channel rules
INSERT INTO channel_rules (segment_type, preferred_channel, character_limit, delivery_speed_ms)
VALUES
  ('high_value', 'whatsapp', 1000, 500),
  ('at_risk', 'sms', 160, 100),
  ('dormant', 'email', 5000, 2000),
  ('new', 'whatsapp', 1000, 500)
ON CONFLICT (segment_type) DO UPDATE
SET preferred_channel = EXCLUDED.preferred_channel,
    character_limit = EXCLUDED.character_limit,
    delivery_speed_ms = EXCLUDED.delivery_speed_ms;
