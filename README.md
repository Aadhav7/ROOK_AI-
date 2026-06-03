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
3. Enable Email OTP in Supabase Auth. SMS OTP needs a Supabase-supported SMS provider.
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

## OTP, Gmail, MongoDB, and Local Backend

Copy `.env.example` to `.env` on your deployment platform and fill the values.

- On Vercel, `/api/auth/request-otp` and `/api/auth/verify-otp` use Supabase Auth.
- Without `EMAIL_WEBHOOK_URL`, OTP codes are printed in the backend terminal for development.
- To use Gmail, connect `EMAIL_WEBHOOK_URL` to a small email service or serverless function that sends mail through Gmail SMTP or Gmail API.
- To capture login records and user activity in MongoDB, enable MongoDB Atlas Data API and fill `MONGODB_DATA_API_URL` plus `MONGODB_DATA_API_KEY`.
- After login, users get free entry to the chat workspace. The app asks for name, age, role, and goal, then stores that profile locally and, when MongoDB is configured, in the `profiles` collection.

## Chat And Images

Rook AI has two chat modes:

- **General** uses Gemini through the Vercel `/api/chat` route.
- **Docs** uses AnythingLLM `query` mode when `ANYTHINGLLM_BASE_URL` and `ANYTHINGLLM_API_KEY` are configured. If AnythingLLM is not configured, the cloud API falls back to Gemini general chat.

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
