# Signitize + Next.js

A Next.js (App Router) signup form whose Server Action rejects disposable, undeliverable and duplicate emails, and keeps working when the check is unavailable. The API key never reaches the browser.

```bash
npm install
echo "SIGNITIZE_API_KEY=sk_live_..." > .env.local
npm run dev
```

Open http://localhost:3000 and try `J.O.H.N+promo@googlemail.com`, then `john@gmail.com` (duplicate) and `abc@yopmail.com` (disposable).

The check is in [`app/actions.ts`](app/actions.ts).

[Get a free API key](https://www.signitize.io/pricing) · [Next.js guide](https://www.signitize.io/docs/integrations/nextjs)
