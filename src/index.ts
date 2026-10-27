export interface CheckResult {
    /** Canonical email: every alias of one inbox gives the same value. Store it in a unique column. */
    email: string
    /** `true` for temporary and throwaway mail domains. */
    disposable: boolean
    /** `false` when the address can never receive mail. */
    deliverable: boolean
}

export interface Usage {
    /** Plan whose limits apply now. */
    plan: 'free' | 'premium'
    /** `past_due`: Premium ended, grace period with Premium limits. `expired`: back to Free limits. */
    status: 'active' | 'past_due' | 'expired'
    /** Checks included per month. */
    quota: number
    /** Checks counted this month (UTC). */
    used: number
    /** Checks left this month. */
    remaining: number
    /** ISO date when the monthly quota resets (1st of next month, 00:00 UTC). */
    resetsAt: string
    /** ISO date when the paid Premium period ends, `null` if you never bought Premium. */
    premiumUntil: string | null
}

export type SafeCheckResult =
    | { status: 'checked'; result: CheckResult }
    | { status: 'invalid'; error: SignitizeError }
    | { status: 'unavailable'; error: SignitizeError }

export type SignitizeErrorType =
    | 'ValidationError'
    | 'AuthorizationError'
    | 'NotFoundError'
    | 'QuotaExceededError'
    | 'RateLimitError'
    | 'InternalServerError'
    | 'TimeoutError'
    | 'NetworkError'

export interface SignitizeOptions {
    /** Your API key. Defaults to the `SIGNITIZE_API_KEY` environment variable. */
    apiKey?: string
    /** Defaults to `https://api.signitize.io`. */
    baseUrl?: string
    /** Request timeout in milliseconds. Defaults to 5000. */
    timeoutMs?: number
    /** Custom `fetch` implementation. Defaults to the global `fetch`. */
    fetch?: typeof fetch
    /** Allow use in a browser. Your API key would be visible to everyone: don't. */
    dangerouslyAllowBrowser?: boolean
}

export class SignitizeError extends Error {
    /** HTTP status, or `0` when no response arrived (timeout or network error). */
    readonly status: number
    readonly type: SignitizeErrorType
    /** Seconds to wait before retrying, from the `Retry-After` header of a `429`. */
    readonly retryAfter: number | null
    /** The `x-request-id` header. Include it when you contact support. */
    readonly requestId: string | null

    constructor(
        message: string,
        details: { status: number; type: SignitizeErrorType; retryAfter?: number | null; requestId?: string | null; cause?: unknown }
    ) {
        super(message, { cause: details.cause })
        this.name = 'SignitizeError'
        this.status = details.status
        this.type = details.type
        this.retryAfter = details.retryAfter ?? null
        this.requestId = details.requestId ?? null
    }
}

const DEFAULT_BASE_URL = 'https://api.signitize.io'
const DEFAULT_TIMEOUT_MS = 5000
const API_ERROR_TYPES = new Set<string>([
    'ValidationError',
    'AuthorizationError',
    'NotFoundError',
    'QuotaExceededError',
    'RateLimitError',
    'InternalServerError',
])

function environmentApiKey(): string | undefined {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    return env?.SIGNITIZE_API_KEY
}

function isBrowser(): boolean {
    return typeof (globalThis as { window?: unknown }).window !== 'undefined' && typeof (globalThis as { document?: unknown }).document !== 'undefined'
}

async function readError(response: Response): Promise<{ type: SignitizeErrorType; message: string }> {
    const fallback = { type: (response.status >= 500 ? 'InternalServerError' : 'ValidationError') as SignitizeErrorType, message: `Signitize answered ${response.status}` }
    const body: unknown = await response.json().catch(() => null)
    if (typeof body !== 'object' || body === null || !('error' in body)) return fallback
    const error = (body as { error: unknown }).error
    if (typeof error !== 'object' || error === null) return fallback
    const { type, message } = error as { type?: unknown; message?: unknown }
    return {
        type: typeof type === 'string' && API_ERROR_TYPES.has(type) ? (type as SignitizeErrorType) : fallback.type,
        message: typeof message === 'string' ? message : fallback.message,
    }
}

export class Signitize {
    readonly #apiKey: string
    readonly #baseUrl: string
    readonly #timeoutMs: number
    readonly #fetch: typeof fetch

    constructor(options: SignitizeOptions = {}) {
        if (isBrowser() && !options.dangerouslyAllowBrowser) {
            throw new Error('Signitize must be called from your server: in a browser your API key would be visible to everyone.')
        }
        const apiKey = options.apiKey ?? environmentApiKey()
        if (!apiKey) {
            throw new Error('Missing API key: pass { apiKey } or set the SIGNITIZE_API_KEY environment variable.')
        }
        const fetchImplementation = options.fetch ?? globalThis.fetch
        if (typeof fetchImplementation !== 'function') {
            throw new Error('No fetch implementation found: use Node.js 20 or later, or pass { fetch }.')
        }
        this.#apiKey = apiKey
        this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
        this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
        this.#fetch = fetchImplementation
    }

    /**
     * Checks one email address. Throws a `SignitizeError` on any error, including
     * `400` (not an email address), timeouts and network errors.
     */
    check(email: string): Promise<CheckResult> {
        return this.#request<CheckResult>('POST', '/v1/check', { email })
    }

    /**
     * Returns your plan and this month's usage. Doesn't count toward your quota.
     * Limited to 10 calls a minute per key: to track usage continuously, read the
     * usage headers of your checks instead of polling.
     */
    usage(): Promise<Usage> {
        return this.#request<Usage>('GET', '/v1/usage')
    }

    async #request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
        const headers: Record<string, string> = { Authorization: `Bearer ${this.#apiKey}` }
        if (body !== undefined) headers['Content-Type'] = 'application/json'
        let response: Response
        try {
            response = await this.#fetch(`${this.#baseUrl}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(this.#timeoutMs),
            })
        } catch (cause) {
            const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
            throw new SignitizeError(timedOut ? `Signitize did not answer within ${this.#timeoutMs} ms` : 'Could not reach Signitize', {
                status: 0,
                type: timedOut ? 'TimeoutError' : 'NetworkError',
                cause,
            })
        }

        const requestId = response.headers.get('x-request-id')
        if (response.ok) return (await response.json()) as T

        const { type, message } = await readError(response)
        const retryAfter = Number(response.headers.get('retry-after'))
        throw new SignitizeError(message, {
            status: response.status,
            type,
            retryAfter: response.status === 429 && Number.isFinite(retryAfter) ? retryAfter : null,
            requestId,
        })
    }

    /**
     * Checks one email address for a signup form and never throws.
     *
     * - `checked`: use `result`.
     * - `invalid`: the value is not an email address. Ask the user to fix it.
     * - `unavailable`: Signitize could not answer (timeout, outage, quota, wrong key).
     *   Don't block the signup: create the account as pending and check it again later.
     */
    async safeCheck(email: string): Promise<SafeCheckResult> {
        try {
            return { status: 'checked', result: await this.check(email) }
        } catch (error) {
            const signitizeError =
                error instanceof SignitizeError ? error : new SignitizeError('Unexpected error', { status: 0, type: 'NetworkError', cause: error })
            if (signitizeError.status === 400 && signitizeError.type === 'ValidationError') {
                return { status: 'invalid', error: signitizeError }
            }
            return { status: 'unavailable', error: signitizeError }
        }
    }
}

export default Signitize
