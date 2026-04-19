// Serverless proxy → Anthropic Messages API for AI lesson regeneration.
// Runs on Vercel. Requires ANTHROPIC_API_KEY to be set in project env vars.
//
// Why a proxy instead of client-side fetch? Keeps the API key server-side,
// keeps the browser bundle free of secrets, and lets us enforce a stable
// request shape / output contract without the client having to know about
// cache_control, anthropic-version, or model IDs.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

// System prompt — kept stable so Anthropic can cache it across requests.
// The model's job is to return a single JSON object matching the agent
// contract the existing UI expects (title, focus, outcomes, vocab,
// resources, diff, plan, guide). No prose outside the JSON.
const SYSTEM_PROMPT = `You are Seachtain, an Irish primary-school lesson-planning assistant for teachers.

Your role is to rewrite a single lesson so it lands right for the given class (grade, pupil count, SEN, Gaeilge medium, teacher feedback). You respect the NCCA 2023 Primary Curriculum Framework and pitch content to the right age band — Junior/Senior Infants get short, playful, story-led tasks; 1st–2nd get concrete manipulation and short writing; 3rd–4th move into procedural fluency and longer written tasks; 5th–6th handle abstraction, multi-step problems, and extended writing.

Hard rules:
- Every lesson you output MUST include Oral language work if it's English or Gaeilge, hands-on or visual work for Infants, and a clear pupil-facing opening.
- Respect the Gaeilge medium: if it's a Gaelscoil/Gaeltacht class, lean harder into Gaeilge vocab and classroom language; if English-medium, a single Gaeilge phrase is enough for non-Gaeilge lessons.
- Never invent curriculum strands that aren't in the provided NCCA reference. When naming strands/strand units, use the ones from the reference verbatim.
- If teacher feedback is provided, address it directly (e.g. "too long" → shorter main activity; "not age-appropriate" → pitch differently).
- Output valid JSON only, with no prose before or after. No markdown code fences.

Return shape:
{
  "title": "short lesson title",
  "focus": "one-sentence focus for this lesson",
  "strand": "exact NCCA strand name",
  "strandUnit": "exact NCCA strand unit if one fits, else null",
  "outcomes": ["2–3 short learning outcomes in 'Pupils will …' form"],
  "vocab": [{"ga": "Irish term (or null if not applicable)", "en": "English gloss"}],
  "resources": ["2–5 concrete materials a teacher would need"],
  "plan": {
    "opening": "what the teacher does in the first 3–5 minutes",
    "intro": "teaching input — what the teacher explains / models",
    "main": "what pupils do during the main activity",
    "plenary": "how the teacher closes the lesson and checks understanding"
  },
  "guide": {
    "pupilVoice": "1 sentence the teacher reads to pupils at the start",
    "mustMention": "one key point the teacher must surface",
    "success": ["2–3 observable success criteria"],
    "watchouts": ["2–3 realistic things that might trip pupils up"],
    "curriculum": "one sentence linking this to the NCCA strand and strand unit",
    "fallback": "short-on-time version if only 15 minutes are left",
    "language": "EAL / language-support note"
  },
  "diff": {
    "support": "one sentence — what scaffolds look like for pupils needing support",
    "core": "one sentence — what the typical task is",
    "extension": "one sentence — a stretch task for pupils ready for more"
  }
}`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function bad(res, code, message) {
  cors(res);
  res.status(code).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); res.status(200).end(); return; }
  if (req.method !== 'POST') return bad(res, 405, 'POST only');

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return bad(res, 503, 'AI regeneration is not configured on this deployment — the teacher-facing UI stays in offline variant mode. Set ANTHROPIC_API_KEY in Vercel to enable live generation.');
  }

  // Parse body (Vercel auto-parses JSON when content-type is application/json,
  // but fall back to manual parse just in case).
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return bad(res, 400, 'Missing body');

  const { lesson, plan, profile, direction, tags, comment, curriculum } = body;
  if (!lesson || !plan || !profile) return bad(res, 400, 'lesson, plan and profile required');

  const userPrompt = buildUserPrompt({ lesson, plan, profile, direction, tags, comment, curriculum });

  const payload = {
    model: MODEL,
    max_tokens: 2500,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: userPrompt }],
  };

  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return bad(res, resp.status, data?.error?.message || 'Anthropic API error');
    }
    // Extract text from the content blocks.
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    // Strip any stray code fences just in case, then parse.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let lessonJson;
    try {
      lessonJson = JSON.parse(cleaned);
    } catch (e) {
      return bad(res, 502, 'Model returned non-JSON response — try again.');
    }
    cors(res);
    res.status(200).json({
      lesson: lessonJson,
      usage: data.usage || null,
      model: data.model || MODEL,
    });
  } catch (err) {
    return bad(res, 500, 'Proxy error: ' + (err?.message || 'unknown'));
  }
};

