// Serverless proxy -> Anthropic Messages API for AI whole-week generation.
// Runs on Vercel. Requires ANTHROPIC_API_KEY env var.
//
// Takes: class profile, week context (grade, pupils, medium, theme, week date),
//        the timetable skeleton (non-break slots with minutes + the subject
//        already allocated by the balancer), plus a condensed NCCA reference
//        block for every subject in use.
// Returns: { lessons: [{ slotKey, ...lessonFields }, ...] } — one lesson per
//        (day, slotIdx, subject) allocation. Client merges into plan.lessons.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are Seachtain, an Irish primary-school lesson-planning assistant for teachers.

Your role: given a teacher's class profile, the weekly theme, and a fully-balanced timetable skeleton (which subjects land in which slots), generate a coherent week of lessons that thread the theme through every subject while respecting the NCCA 2023 Primary Curriculum Framework.

Hard rules:
- Every lesson must be pitched to the given grade band. Infants get short, playful, story- or play-led tasks; 1st-2nd get concrete manipulation and short writing; 3rd-4th get procedural fluency and paragraph writing; 5th-6th handle abstraction, multi-step problems, and extended writing.
- Respect Gaeilge medium: Gaelscoil/Gaeltacht classes lean hard into Gaeilge across subjects; English-medium classes use a Gaeilge phrase-of-the-week in non-Gaeilge lessons.
- Name real NCCA strands verbatim from the reference. Never invent strands.
- Thread the weekly theme through every subject - if the theme is "Ireland Week" and the slot is Maths, the word problems should be about Irish landmarks or GAA or local data; if the slot is Gaeilge, the vocab is Irish-themed; etc.
- Vary across the week - don't repeat the same activity format in two slots of the same subject.
- Keep each lesson's total time roughly equal to the slot minutes shown.
- Output valid JSON only. No prose, no markdown fences.

Return shape (EXACTLY):
{
  "lessons": [
    {
      "slotKey": "Monday|0",  // exact day and slotIdx from the input skeleton
      "title": "short lesson title",
      "focus": "one-sentence focus",
      "strand": "exact NCCA strand name",
      "strandUnit": "exact strand unit or null",
      "outcomes": ["2-3 short outcomes in 'Pupils will ...' form"],
      "vocab": [{"ga": "Irish term or null", "en": "English gloss"}],
      "resources": ["2-5 concrete materials"],
      "plan": {
        "opening": "first 3-5 min",
        "intro": "teaching input",
        "main": "pupil activity",
        "plenary": "close and check"
      },
      "guide": {
        "pupilVoice": "one sentence teacher reads to pupils",
        "mustMention": "one key point",
        "success": ["2-3 observable criteria"],
        "watchouts": ["2-3 realistic trip-ups"],
        "curriculum": "one sentence linking to strand",
        "fallback": "15-min-only version",
        "language": "EAL / language-support note"
      },
      "diff": {
        "support": "one sentence",
        "core": "one sentence",
        "extension": "one sentence"
      }
    }
    // ... one entry per slot in the input skeleton
  ]
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
  if (!key) return bad(res, 503, 'ANTHROPIC_API_KEY not set on this deployment.');

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return bad(res, 400, 'Missing body');

  const { plan, profile, skeleton, curriculum } = body;
  if (!plan || !profile || !Array.isArray(skeleton) || !skeleton.length) {
    return bad(res, 400, 'plan, profile and skeleton[] required');
  }
  if (skeleton.length > 30) return bad(res, 400, 'skeleton too large (>30 slots)');

  const userPrompt = buildUserPrompt({ plan, profile, skeleton, curriculum });

  const payload = {
    model: MODEL,
    max_tokens: 8000,
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
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    let weekJson;
    try { weekJson = JSON.parse(cleaned); }
    catch (e) { return bad(res, 502, 'Model returned non-JSON - try again.'); }
    if (!Array.isArray(weekJson.lessons)) return bad(res, 502, 'Model response missing lessons[].');
    cors(res);
    res.status(200).json({
      lessons: weekJson.lessons,
      usage: data.usage || null,
      model: data.model || MODEL,
    });
  } catch (err) {
    return bad(res, 500, 'Proxy error: ' + (err?.message || 'unknown'));
  }
};

function buildUserPrompt({ plan, profile, skeleton, curriculum }) {
  const lines = [];
  lines.push(`# Class profile`);
  lines.push(`- Teacher: ${profile.teacher || '(unknown)'}`);
  lines.push(`- School: ${profile.school || '(unknown)'}`);
  lines.push(`- Grade: ${plan.gradeName || plan.grade || profile.grade}`);
  lines.push(`- Pupils: ${plan.pupils ?? profile.pupils}`);
  lines.push(`- SEN / support: ${plan.sen ?? profile.sen ?? 0}`);
  lines.push(`- Gaeilge medium: ${plan.medium || profile.medium || 'english'}`);
  if (profile.gaeilgeLevel) lines.push(`- Teacher Gaeilge confidence: ${profile.gaeilgeLevel}`);
  lines.push('');

  lines.push(`# Week context`);
  lines.push(`- Week of: ${plan.weekDateReadable || plan.weekDate || 'upcoming'}`);
  lines.push(`- Weekly theme: ${plan.themeName || plan.title || 'Standard'}`);
  if (plan.themeDesc) lines.push(`- Theme description: ${plan.themeDesc}`);
  lines.push('');

  lines.push(`# Timetable skeleton (one lesson required per line)`);
  skeleton.forEach(s => {
    lines.push(`- slotKey="${s.day}|${s.slotIdx}" · subject=${s.subject} · minutes=${s.minutes}${s.fixed ? ' · fixed slot' : ''}${s.time ? ' · ' + s.time : ''}`);
  });
  lines.push('');

  if (curriculum) {
    lines.push(`# NCCA reference`);
    lines.push(curriculum);
    lines.push('');
  }

  lines.push(`# Your task`);
  lines.push(`Produce one lesson JSON object for every skeleton line above. The slotKey in each lesson must match exactly. Thread "${plan.themeName || 'the theme'}" through every subject where it fits naturally. Pitch to the class profile. Return the full JSON object with lessons[] and nothing else.`);

  return lines.join('\n');
}
