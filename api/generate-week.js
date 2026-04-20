// Serverless proxy -> Anthropic Messages API for AI whole-week generation.
// Runs on Vercel. Requires ANTHROPIC_API_KEY env var.
//
// Uses tool_use for guaranteed structured output. The model must call
// return_week with an array of lessons, one per (day, slotIdx) in the
// skeleton — no free-form JSON parsing required.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are a lesson-planning companion for Irish primary-school teachers.

Given a teacher's class profile, the weekly theme, and a fully-balanced timetable skeleton (which subjects land in which slots), produce a coherent week of lessons that thread the theme through every subject while respecting the NCCA 2023 Primary Curriculum Framework.

Priority: if a skeleton slot carries a "teacherDirection" field, that is the teacher's specific request for that lesson and is the TOP priority — build that lesson around it exactly. Other priorities: grade-band pitch, Gaeilge medium, NCCA strand grounding, weekly theme, variation across the week.

Hard rules:
- Every lesson is pitched to the given grade band. Infants get short, playful, story- or play-led tasks; 1st–2nd get concrete manipulation and short writing; 3rd–4th get procedural fluency and paragraph writing; 5th–6th handle abstraction, multi-step problems, and extended writing.
- Respect Gaeilge medium: Gaelscoil/Gaeltacht classes lean hard into Gaeilge across subjects; English-medium classes use a Gaeilge phrase-of-the-week in non-Gaeilge lessons.
- Name real NCCA strands verbatim from the reference. Never invent strands.
- Thread the weekly theme through every subject where it fits naturally — if the theme is "Ireland Week" and the slot is Maths, word problems should be about Irish landmarks or GAA or local data; if the slot is Gaeilge, vocab is Irish-themed.
- Vary across the week — don't repeat the same activity format in two slots of the same subject.
- Total time per lesson should match the slot minutes shown.
- Honour every teacherDirection verbatim. If a Maths slot says teacherDirection="Focus on long division", the lesson is about long division. Do not substitute a related topic.
- Call the return_week tool. Do not write prose outside the tool call.`;

// Sub-schema for a single lesson — reused inside the week tool below.
const LESSON_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    slotKey:    { type: 'string', description: 'Exact "Day|slotIdx" from the skeleton' },
    title:      { type: 'string' },
    focus:      { type: 'string' },
    strand:     { type: 'string' },
    strandUnit: { type: ['string', 'null'] },
    outcomes:   { type: 'array', items: { type: 'string' } },
    vocab:      {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ga: { type: ['string', 'null'] },
          en: { type: 'string' },
        },
        required: ['en'],
      },
    },
    resources:  { type: 'array', items: { type: 'string' } },
    plan: {
      type: 'object',
      properties: {
        opening: { type: 'string' },
        intro:   { type: 'string' },
        main:    { type: 'string' },
        plenary: { type: 'string' },
      },
      required: ['opening', 'intro', 'main', 'plenary'],
    },
    guide: {
      type: 'object',
      properties: {
        pupilVoice:  { type: 'string' },
        mustMention: { type: 'string' },
        success:     { type: 'array', items: { type: 'string' } },
        watchouts:   { type: 'array', items: { type: 'string' } },
        curriculum:  { type: 'string' },
        fallback:    { type: 'string' },
        language:    { type: 'string' },
      },
      required: ['pupilVoice', 'mustMention', 'success', 'watchouts', 'curriculum', 'fallback', 'language'],
    },
    diff: {
      type: 'object',
      properties: {
        support:   { type: 'string' },
        core:      { type: 'string' },
        extension: { type: 'string' },
      },
      required: ['support', 'core', 'extension'],
    },
  },
  required: ['slotKey', 'title', 'focus', 'strand', 'outcomes', 'plan', 'guide', 'diff'],
};

const WEEK_TOOL = {
  name: 'return_week',
  description: 'Return the full week of lessons in structured form.',
  input_schema: {
    type: 'object',
    properties: {
      lessons: { type: 'array', items: LESSON_ITEM_SCHEMA, description: 'One entry per skeleton slot.' },
    },
    required: ['lessons'],
  },
};

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
  if (!key) return bad(res, 503, 'AI isn\'t configured on this deployment. Offline generation keeps the flow moving.');

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
    tools: [WEEK_TOOL],
    tool_choice: { type: 'tool', name: 'return_week' },
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
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'return_week');
    if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.lessons)) {
      console.warn('No tool_use in response', JSON.stringify(data.content).slice(0, 500));
      return bad(res, 502, 'Model did not return structured week. Please try again.');
    }
    cors(res);
    res.status(200).json({
      lessons: toolUse.input.lessons,
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

  lines.push(`# Timetable skeleton (one lesson required per line; slotKey must match exactly)`);
  skeleton.forEach(s => {
    const direction = s.teacherDirection ? ` · TEACHER DIRECTION: "${s.teacherDirection}"` : '';
    lines.push(`- slotKey="${s.day}|${s.slotIdx}" · subject=${s.subject} · minutes=${s.minutes}${s.fixed ? ' · fixed slot' : ''}${s.time ? ' · ' + s.time : ''}${direction}`);
  });
  lines.push('');

  if (curriculum) {
    lines.push(`# NCCA reference`);
    lines.push(curriculum);
    lines.push('');
  }

  lines.push(`# Your task`);
  lines.push(`Call the return_week tool with one lesson per skeleton line. Thread "${plan.themeName || 'the theme'}" through every subject where it fits naturally. Pitch to the class profile.`);

  return lines.join('\n');
}
