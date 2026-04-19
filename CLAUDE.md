# Seachtain — project context for Claude Code

AI-driven weekly lesson planning platform for Irish primary-school teachers.
Built for James (james@socialenviro.ie), Ireland-based founder.

**Live:** https://seachtain.vercel.app
**Repo:** https://github.com/iJellyx/seachtain
**Deploy:** GitHub → Vercel auto-deploy on push to `main`.

## What it is

Single-file HTML prototype at `app.html` (now `index.html` after the rename
for Vercel root routing). Teacher-facing only — no student accounts, no
student data (simplifies GDPR). Parents will be a separate product later.

Reference competitor is Twinkl.ie, but Seachtain is AI-generation-driven
rather than a static resource library: teacher hits "generate", gets a full
week of lessons that respect their profile (grade, school-day times, fixed
slots, Gaeilge level, SEN/EAL counts).

Curriculum source is the **2023 NCCA Primary Curriculum Framework** — not
1999. Gaeilge, multi-grade, and SEN differentiation are first-class.

## Tech shape

- One file: HTML + inline CSS + inline JS.
- Persistence: `localStorage` only. No backend yet.
  - `seachtain.v1` — plans
  - `seachtain.profile.v1` — teacher profile
  - `seachtain.learning.v1` — event log of edits/overrides/swaps (capped at
    500 events, backend-ready JSON shape)
- Deploy: Vercel static. `vercel.json` rewrites `/` → `/index.html` and sets
  basic security headers.
- No build step. Edit the file, commit, push. Vercel redeploys in ~30 sec.

## Architecture decisions to preserve

### 1. DST-safe local dates (critical)

**Never** use `d.toISOString().slice(0, 10)` to store a date string when the
`Date` was created via `setHours(0,0,0,0)`. In Dublin during IST (UTC+1),
local midnight = UTC 23:00 previous day, so `toISOString()` returns
yesterday's date. Use the local helpers:

```js
function ymd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function mondayOf(dateObj) { /* returns Monday of that week */ }
```

These are already in the file. If you see `toISOString().slice(0, 10)`
anywhere in date-persistence code, flag it.

### 2. Grade-aware school day (Pass 5A)

The Irish primary day splits into two tiers:

- **Infants** (Junior/Senior): 09:00–13:40 (~4h 40m), DES floor ~1,100 min/wk
- **1st–6th**: 09:00–14:40 (~5h 40m), DES floor 1,400 min/wk

Standard breaks across both: 11:00–11:15 (small break), 12:30–13:00 (lunch).

Helpers:
- `defaultSchoolTimesForGrade(gradeId)` → `{schoolStart, schoolEnd, smallBreakStart, smallBreakEnd, lunchStart, lunchEnd}`
- `desWeeklyMinFor(gradeId)` → 1100 or 1400

Migration: `migrateProfile()` detects the legacy 09:00–14:30 default and
retimes it forward. **Never** silently overwrite customised teacher timings.

### 3. Balancer — proportional shortfall scoring (Pass 5B)

`autoBalanceSlots()` uses a three-tier picker:

1. **Below DES floor** → pick subject with biggest `(floor − got) / floor`.
2. **Above floor, below target** → pick by `(target − got) / target`, guard
   against 120 % overshoot for the cell size.
3. **All at/over target** → fall back to biggest remaining target gap.

This replaced an absolute-gap `FLOOR_BONUS = 1e6` scheme that unfairly
favoured big-target cores (English 280, Maths 250) and starved small-floor
subjects (SPHE 30, PE 60). **Don't regress back to absolute gap scoring.**

### 4. Time Audit — four-tier classifier (Pass 5C)

In `renderTimeAudit()`:

- `Missed` (red) — 0 min planned
- `Under DES` (red) — below regulatory floor
- `Under plan` (amber) — at/above DES but well below teacher target
- `On plan` (green) — within target band
- `Over plan` (blue) — > 10 % above target

