import { readJsonBody, requireMethod, requireSession, sendJson, upsertProfile } from './_shared.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const session = await requireSession(req, res);
    if (!session) return;
    const profile = await readJsonBody(req);
    const savedProfile = await upsertProfile(session.user.id, profile);
    sendJson(res, 200, { profile: savedProfile });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Could not save profile.' });
  }
}
