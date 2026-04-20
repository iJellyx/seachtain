// Serverless proxy -> Anthropic Messages API for AI Cúntas Míosúil
// (monthly record) generation. Per-subject paragraphs summarising what
// was actually taught, what worked, and what needs follow-up — drawn
// from the teacher's real plans + feedback across the last ~month.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are writing a teacher's Cúntas Míosúil — the monthly record of teaching required by Irish primary-school inspectors.

Voice & register:
- Professional, factual, concise. Past tense. First-person plural where natural ("we covered", "we revisited").
- Irish primary idiom: múinteoir, strand, strand unit, Cúntas Míosúil, Junior/Senior Infants, 1st class, etc.
- One paragraph per subject, 3–6 sentences. Not bullet lists.
- Name NCCA strands and strand units where they were covered. Don't invent strands.
- If prior feedback flagged a lesson as "too hard" or "needs reteach", mention plainly that we'll revisit or adjust.
- Don't invent specifics. If you don't know whether something happened, don't claim it.

Hard rules:
- Never name individual pupils. "The class" / "most pupils" / "a small group" are fine.
- Never mention Claude, AI, or the underlying tech. You're writing the record on the teacher's behalf.
- Plain prose. No markdown headings or bullets. Paragraphs only.
- Call the return_cuntas tool. Don't write outside the tool call.`;

const CUNTAS_TOOL = {
  name: 'return_cuntas',
  description: 'Return one paragraph per subject for the Cúntas Míosúil record.',
  input_schema: {
    type: 'object',
    properties: {
      periodLabel: { type: 'string', description: 'Short label for the period covered, e.g. "Week of 20 April" or "April 2026"' },
      paragraphs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Subject id (english, gaeilge, maths, sese, pe, arts, sphe, religion)' },
            text:    { type: 'string', description: '3–6 sentence paragraph for this subject.' },
          },
          required: ['subject', 'text'],
        },
      },
    },
    required: ['periodLabel', 'paragraphs'],
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
  if (!key) return bad(res, 503, "Cúntas regeneration isn't configured on this deployment.");

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return bad(res, 400, 'Missing body');

  const { plan, profile, lessonsBySubject, feedbackSummary, periodLabel, curriculum } = body;
  if (!plan || !profile) return bad(res, 400, 'plan and profile required');

  const userPrompt = buildUserPrompt({ plan, profile, lessonsBySubject, feedbackSummary, periodLabel, curriculum });

  const payload = {
    model: MODEL,
    max_tokens: 3500,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [CUNTAS_TOOL],
    tool_choice: { type: 'tool', name: 'return_cuntas' },
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
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'return_cuntas');
    if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.paragraphs)) {
      return bad(res, 502, 'Cúntas not produced. Please try again.');
    }
    cors(res);
    res.status(200).json({
      cuntas: toolUse.input,
      usage: data.usage || null,
      model: data.model || MODEL,
    });
  } catch (err) {
    return bad(res, 500, 'Proxy error: ' + (err?.message || 'unknown'));
  }
};

function buildUserPrompt({ plan, profile, lessonsBySubject, feedbackSummary, periodLabel, curriculum }) {
  const lines = [];
  lines.push(`# Teacher & class`);
  lines.push(`- Teacher: ${profile.teacher || '(unknown)'}`);
  lines.push(`- School: ${profile.school || ''}`);
  lines.push(`- Grade: ${plan.gradeName || plan.grade || profile.grade}`);
  lines.push(`- Pupils: ${plan.pupils ?? profile.pupils}`);
  lines.push(`- Medium: ${plan.medium || profile.medium || 'english'}`);
  lines.push('');
  lines.push(`# Period covered`);
  lines.push(`- Label: ${periodLabel || ('Week of ' + (plan.weekDateReadable || plan.weekDate || ''))}`);
  lines.push('');

  if (lessonsBySubject) {
    lines.push(`# Lessons actually taught (grouped by subject)`);
    Object.entries(lessonsBySubject).forEach(([sid, items]) => {
      if (!items || !items.length) return;
      lines.push(`## ${sid.toUpperCase()}`);
      items.slice(0, 20).forEach(l => {
        const bits = [
          l.title,
          l.focus ? '— ' + l.focus : '',
          l.strand ? '· strand: ' + l.strand : '',
          l.teacherDirection ? '· teacher direction: ' + l.teacherDirection : '',
        ].filter(Boolean).join(' ');
        lines.push(`- ${bits}`);
      });
      lines.push('');
    });
  }

  if (feedbackSummary) {
    lines.push(`# Teacher's feedback + reflections`);
    lines.push(feedbackSummary);
    lines.push('');
  }

  if (curriculum) {
    lines.push(`# NCCA reference`);
    lines.push(curriculum);
    lines.push('');
  }

  lines.push(`# Your task`);
  lines.push(`Call the return_cuntas tool with one paragraph per subject taught above. Professional register. Past tense. Name NCCA strands where they fit. If feedback flagged anything as too hard / needing reteach, mention that we'll revisit it. Don't invent content that isn't in the inputs.`);

  return lines.join('\n');
}
