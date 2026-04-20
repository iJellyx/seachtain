# Abbie mascot assets

Drop the four PNG files in here, exactly with these names. The renderer
picks them up at `/mascot/abbie-*.png` on the deployed site. Until they're
present, a simple SVG fallback bee is drawn so nothing looks broken.

## The four files

| Filename | Pose / usage |
|---|---|
| `abbie-wave.png` | Waving/greeting. Used in the floating bottom-right helper and the landing hero. |
| `abbie-idle.png` | Standing calmly, arms down. Used for reserved moments. |
| `abbie-apple.png` | Holding the apple. Used for the onboarding "all set" celebration + success states. |
| `abbie-tablet.png` | Holding the Lesson Planner iPad. Used on the profile page + thinking moments. |

## Specs

- Format: **PNG with transparent background**
- Recommended size: **800 × 800 pixels** (square) or larger
- Character centred roughly in the frame — the renderer crops to the
  character for the small bottom-right toggle, so a bit of whitespace
  around her is fine
- Keep the character sized consistently across the four files — same
  apparent height in each so she doesn't "grow" between poses

## How to save them

1. For each pose, right-click → **Save image as…** in your browser, or
   export the specific layer/pose from whatever tool generated them
2. Rename to one of the four filenames above
3. Place directly in this `/mascot/` folder (next to this README)
4. Commit & push — Vercel serves them from `/mascot/abbie-*.png` on the
   live site within about 30 seconds

## Checking it worked

- Land on `/welcome` — the hero bee should be the uploaded illustration,
  not the simple drawn fallback
- Any page other than `/welcome` and `/onboarding` — the floating
  bottom-right button should show Abbie's waving face
- If you still see the simple drawn bee: check the filename casing
  matches exactly (lower-case, hyphen, `.png`)
