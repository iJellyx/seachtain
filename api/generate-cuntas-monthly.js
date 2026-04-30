// Serverless proxy -> Anthropic Messages API for AI Cúntas Míosúil over a
// FULL MONTH of plans. Distinct from generate-cuntas.js (which is per-week)
// — this endpoint takes every plan whose weekDate falls in the named
// month, compiles the lessons + strand coverage + feedback into one
// monthly record, returns one paragraph per subject in inspector-ready
// register.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are writing a teacher's Cúntas Míosúil — the MONTHLY record of teaching required by Irish primary-school inspectors.

Voice & register:
- Professional, factual. Past tense. First-person plural where natural ("we covered", "we revisited").
- Irish primary idiom: múinteoir, strand, strand unit, Cúntas Míosúil, Junior/Senior Infants, 1st class.
- One paragraph per subject. 4–8 sentences for the month — long enough to give the inspector a real picture of what was taught, short enough that the document stays readable.
- Reference NCCA strands and strand units explicitly when describing what was covered.
- Where the same strand was revisited across weeks, mention the progression ("In Week 1 we explored X, building to Y by Week 4…").
- If feedback flagged a lesson as "too hard" or "needs reteach", say plainly that we'll revisit or have already revisited.

Hard rules:
- Never name individual pupils. "The class" / "most pupils" / "a small group" are fine.
- Never mention Claude, AI, or the underlying tech. You're writing the record on the teacher's behalf.
- Do not invent learning outcome codes (e.g. "1.3", "2.4"). Reference outcomes by theme, paraphrased from the NCCA reference provided.
- Plain prose. No markdown headings or bullets. Paragraphs only.
- Call the return_monthly_cuntas tool. Do not write outside the tool call.`;

const CUNTAS_TOOL = {
  name: 'return_monthly_cuntas',
  description: 'Return one paragraph per subject for the monthly Cúntas Míosúil record.',
  input_schema: {
    type: 'object',
    properties: {
      monthLabel: { type: 'string', description: 'The month covered, e.g. "April 2026"' },
      paragraphs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Subject id (english, gaeilge, maths, sese, pe, arts, sphe, religion)' },
            text:    { type: 'string', description: '4–8 sentence paragraph for this subject covering the whole month.' },
            strands: { type: 'array', items: { type: 'string' }, description: 'NCCA strands meaningfully covered this month (verbatim from the reference).' },
          },
          required: ['subject', 'text', 'strands'],
        },
      },
    },
    required: ['monthLabel', 'paragraphs'],
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

  const { profile, plans, monthLabel, lessonsBySubject, feedbackSummary, curriculum } = body;
  if (!profile || !Array.isArray(plans)) return bad(res, 400, 'profile and plans[] required');
  if (!plans.length) return bad(res, 400, 'No plans in this month — nothing to summarise.');

  const userPrompt = buildUserPrompt({ profile, plans, monthLabel, lessonsBySubject, feedbackSummary, curriculum });

  const payload = {
    model: MODEL,
    max_tokens: 5000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: [CUNTAS_TOOL],
    tool_choice: { type: 'tool', name: 'return_monthly_cuntas' },
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
    const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'return_monthly_cuntas');
    if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.paragraphs)) {
      return bad(res, 502, 'Monthly Cúntas not produced. Please try again.');
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

function buildUserPrompt({ profile, plans, monthLabel, lessonsBySubject, feedbackSummary, curriculum }) {
  const lines = [];
  lines.push(`# Teacher & class`);
  lines.push(`- Teacher: ${profile.teacher || '(unknown)'}`);
  lines.push(`- School: ${profile.school || ''}`);
  lines.push(`- Grade: ${profile.gradeName || profile.grade || ''}`);
  lines.push(`- Pupils: ${profile.pupils || ''}`);
  lines.push(`- Medium: ${profile.medium || 'english'}`);
  lines.push('');
  lines.push(`# Period`);
  lines.push(`- ${monthLabel} — ${plans.length} week${plans.length === 1 ? '' : 's'} of teaching`);
  lines.push('');

  lines.push(`# Weeks covered`);
  plans.forEach(p => {
    lines.push(`- Week of ${p.weekDateReadable || p.weekDate}${p.themeName ? ' — theme: ' + p.themeName : ''}`);
  });
  lines.push('');

  if (lessonsBySubject) {
    lines.push(`# Lessons taught (grouped by subject, across the month)`);
    Object.entries(lessonsBySubject).forEach(([sid, items]) => {
      if (!items || !items.length) return;
      lines.push(`## ${sid.toUpperCase()}`);
      items.slice(0, 40).forEach(l => {
        const bits = [
          l.title,
          l.focus ? '— ' + l.focus : '',
          l.strand ? '· strand: ' + l.strand : '',
          l.day ? '(' + l.day + ' wk-of-' + l.weekDate + ')' : '',
        ].filter(Boolean).join(' ');
        lines.push(`- ${bits}`);
      });
      lines.push('');
    });
  }

  if (feedbackSummary) {
    lines.push(`# Teacher's feedback + reflections this month`);
    lines.push(feedbackSummary);
    lines.push('');
  }

  if (curriculum) {
    lines.push(`# NCCA reference (strands + outcomes per subject for this grade band)`);
    lines.push(curriculum);
    lines.push('');
  }

  lines.push(`# Your task`);
  lines.push(`Call return_monthly_cuntas with one paragraph per subject taught this month. Each paragraph should give an inspector a clear sense of what strands were covered, how the work progressed across the weeks, and any reteach planned. Past tense. Professional register. No fabricated outcome codes — paraphrase outcome themes from the reference.`);

  return lines.join('\n');
}
