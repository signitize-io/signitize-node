import express from 'express'
import { Signitize } from 'signitize'

const signitize = new Signitize()
const app = express()

// In-memory store for the example. Use your database, with a unique column on emailCanonical.
const users = []

app.use(express.urlencoded({ extended: false }))
app.use(express.json())

app.get('/', (_req, res) => {
    res.type('html').send(`
        <form method="post" action="/signup">
            <input name="email" type="email" required placeholder="you@example.com">
            <button>Sign up</button>
        </form>`)
})

app.post('/signup', async (req, res) => {
    const typed = String(req.body.email ?? '').trim()
    const outcome = await signitize.safeCheck(typed)

    if (outcome.status === 'invalid') return res.status(422).json({ error: 'Enter a valid email address.' })

    if (outcome.status === 'checked') {
        const { email, disposable, deliverable } = outcome.result
        if (disposable) return res.status(422).json({ error: 'Please use a permanent email address.' })
        if (!deliverable) return res.status(422).json({ error: 'This email address cannot receive mail. Please check it for typos.' })
        if (users.some((user) => user.emailCanonical === email)) return res.status(409).json({ error: 'You already have an account.' })
        users.push({ email: typed, emailCanonical: email, emailCheck: 'passed' })
    } else {
        console.warn('Signitize unavailable, user created as pending:', outcome.error.type)
        users.push({ email: typed, emailCanonical: null, emailCheck: 'pending' })
    }

    // Send your verification email to `typed` here.
    res.status(201).json({ ok: true, emailCheck: users.at(-1).emailCheck })
})

app.listen(3000, () => console.log('Open http://localhost:3000'))
