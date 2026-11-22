# FlexHaus · The Comeback (booking page)

A static, single-page comeback-booking experience: vanilla three.js r170 (import map from jsDelivr), bloom post-processing, GPU chalk-dust particles, InstancedMesh rig/lamps/shafts, and scroll-driven camera + heartbeat pulse. All content and the form live in the DOM; the canvas is decorative and `aria-hidden`.

## Files

| Path | What |
|---|---|
| `index.html` | the page: hero → momentum → proof → comeback card + form |
| `css/main.css` | brand tokens (Carbon / Chalk / Volt / Ember), layout, states, reduced-motion + fallback rules |
| `js/app.js` | form, validation, personalisation, slots, submit, a11y, 3D boot + tier pick. Works with zero 3D |
| `js/scene.js` | the three.js scene, loaded via dynamic `import()` after `load` + idle |
| `thanks.html` | no-JS redirect target after a Formspree post |
| `.nojekyll` | stops GitHub Pages running Jekyll |

## Run locally

```sh
cd site
python -m http.server 8080
# open http://localhost:8080
```

ES modules need http(s); opening `index.html` from disk will skip the 3D (the form still works).

### Test switches (query string)

| Switch | Effect |
|---|---|
| `?reducedmotion=1` | forces the reduced-motion page (no 3D, no reveals, normal scroll) |
| `?nogl` | forces the no-WebGL static fallback |
| `?tier=high\|mid\|low` | forces a performance tier |
| `?nowatchdog` | disables the FPS watchdog (demotes a tier when avg frame > 22 ms; freezes to a still frame on `low` when > 34 ms) |
| `?name=Aoife` | personalises the eyebrow + pre-fills first name (then removed from the URL) |
| `?utm_source=sms&utm_campaign=comeback&utm_content=t1` | carried into the form submission for attribution |
| `?at=0.5` | debug: jump to a scroll fraction after load |

## The form: how it captures

The form defaults to a **`mailto:` fallback**: on submit the member's email app opens with the request pre-written to `hello@flexhaus.ie` (class, slot, name, contact, note, UTM content). This needs no account and costs €0, but it relies on the member pressing send.

**Recommended before launch: switch to Formspree (free tier, 50 submissions/month).**

1. Create a form at https://formspree.io and copy its endpoint, e.g. `https://formspree.io/f/abcdwxyz`.
2. In `index.html`, on `<form id="comeback-form">`, set `data-endpoint="https://formspree.io/f/abcdwxyz"` and `action="https://formspree.io/f/abcdwxyz"` (the `action` is for no-JS visitors; remove `enctype="text/plain"`).
3. Commit and push. JS posts via `fetch` and shows the success/error card; no-JS posts redirect to `thanks.html`.

The free tier's 50/month is enough for a pilot; the at-risk segment is 214 members, so a full send needs either a paid Formspree tier (**[ASSUMPTION]** about €10/month; check current pricing) (inside the €2,000 budget) or the mailto fallback.

## Deploy (GitHub Pages)

```sh
cd site
git init -b main && git add . && git commit -m "Comeback page"
gh repo create flexhaus-comeback --public --source . --push
gh api -X POST repos/<you>/flexhaus-comeback/pages -f "source[branch]=main" -f "source[path]=/"
```

The page is then at `https://<you>.github.io/flexhaus-comeback/`. All paths are relative, so it works from a project sub-path.

## Performance + accessibility notes

- Nothing 3D is downloaded until after `load` + idle; the form is interactive before three.js arrives.
- 3D is never loaded under `prefers-reduced-motion`, Save-Data, or without WebGL.
- Tiers: `low` (≤4 cores / ≤3 GB / no WebGL2) drops bloom (halo sprite instead), shafts, brick texture and the point light, and runs 800 dust points at DPR 1.
- Rendering pauses when the tab is hidden, and caps to 30 fps when idle or while a field is focused.
- A **Pause motion** button (WCAG 2.2.2) persists in `localStorage`.
- WebGL context loss: waits 2 s for a restore, else swaps to the static fallback.
