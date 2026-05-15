# Alma Sonora — Booking Worker

Cloudflare Worker + D1 backend for booking management.

**Live database:** `alma-sonora-bookings` (D1, ENAM region, MIA primary)

---

## Stack

| Layer | Tech |
|-------|------|
| Compute | Cloudflare Worker (ES modules) |
| Storage | Cloudflare D1 (SQLite) |
| Payments | Square (webhook-driven) |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Set secrets

```bash
# From Square Developer Dashboard → Webhooks → your endpoint → Signature key
wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY

# Choose a strong random string (used to protect admin endpoints)
wrangler secret put ADMIN_SECRET
```

### 3. Deploy

```bash
npm run deploy
```

This deploys to `https://alma-sonora-bookings.<your-subdomain>.workers.dev`

---

## Wiring Square (when Karina has credentials)

1. Square Developer Dashboard → your app → **Webhooks** → Add endpoint
2. URL: `https://alma-sonora-bookings.<subdomain>.workers.dev/webhooks/square`
   (or `https://api.alma-sonora.com/webhooks/square` after custom domain)
3. Subscribe to events:
   - `payment.completed`
   - `payment.updated`
   - `order.updated`
   - `order.fulfillment.updated`
   - `refund.created`
4. Copy the **Signature key** → `wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY`
5. Update `events.json` with the live `square_checkout_url`
6. Optionally update `events` table: `square_item_id` and `square_variation_id`

---

## API Endpoints

### Public

```
GET /health
GET /api/events
GET /api/events/:id
```

### Webhook

```
POST /webhooks/square
```

### Admin (requires `x-admin-secret` header)

```
GET /api/admin/bookings
GET /api/admin/bookings/:eventId
GET /api/admin/bookings?status=confirmed
```

---

## Useful CLI commands

```bash
# Check availability
npm run db:availability

# View all bookings
npm run db:bookings

# Raw query
npm run db:query -- "SELECT COUNT(*) FROM bookings WHERE status='confirmed'"

# Tail live logs
npm run tail
```

---

## DB Schema

### `events`
Seeded with `cacao-sonido-2026-05-24` (May 24, $65, cap 12).
Add `square_item_id` / `square_variation_id` after Square setup.

### `bookings`
Created by webhook. Statuses: `pending → confirmed | canceled | refunded | failed`.

### `webhook_log`
Every incoming Square webhook is logged here. `square_event_id` is UNIQUE to prevent double-processing.

---

## Custom domain (optional)

To serve from `api.alma-sonora.com` instead of `*.workers.dev`:

1. Cloudflare Dashboard → Workers → alma-sonora-bookings → Settings → Domains & Routes
2. Add route: `api.alma-sonora.com/*` (zone: alma-sonora.com)
3. Or uncomment the `routes` block in `wrangler.toml`
