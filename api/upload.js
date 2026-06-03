import { requireMethod, requireSession, sendJson } from './_shared.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  const session = await requireSession(req, res);
  if (!session) return;

  sendJson(res, 501, {
    error: 'Cloud uploads need a deployed document store/vector service. Chat is ready now; connect AnythingLLM or Supabase Storage ingestion before enabling uploads.',
  });
}
