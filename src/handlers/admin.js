import { json } from '../lib/response.js';

export async function handleAdminBookings(request, env, eventId) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status'); // optional filter

  let query, params;

  if (eventId) {
    query = `
      SELECT b.*, e.title AS event_title, e.date AS event_date
      FROM bookings b
      JOIN events e ON e.id = b.event_id
      WHERE b.event_id = ?
      ${status ? 'AND b.status = ?' : ''}
      ORDER BY b.created_at DESC
    `;
    params = status ? [eventId, status] : [eventId];
  } else {
    query = `
      SELECT b.*, e.title AS event_title, e.date AS event_date
      FROM bookings b
      JOIN events e ON e.id = b.event_id
      ${status ? 'WHERE b.status = ?' : ''}
      ORDER BY b.created_at DESC
    `;
    params = status ? [status] : [];
  }

  const stmt = env.DB.prepare(query);
  const rows = await (params.length ? stmt.bind(...params) : stmt).all();

  // Capacity summary per event
  const summary = await env.DB.prepare(`
    SELECT
      e.id,
      e.title,
      e.date,
      e.capacity,
      COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) AS confirmed_count,
      SUM(CASE WHEN b.status = 'confirmed' THEN b.quantity ELSE 0 END) AS confirmed_spots,
      COUNT(CASE WHEN b.status = 'pending' THEN 1 END) AS pending_count
    FROM events e
    LEFT JOIN bookings b ON b.event_id = e.id
    WHERE e.active = 1
    GROUP BY e.id
    ORDER BY e.date ASC
  `).all();

  return json({
    bookings: rows.results,
    summary: summary.results,
  });
}
