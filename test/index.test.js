import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Signitize, SignitizeError } from '../dist/index.js'

function fakeFetch(status, body, headers = {}) {
    const calls = []
    const fetch = async (url, init) => {
        calls.push({ url, init })
        return new Response(body === undefined ? null : JSON.stringify(body), { status, headers })
    }
    return { fetch, calls }
}

test('check sends the key and email and returns the result', async () => {
    const result = { email: 'john@gmail.com', disposable: false, deliverable: true }
    const { fetch, calls } = fakeFetch(200, result)
    const signitize = new Signitize({ apiKey: 'sk_live_test', fetch })

    assert.deepEqual(await signitize.check('J.O.H.N+x@googlemail.com'), result)
    assert.equal(calls[0].url, 'https://api.signitize.io/v1/check')
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_live_test')
    assert.equal(calls[0].init.body, JSON.stringify({ email: 'J.O.H.N+x@googlemail.com' }))
})

test('usage sends a GET with the key and returns the usage', async () => {
    const usage = {
        plan: 'premium',
        status: 'active',
        quota: 100000,
        used: 1234,
        remaining: 98766,
        resetsAt: '2026-11-01T00:00:00.000Z',
        premiumUntil: '2027-01-15T10:00:00.000Z',
    }
    const { fetch, calls } = fakeFetch(200, usage)

    assert.deepEqual(await new Signitize({ apiKey: 'sk_live_test', fetch }).usage(), usage)
    assert.equal(calls[0].url, 'https://api.signitize.io/v1/usage')
    assert.equal(calls[0].init.method, 'GET')
    assert.equal(calls[0].init.headers.Authorization, 'Bearer sk_live_test')
    assert.equal(calls[0].init.body, undefined)
    assert.equal(calls[0].init.headers['Content-Type'], undefined)
})

test('usage rate limit becomes a RateLimitError with retryAfter', async () => {
    const { fetch } = fakeFetch(429, { error: { type: 'RateLimitError', message: 'Too many usage requests.' } }, { 'retry-after': '42' })
    const error = await new Signitize({ apiKey: 'k', fetch }).usage().catch((e) => e)
    assert.ok(error instanceof SignitizeError)
    assert.equal(error.type, 'RateLimitError')
    assert.equal(error.retryAfter, 42)
})

test('baseUrl trailing slashes are removed', async () => {
    const { fetch, calls } = fakeFetch(200, { email: 'a@b.co', disposable: false, deliverable: true })
    await new Signitize({ apiKey: 'k', baseUrl: 'http://localhost:5000/', fetch }).check('a@b.co')
    assert.equal(calls[0].url, 'http://localhost:5000/v1/check')
})

test('API errors become SignitizeError with type, retryAfter and requestId', async () => {
    const { fetch } = fakeFetch(
        429,
        { error: { type: 'QuotaExceededError', message: 'Monthly quota reached.' } },
        { 'retry-after': '3600', 'x-request-id': 'req-1' }
    )
    const error = await new Signitize({ apiKey: 'k', fetch }).check('a@b.co').catch((e) => e)

    assert.ok(error instanceof SignitizeError)
    assert.equal(error.status, 429)
    assert.equal(error.type, 'QuotaExceededError')
    assert.equal(error.message, 'Monthly quota reached.')
    assert.equal(error.retryAfter, 3600)
    assert.equal(error.requestId, 'req-1')
})

test('a non-JSON error body falls back to a generic error', async () => {
    const fetch = async () => new Response('<html>Bad gateway</html>', { status: 502 })
    const error = await new Signitize({ apiKey: 'k', fetch }).check('a@b.co').catch((e) => e)
    assert.equal(error.type, 'InternalServerError')
    assert.equal(error.status, 502)
})

test('safeCheck maps 400 to invalid', async () => {
    const { fetch } = fakeFetch(400, { error: { type: 'ValidationError', message: 'Invalid email' } })
    const outcome = await new Signitize({ apiKey: 'k', fetch }).safeCheck('nope')
    assert.equal(outcome.status, 'invalid')
})

test('safeCheck maps 5xx, 401 and 429 to unavailable', async () => {
    for (const status of [401, 429, 503]) {
        const { fetch } = fakeFetch(status, { error: { type: 'InternalServerError', message: 'x' } })
        const outcome = await new Signitize({ apiKey: 'k', fetch }).safeCheck('a@b.co')
        assert.equal(outcome.status, 'unavailable', String(status))
    }
})

test('safeCheck maps network errors and timeouts to unavailable', async () => {
    const failing = async () => {
        throw new TypeError('fetch failed')
    }
    const network = await new Signitize({ apiKey: 'k', fetch: failing }).safeCheck('a@b.co')
    assert.equal(network.status, 'unavailable')
    assert.equal(network.error.type, 'NetworkError')

    const hanging = (_url, init) =>
        new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
    const timeout = await new Signitize({ apiKey: 'k', fetch: hanging, timeoutMs: 10 }).safeCheck('a@b.co')
    assert.equal(timeout.status, 'unavailable')
    assert.equal(timeout.error.type, 'TimeoutError')
})

test('the API key is required', () => {
    const saved = process.env.SIGNITIZE_API_KEY
    delete process.env.SIGNITIZE_API_KEY
    assert.throws(() => new Signitize(), /Missing API key/)
    process.env.SIGNITIZE_API_KEY = 'from-env'
    assert.doesNotThrow(() => new Signitize())
    if (saved === undefined) delete process.env.SIGNITIZE_API_KEY
    else process.env.SIGNITIZE_API_KEY = saved
})

test('browsers are refused unless explicitly allowed', () => {
    globalThis.window = {}
    globalThis.document = {}
    try {
        assert.throws(() => new Signitize({ apiKey: 'k' }), /from your server/)
        assert.doesNotThrow(() => new Signitize({ apiKey: 'k', dangerouslyAllowBrowser: true }))
    } finally {
        delete globalThis.window
        delete globalThis.document
    }
})
