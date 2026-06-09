# Rook AI

Rook AI is a React + Vite AI chat site. It now supports a Vercel cloud API with Supabase OTP auth, Supabase database tables for profiles/chat logs, Gemini text chat, Gemini image generation, and optional AnythingLLM document chat.

## Local Development

Run the backend and frontend in two terminals:

```bash
npm run server
npm run dev
```

The frontend uses `/api` in production. During local development, Vite proxies `/api` to the Node backend at `http://localhost:8787`.

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase/schema.sql`.
3. Enable Email OTP in Supabase Auth. SMS OTP needs a Supabase-supported SMS provider or a webhook connected to a CPaaS provider.
4. Add these variables in Vercel:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-google-ai-api-key
GEMINI_TEXT_MODEL=gemini-1.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Do not expose it with a `VITE_` prefix.

### Vercel Supabase Integration

If you connected Supabase from the Vercel dashboard, Vercel can inject the Supabase variables automatically. The app accepts both direct names like `SUPABASE_URL`/`SUPABASE_ANON_KEY` and integration names like `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Run these after installing or using the Vercel CLI:

```bash
npx vercel login
npx vercel link
npx vercel env pull .env.development.local
```

Or use the package scripts:

```bash
npm run vercel:link
npm run vercel:env
```

The pulled `.env.development.local` file is ignored by git. For deployed OTP to work, confirm the Vercel project has `SUPABASE_URL`, `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the Production environment, then redeploy.

If your Supabase/Vercel integration uses newer key names, `SUPABASE_PUBLISHABLE_KEY` can replace `SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEY` can replace `SUPABASE_SERVICE_ROLE_KEY`. Keep service-role/secret keys server-only; do not create `NEXT_PUBLIC_` versions of secret keys.

## OTP, Gmail, MongoDB, and Local Backend

Copy `.env.example` to `.env` on your deployment platform and fill the values.

- On Vercel, `/api/auth/request-otp` and `/api/auth/verify-otp` use Supabase Auth.
- Without `EMAIL_WEBHOOK_URL`, OTP codes are printed in the backend terminal for development.
- To use Gmail, connect `EMAIL_WEBHOOK_URL` to a small email service or serverless function that sends mail through Gmail SMTP or Gmail API.
- For SMS OTP, use a reliable CPaaS provider such as Twilio Verify, Vonage Verify, MessageBird/Bird, Sinch, Plivo, or AWS SNS. Point `SMS_WEBHOOK_URL` at your provider wrapper so the backend can post `{ to, text }`.
- To capture login records and user activity in MongoDB, enable MongoDB Atlas Data API and fill `MONGODB_DATA_API_URL` plus `MONGODB_DATA_API_KEY`.
- After login, users get free entry to the chat workspace. The app asks for name, age, role, and goal, then stores that profile locally and, when MongoDB is configured, in the `profiles` collection.

## Chat And Images

Rook AI has two chat modes and a configurable AI brain order:

- **General** uses `AI_BRAIN_PRIORITY`, which defaults to Ollama first, then Gemini, then AnythingLLM, then local fallback.
- **Docs** uses AnythingLLM `query` mode when `ANYTHINGLLM_BASE_URL` and `ANYTHINGLLM_API_KEY` are configured. If AnythingLLM is not reachable, the backend falls back to Ollama with a document-mode prompt.
- The sidebar is reserved for private chat search, chat history, folders, pins, and Nano Banana visual shortcuts.

Ollama defaults:

```bash
AI_BRAIN_PRIORITY=ollama,gemini,anythingllm,local
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_GENERAL_MODEL=qwen2.5:0.5b
OLLAMA_DOCUMENT_MODEL=qwen2.5:0.5b
```

For stronger local reasoning, install a larger Ollama model and update the model variables, for example `llama3.1:8b`, `qwen2.5:7b`, or another model your machine can run smoothly.

Image generation is available through Gemini image generation, also known as Nano Banana. Set these variables:

```bash
GEMINI_API_KEY=your-google-ai-api-key
GEMINI_TEXT_MODEL=gemini-1.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

For Nano Banana Pro, use:

```bash
GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
```

## Deployment

For Vercel, deploy the repo as a Vite app. Vercel will build the frontend and serve the files in `api/` as serverless functions.

Build locally before deploying:

```bash
npm run build
```

For a custom Node host, build the web app, then start the Node server:

```bash
npm run build
npm start
```

After `npm run build`, `app.js` serves the compiled frontend from `dist` and the API from the same deployed server. Set these optional document-chat variables on the host:

```bash
PORT=8787
ANYTHINGLLM_BASE_URL=https://your-anythingllm-host/api
ANYTHINGLLM_API_KEY=your-api-key
ANYTHINGLLM_WORKSPACE_SLUG=my-workspace
APP_ORIGIN=https://your-site.example
```

AnythingLLM must be reachable from the deployed backend. If AnythingLLM only runs on your laptop at `localhost:3001`, public users cannot use document chat until AnythingLLM is deployed or exposed securely.

## Security Notes

Never commit `.env`; it is already ignored by `.gitignore`. If an API key is pasted into chat, screenshots, GitHub, or logs, treat it as compromised: rotate it in Google AI Studio, restrict it by API/application where possible, and update the deployment secret.

## Current Cloud Limits

The Vercel cloud API provides auth, profile storage, chat storage, Gemini chat, and image generation. File upload currently returns a setup message until you connect a deployed document ingestion/vector service such as public AnythingLLM, Supabase Storage plus embeddings, or another RAG backend.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
