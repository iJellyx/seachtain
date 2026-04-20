// Serverless proxy -> Anthropic Messages API for AI parent-note rewriting.
// Takes the current note + the week's lessons + tone preferences, returns
// a polished parent-friendly note that sounds like the teacher wrote it.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are Seachtain, writing a weekly parent note on behalf of an Irish primary-school teacher.

Hard rules:
- Sound like the teacher — warm, specific, grounded in what actually happened this week. Never generic.
- Keep Irish educational idiom (Aladdin, Classroom, school tour, lá spóirt, múinteoir) where it fits.
- Don't over-promise pupil outcomes; use "the class" collectively, never pick out individual children.
- If a Gaeilge phrase is requested, include one short Gaeilge phrase with an English gloss.
- Include only sections the teacher asked for (homework, dates, how-to-help, praise line).
- Plain text only — no markdown, no headers with #. Short line breaks between sections are fine.
- Length target: "short" ~100 words, "full" ~200 words, "bilingual" ~220 words with a brief "As Gaeilge" opener then "In English" body.
- Sign off with the teacher's salutation + name. No digital signature markers.
- Output plain text only — no JSON, no code fences, no explanations.`;

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
  if (!key) return bad(res, 503, 'ANTHROPIC_API_KEY not set on this deployment.');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return bad(res, 400, 'Missing body');

  const { plan, profile, lessonsSummary, homeworkSummary, mode, toggles, currentDraft } = body;
  if (!plan || !profile) return bad(res, 400, 'plan and profile required');

  const userPrompt = buildUserPrompt({ plan, profile, lessonsSummary, homeworkSummary, mode, toggles, currentDraft });

  const payload = {
    model: MODEL,
    max_tokens: 1200,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
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
    if (!resp.ok) return bad(res, resp.status, data?.error?.message || 'Anthropic API error');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    cors(res);
    res.status(200).json({ note: text, usage: data.usage || null, model: data.model || MODEL });
  } catch (err) {
    return bad(res, 500, 'Proxy error: ' + (err?.message || 'unknown'));
  }
};

function buildUserPrompt({ plan, profile, lessonsSummary, homeworkSummary, mode, toggles, currentDraft }) {
  const lines = [];
  lines.push(`# Teacher`);
  lines.push(`- Name: ${profile.teacher || 'class teacher'}`);
  lines.push(`- Salutation: ${profile.salutation || 'Múinteoir'}`);
  lines.push(`- School: ${profile.school || ''}`);
  lines.push('');
  lines.push(`# Class`);
  lines.push(`- Grade: ${plan.gradeName || plan.grade}`);
  lines.push(`- Pupils: ${plan.pupils}`);
  lines.push(`- Medium: ${plan.medium || 'english'}`);
  lines.push('');
  lines.push(`# This week`);
  lines.push(`- Theme: ${plan.themeName || plan.title || 'Standard'}`);
  lines.push(`- Week of: ${plan.weekDateReadable || plan.weekDate || ''}`);
  lines.push('');
  if (lessonsSummary) {
    lines.push(`# Lessons taught this week`);
    lines.push(lessonsSummary);
    lines.push('');
  }
  if (homeworkSummary && toggles?.homework) {
    lines.push(`# Homework attached to lessons this week`);
    lines.push(homeworkSummary);
    lines.push('');
    lines.push(`When the homework toggle is on, reference the actual homework above — days it's set, what pupils will do, parent-facing notes where useful. Don't just say "daily maths practice" if there's real homework to mention.`);
    lines.push('');
  }
  lines.push(`# Tone / length`);
  lines.push(`- Mode: ${mode || 'short'}`);
  lines.push(`- Include Gaeilge phrase: ${toggles?.gaeilge ? 'yes' : 'no'}`);
  lines.push(`- Include homework: ${toggles?.homework ? 'yes' : 'no'}`);
  lines.push(`- Include upcoming dates: ${toggles?.dates ? 'yes' : 'no'}`);
  lines.push(`- Include how-to-help-at-home: ${toggles?.help ? 'yes' : 'no'}`);
  lines.push(`- Include praise line: ${toggles?.praise ? 'yes' : 'no'}`);
  lines.push('');
  if (currentDraft) {
    lines.push(`# Current auto-generated draft (rewrite this, don't just tweak)`);
    lines.push(currentDraft);
    lines.push('');
  }
  lines.push(`# Your task`);
  lines.push(`Write the parent note in plain text. Tight, warm, specific. No headers, no markdown. Sign off from the teacher.`);
  return lines.join('\n');
}
