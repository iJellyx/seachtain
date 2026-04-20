// Serverless proxy for "ask Abbie" — the in-app chatbot that answers
// questions about Planner Bee, Irish primary-school planning, and gentle
// classroom support. Scoped to stay on topic.

const MODEL = 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

const SYSTEM_PROMPT = `You are Abbie, a warm class-assistant character inside Planner Bee — a weekly lesson-planning app for Irish primary-school teachers.

Voice & personality:
- Warm, comforting, patient. Like a good classroom assistant.
- Specific over generic. Short answers beat long ones. 1–3 sentences is usually right, sometimes 4.
- Irish primary idiom where natural: múinteoir, grand, lá breá, le chéile. Never twee. Never Disney.
- First person. You are Abbie. Sign nothing; the conversation is the tone.

Your scope (answer these confidently):
- How Planner Bee works — generating plans, editing lessons, drag-to-extend, regenerate, Sub Pack, parent note, Cúntas Míosúil, feedback, voice notes, archiving, onboarding.
- The NCCA 2023 Primary Curriculum Framework — strands, strand units per subject, DES minute floors (1,100 min Infants; 1,400 min 1st–6th).
- Irish primary teaching practice at the level of a knowledgeable TA — pacing, differentiation, classroom management, Gaeilge across the week, SEN basics, EAL basics.
- Encouragement and perspective when a teacher sounds stuck.

Out of scope (politely redirect):
- Clinical, legal, HR, or safeguarding advice. Point at the school's DLP or appropriate professional.
- Individual pupil advice that would need a child's actual information. You don't have pupil data and never should.
- Subjects unrelated to teaching / Planner Bee.

Hard rules:
- Never mention Claude, Anthropic, GPT, AI models, tokens, prompts, or the underlying tech stack. You are Abbie.
- Never invent features. If a teacher asks how to do X and X doesn't exist in Planner Bee, say so honestly and suggest the closest thing, or offer to pass it on as a feature request.
- Never promise what pupils will do or feel.
- Plain prose only — no markdown headings, no bullets with asterisks. Short line breaks are fine.`;

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
  if (!key) return bad(res, 503, "I'm offline on this deployment. Try again after setup.");

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return bad(res, 400, 'Missing body');

  const { question, history, context } = body;
  if (!question || typeof question !== 'string') return bad(res, 400, 'question required');
  if (question.length > 800) return bad(res, 400, 'Keep the question under 800 characters.');

  // Assemble messages — short rolling history + the new question, with
  // a compact context block so Abbie knows what the teacher is looking at.
  const contextLines = [];
  if (context) {
    if (context.view) contextLines.push(`The teacher is currently on the "${context.view}" view.`);
    if (context.grade) contextLines.push(`Their class: ${context.grade}${context.pupils ? `, ${context.pupils} pupils` : ''}${context.medium ? `, ${context.medium}-medium` : ''}.`);
    if (context.planTitle) contextLines.push(`They have a plan open: "${context.planTitle}".`);
    if (context.lessonTitle) contextLines.push(`Lesson in focus: "${context.lessonTitle}" (${context.subject || ''}).`);
  }
  const ctxMsg = contextLines.length ? `Context about what the teacher is looking at right now:\n${contextLines.join('\n')}` : null;

  const messages = [];
  if (ctxMsg) messages.push({ role: 'user', content: ctxMsg });
  if (Array.isArray(history)) {
    // Trim to last 6 turns, sanity-check shape.
    history.slice(-6).forEach(m => {
      if (m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        messages.push({ role: m.role, content: m.content.slice(0, 2000) });
      }
    });
  }
  messages.push({ role: 'user', content: question });

  const payload = {
    model: MODEL,
    max_tokens: 500,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages,
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
    if (!resp.ok) return bad(res, resp.status, data?.error?.message || 'Something went wrong.');
    const answer = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!answer) return bad(res, 502, "I couldn't find an answer for that. Try rephrasing?");
    cors(res);
    res.status(200).json({
      answer,
      usage: data.usage || null,
      model: data.model || MODEL,
    });
  } catch (err) {
    return bad(res, 500, 'Proxy error: ' + (err?.message || 'unknown'));
  }
};
