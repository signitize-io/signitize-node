# Signitize for Node.js

Official Node.js client for [Signitize](https://www.signitize.io), the email check API for signup forms. One call tells you:

| Field         | Problem it solves                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `email`       | **One account per inbox.** Every alias (`J.O.H.N+promo@googlemail.com`) gives the same canonical email (`john@gmail.com`). |
| `disposable`  | **No throwaway signups.** `true` for temporary mail domains such as yopmail or mailinator, including new ones. |
| `deliverable` | **No mistyped or made-up addresses.** `false` when the address can never receive mail.         |

Zero dependencies. Works in Node.js 20+, Bun, Deno and edge runtimes with `fetch`.

## Install

```bash
npm install signitize
```

Get a free API key (2,500 checks a month, no card) at [signitize.io/pricing](https://www.signitize.io/pricing) and store it on your server:

```bash
SIGNITIZE_API_KEY=sk_live_...
```

## Usage

```js
import { Signitize } from 'signitize'

const signitize = new Signitize() // reads SIGNITIZE_API_KEY

const result = await signitize.check('J.O.H.N+promo@googlemail.com')
// { email: 'john@gmail.com', disposable: false, deliverable: true }
```

## In a signup form: `safeCheck`

Your signup must keep working when an email check can't run. `safeCheck` never throws, so a timeout or an outage never blocks a real user:

```js
const outcome = await signitize.safeCheck(req.body.email)

if (outcome.status === 'invalid') {
    return res.status(422).json({ error: 'Enter a valid email address.' })
}

if (outcome.status === 'checked') {
    const { email, disposable, deliverable } = outcome.result
    if (disposable) return res.status(422).json({ error: 'Please use a permanent email address.' })
    if (!deliverable) return res.status(422).json({ error: 'This email address cannot receive mail.' })
    if (await users.findByCanonicalEmail(email)) return res.status(409).json({ error: 'You already have an account.' })
    await users.create({ email: req.body.email, emailCanonical: email, emailCheck: 'passed' })
} else {
    // 'unavailable': timeout, outage, quota used up or wrong key. Don't block the user.
    console.warn('Signitize unavailable:', outcome.error.type)
    await users.create({ email: req.body.email, emailCanonical: null, emailCheck: 'pending' })
}
```

Store `email` in a **unique** column, and send your verification email to the address the user **typed**. Recheck `pending` users later and hold back free credits until they pass: see [Never block a signup](https://www.signitize.io/docs/handling-failures).

| `outcome.status` | Meaning                                                           | What to do                     |
| ---------------- | ----------------------------------------------------------------- | ------------------------------ |
| `checked`        | The address was checked                                           | Use `outcome.result`           |
| `invalid`        | The value is not an email address (`400`)                         | Ask the user to fix it         |
| `unavailable`    | Timeout, network error, outage, quota used up, wrong key          | Create the account as pending  |

## Options

```js
new Signitize({
    apiKey: 'sk_live_...', // default: process.env.SIGNITIZE_API_KEY
    timeoutMs: 5000, // default: 5000
    baseUrl: 'https://api.signitize.io', // default
    fetch: customFetch, // default: global fetch
})
```

The client refuses to run in a browser, where your key would be visible to everyone. Call Signitize from your backend.

## Errors

`check()` throws a `SignitizeError`:

```js
import { SignitizeError } from 'signitize'

try {
    await signitize.check(email)
} catch (error) {
    if (error instanceof SignitizeError) {
        error.status // HTTP status, or 0 for a timeout or network error
        error.type // 'ValidationError', 'AuthorizationError', 'QuotaExceededError', 'RateLimitError',
        //            'InternalServerError', 'NotFoundError', 'TimeoutError' or 'NetworkError'
        error.retryAfter // seconds, on 429
        error.requestId // include it when you contact support
    }
}
```

`QuotaExceededError` means the monthly quota is used up (it resets on the 1st, UTC); `RateLimitError` means too many requests this second. See [Errors](https://www.signitize.io/docs/errors).

## Examples

- [Express](examples/express)
- [Next.js](examples/nextjs)

Laravel, Django, Supabase, Firebase and Clerk: see the [integration guides](https://www.signitize.io/docs/integrations).

## Links

- [Documentation](https://www.signitize.io/docs)
- [How normalization works](https://www.signitize.io/docs/normalization)
- [How disposable detection works](https://www.signitize.io/docs/detection)
- [Pricing](https://www.signitize.io/pricing)
- Support: [support@signitize.io](mailto:support@signitize.io)

## License

MIT
