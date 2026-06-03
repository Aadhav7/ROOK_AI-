import { config, requireMethod, sendJson } from './_shared.js';

export default function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  sendJson(res, 200, {
    ok: true,
    runtime: 'vercel-serverless',
    auth: 'supabase-otp',
    supabaseConfigured: Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY),
    databaseWritesConfigured: Boolean(config.SUPABASE_SERVICE_ROLE_KEY),
    generalChatConfigured: Boolean(config.GEMINI_API_KEY),
    imageGenerationConfigured: Boolean(config.GEMINI_API_KEY),
    documentChatConfigured: Boolean(config.ANYTHINGLLM_BASE_URL && config.ANYTHINGLLM_API_KEY),
    workspace: config.WORKSPACE_SLUG,
  });
}
