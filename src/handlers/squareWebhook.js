/**
 * Square webhook handler
 * Verifies HMAC-SHA256 signature, logs every event, and processes:
 *   - payment.completed  → mark booking paid
 *   - payment.canceled   → mark booking canceled
 *   - order.updated      → fallback state sync
 */

import { json } from '../lib/response.js';
import { generateId } from '../lib/utils.js';

const SUPPORTED_EVENTS = new Set([
  'payment.completed',
  'payment.updated',
  'order.updated',
  'order.fulfillment.updated',
  'refund.created',
]);

export async function handleSquareWebhook(request, env, ctx) {
  const body = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature');

  // ── 1. Verify signature ────────────────────────────────────────
  if (env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    const isValid = await verifySquareSignature(
      body,
      signature,
      env.SQUARE_WEBHOOK_SIGNATURE_KEY,
      request.url
    );
    if (!isValid) {
      console.warn('Square webhook: invalid signature');
      return json({ error: 'Invalid signature' }, 403);
    }
  } else {
    console.warn('Square webhook: SQUARE_WEBHOOK_SIGNATURE_KEY not set, skipping verification');
  }

  // ── 2. Parse payload ───────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const eventType = payload.type;
  const squareEventId = payload.event_id;

  // ── 3. Log to webhook_log (idempotent via UNIQUE square_event_id) ──
  const logId = generateId();
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO webhook_log (id, event_type, square_event_id, payload)
      VALUES (?, ?, ?, ?)
    `).bind(logId, eventType, squareEventId, body).run();
  } catch (err) {
    console.error('Failed to log webhook:', err);
  }

  // ── 4. Process known event types ───────────────────────────────
  if (!SUPPORTED_EVENTS.has(eventType)) {
    return json({ received: true, processed: false, reason: 'event_type_ignored' });
  }

  // Check for duplicate (already processed)
  const existing = await env.DB.prepare(`
    SELECT processed FROM webhook_log WHERE square_event_id = ? AND processed = 1
  `).bind(squareEventId).first();

  if (existing) {
    return json({ received: true, processed: false, reason: 'duplicate' });
  }

  // Process async so Square gets a fast 200
  ctx.waitUntil(processWebhookEvent(payload, eventType, squareEventId, env));

  return json({ received: true });
}

async function processWebhookEvent(payload, eventType, squareEventId, env) {
  try {
    const data = payload.data?.object;

    if (eventType === 'payment.completed' || eventType === 'payment.updated') {
      await handlePaymentEvent(data?.payment, env);
    } else if (eventType === 'order.updated' || eventType === 'order.fulfillment.updated') {
      await handleOrderEvent(data?.order || data?.order_updated, env);
    } else if (eventType === 'refund.created') {
      await handleRefundEvent(data?.refund, env);
    }

    // Mark as processed
    await env.DB.prepare(`
      UPDATE webhook_log SET processed = 1 WHERE square_event_id = ?
    `).bind(squareEventId).run();
  } catch (err) {
    console.error('processWebhookEvent error:', err);
    await env.DB.prepare(`
      UPDATE webhook_log SET error = ? WHERE square_event_id = ?
    `).bind(err.message, squareEventId).run();
  }
}

async function handlePaymentEvent(payment, env) {
  if (!payment) return;

  const { id: paymentId, order_id: orderId, status, amount_money } = payment;
  const amountCents = amount_money?.amount ?? 0;

  // Find booking by order_id or payment_id
  const booking = await env.DB.prepare(`
    SELECT id FROM bookings WHERE square_order_id = ? OR square_payment_id = ?
  `).bind(orderId, paymentId).first();

  if (booking) {
    // Update existing booking
    const newStatus = status === 'COMPLETED' ? 'confirmed' :
                      status === 'FAILED'    ? 'failed'    : 'pending';
    await env.DB.prepare(`
      UPDATE bookings
      SET status = ?, square_payment_id = ?, amount_cents = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(newStatus, paymentId, amountCents, booking.id).run();
  } else if (status === 'COMPLETED' && orderId) {
    // Create booking record from webhook (Square Checkout flow)
    await createBookingFromPayment(payment, env);
  }
}

async function createBookingFromPayment(payment, env) {
  const { id: paymentId, order_id: orderId, buyer_email_address, amount_money } = payment;

  // Derive event from amount (fallback — will improve when we have Square item IDs)
  const event = await env.DB.prepare(`
    SELECT id FROM events WHERE active = 1 LIMIT 1
  `).first();

  if (!event) {
    console.warn('No active event found for payment', paymentId);
    return;
  }

  const bookingId = generateId();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO bookings
      (id, event_id, square_order_id, square_payment_id, customer_email, quantity, amount_cents, status)
    VALUES (?, ?, ?, ?, ?, 1, ?, 'confirmed')
  `).bind(
    bookingId,
    event.id,
    orderId,
    paymentId,
    buyer_email_address ?? 'unknown@square.checkout',
    amount_money?.amount ?? 0
  ).run();
}

async function handleOrderEvent(order, env) {
  if (!order?.id) return;
  const orderId = order.id;

  const booking = await env.DB.prepare(`
    SELECT id FROM bookings WHERE square_order_id = ?
  `).bind(orderId).first();

  if (!booking) return;

  const state = order.state;
  const status = state === 'COMPLETED' ? 'confirmed' :
                 state === 'CANCELED'  ? 'canceled'  : null;

  if (status) {
    await env.DB.prepare(`
      UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(status, booking.id).run();
  }
}

async function handleRefundEvent(refund, env) {
  if (!refund?.order_id) return;

  await env.DB.prepare(`
    UPDATE bookings SET status = 'refunded', updated_at = datetime('now')
    WHERE square_order_id = ?
  `).bind(refund.order_id).run();
}

// ── HMAC-SHA256 verification ────────────────────────────────────────────────
async function verifySquareSignature(body, signature, signatureKey, requestUrl) {
  if (!signature) return false;
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(signatureKey);
    const msgData = encoder.encode(requestUrl + body);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const computed = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
    return computed === signature;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}
