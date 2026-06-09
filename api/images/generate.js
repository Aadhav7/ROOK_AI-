import {
  config,
  getProfile,
  readJsonBody,
  requireMethod,
  requireSession,
  saveChatMessage,
  sendJson,
} from '../_shared.js';

function parseDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const session = await requireSession(req, res);
    if (!session) return;
    const { prompt, referenceImage, profile: clientProfile = {} } = await readJsonBody(req);

    if (!prompt || typeof prompt !== 'string') {
      sendJson(res, 400, { error: 'Image prompt is required.' });
      return;
    }
    if (!config.GEMINI_API_KEY) {
      sendJson(res, 500, { error: 'Gemini image generation is not configured. Add GEMINI_API_KEY in Vercel.' });
      return;
    }

    const profile = await getProfile(session.user.id).catch(() => null) || clientProfile || {};
    const parsedImage = parseDataUrl(referenceImage);
    const parts = [
      {
        text: [
          'Create a polished, useful AI-generated visual for this Rook AI chat user.',
          'Support image, graph, chart, diagram, map, flowchart, mind map, timeline, architecture, infographic, labeled example, and sample-image requests.',
          'When the user asks for data visuals, render readable labels, legends, axes, and hierarchy. When exact data is missing, make a clearly illustrative sample.',
          'Keep the output professional, high contrast, cleanly composed, and easy to study.',
          profile.role ? `User role: ${profile.role}.` : '',
          `Prompt: ${prompt}`,
        ].filter(Boolean).join('\n'),
      },
    ];
    if (parsedImage) {
      parts.unshift({ inlineData: parsedImage });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.GEMINI_IMAGE_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini image generation returned ${response.status}`);
    }

    const responseParts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = responseParts.find(part => part.inlineData || part.inline_data);
    const inlineData = imagePart?.inlineData || imagePart?.inline_data;
    if (!inlineData?.data) {
      throw new Error('Gemini did not return an image.');
    }

    const imageUrl = `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`;
    await saveChatMessage({
      userId: session.user.id,
      role: 'assistant',
      mode: 'image',
      content: `Generated image for: ${prompt}`,
      provider: config.GEMINI_IMAGE_MODEL,
      imageUrl,
    });

    sendJson(res, 200, {
      imageUrl,
      text: 'Visual generated successfully.',
      model: config.GEMINI_IMAGE_MODEL,
    });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Image generation failed.' });
  }
}
