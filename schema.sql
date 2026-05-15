-- Alma Sonora D1 Schema
-- Run via: wrangler d1 execute alma-sonora-bookings --file=schema.sql
-- (Already applied to production DB — this file is for reference + future migrations)

-- ─────────────────────────────────────────────────────────────────
-- Table: events
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                  TEXT    PRIMARY KEY,
  title               TEXT    NOT NULL,
  date                TEXT    NOT NULL,           -- ISO 8601: 2026-05-24
  time                TEXT    NOT NULL,           -- HH:MM
  location            TEXT    NOT NULL,
  capacity            INTEGER NOT NULL DEFAULT 12,
  price_cents         INTEGER NOT NULL,
  currency            TEXT    NOT NULL DEFAULT 'USD',
  square_item_id      TEXT,                       -- filled after Square setup
  square_variation_id TEXT,                       -- filled after Square setup
  active              INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─────────────────────────────────────────────────────────────────
-- Table: bookings
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT    PRIMARY KEY,
  event_id          TEXT    NOT NULL REFERENCES events(id),
  square_order_id   TEXT    UNIQUE,              -- from Square webhook
  square_payment_id TEXT,                        -- from Square webhook
  customer_name     TEXT,
  customer_email    TEXT    NOT NULL,
  customer_phone    TEXT,
  quantity          INTEGER NOT NULL DEFAULT 1,
  amount_cents      INTEGER NOT NULL,
  status            TEXT    NOT NULL DEFAULT 'pending',
  --   pending   → payment initiated but not confirmed
  --   confirmed → payment.completed received
  --   canceled  → order canceled
  --   refunded  → refund issued
  --   failed    → payment failed
  notes             TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_event_id       ON bookings(event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_square_order_id ON bookings(square_order_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status          ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_email           ON bookings(customer_email);

-- ─────────────────────────────────────────────────────────────────
-- Table: webhook_log
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_log (
  id             TEXT    PRIMARY KEY,
  received_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  event_type     TEXT    NOT NULL,
  square_event_id TEXT   UNIQUE,                 -- dedup key
  payload        TEXT    NOT NULL,               -- raw JSON body
  processed      INTEGER NOT NULL DEFAULT 0,
  error          TEXT                            -- set on processing failure
);

CREATE INDEX IF NOT EXISTS idx_webhook_log_event_type ON webhook_log(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_log_processed  ON webhook_log(processed);

-- ─────────────────────────────────────────────────────────────────
-- Seed: May 24 event (already inserted — idempotent)
-- ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO events (id, title, date, time, location, capacity, price_cents, currency, active)
VALUES (
  'cacao-sonido-2026-05-24',
  'Cacao & Sonido',
  '2026-05-24',
  '10:00',
  'Espacio Alma Sonora, Bird Road, Miami',
  12,
  6500,
  'USD',
  1
);
