'use server'

import { Signitize } from 'signitize'

let signitize: Signitize | undefined

// In-memory store for the example. Use your database, with a unique column on emailCanonical.
const users: { email: string; emailCanonical: string | null; emailCheck: 'passed' | 'pending' }[] = []

export type SignupState = { error?: string; message?: string }

export async function signup(_state: SignupState, formData: FormData): Promise<SignupState> {
    const typed = String(formData.get('email') ?? '').trim()
    signitize ??= new Signitize()
    const outcome = await signitize.safeCheck(typed)

    if (outcome.status === 'invalid') return { error: 'Enter a valid email address.' }

    if (outcome.status === 'checked') {
        const { email, disposable, deliverable } = outcome.result
        if (disposable) return { error: 'Please use a permanent email address.' }
        if (!deliverable) return { error: 'This email address cannot receive mail. Please check it for typos.' }
        if (users.some((user) => user.emailCanonical === email)) return { error: 'You already have an account.' }
        users.push({ email: typed, emailCanonical: email, emailCheck: 'passed' })
    } else {
        console.warn('Signitize unavailable, user created as pending:', outcome.error.type)
        users.push({ email: typed, emailCanonical: null, emailCheck: 'pending' })
    }

    // Send your verification email to `typed` here.
    return { message: `Check your inbox: we sent a link to ${typed}.` }
}
