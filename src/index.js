/**
 * Alma Sonora — Booking Worker
 * Cloudflare Worker + D1
 *
 * Routes:
 *   GET  /health                       → status check
 *   GET  /api/events                   → list active events + availability
 *   GET  /api/events/:id               → single event detail
 *   POST /api/intake                   → public intake form submission
 *   POST /webhooks/square              → Square payment webhook (HMAC-verified)
 *   GET  /api/admin/bookings           → list bookings (requires ADMIN_SECRET header)
 *   GET  /api/admin/bookings/:eventId  → bookings for one event
 */

import { handleSquareWebhook } from './handlers/squareWebhook.js';
import { handleAdminBookings } from './handlers/admin.js';
import { getEvents, getEventById } from './handlers/events.js';
import { handleIntake } from './handlers/intake.js';
import { corsHeaders, json, notFound, unauthorized } from './lib/response.js';

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ── Public routes ──────────────────────────────────────────
      if (path === '/health') {
        return json({ ok: true, ts: new Date().toISOString() });
      }

      if (path === '/api/events' && request.method === 'GET') {
        return getEvents(request, env);
      }

      const eventMatch = path.match(/^\/api\/events\/([^/]+)$/);
      if (eventMatch && request.method === 'GET') {
        return getEventById(request, env, eventMatch[1]);
      }

      // ── Intake form submission ─────────────────────────────────
      if (path === '/api/intake' && request.method === 'POST') {
        return handleIntake(request, env);
      }

      // ── Square webhook ─────────────────────────────────────────
      if (path === '/webhooks/square' && request.method === 'POST') {
        return handleSquareWebhook(request, env, ctx);
      }

      // ── Admin routes (require ADMIN_SECRET header) ─────────────
      if (path.startsWith('/api/admin/')) {
        const secret = request.headers.get('x-admin-secret');
        if (!secret || secret !== env.ADMIN_SECRET) {
          return unauthorized();
        }

        const bookingsMatch = path.match(/^\/api\/admin\/bookings\/([^/]+)$/);
        if (bookingsMatch) {
          return handleAdminBookings(request, env, bookingsMatch[1]);
        }
        if (path === '/api/admin/bookings') {
          return handleAdminBookings(request, env, null);
        }
      }

      return notFound();
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};
