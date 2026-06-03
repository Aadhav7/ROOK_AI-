import {
  generateGeminiText,
  getProfile,
  proxyAnythingLLM,
  readJsonBody,
  requireMethod,
  requireSession,
  saveChatMessage,
  sendJson,
} from './_shared.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const session = await requireSession(req, res);
    if (!session) return;
    const { message, mode = 'general', profile: clientProfile = {} } = await readJsonBody(req);

    if (!message || typeof message !== 'string') {
      sendJson(res, 400, { error: 'Message is required.' });
      return;
    }

    const savedProfile = await getProfile(session.user.id).catch(() => null);
    const profile = savedProfile || clientProfile || {};
    await saveChatMessage({ userId: session.user.id, role: 'user', mode, content: message });

    const answer = mode === 'documents'
      ? await proxyAnythingLLM(message, profile).catch(() => generateGeminiText(message, profile, 'general'))
      : await generateGeminiText(message, profile, 'general');

    await saveChatMessage({
      userId: session.user.id,
      role: 'assistant',
      mode,
      content: answer.text,
      provider: answer.provider,
    });

    sendJson(res, 200, {
      text: answer.text,
      provider: answer.provider,
      raw: answer.raw,
    });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'The cloud chat engine could not answer.' });
  }
}
