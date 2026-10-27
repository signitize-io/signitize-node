# Signitize + Express

A signup form that rejects disposable, undeliverable and duplicate emails, and keeps working when the check is unavailable.

```bash
npm install
echo "SIGNITIZE_API_KEY=sk_live_..." > .env
npm start
```

Open http://localhost:3000 and try `J.O.H.N+promo@googlemail.com`, then `john@gmail.com` (duplicate) and `abc@yopmail.com` (disposable).

[Get a free API key](https://www.signitize.io/pricing) · [Express guide](https://www.signitize.io/docs/integrations/express)
