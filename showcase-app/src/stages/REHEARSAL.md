# Rehearsal

Filmed with stageshow `scripts/film.mjs` against `npm run dev` (Microsoft Edge, Playwright).

| Capture | Command | Result |
|---|---|---|
| Wide loop (1440) | `film.mjs <url> --gate` | rehearsal passed |
| Phone loop + states (390) | `film.mjs <url> --gate --width 390 --states` | rehearsal passed |
| Layout snapshot | `layout.mjs <url>` | no issues detected |
| Class clash | `class-clash.mjs src` | inconclusive by design: `.pg-kit` is defined in both `kit-tokens.css` and `site.css` on purpose; remaining lines are kit `:where()` guards |

Stages captured: `HeroStage` (wide 720×380, compact 358×330), `TuneTile`, `BatchTile`, `GraphTile` (400×190).

Fixes made while rehearsing:

- Spinner→Check swap replaced with one `Check` going pending → on.
- `Count` replaced with `States` crossfades: the figures change length (1,218.42 → 4.44, 0 → 12) and Count's post-roll homing read as a settle snap.
- Approve → Approved and every badge text change is a `States` crossfade; host `display: flex` removed from `States` roots (it un-stacked the states).
- Stage clip moved to `.ss-stage`; compact hero rebuilt to bleed off the bottom instead of the right so the Approve target stays whole.
- Cursor presses the Approve button off its label.

Not captured: reduced-motion (`--reduced`), dark theme (the site is light only), and the interactive demo pages, which are not scripted stages.
