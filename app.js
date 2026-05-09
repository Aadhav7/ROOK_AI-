import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';

const PORT = Number(process.env.PORT || 8787);
const ANYTHINGLLM_BASE_URL = (process.env.ANYTHINGLLM_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY || '7ZCNN63-MD44TTE-K3QJJYW-0NJVHYE';
const WORKSPACE_SLUG = process.env.ANYTHINGLLM_WORKSPACE_SLUG || 'my-workspace';
const APP_ORIGIN = process.env.APP_ORIGIN || '*';
const DATA_API_URL = process.env.MONGODB_DATA_API_URL;
const DATA_API_KEY = process.env.MONGODB_DATA_API_KEY;
const DATA_SOURCE = process.env.MONGODB_DATA_SOURCE || 'Cluster0';
const DATABASE = process.env.MONGODB_DATABASE || 'rook_ai';
const USERS_COLLECTION = process.env.MONGODB_USERS_COLLECTION || 'users';
const PROFILES_COLLECTION = process.env.MONGODB_PROFILES_COLLECTION || 'profiles';
const OTP_COLLECTION = process.env.MONGODB_OTP_COLLECTION || 'otp_events';
const EVENTS_COLLECTION = process.env.MONGODB_EVENTS_COLLECTION || 'user_events';
const EMAIL_WEBHOOK_URL = process.env.EMAIL_WEBHOOK_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_GENERAL_MODEL = process.env.OLLAMA_GENERAL_MODEL || 'qwen2.5:0.5b';
const DIST_DIR = resolve('dist');
const STATE_FILE = resolve('.rook-ai-state.json');

const otpStore = new Map();
const sessionStore = new Map();
const profileStore = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function loadState() {
  try {
    const state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    for (const [token, session] of Object.entries(state.sessions || {})) {
      if (session.expiresAt > Date.now()) sessionStore.set(token, session);
    }
    for (const [email, profile] of Object.entries(state.profiles || {})) {
      profileStore.set(email, profile);
    }
  } catch {
    // First run: no state file yet.
  }
}

async function saveState() {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify({
    sessions: Object.fromEntries(sessionStore),
    profiles: Object.fromEntries(profileStore),
  }, null, 2));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function getSession(req) {
  const token = getBearerToken(req);
  const session = sessionStore.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (token) sessionStore.delete(token);
    void saveState();
    return null;
  }

  return session;
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Please verify your email before using Rook AI.' });
  }
  return session;
}

async function mongoAction(action, collection, document) {
  if (!DATA_API_URL || !DATA_API_KEY) return null;

  const response = await fetch(`${DATA_API_URL.replace(/\/$/, '')}/action/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': DATA_API_KEY,
    },
    body: JSON.stringify({
      dataSource: DATA_SOURCE,
      database: DATABASE,
      collection,
      document,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MongoDB Data API failed: ${text}`);
  }

  return response.json();
}

async function saveUserLogin(email) {
  const document = {
    email,
    verifiedAt: new Date().toISOString(),
    provider: 'email-otp',
  };

  await mongoAction('insertOne', USERS_COLLECTION, document);
  return document;
}

async function saveUserEvent(email, type, details = {}) {
  await mongoAction('insertOne', EVENTS_COLLECTION, {
    email,
    type,
    details,
    createdAt: new Date().toISOString(),
  });
}

async function saveUserProfile(email, profile) {
  const cleanProfile = {
    name: String(profile.name || '').trim().slice(0, 80),
    age: String(profile.age || '').trim().slice(0, 20),
    role: String(profile.role || '').trim().slice(0, 80),
    goal: String(profile.goal || '').trim().slice(0, 180),
  };

  profileStore.set(email, cleanProfile);
  await saveState();
  await mongoAction('insertOne', PROFILES_COLLECTION, {
    email,
    ...cleanProfile,
    updatedAt: new Date().toISOString(),
  });
  return cleanProfile;
}

async function sendOtpEmail(email, otp) {
  if (EMAIL_WEBHOOK_URL) {
    await fetch(EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'Your Rook AI verification code',
        text: `Your Rook AI verification code is ${otp}. It expires in 10 minutes.`,
      }),
    });
    return;
  }

  console.log(`Rook AI OTP for ${email}: ${otp}`);
}

