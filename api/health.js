import { config, requireMethod, sendJson } from './_shared.js';

export default function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;
  sendJson(res, 200, {
    ok: true,
    runtime: 'vercel-serverless',
    auth: 'rook-otp',
    emailOtpConfigured: Boolean(config.EMAIL_WEBHOOK_URL),
    smsOtpConfigured: Boolean(config.SMS_WEBHOOK_URL),
    databaseConfigured: Boolean(config.MONGODB_URI || (config.DATA_API_URL && config.DATA_API_KEY)),
    generalChatConfigured: Boolean(config.GEMINI_API_KEY),
    imageGenerationConfigured: Boolean(config.GEMINI_API_KEY),
    documentChatConfigured: Boolean(config.ANYTHINGLLM_BASE_URL && config.ANYTHINGLLM_API_KEY),
    workspace: config.WORKSPACE_SLUG,
  });
}
