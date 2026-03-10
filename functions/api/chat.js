const DEFAULT_RATE_WINDOW_SEC = 60;
const DEFAULT_RATE_MAX = 30;
const MAX_BODY_BYTES = 20000;

function jsonResponse(body, status, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        }
    });
}

function getRequestOrigin(request) {
    const origin = request.headers.get('Origin');
    if (origin) return origin;
    try {
        return new URL(request.url).origin;
    } catch {
        return '';
    }
}

function buildCorsHeaders(request, env) {
    const origin = getRequestOrigin(request);
    const allowedOrigins = String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(o => o.trim())
        .filter(Boolean);

    let allowOrigin = '';
    if (allowedOrigins.length > 0) {
        if (origin && allowedOrigins.includes(origin)) {
            allowOrigin = origin;
        }
    } else if (origin) {
        const requestOrigin = new URL(request.url).origin;
        if (origin === requestOrigin) {
            allowOrigin = origin;
        }
    }

    const headers = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    };

    if (allowOrigin) {
        headers['Access-Control-Allow-Origin'] = allowOrigin;
        headers['Vary'] = 'Origin';
    }

    return headers;
}

function parseRateLimitConfig(env) {
    const windowSec = Number.parseInt(env.RATE_LIMIT_WINDOW_SEC || '', 10);
    const max = Number.parseInt(env.RATE_LIMIT_MAX || '', 10);
    return {
        windowSec: Number.isFinite(windowSec) && windowSec > 0 ? windowSec : DEFAULT_RATE_WINDOW_SEC,
        max: Number.isFinite(max) && max > 0 ? max : DEFAULT_RATE_MAX
    };
}

function getClientIp(request) {
    const cfIp = request.headers.get('CF-Connecting-IP');
    if (cfIp) return cfIp;
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return 'unknown';
}

async function enforceRateLimit(request, env) {
    if (!env.RATE_LIMIT_KV) return null;

    const { windowSec, max } = parseRateLimitConfig(env);
    const nowSec = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(nowSec / windowSec) * windowSec;
    const ip = getClientIp(request);
    const key = `rate:${ip}:${windowStart}`;

    const currentRaw = await env.RATE_LIMIT_KV.get(key);
    const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
    if (current >= max) {
        return { limited: true, windowSec, max };
    }

    await env.RATE_LIMIT_KV.put(key, String(current + 1), {
        expirationTtl: windowSec + 5
    });

    return { limited: false };
}

async function callGemini(contentParts, apiKey) {
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash'];
    let lastError = null;

    for (const model of models) {
        try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: contentParts }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 220,
                        topP: 0.9,
                        topK: 40
                    }
                })
            });

            if (response.ok) {
                return await response.json();
            }

            const errorBody = await response.json().catch(() => ({}));
            const errorText = JSON.stringify(errorBody || {});

            if (response.status === 404 || errorText.toLowerCase().includes('not found')) {
                lastError = new Error(`Model not available: ${model}`);
                continue;
            }

            const err = new Error(`Gemini API error ${response.status}`);
            err.status = response.status;
            throw err;
        } catch (err) {
            lastError = err;
            if (err.status && [400, 401, 403, 429].includes(err.status)) {
                throw err;
            }
        }
    }

    throw lastError || new Error('No available Gemini model found.');
}

export async function onRequest(context) {
    const { request, env } = context;
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'Request too large' }, 413, corsHeaders);
    }

    let bodyText = '';
    try {
        bodyText = await request.text();
    } catch {
        return jsonResponse({ error: 'Invalid request body' }, 400, corsHeaders);
    }

    if (bodyText.length > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'Request too large' }, 413, corsHeaders);
    }

    let payload;
    try {
        payload = JSON.parse(bodyText || '{}');
    } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
    }

    const contentParts = Array.isArray(payload.contentParts) ? payload.contentParts : null;
    if (!contentParts || !contentParts.every(p => p && typeof p.text === 'string')) {
        return jsonResponse({ error: 'Invalid contentParts' }, 400, corsHeaders);
    }

    if (!env.GEMINI_API_KEY) {
        return jsonResponse({ error: 'AI service not configured' }, 500, corsHeaders);
    }

    const rate = await enforceRateLimit(request, env);
    if (rate && rate.limited) {
        return jsonResponse({ error: 'Too many requests' }, 429, corsHeaders);
    }

    try {
        const data = await callGemini(contentParts, env.GEMINI_API_KEY);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!text) {
            return jsonResponse({ error: 'No response received' }, 502, corsHeaders);
        }
        return jsonResponse({ text }, 200, corsHeaders);
    } catch (err) {
        const status = err?.status || 500;
        const message = status === 429 ? 'Too many requests' : 'AI service not configured or temporarily unavailable';
        return jsonResponse({ error: message }, status, corsHeaders);
    }
}