async function proxyAnythingLLM(path, init) {
  const response = await fetch(`${ANYTHINGLLM_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ANYTHINGLLM_API_KEY}`,
      ...init.headers,
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const message = data.error || data.message || `AnythingLLM returned ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function generateGeminiImage({ prompt, referenceImage }) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini image generation is not configured. Add GEMINI_API_KEY to your environment.');
  }

  const parts = [{ text: prompt }];
  const parsedImage = parseDataUrl(referenceImage);
  if (parsedImage) {
    parts.unshift({
      inlineData: {
        mimeType: parsedImage.mimeType,
        data: parsedImage.data,
      },
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['Image'],
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini image generation returned ${response.status}`);
  }

  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = responseParts.find(part => part.inlineData || part.inline_data);
  const textPart = responseParts.find(part => part.text);
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;

  if (!inlineData?.data) {
    throw new Error(textPart?.text || 'Gemini did not return an image.');
  }

  return {
    imageUrl: `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`,
    text: textPart?.text || 'Image generated successfully.',
    model: GEMINI_IMAGE_MODEL,
  };
}

function getProfileName(profile, fallbackEmail) {
  return profile?.name || fallbackEmail.split('@')[0] || 'friend';
}

function buildPersonaPrompt(message, profile, mode) {
  const name = getProfileName(profile, 'friend@example.com');
  const role = profile?.role ? ` They are a ${profile.role}.` : '';
  const age = profile?.age ? ` Age: ${profile.age}.` : '';
  const goal = profile?.goal ? ` Their goal is: ${profile.goal}.` : '';

  return [
    'You are Rook AI, a warm, humanoid, friendly AI companion.',
    'Talk naturally, use the user name when it feels right, and use a few helpful emojis.',
    'If you make a mistake or need to correct yourself, say casual things like "sorry", "oh I forgot", or "my bad".',
    'Answer from general knowledge for random questions. Do not limit yourself to uploaded documents unless the user asks document-specific questions.',
    'Be concise, clear, supportive, and useful.',
    `User profile: name=${name}.${role}${age}${goal}`,
    `Current mode: ${mode}.`,
    `User message: ${message}`,
  ].join('\n');
}

function localFriendlyReply(message, profile) {
  const name = getProfileName(profile, 'friend@example.com');
  const normalized = message.trim().toLowerCase();

  if (/^(hi|hello|hey|yo|sup)\b/.test(normalized)) {
    return `Hey ${name}! 😊 I'm here with you. You can ask me random questions, study questions, or upload files and I’ll help from those too.`;
  }

  if (normalized.includes('who are you')) {
    return `I’m Rook AI, ${name} — your study and creative chat assistant 😊 I can chat normally, help with uploaded docs, and generate images once the Gemini key is connected.`;
  }

  return `Sorry ${name}, my bad 😅 I can chat with you, but the main AI engine is not responding right now. Please check AnythingLLM or add GEMINI_API_KEY for stronger general answers.`;
}

async function generateGeminiText(message, profile) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini text chat is not configured.');
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
        contents: [{ parts: [{ text: buildPersonaPrompt(message, profile, 'general') }] }],
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini text chat returned ${response.status}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join('\n').trim();
  if (!text) throw new Error('Gemini did not return a text answer.');
  return text;
}

