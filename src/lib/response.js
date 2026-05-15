const CORS_ORIGINS = [
  'https://alma-sonora.com',
  'https://www.alma-sonora.com',
];

export function corsHeaders(request) {
  const origin = request?.headers?.get('origin') ?? '';
  const allowedOrigin = CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
    'Access-Control-Max-Age': '86400',
  };
}

export function json(data, status = 200, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

export function notFound() {
  return json({ error: 'Not found' }, 404);
}

export function unauthorized() {
  return json({ error: 'Unauthorized' }, 401);
}
