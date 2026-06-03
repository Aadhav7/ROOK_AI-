const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const ANYTHINGLLM_BASE_URL = (process.env.ANYTHINGLLM_BASE_URL || '').replace(/\/$/, '');
const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY || '';
const WORKSPACE_SLUG = process.env.ANYTHINGLLM_WORKSPACE_SLUG || 'my-workspace';

export const config = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  GEMINI_API_KEY,
  GEMINI_TEXT_MODEL,
  GEMINI_IMAGE_MODEL,
  ANYTHINGLLM_BASE_URL,
  ANYTHINGLLM_API_KEY,
  WORKSPACE_SLUG,
};

export function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true;
  sendJson(res, 405, { error: `Method ${req.method} is not allowed.` });
  return false;
}

export function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

export function supabaseHeaders({ service = false, token = '' } = {}) {
  const key = service ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: token ? `Bearer ${token}` : `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export function assertSupabaseConfigured({ service = false } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.');
  }
  if (service && !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role key is missing. Add SUPABASE_SERVICE_ROLE_KEY in Vercel for database writes.');
  }
}

export async function supabaseFetch(path, init = {}, { service = false, token = '' } = {}) {
  assertSupabaseConfigured({ service });
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...supabaseHeaders({ service, token }),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    throw new Error(data.error_description || data.msg || data.message || `Supabase returned ${response.status}`);
  }
  return data;
}

export async function getSessionUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const user = await supabaseFetch('/auth/v1/user', { method: 'GET' }, { token });
  return { token, user };
}

export async function requireSession(req, res) {
  const session = await getSessionUser(req);
  if (!session?.user?.id) {
    sendJson(res, 401, { error: 'Please sign in before using Rook AI.' });
    return null;
  }
  return session;
}

export async function upsertProfile(userId, profile = {}) {
  assertSupabaseConfigured({ service: true });
  const cleanProfile = {
    id: userId,
    name: String(profile.name || '').trim().slice(0, 80),
    age: String(profile.age || '').trim().slice(0, 20),
    role: String(profile.role || '').trim().slice(0, 80),
    goal: String(profile.goal || '').trim().slice(0, 180),
    updated_at: new Date().toISOString(),
  };
  await supabaseFetch('/rest/v1/profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(cleanProfile),
  }, { service: true });
  return cleanProfile;
}

export async function getProfile(userId) {
  assertSupabaseConfigured({ service: true });
  const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
    method: 'GET',
  }, { service: true });
  return rows[0] || null;
}

export async function saveChatMessage({ userId, role, mode, content, provider, imageUrl }) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  await supabaseFetch('/rest/v1/chat_messages', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      role,
      mode,
      content,
      provider,
      image_url: imageUrl,
      created_at: new Date().toISOString(),
    }),
  }, { service: true });
}

export function buildPersonaPrompt(message, profile = {}, mode = 'general') {
  const name = profile?.name || 'friend';
  const role = profile?.role ? ` They are a ${profile.role}.` : '';
  const age = profile?.age ? ` Age: ${profile.age}.` : '';
  const goal = profile?.goal ? ` Their goal is: ${profile.goal}.` : '';
  return [
    'You are Rook AI, a warm, friendly AI chat assistant.',
    'Be clear, useful, natural, and concise. Use the user name only when it feels right.',
    'For normal questions, answer from broad general knowledge. For document mode, use uploaded workspace context when available.',
    `User profile: name=${name}.${role}${age}${goal}`,
    `Current mode: ${mode}.`,
    `User message: ${message}`,
  ].join('\n');
}

export async function generateGeminiText(message, profile, mode = 'general') {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini is not configured. Add GEMINI_API_KEY in Vercel.');
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPersonaPrompt(message, profile, mode) }] }],
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini returned ${response.status}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join('\n').trim();
  if (!text) throw new Error('Gemini did not return an answer.');
  return { text, provider: GEMINI_TEXT_MODEL };
}

export async function proxyAnythingLLM(message, profile) {
  if (!ANYTHINGLLM_BASE_URL || !ANYTHINGLLM_API_KEY) {
    throw new Error('AnythingLLM is not configured for document chat.');
  }
  const response = await fetch(`${ANYTHINGLLM_BASE_URL}/v1/workspace/${WORKSPACE_SLUG}/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANYTHINGLLM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: buildPersonaPrompt(message, profile, 'documents'),
      mode: 'query',
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `AnythingLLM returned ${response.status}`);
  }
  return {
    text: data.textResponse || data.response || data.message || 'No answer returned by AnythingLLM.',
    provider: 'anythingllm',
    raw: data,
  };
}