async function generateOllamaText(message, profile) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_GENERAL_MODEL,
      stream: false,
      messages: [
        {
          role: 'system',
          content: buildPersonaPrompt('', profile, 'general'),
        },
        {
          role: 'user',
          content: message,
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Ollama returned ${response.status}`);
  }

  const text = data.message?.content || data.response;
  if (!text) throw new Error('Ollama did not return a text answer.');
  return text;
}

async function answerGeneralQuestion(message, session, clientProfile) {
  const profile = clientProfile || profileStore.get(session.email) || {};
  if (/^(hi|hello|hey|yo|sup)\b/i.test(message.trim())) {
    return {
      text: localFriendlyReply(message, profile),
      provider: 'local-friendly-greeting',
    };
  }

  if (GEMINI_API_KEY) {
    return {
      text: await generateGeminiText(message, profile),
      provider: GEMINI_TEXT_MODEL,
    };
  }

  try {
    return {
      text: await generateOllamaText(message, profile),
      provider: OLLAMA_GENERAL_MODEL,
    };
  } catch {
    // Fall through to AnythingLLM when a standalone Ollama server is not available.
  }

  try {
    const data = await proxyAnythingLLM(`/v1/workspace/${WORKSPACE_SLUG}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: buildPersonaPrompt(message, profile, 'general'),
        mode: 'chat',
      }),
    });

    return {
      text: data.textResponse || data.response || data.message || localFriendlyReply(message, profile),
      provider: 'anythingllm-chat',
      raw: data,
    };
  } catch {
    return {
      text: localFriendlyReply(message, profile),
      provider: 'local-friendly-fallback',
    };
  }
}

