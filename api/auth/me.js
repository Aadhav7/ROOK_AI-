import { getProfile, requireMethod, sendJson, getSessionUser } from '../_shared.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  try {
    const session = await getSessionUser(req);
    if (!session?.user?.id) {
      sendJson(res, 401, { error: 'Not signed in.' });
      return;
    }
    const profile = await getProfile(session.user.id);
    sendJson(res, 200, {
      user: {
        userId: session.user.id,
        email: session.user.email,
        phone: session.user.phone,
      },
      profile,
    });
  } catch (error) {
    sendJson(res, 401, { error: error instanceof Error ? error.message : 'Not signed in.' });
  }
}
