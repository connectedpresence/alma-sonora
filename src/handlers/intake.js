import { json } from '../lib/response.js';
import { generateId } from '../lib/utils.js';

/**
 * POST /api/intake
 * Public endpoint — accepts intake form submission after Square checkout.
 *
 * Body: {
 *   event_id: 'cacao-sonido-2026-05-24',
 *   name:     string,
 *   email:    string,
 *   phone:    string,
 *   first_time:    'yes' | 'no',
 *   intention:     string (optional),
 *   medical:       string (optional),
 *   how_heard:     string (optional)
 * }
 */
export async function handleIntake(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // Validate required fields
  const { event_id, name, email, phone } = body;
  if (!event_id || !name || !email || !phone) {
    return json({
      error: 'Faltan campos obligatorios',
      details: 'Nombre, email, teléfono y evento son requeridos.'
    }, 400);
  }

  // Verify the event exists
  const event = await env.DB.prepare(`
    SELECT id, title FROM events WHERE id = ? AND active = 1
  `).bind(event_id).first();

  if (!event) {
    return json({ error: 'Evento no encontrado' }, 404);
  }

  // Build notes blob from optional fields
  const notesParts = [];
  if (body.first_time) notesParts.push(`Primera vez: ${body.first_time}`);
  if (body.intention)  notesParts.push(`Intención: ${body.intention}`);
  if (body.medical)    notesParts.push(`Médico: ${body.medical}`);
  if (body.how_heard)  notesParts.push(`Cómo se enteró: ${body.how_heard}`);
  const notes = notesParts.join('\n');

  // Check if a booking already exists for this email (Square webhook may have created one)
  const existing = await env.DB.prepare(`
    SELECT id FROM bookings
    WHERE event_id = ? AND customer_email = ?
    ORDER BY created_at DESC LIMIT 1
  `).bind(event_id, email.toLowerCase().trim()).first();

  if (existing) {
    // Update existing booking with intake data
    await env.DB.prepare(`
      UPDATE bookings
      SET customer_name = ?, customer_phone = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(name.trim(), phone.trim(), notes, existing.id).run();

    return json({ ok: true, booking_id: existing.id, mode: 'updated' });
  }

  // Create new booking record (intake before webhook arrives, or no webhook configured)
  const bookingId = generateId();
  await env.DB.prepare(`
    INSERT INTO bookings
      (id, event_id, customer_name, customer_email, customer_phone, quantity, amount_cents, status, notes)
    VALUES (?, ?, ?, ?, ?, 1, 6500, 'pending', ?)
  `).bind(
    bookingId,
    event_id,
    name.trim(),
    email.toLowerCase().trim(),
    phone.trim(),
    notes
  ).run();

  return json({ ok: true, booking_id: bookingId, mode: 'created' });
}