Previously SPHE 30/60 falsely read "On plan" because the classifier only
compared against DES floor, not teacher target. The amber tier fixed that.

### 5. Per-subject "agent" pattern

Each of the 8 DES subjects has a dedicated generator: `englishAgent`,
`gaeilgeAgent`, `mathsAgent`, `seseAgent`, `peAgent`, `artsAgent`,
`spheAgent`, `religionAgent`. All return the same contract:

```
{ title, focus, outcomes, vocab, resources, diff, plan, guide, worksheet, coachBrief? }
```

PE is special: it returns `coachBrief` (SVG pitch diagram + warm-up/game/
cool-down + safety notes) instead of a pupil worksheet. Don't make PE
generate a worksheet.

### 6. Event-shaped learning log

`logEvent(type, meta)` appends to `seachtain.learning.v1`. Shape:

```js
{ id, at: ISO-timestamp, type, meta }
```

Event types: `plan_generated`, `lesson_override`, `lesson_revert`,
`lesson_regenerate`, `block_swap`, `block_move`, `week_move`,
`week_conflict_resolved`, `lesson_materials_added`, `bulk_print`.

This shape is deliberately backend-ready — when a server is added, the log
ships straight to it. Don't change the shape without a migration plan.

## Features built, at a glance

- Wizard → plan with per-subject agent content + minute-by-minute plan
- Lesson view: **Plan** (teacher delivery) vs **Teacher notes** (pupil voice
  + watch-outs + curriculum + fallback) tabs
- Teacher override: replace any lesson with own content, attach files/
  links, revert to draft
- Drag-and-drop swap of same-length timetable blocks (pinned lessons stay)
- Dashboard calendar strip: prev 3 → current → next 3 weeks, drag-swap
  plans, conflict flag
- "Today" side panel on dashboard with live now-highlight of current lesson
- Profile: teacher, school, grade, class size, SEN/EAL, school-day times,
  pinned fixed slots, subject-minute targets, subject emojis, avatar
  (240 px thumbnail in localStorage)
- Time Audit: per-subject planned vs target vs DES, grade-aware
- Coverage tracker: NCCA strand ticks per subject
- Parent note generator: short/medium/long, optional Gaeilge phrase,
  upcoming dates (tour/sports/break)
- Seasonal theme suggestion based on week-beginning date (Irish calendar:
  Seachtain na Gaeilge, Lá Fhéile Bríde, Samhain, Maths Week, etc.)
- Multi-select print (gated by "Select lessons" toggle — checkbox hidden by
  default to avoid overlap with subject emoji)
- Insights panel: override counts, most-edited subject, JSON export

## Deploying

Everything auto-deploys from `main`:

```bash
git add <changed-files>
git commit -m "describe what changed"
git push
```

Vercel picks it up within a minute. Custom domain is set up via Vercel
Dashboard → Settings → Domains when ready.

## Smoke testing

Node-based smoke suites used during development live in `/tmp/` (not
committed):

- `pass5-smoke.js` — 52 tests: grade-aware times, DES floors, balancer
  allocation, classifier truth table
- `dom-smoke.js` — 41 tests via JSDOM: function presence, element presence,
  week strip rendering, learning-log persistence, select-mode toggle

Run with `node /tmp/pass5-smoke.js`. They rely on extracting the script
blocks from the HTML file with a regex — keep them in mind when adding
features so we can verify nothing regresses.

## Not done (intentional, future work)

- No backend, no auth, no teacher accounts — next milestone.
- No student-facing surface at all (out of scope for MVP).
- No parent-facing product (separate product later).
- No real AI calls yet — agent content is hand-authored + parameterised.
  The "generation" feel is the week-assembly + parameterisation. A live
  LLM call layer slots in cleanly behind the agent contract.

## User profile — James

Ireland-based founder, more technical than he lets on. Has built platforms
before. Validates by seeing-the-thing, so prioritise feel and shape over
architecture debates. Prefers pragmatic recommendations over exhaustive
option-listing. Uses Irish Gaeilge naturally — lessons should respect that.
