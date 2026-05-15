// Neon Postgres connection helper (Vercel serverless)
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.warn('[DB] DATABASE_URL is not set in environment');
}

export const sql = neon(process.env.DATABASE_URL || '');

// Apply CORS headers (for local dev / preview deployments)
export function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Send error response with consistent shape
export function sendError(res, status, message, err) {
  console.error(`[API ${status}]`, message, err || '');
  res.status(status).json({
    ok: false,
    error: message,
    detail: err && err.message ? err.message : undefined,
  });
}

// Default workspace id (multi-tenant support reserved)
export const DEFAULT_WORKSPACE = 'default';
