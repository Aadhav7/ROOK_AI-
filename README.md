# Rook AI

Rook AI is a React + Vite AI chat app with Vercel serverless API routes. The deployed app uses `/api/*` functions for OTP verification, profile storage, Gemini chat, Gemini image generation, and optional AnythingLLM document chat.

## Local Development

Run the backend and frontend in two terminals:

```bash
npm run server
npm run dev
```

The frontend uses `/api` in production. During local development, Vite proxies `/api` to the local Node backend at `http://localhost:8787`.

## Vercel Deployment

Deploy the repo as a Vite app. `vercel.json` tells Vercel to:

- run `npm run build`
- publish `dist`
- run `api/**/*.js` as Node serverless functions
- rewrite non-API routes to `index.html`

Useful commands:

```bash
npm run build
npm run vercel:link
npm run vercel:env
npm run vercel:deploy
```

## Required Production Variables

Set these in the Vercel project settings:

```bash
SESSION_SECRET=long-random-production-secret
GEMINI_API_KEY=your-google-ai-api-key
GEMINI_TEXT_MODEL=gemini-1.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

For production OTP, also configure at least one delivery webhook:

```bash
EMAIL_WEBHOOK_URL=https://your-email-webhook.example.com/send
SMS_WEBHOOK_URL=https://your-sms-webhook.example.com/send
```

The email webhook receives `{ to, subject, text }`. The SMS webhook receives `{ to, text }`.

## MongoDB Storage

Vercel serverless functions do not keep process memory forever, so production verification should use MongoDB. Configure either the Atlas driver:

```bash
MONGODB_URI=mongodb+srv://...
MONGODB_DATABASE=rook_ai
MONGODB_USERS_COLLECTION=users
MONGODB_PROFILES_COLLECTION=profiles
MONGODB_OTP_COLLECTION=otp_events
MONGODB_EVENTS_COLLECTION=user_events
```

Or MongoDB Atlas Data API:

```bash
MONGODB_DATA_API_URL=https://data.mongodb-api.com/app/YOUR_APP_ID/endpoint/data/v1
MONGODB_DATA_API_KEY=your-data-api-key
MONGODB_DATA_SOURCE=Cluster0
```

Without MongoDB, OTP works only as a development fallback on warm function instances.

## Optional Document Chat

AnythingLLM must be reachable from Vercel. If it only runs on your laptop at `localhost:3001`, public users cannot use document chat until it is deployed or exposed securely.

```bash
ANYTHINGLLM_BASE_URL=https://your-anythingllm-host/api
ANYTHINGLLM_API_KEY=your-api-key
ANYTHINGLLM_WORKSPACE_SLUG=my-workspace
```

## Verification Notes

Rook AI now sends 6-digit codes from your own webhook instead of using third-party sign-in links. If a user clicks an old verification email, it may still point at a stale localhost callback, but new verification requests go through `/api/auth/request-otp` and `/api/auth/verify-otp` on Vercel.

Check the deployed API:

```bash
curl https://your-vercel-domain.vercel.app/api/health
```

The health response should show `auth: "rook-otp"` and `runtime: "vercel-serverless"`.

## Security Notes

Never commit `.env`, `.env.*.local`, API keys, or Vercel-pulled secrets. If a key was pasted into chat, screenshots, GitHub, or logs, rotate it and update the deployment secret.
