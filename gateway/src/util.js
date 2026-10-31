// Small shared helpers — no dependencies, runs on Workers and Node 20+.

export const MICRO = 1_000_000;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** OpenAI-style error body (most tools understand it; Anthropic clients read .error.message too). */
export function apiError(status, message, type = 'invalid_request_error', code = undefined) {
  return json({ error: { message, type, code: code ?? type } }, status);
}

export class HttpError extends Error {
  constructor(status, message, type = 'invalid_request_error') {
    super(message);
    this.status = status;
    this.type = type;
  }
}

export const now = () => Math.floor(Date.now() / 1000);

const enc = new TextEncoder();

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function randomToken(len = 32, alphabet = ALPHABET) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export const newApiKey = () => `sk-abd-${randomToken(40)}`;
export const newCouponCode = () =>
  `ABD-${randomToken(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}-${randomToken(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}-${randomToken(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}`;

// ── AES-GCM for provider keys at rest (ENCRYPTION_KEY secret, any string) ──
async function aesKey(secret) {
  if (!secret) throw new HttpError(500, 'ENCRYPTION_KEY secret is not configured', 'server_error');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptSecret(plain, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decryptSecret(blob, secret) {
  const [iv, ct] = blob.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secret), unb64(ct));
  return new TextDecoder().decode(pt);
}

/** Constant-time string compare (for the admin token). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ea = enc.encode(a), eb = enc.encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function bearer(request) {
  const h = request.headers.get('authorization') || '';
  if (/^bearer\s+/i.test(h)) return h.replace(/^bearer\s+/i, '').trim();
  return (request.headers.get('x-api-key') || '').trim() || null;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

export function toInt(v, def = 0) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
}

/** USD (float, as typed by a human) → micro-USD integer. */
export const usdToMicro = (usd) => Math.round(Number(usd || 0) * MICRO);
export const microToUsd = (m) => Number(m || 0) / MICRO;
