'use client'

import { useActionState } from 'react'

import { signup, type SignupState } from './actions'

export default function SignupPage() {
    const [state, action, pending] = useActionState<SignupState, FormData>(signup, {})

    return (
        <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
            <h1>Sign up</h1>
            <form action={action}>
                <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
                <button disabled={pending}>Sign up</button>
            </form>
            {state.error && <p role="alert">{state.error}</p>}
            {state.message && <p>{state.message}</p>}
        </main>
    )
}