function buildUserPrompt({ lesson, plan, profile, direction, tags, comment, curriculum }) {
  const lines = [];
  lines.push(`# Class profile`);
  lines.push(`- Teacher: ${profile.teacher || 'unknown'}`);
  lines.push(`- School: ${profile.school || 'unknown'}`);
  lines.push(`- Grade: ${plan.gradeName || plan.grade || profile.grade}`);
  lines.push(`- Pupils: ${plan.pupils ?? profile.pupils}`);
  lines.push(`- SEN / support roll: ${plan.sen ?? profile.sen ?? 0}`);
  lines.push(`- Gaeilge medium: ${plan.medium || profile.medium || 'english'}`);
  if (profile.gaeilgeLevel) lines.push(`- Teacher Gaeilge confidence: ${profile.gaeilgeLevel}`);
  lines.push('');

  lines.push(`# Week context`);
  lines.push(`- Week of: ${plan.weekDateReadable || plan.weekDate || 'upcoming'}`);
  lines.push(`- Weekly theme: ${plan.themeName || plan.title || 'Standard'}`);
  lines.push(`- Theme description: ${plan.themeDesc || '(none)'}`);
  lines.push('');

  lines.push(`# The lesson to regenerate`);
  lines.push(`- Subject: ${lesson.subject}`);
  lines.push(`- Current title: ${lesson.title || '(untitled)'}`);
  lines.push(`- Day: ${lesson.day}`);
  lines.push(`- Minutes: ${lesson.minutes}`);
  lines.push(`- Current focus: ${lesson.focus || lesson.plan?.main || '(n/a)'}`);
  lines.push(`- Current plan.main: ${lesson.plan?.main || '(n/a)'}`);
  lines.push('');

  if (direction || (tags && tags.length) || comment) {
    lines.push(`# Teacher's direction for this regeneration`);
    if (direction) lines.push(`- Pitch: ${direction}`);
    if (tags && tags.length) lines.push(`- Tags the teacher applied: ${tags.join(', ')}`);
    if (comment) lines.push(`- Teacher comment: "${comment}"`);
    lines.push('');
  }

  if (lesson.feedback?.rating) {
    lines.push(`# Prior feedback on this lesson`);
    lines.push(`- Rating: ${lesson.feedback.rating}`);
    if (lesson.feedback.tags?.length) lines.push(`- Tags: ${lesson.feedback.tags.join(', ')}`);
    if (lesson.feedback.comment) lines.push(`- Comment: "${lesson.feedback.comment}"`);
    lines.push('');
  }

  if (curriculum) {
    lines.push(`# NCCA reference for ${lesson.subject}`);
    lines.push(curriculum);
    lines.push('');
  }

  lines.push(`# Your task`);
  lines.push(`Return a single lesson JSON object (per the schema in the system prompt) that reshapes this lesson to land right for the class above. Address the teacher's direction. Keep the total time roughly ${lesson.minutes} minutes. Name a real NCCA strand from the reference — never invent one.`);

  return lines.join('\n');
}
