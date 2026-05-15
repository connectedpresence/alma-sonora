import { json, notFound } from '../lib/response.js';

export async function getEvents(request, env) {
  const rows = await env.DB.prepare(`
    SELECT
      e.id,
      e.title,
      e.date,
      e.time,
      e.location,
      e.capacity,
      e.price_cents,
      e.currency,
      e.capacity - COALESCE(SUM(CASE WHEN b.status IN ('confirmed','pending') THEN b.quantity ELSE 0 END), 0) AS spots_remaining
    FROM events e
    LEFT JOIN bookings b ON b.event_id = e.id
    WHERE e.active = 1
    GROUP BY e.id
    ORDER BY e.date ASC
  `).all();

  return json({ events: rows.results });
}

export async function getEventById(request, env, eventId) {
  const row = await env.DB.prepare(`
    SELECT
      e.id,
      e.title,
      e.date,
      e.time,
      e.location,
      e.capacity,
      e.price_cents,
      e.currency,
      e.capacity - COALESCE(SUM(CASE WHEN b.status IN ('confirmed','pending') THEN b.quantity ELSE 0 END), 0) AS spots_remaining
    FROM events e
    LEFT JOIN bookings b ON b.event_id = e.id
    WHERE e.id = ? AND e.active = 1
    GROUP BY e.id
  `).bind(eventId).first();

  if (!row) return notFound();
  return json({ event: row });
}