async function serveStatic(req, res) {
  if (!existsSync(DIST_DIR)) {
    sendJson(res, 404, { error: 'Build the frontend first with npm run build.' });
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requestedPath = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const resolvedPath = resolve(join(DIST_DIR, requestedPath));

  if (!resolvedPath.startsWith(DIST_DIR)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }

  let filePath = resolvedPath;
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(DIST_DIR, 'index.html');
  }

  const contentType = mimeTypes[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        anythingllmBaseUrl: ANYTHINGLLM_BASE_URL,
        workspace: WORKSPACE_SLUG,
        hasApiKey: Boolean(ANYTHINGLLM_API_KEY),
        auth: 'email-otp',
        mongoConfigured: Boolean(DATA_API_URL && DATA_API_KEY),
        emailConfigured: Boolean(EMAIL_WEBHOOK_URL),
        generalChatConfigured: true,
        imageGenerationConfigured: Boolean(GEMINI_API_KEY),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/auth/request-otp') {
      const rawBody = await readBody(req);
      const { email } = JSON.parse(rawBody.toString('utf8') || '{}');
      const normalizedEmail = String(email || '').trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        sendJson(res, 400, { error: 'Enter a valid email address.' });
        return;
      }

      const otp = String(randomInt(100000, 999999));
      const otpHash = hash(otp);
      const expiresAt = Date.now() + 10 * 60 * 1000;

      otpStore.set(normalizedEmail, { otpHash, expiresAt, attempts: 0 });
      await mongoAction('insertOne', OTP_COLLECTION, {
        email: normalizedEmail,
        otpHash,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
      });
      await sendOtpEmail(normalizedEmail, otp);

      sendJson(res, 200, {
        message: EMAIL_WEBHOOK_URL
          ? 'Verification code sent to your email.'
          : 'Verification code generated. Check the backend terminal while email is not configured.',
        devOtp: EMAIL_WEBHOOK_URL ? undefined : otp,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/auth/verify-otp') {
      const rawBody = await readBody(req);
      const { email, otp } = JSON.parse(rawBody.toString('utf8') || '{}');
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const record = otpStore.get(normalizedEmail);

      if (!record || record.expiresAt < Date.now()) {
        otpStore.delete(normalizedEmail);
        sendJson(res, 400, { error: 'The verification code expired. Request a new one.' });
        return;
      }

      record.attempts += 1;
      if (record.attempts > 5) {
        otpStore.delete(normalizedEmail);
        sendJson(res, 429, { error: 'Too many attempts. Request a new code.' });
        return;
      }

      if (record.otpHash !== hash(String(otp || '').trim())) {
        sendJson(res, 400, { error: 'Incorrect verification code.' });
        return;
      }

      otpStore.delete(normalizedEmail);
      await saveUserLogin(normalizedEmail);

      const token = randomBytes(32).toString('hex');
      sessionStore.set(token, {
        email: normalizedEmail,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      await saveState();

      sendJson(res, 200, { token, user: { email: normalizedEmail } });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/auth/me') {
      const session = getSession(req);
      sendJson(res, session ? 200 : 401, session ? { user: { email: session.email }, profile: profileStore.get(session.email) || null } : { error: 'Not signed in.' });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/profile') {
      const session = requireSession(req, res);
      if (!session) return;

      const rawBody = await readBody(req);
      const profile = JSON.parse(rawBody.toString('utf8') || '{}');
      const savedProfile = await saveUserProfile(session.email, profile);
      await saveUserEvent(session.email, 'profile_completed', savedProfile);

      sendJson(res, 200, { profile: savedProfile });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
      const session = requireSession(req, res);
      if (!session) return;

      const rawBody = await readBody(req);
      const { message, mode = 'documents', profile } = JSON.parse(rawBody.toString('utf8') || '{}');

      if (!message || typeof message !== 'string') {
        sendJson(res, 400, { error: 'Message is required.' });
        return;
      }

      if (mode === 'general') {
        const answer = await answerGeneralQuestion(message, session, profile);
        await saveUserEvent(session.email, 'chat_message', {
          mode,
          provider: answer.provider,
          messageLength: message.length,
        });

        sendJson(res, 200, {
          text: answer.text,
          provider: answer.provider,
          raw: answer.raw,
        });
        return;
      }

      const data = await proxyAnythingLLM(`/v1/workspace/${WORKSPACE_SLUG}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: buildPersonaPrompt(message, profileStore.get(session.email) || profile || {}, 'documents'),
          mode: 'query',
        }),
      });

      await saveUserEvent(session.email, 'chat_message', {
        mode,
        messageLength: message.length,
      });

      sendJson(res, 200, {
        text: data.textResponse || data.response || data.message || 'No answer returned by AnythingLLM.',
        raw: data,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/upload') {
      const session = requireSession(req, res);
      if (!session) return;

      const contentType = req.headers['content-type'];

      if (!contentType?.includes('multipart/form-data')) {
        sendJson(res, 400, { error: 'Upload must be sent as multipart/form-data.' });
        return;
      }

      const rawBody = await readBody(req);
      const data = await proxyAnythingLLM('/v1/document/upload', {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: rawBody,
      });

      await saveUserEvent(session.email, 'file_upload', {
        contentType,
        byteLength: rawBody.length,
      });

      sendJson(res, 200, { message: 'Document uploaded and queued for embedding.', raw: data });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/images/generate') {
      const session = requireSession(req, res);
      if (!session) return;

      const rawBody = await readBody(req);
      const { prompt, referenceImage } = JSON.parse(rawBody.toString('utf8') || '{}');

      if (!prompt || typeof prompt !== 'string') {
        sendJson(res, 400, { error: 'Image prompt is required.' });
        return;
      }

      const image = await generateGeminiImage({ prompt, referenceImage });
      await saveUserEvent(session.email, 'image_generation', {
        promptLength: prompt.length,
        hasReferenceImage: Boolean(referenceImage),
        model: image.model,
      });

      sendJson(res, 200, image);
      return;
    }

    if (req.method === 'GET') {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 404, { error: 'Route not found.' });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unexpected backend error.',
    });
  }
});

await loadState();

server.listen(PORT, async () => {
  const builtFiles = existsSync(DIST_DIR) ? await readdir(DIST_DIR).catch(() => []) : [];
  console.log(`Rook AI backend listening on http://localhost:${PORT}`);
  console.log(`Proxying AnythingLLM workspace "${WORKSPACE_SLUG}" at ${ANYTHINGLLM_BASE_URL}`);
  console.log(DATA_API_URL && DATA_API_KEY ? 'MongoDB Data API is configured.' : 'MongoDB Data API is not configured; login records stay in the running process.');
  console.log(EMAIL_WEBHOOK_URL ? 'Email webhook is configured.' : 'Email webhook is not configured; OTP codes print in this terminal.');
  console.log(`General chat tries Gemini, then Ollama at ${OLLAMA_BASE_URL}, then AnythingLLM, then a friendly fallback.`);
  console.log(GEMINI_API_KEY ? `Gemini image generation is configured with ${GEMINI_IMAGE_MODEL}.` : 'Gemini image generation is not configured; set GEMINI_API_KEY to enable images.');
  console.log(builtFiles.length ? 'Serving built frontend from dist.' : 'Run npm run build before production deploy.');
});
