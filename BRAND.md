# Planner Bee — brand system

The reference for every pixel of colour, type, and voice. Anything you
design, write, or ship should sit inside this system. When you find a
gap, add it here first.

---

## 1. The product

**Planner Bee** is a weekly lesson-planning companion for Irish primary
teachers. It drafts the full week in about a minute, grounded in the
2023 NCCA Primary Curriculum Framework, pitched to the teacher's class,
with Gaeilge threaded through.

**One-line pitch**: *Plans your week while you have a cup of tea.*

**Positioning**: A tool that respects teachers' time and judgement.
Never condescending. Never cutesy in a way that undermines professional
authority. Warm but serious about the craft of teaching.

---

## 2. Name

- **Planner Bee** — two words, always capitalised. Never "PlannerBee"
  or "planner bee".
- **Bee** (short form) — acceptable in voice and second reference,
  especially in playful moments ("Let Bee take a crack at it").
- Avoid: "the app", "the platform", "the AI". Say **Planner Bee** or
  **Bee**.

---

## 3. The mascot — Abbie

A friendly fuzzy bee in a teal backpack and orange boots. Her name is
**Abbie**. She's the product's warm face — not a logo, not a gimmick.
She sits beside the wordmark, never replacing it.

**Personality**: Warm, comforting, gently helpful — like a good classroom
assistant. Patient. Never overbearing, never condescending, never
silly. If a line sounds like it belongs on children's TV, cut it. If it
sounds like corporate SaaS ("Let's get you onboarded!"), also cut it.

**Voice** — a handful of examples to tune by:

- ✅ *"Hi there! Want me to show you around?"*
- ✅ *"No rush — tap me any time you want a hand."*
- ✅ *"I'm here if you need me."*
- ✅ *"Grand — I'll stay quiet. Click me back any time."*
- ❌ *"Hey! Let's make some magic happen!"*
- ❌ *"Uh-oh, looks like you're stuck!"*
- ❌ *"Pro tip:"* — we don't do Pro tips.

**Ambient presence — the Clippy principle**

Abbie is visible but *small*. Think paperclip-era Clippy sized down and
matured: a 76px button in the bottom-right corner, there when you need
her, never in the way. She pops a contextual speech bubble for each
view the first time you visit it, then waits to be clicked.

- Size across the app: `xs 40px`, `sm 56px`, `md 80px`, `lg 120px` (landing only)
- Always dismissable from the bubble itself
- Can be turned off entirely via *My profile → Abbie's here to help*
- Hidden automatically on the landing + onboarding views (she's already
  inline there)
- Never appears inside lesson content, worksheets, or the Sub Pack —
  those are professional documents a teacher hands to someone else

**Anatomy** (so variations stay on-model):
- Soft fuzzy amber body with three dark-brown stripes
- Two translucent wings, always visible
- Large round brown eyes with a single catchlight each + small eyelashes
- Soft pink cheeks
- Two short dark antennae tipped with cream pom-poms
- Teal backpack, orange/tan boots
- White gloves on hands

**Poses** (PNG files in `/mascot/`):
- `abbie-wave.png` — greeting; used in the bottom-right toggle + landing
- `abbie-idle.png` — calm standing; available for reserved moments
- `abbie-apple.png` — celebration / success / onboarding complete
- `abbie-tablet.png` — thinking / working / profile page

Files not yet uploaded? The renderer falls back to a simple inline SVG so
the UI still reads during setup.

---

## 4. Colour palette

All values live in CSS custom properties under `:root`. Add new ones
here before using them in a stylesheet.

### Primary palette
| Name | Hex | Use |
|---|---|---|
| **Honey** | `#D4A72C` | Primary accent — mascot body, CTAs in moments of warmth |
| **Forest** | `#2D5F3F` | Primary brand green — headings, navigation, primary buttons |
| **Forest Deep** | `#25513A` | Button hover, sidebar accents |
| **Forest Soft** | `#E8F0E8` | Hover washes, active nav chips |
| **Amber** | `#E8B739` | Mascot highlight, banner accents |
| **Dark Stripe** | `#4B2E2A` | Mascot stripes + detail work |

### Secondary palette (subject chrome — keep consistent across the app)
| Subject | Tile bg | Ink | Accent |
|---|---|---|---|
| English | `#DDE9F4` | `#1E3A5C` | `#3B6EA8` |
| Gaeilge | `#D7E8DB` | `#1D4A30` | `#2D5F3F` |
| Maths | `#F6E4B8` | `#6B4E0A` | `#C48A1A` |
| SESE | `#F5D9CB` | `#7A2D1A` | `#C85A3E` |
| PE | `#E3D6EF` | `#4A2C63` | `#8A5CA0` |
| Arts | `#F9D7DC` | `#7A2A3B` | `#C0566A` |
| SPHE | `#CFE8E3` | `#16433E` | `#3E8F83` |
| Religion | `#E8DFEB` | `#523A5F` | `#7A5E8C` |

### Neutrals
| Name | Hex | Use |
|---|---|---|
| **Bg** | `#FBF7F0` | Page background (warm cream) |
| **Surface** | `#FFFFFF` | Cards, modals |
| **Surface Alt** | `#F4EEE2` | Secondary surfaces, hover wash |
| **Ink** | `#2B2420` | Body text |
| **Ink Soft** | `#6B5F54` | Secondary text |
| **Ink Faint** | `#A89B8E` | Tertiary text, captions |
| **Line** | `#E8E0D4` | Hairlines, borders |
| **Line Strong** | `#D9CEBD` | Emphasised borders |

