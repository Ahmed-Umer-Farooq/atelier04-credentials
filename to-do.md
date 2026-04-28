# To-do

Badges show template placeholders / static copy instead of API data (`participant` name, course, dates, etc.) because `lib/badge/generateSVG.ts` replaces **hard-coded strings** from an older `lib/badge/template.svg`; the current template no longer contains those strings, so `replace()` does nothing.

**Fix:** Align `generateSVG` with the actual `template.svg` (or revert the template to match the replacers).
