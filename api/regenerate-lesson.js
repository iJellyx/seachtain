// Serverless proxy -> Anthropic Messages API for AI lesson regeneration.
// Runs on Vercel. Requires ANTHROPIC_API_KEY to be set in project env vars.
//
// Uses tool_use for guaranteed structured output. Instead of asking the
// model to return JSON and hoping it does, we give it a tool with a
// strict input schema and force it to call that tool. The SDK returns
// the tool call's input as a proper object — zero parsing risk.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

// System prompt — cached for cost efficiency across requests.
const SYSTEM_PROMPT = `You are a lesson-planning companion for Irish primary-school teachers.

Your role is to rewrite a single lesson so it lands right for the given class (grade, pupil count, SEN, Gaeilge medium, teacher feedback). You respect the NCCA 2023 Primary Curriculum Framework and pitch content to the right age band — Junior/Senior Infants get short, playful, story-led tasks; 1st–2nd get concrete manipulation and short writing; 3rd–4th move into procedural fluency and longer written tasks; 5th–6th handle abstraction, multi-step problems, and extended writing.

Priority order — when signals conflict, follow this:
1. The TEACHER'S SPECIFIC REQUEST FOR THIS LESSON (if present) is highest priority. If they say "we're on page 84 of Charlotte's Web", build the lesson around that exact material. If they say "focus on long division with column method", that's the focus. Do not substitute a more generic topic.
2. The teacher's prior feedback on this lesson.
3. The pitch modifiers (younger/older/shorter/more Gaeilge etc.).
4. Sensible defaults from the NCCA reference and the class profile.

Hard rules:
- Every lesson must include Oral language work if it's English or Gaeilge, hands-on or visual work for Infants, and a clear pupil-facing opening.
- Respect the Gaeilge medium: if Gaelscoil/Gaeltacht, lean harder into Gaeilge vocab and classroom language; if English-medium, a single Gaeilge phrase is enough for non-Gaeilge lessons.
- Never invent curriculum strands. When naming strands/strand units, use the ones from the provided NCCA reference verbatim.
- If teacher feedback is provided, address it directly (e.g. "too long" → shorter main activity).
- Call the return_lesson tool. Do not write prose outside the tool call.`;

// Tool schema — forces the model into a known-good structure. Anthropic
// routes tool_use through a strict validator, so malformed output is
// impossible here.
const LESSON_TOOL = {
  name: 'return_lesson',
  description: 'Return the rewritten lesson in structured form.',
  input_schema: {
    type: 'object',
    properties: {
      title:      { type: 'string', description: 'Short lesson title' },
      focus:      { type: 'string', description: 'One-sentence focus for this lesson' },
      strand:     { type: 'string', description: 'Exact NCCA strand name from the reference' },
      strandUnit: { type: ['string', 'null'], description: 'Exact strand unit if one fits, else null' },
      outcomes:   { type: 'array', items: { type: 'string' }, description: '2–3 short learning outcomes in "Pupils will …" form' },
      vocab: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ga: { type: ['string', 'null'], description: 'Irish term (or null if not applicable)' },
            en: { type: 'string', description: 'English gloss' },
          },
          required: ['en'],
        },
      },
      resources: { type: 'array', items: { type: 'string' }, description: '2–5 concrete materials a teacher would need' },
      plan: {
        type: 'object',
        properties: {
          opening: { type: 'string', description: 'What the teacher does in the first 3–5 minutes' },
          intro:   { type: 'string', description: 'Teaching input — what the teacher explains / models' },
          main:    { type: 'string', description: 'What pupils do during the main activity' },
          plenary: { type: 'string', description: 'How the teacher closes the lesson and checks understanding' },
        },
        required: ['opening', 'intro', 'main', 'plenary'],
      },
      guide: {
        type: 'object',
        properties: {
          pupilVoice:  { type: 'string', description: 'One sentence teacher reads to pupils at the start' },
          mustMention: { type: 'string', description: 'One key point the teacher must surface' },
          success:     { type: 'array', items: { type: 'string' }, description: '2–3 observable success criteria' },
          watchouts:   { type: 'array', items: { type: 'string' }, description: '2–3 realistic trip-ups' },
          curriculum:  { type: 'string', description: 'One sentence linking this to the NCCA strand and strand unit' },
          fallback:    { type: 'string', description: 'Short-on-time version if only 15 minutes are left' },
          language:    { type: 'string', description: 'EAL / language-support note' },
        },
        required: ['pupilVoice', 'mustMention', 'success', 'watchouts', 'curriculum', 'fallback', 'language'],
      },
      diff: {
        type: 'object',
        properties: {
          support:   { type: 'string', description: 'What scaffolds look like for pupils needing support' },
          core:      { type: 'string', description: 'What the typical task is' },
          extension: { type: 'string', description: 'A stretch task for pupils ready for more' },
        },
        required: ['support', 'core', 'extension'],
      },
    },
    required: ['title', 'focus', 'strand', 'outcomes', 'vocab', 'resources', 'plan', 'guide', 'diff'],
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
  if (!key) return bad(res, 503, 'AI isn\'t configured on this deployment. Offline variants keep the flow moving.');

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
    max_tokens: 3500,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [LESSON_TOOL],
    tool_choice: { type: 'tool', name: 'return_lesson' },
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
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'return_lesson');
    if (!toolUse || !toolUse.input) {
      console.warn('No tool_use in response', JSON.stringify(data.content).slice(0, 500));
      return bad(res, 502, 'Model did not return a structured lesson. Please try again.');
    }
    cors(res);
    res.status(200).json({
      lesson: toolUse.input,
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

  // Teacher's persistent direction for this specific lesson — highest
  // priority signal. Surfaced first and in its own block so the model
  // clearly distinguishes it from pitch modifiers.
  if (lesson.teacherDirection) {
    lines.push(`# Teacher's specific request for this lesson  (TOP PRIORITY)`);
    lines.push(`"${lesson.teacherDirection}"`);
    lines.push(`Build the lesson around this request. Don't substitute it with a more generic topic.`);
    lines.push('');
  }

  if (direction || (tags && tags.length) || comment) {
    lines.push(`# This regeneration's modifiers`);
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
  lines.push(`Call the return_lesson tool with a lesson that reshapes this one to land right for the class above. Address the teacher's direction. Keep the total time roughly ${lesson.minutes} minutes. Name a real NCCA strand from the reference — never invent one.`);

  return lines.join('\n');
}