### Semantic
| Name | Hex | Use |
|---|---|---|
| **Danger** | `#B2382A` | Destructive actions (delete), validation errors |
| **Warning** | `#C48A1A` | Non-blocking warnings (DES under-minutes) |
| **Success** | `#2D5F3F` | Confirmation states — same as Forest |

### Seasonal accents
A thin gradient bar top-of-page that shifts across the Irish school
calendar. Managed by `SEASONAL_PALETTE` in JS. Never use these colours
outside the seasonal-accent system.

---

## 5. Type

| Use | Family | Weights |
|---|---|---|
| Headlines, display | **Fraunces** (serif) | 500, 600, 700 |
| Body, UI | **Inter** (sans) | 400, 500, 600, 700 |
| Numeric / tabular | Inter with `font-variant-numeric: tabular-nums` | — |

**Scale** (desktop):
- Display: `clamp(44px, 6vw, 76px)` — landing hero only
- H1: 34px / 1.15 / -0.015em
- H2: 24px / 1.25 / -0.01em
- H3: 18px / 1.3
- H4: 15px / 1.3
- Body: 15px / 1.5
- Small: 13px / 1.5
- Micro: 11–12px / 1.4 — labels, captions

**Rules**:
- Fraunces italic for emphasis in large type (`<em>Sunday evening</em>`)
- Never use Fraunces for body text
- Always pair Fraunces headings with Inter body — no serif body copy
- Letter-spacing: tighten display (-0.015em to -0.02em), loosen micro
  labels (+0.06em to +0.14em for uppercase)

---

## 6. Voice & tone

### Principles

1. **Specific over generic.** "Nine lessons drafted in 38 seconds" beats
   "Your week is ready!"
2. **One idea per sentence.** Teachers skim. Don't bury the verb.
3. **Warm, not twee.** "Nice one" is fine. "Yay!" isn't. "Le chéile" is
   natural. "Sláinte!" in a save toast is not.
4. **Address the teacher as a peer.** Never "users", never "educators",
   never "you're doing amazing, sweetie".
5. **Irish idiom where it lands.** "Lá breá" in a Friday empty state is
   right. "Top of the mornin'" is never right.
6. **Don't apologise for the tech.** "Planner Bee isn't available right
   now" beats "Oh no! Something went wrong 😢".

### Microcopy patterns

- Empty states: *"No plan yet for this week — let's build one le chéile."*
- Loading: *"Bee is drafting your week — usually about a minute."*
- Success toast: *"Plan saved. Have a grand evening."*
- Destructive confirm: state the consequence plainly — *"This plan will
  be permanently removed. This can't be undone."*
- Error: name what went wrong and what to do next.

### Words to avoid

- *AI, artificial intelligence, ML, machine learning, LLM, GPT, Claude,
  model, neural* — never in teacher-facing copy.
- *Leverage, solution, utilise, seamless, empowering, game-changing* —
  SaaS noise, cut on sight.
- *Magical, revolutionary, disrupt* — we're a planner, not a prophecy.
- *Just* — as in "just click here". Condescending.
- *Hey!* — in a toast or modal. Unserious.

### Words we like

- *Draft, thread, pitch, tweak, pin, shortfall, spiral, companion.*
- *Right now, next up, wrapped, nice one, grand.*
- Gaeilge where natural: *le chéile, lá breá, go raibh maith agat,
  seachtain, múinteoir.*

---

## 7. The wordmark

- **Primary wordmark**: "Planner Bee" set in Fraunces 600, -0.01em
  tracking, paired with the 7-dot arc mark.
- **7-dot arc**: keep as-is. Reinterpreted as *a bee's weekly flight
  path* — the middle dot (gold, larger) is "today". Works at any size
  down to 16px.
- **Tagline**: *"Weekly planning, done."* — optional, appears under the
  wordmark in the landing top bar and in emails.

Never:
- Use the wordmark without the mark in the sidebar or landing header
- Apply drop shadows or gradients to the wordmark
- Substitute a different font for the wordmark
- Put the mascot where the wordmark should be

---

## 8. Layout & space

- 4px base spacing scale (4, 8, 12, 16, 20, 24, 32, 40, 56, 80).
- Rounded corners: 6px (chips), 8px (buttons/inputs), 12px (cards),
  14–18px (large cards), 999px (pills).
- Shadows: three-tier subtle system. Never use hard shadows.
- Maximum content width: 1080–1200px. Landing sections can go full-bleed.
- Responsive breakpoints: 480, 720, 1100px.

---

## 9. Imagery & iconography

- Illustrations: loose line work, honey-and-forest palette, pedagogical
  subjects (books, pencils, pitches). Never stock photography.
- Icons: Feather / Lucide style. 2px stroke, rounded caps. Never mix
  solid and outline icons in the same view.
- Emoji: sparingly, for subject colour-coding (📘 English, 🔢 Maths,
  🍀 Gaeilge, 🌍 SESE, 🏃 PE, 🎨 Arts, 🌈 SPHE, ✝️ Religion) and for
  light mood in empty states. Never in headlines.

---

## 10. Using this doc

- When you design a new surface, pick colours/type/tone from here first.
- When you find you're reaching for something that isn't here, add it
  here before using it.
- This doc lives with the code. Update it in the same PR as the change.
