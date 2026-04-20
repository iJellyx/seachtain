// Serverless proxy -> Anthropic Messages API for AI homework generation.
// Per-lesson homework, age-appropriate, uses the teacher's direction and
// prior feedback. Uses tool_use for guaranteed structured output.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are a lesson-planning companion for Irish primary-school teachers, writing take-home homework for a specific lesson.

Principles for good Irish primary homework:
- Matches what was done in class (don't introduce genuinely new material).
- Age-appropriate duration: Junior/Senior Infants 0–10 min, 1st–2nd 15–20 min, 3rd–4th 20–30 min, 5th–6th 30–45 min.
- Clear to parents without a teacher present. A parent should be able to support without needing to "learn" the topic first.
- One task, usually. If more, they should nest under one clear goal.
- For Gaeilge: keep phonetic spelling or include pronunciation guide for parents.
- For Maths: mix procedure + a light problem-solving question. Not all drill.
- For English: reading + a small writing response beats either alone.

Hard rules:
- Honour the teacher's specific direction for this lesson (a page number, a focus, a particular method). If they said "column method", the homework uses column method.
- Never include pupil names, even in examples.
- Output plain, parent-readable prose inside the tool fields. No markdown, no emoji chains.
- Call the return_homework tool. Don't write outside the tool call.`;

const HOMEWORK_TOOL = {
  name: 'return_homework',
  description: 'Return the homework for this lesson in structured form.',
  input_schema: {
    type: 'object',
    properties: {
      title:            { type: 'string', description: 'Short homework title (e.g. "Long division — 4 problems")' },
      estimatedMinutes: { type: 'integer', description: 'Realistic minutes it should take this class' },
      instructions:     { type: 'string',  description: 'Plain prose instructions a parent + child can follow without a teacher present. 2–6 sentences.' },
      tasks:            { type: 'array', items: { type: 'string' }, description: '1–5 concrete tasks. Each a single sentence.' },
      materials:        { type: 'array', items: { type: 'string' }, description: 'Anything needed beyond pencil/copy — "ruler", "reader book", "measuring tape". Empty array if none.' },
      parentNote:       { type: 'string',  description: 'Optional 1–2 sentence note to parents explaining what to support with. Leave empty string if none needed.' },
      differentiation:  {
        type: 'object',
        properties: {
          support:   { type: 'string', description: 'Easier version for pupils needing support. One sentence.' },
          extension: { type: 'string', description: 'Stretch version for pupils ready for more. One sentence.' },
        },
        required: ['support', 'extension'],
      },
    },
    required: ['title', 'estimatedMinutes', 'instructions', 'tasks', 'materials', 'parentNote', 'differentiation'],
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
  if (!key) return bad(res, 503, "Homework generation isn't configured on this deployment.");

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return bad(res, 400, 'Missing body');

  const { lesson, plan, profile, teacherNote } = body;
  if (!lesson || !plan || !profile) return bad(res, 400, 'lesson, plan and profile required');

  const userPrompt = buildUserPrompt({ lesson, plan, profile, teacherNote });

  const payload = {
    model: MODEL,
    max_tokens: 1500,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [HOMEWORK_TOOL],
    tool_choice: { type: 'tool', name: 'return_homework' },
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
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'return_homework');
    if (!toolUse || !toolUse.input) {
      return bad(res, 502, 'Homework not produced. Please try again.');
    }
    cors(res);
    res.status(200).json({
      homework: toolUse.input,
      usage: data.usage || null,
      model: data.model || MODEL,
    });
  } catch (err) {
    return bad(res, 500, 'Proxy error: ' + (err?.message || 'unknown'));
  }
};

function buildUserPrompt({ lesson, plan, profile, teacherNote }) {
  const lines = [];
  lines.push(`# Class`);
  lines.push(`- Grade: ${plan.gradeName || plan.grade || profile.grade}`);
  lines.push(`- Pupils: ${plan.pupils ?? profile.pupils}`);
  lines.push(`- Medium: ${plan.medium || profile.medium || 'english'}`);
  lines.push('');

  lines.push(`# The lesson this homework is attached to`);
  lines.push(`- Subject: ${lesson.subject}`);
  lines.push(`- Title: ${lesson.title}`);
  lines.push(`- Focus: ${lesson.focus || ''}`);
  lines.push(`- Minutes of class time: ${lesson.minutes}`);
  if (lesson.plan?.main) lines.push(`- Main activity in class: ${lesson.plan.main}`);
  if (Array.isArray(lesson.outcomes)) lines.push(`- Outcomes: ${lesson.outcomes.slice(0, 3).join('; ')}`);
  if (Array.isArray(lesson.vocab) && lesson.vocab.length) lines.push(`- Vocab in play: ${lesson.vocab.slice(0, 5).map(v => (v.ga ? v.ga + ' (' + v.en + ')' : v.en)).join(', ')}`);
  lines.push('');

  if (lesson.teacherDirection) {
    lines.push(`# Teacher's specific direction for this lesson (TOP PRIORITY)`);
    lines.push(`"${lesson.teacherDirection}"`);
    lines.push(`The homework must reinforce exactly this, not a generic version.`);
    lines.push('');
  }

  if (teacherNote) {
    lines.push(`# Extra note for this homework only`);
    lines.push(`"${teacherNote}"`);
    lines.push('');
  }

  lines.push(`# Your task`);
  lines.push(`Call the return_homework tool with age-appropriate homework for this lesson. Duration should match the grade band.`);

  return lines.join('\n');
}
