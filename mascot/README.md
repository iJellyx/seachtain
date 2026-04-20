# Abbie mascot assets

Drop the nine PNG files into this folder. The renderer reads from
`/mascot/abbie-*.png` on the deployed site. Until a given file is
present, a simple SVG fallback bee is drawn for that slot so the UI
never looks broken.

## The file list

| Filename | Pose key | Used where |
|---|---|---|
| `abbie-wave-standing.png` | `wave` | Floating bottom-right helper, onboarding intro, quiet greetings |
| `abbie-wave-side.png` | `waveSide` | Alternate wave — available for variety, second dashboard slots |
| `abbie-flying-wave.png` | `flying` | Landing hero (energetic greeting), whole-week celebration |
| `abbie-idle.png` | `idle` | Quiet background presence when no specific mood fits |
| `abbie-apple.png` | `apple` | Celebrations, onboarding complete, success toasts, feedback thanks |
| `abbie-clipboard.png` | `clipboard` | Profile page, writing / planning moments |
| `abbie-think.png` | `think` | Loading states, considered-response moments |
| `abbie-point.png` | `point` | Teaching gestures, coach marks ("this is where…") |
| `abbie-back.png` | `back` | Sign-out confirmation, weekend state, end-of-day |

## Specs

- Format: **PNG with transparent background**
- Recommended size: **800 × 800 pixels** (square) or larger, though
  landscape works too — the renderer uses `object-fit: contain`
- Character sized consistently across the set so she doesn't "grow" or
  "shrink" when switching poses
- Keep filenames **lowercase** with hyphens, exactly as above

## How to upload

### Web (easy path)

1. Open <https://github.com/iJellyx/seachtain>
2. Click into the **`mascot/`** folder
3. **Add file → Upload files**
4. Drag all nine PNGs in (rename them first if needed so they match the
   filenames above exactly)
5. Commit message: *"Add Abbie mascot PNGs"* → **Commit changes** to `main`
6. Vercel redeploys automatically in ~30 seconds

### Local (if you have the repo cloned)

```bash
cd "/Users/JamesKelly/Documents/Claude/Projects/Teaching Platform"
# copy the PNGs into mascot/ with the filenames above
git add mascot/*.png
git commit -m "Add Abbie mascot PNGs"
git push
```

## Checking it worked

- Landing page (`/welcome`) — the flying Abbie greets you in the hero
- Any other view — the bottom-right floating helper shows Abbie's
  standing wave instead of the simple drawn fallback
- Profile page (`/profile`) — Abbie with her clipboard beside the heading
- Onboarding final step — Abbie with the apple, celebrating

If any pose still shows the simple drawn fallback, the filename didn't
match — double-check casing and hyphens, or check the deploy logs in
Vercel to see which file 404'd.
