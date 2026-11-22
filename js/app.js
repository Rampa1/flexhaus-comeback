// FlexHaus "The Comeback": page logic. Everything needed to send a request lives here;
// three.js is only imported later (after load + idle) by bootScene(), never under reduced motion.

// ---- CONFIG: the single place to wire Formspree --------------------------------------
// Leave empty to use the mailto: fallback. To use Formspree, set data-endpoint on
// <form id="comeback-form"> in index.html (and its action, for no-JS visitors). See README.
const form = document.getElementById('comeback-form');
const FORMSPREE_ENDPOINT = (form.dataset.endpoint || '').trim();
const GYM_EMAIL = 'hello@flexhaus.ie';
// ---------------------------------------------------------------------------------------

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const root = document.documentElement;
const params = new URLSearchParams(location.search);
const reducedMotion = root.classList.contains('rm');
let scene = null; // scene API once loaded

form.noValidate = true;
if (FORMSPREE_ENDPOINT) {
  form.action = FORMSPREE_ENDPOINT;
  form.removeAttribute('enctype');
}

// ---- Personalisation + UTM -----------------------------------------------------------
const firstName = (() => {
  const raw = (params.get('name') || '').normalize('NFC').trim().split(/\s+/)[0] || '';
  const clean = raw.replace(/[^\p{L}\p{M}'’-]/gu, '').slice(0, 30);
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
})();
if (firstName) {
  $('#eyebrow').textContent = `The comeback · Hi ${firstName}`;
  const f = $('#f-name');
  if (!f.value) f.value = firstName;
  // Don't leave a name sitting in the address bar / history.
  params.delete('name');
  try { history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash); } catch (e) {}
}
['utm_source', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
  const v = (params.get(k) || '').replace(/[^\w.-]/g, '').slice(0, 40);
  if (v) form.elements[k].value = v;
});
form.elements._next.value = new URL('thanks.html', location.href).href;

// ---- Slots relative to today -------------------------------------------------------------
const DAY = 864e5;
const fmtI = new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' });
const fmt = { format: (d) => fmtI.format(d).replace(',', '') }; // "Sat 28 Nov"
const fmtLong = new Intl.DateTimeFormat('en-IE', { weekday: 'long' });
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function at(d, h) { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; }
function nextDow(now, dow, h) { // next given weekday at hour h that is >= 24h away
  let d = at(now, h); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  while (d - now < DAY) d.setDate(d.getDate() + 7);
  return d;
}
const now = new Date();
const sat = nextDow(now, 6, 8);
const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
let wkd = at(now, 17); do { wkd.setDate(wkd.getDate() + 1); } while (wkd.getDay() % 6 === 0 || wkd - now < DAY);
const SLOTS = {
  sat: { date: sat, label: `${fmt.format(sat)} · 08:00`, day: fmtLong.format(sat) },
  sun: { date: sun, label: `${fmt.format(sun)} · 08:00`, day: fmtLong.format(sun) },
  wkd: { date: wkd, label: `A weekday · 17:00 (e.g. ${fmt.format(wkd)})`, day: 'a weekday', approx: true },
  other: { label: 'Another time: tell us below', day: 'soon' },
};
$$('input[name="slot"]').forEach((r) => {
  const s = SLOTS[r.dataset.slot];
  if (!s) return;
  $('.slot-text', r.parentElement).textContent = s.label;
  if (s.date) r.value = s.approx ? `Weekday 17:00 (any; e.g. ${iso(s.date)})` : `${iso(s.date)} 08:00 (${fmt.format(s.date)})`;
});
const pick = () => ({
  cls: form.elements.class.value,
  slotKey: ($('input[name="slot"]:checked') || {}).dataset?.slot || 'sat',
});
function syncPick() {
  const { cls, slotKey } = pick();
  const s = SLOTS[slotKey];
  $('#see-day').textContent = slotKey === 'sat' || slotKey === 'sun' ? s.day : slotKey === 'wkd' ? 'this week' : 'soon';
  $('[data-pick-summary]').textContent = `${cls} · ${slotKey === 'other' ? 'a time that suits you' : s.label.replace(/ \(e\.g\..*\)/, '')}`;
}
form.addEventListener('change', syncPick);
syncPick();

// ---- Validation ---------------------------------------------------------------------
const F = { name: $('#f-name'), email: $('#f-email'), mobile: $('#f-mobile') };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normPhone = (v) => v.replace(/[\s().-]/g, '');
function setErr(id, msg, inputs) {
  const p = document.getElementById(id);
  p.textContent = msg || '';
  p.hidden = !msg;
  inputs.forEach((i) => (msg ? i.setAttribute('aria-invalid', 'true') : i.removeAttribute('aria-invalid')));
}
function validate() {
  const errs = [];
  const name = F.name.value.trim(), email = F.email.value.trim(), mob = normPhone(F.mobile.value);
  const nameMsg = name ? '' : 'What should we call you?';
  setErr('err-name', nameMsg, [F.name]); if (nameMsg) errs.push(F.name);
  const emailMsg = email && !EMAIL_RE.test(email) ? "That email doesn't look quite right. Check for a typo?" : '';
  const mobMsg = mob && !/^\+?\d{7,15}$/.test(mob) ? 'That number looks short. Include the area code?' : '';
  const none = !email && !mob;
  setErr('err-contact', none ? 'Add an email or a mobile so we can confirm.' : '', none ? [F.email, F.mobile] : []);
  setErr('err-email', emailMsg, emailMsg ? [F.email] : none ? [F.email] : []);
  setErr('err-mobile', mobMsg, mobMsg ? [F.mobile] : none ? [F.mobile] : []);
  if (none) errs.push(F.email);
  if (emailMsg) errs.push(F.email);
  if (mobMsg) errs.push(F.mobile);
  return [...new Set(errs)];
}
// Re-validate as they type only after a first submit attempt, so errors clear as soon as they're fixed.
Object.values(F).forEach((el) => el.addEventListener('input', () => { if (form.dataset.tried) validate(); }));

// ---- Submit ----------------------------------------------------------------------------
const btn = $('#submit-btn'), btnLabel = $('.btn-label', btn);
const status = $('#status'), alertBox = $('#alert');
let busy = false;
const say = (msg) => { status.textContent = ''; setTimeout(() => (status.textContent = msg), 30); };

function summary() {
  const { cls, slotKey } = pick();
  const s = SLOTS[slotKey];
  const slotText = slotKey === 'other' ? 'a time that suits you (see note)' : s.label;
  return { cls, slotKey, slotText, name: F.name.value.trim(), email: F.email.value.trim(), mobile: normPhone(F.mobile.value), note: form.elements.note.value.trim() };
}
function mailtoHref(d) {
  const subject = `Comeback request: ${d.cls}, ${d.slotText}`;
  const body = [
    'Hi FlexHaus team,', '', "I'd like to come back for a class. Please confirm a place for me:", '',
    `Class: ${d.cls}`, `When: ${d.slotText}`, `First name: ${d.name}`,
    `Email: ${d.email || '-'}`, `Mobile: ${d.mobile || '-'}`, `Note: ${d.note || '-'}`, '',
    `(source: comeback-page${form.elements.utm_content.value ? ', ' + form.elements.utm_content.value : ''})`,
  ].join('\r\n');
  return `mailto:${GYM_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function setLoading(on) {
  busy = on;
  $$('input, textarea', form).forEach((i) => { if (i.type !== 'radio' && i.type !== 'hidden') i.readOnly = on; });
  if (on) {
    btn.style.width = btn.offsetWidth + 'px';
    btn.setAttribute('aria-disabled', 'true');
    btnLabel.textContent = 'Sending…';
    if (!reducedMotion) btnLabel.insertAdjacentHTML('afterend', '<span class="spinner" aria-hidden="true"></span>');
  } else {
    btn.removeAttribute('aria-disabled'); btn.style.width = '';
    $('.spinner', btn)?.remove();
  }
}
function icsLink(d) {
  const s = SLOTS[d.slotKey];
  if (!s.date || s.approx) return null;
  const start = s.date, end = new Date(+start + 3600e3);
  const z = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FlexHaus//Comeback//EN', 'BEGIN:VEVENT',
    `UID:${Date.now()}@flexhaus.ie`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
    `SUMMARY:FlexHaus comeback class (to be confirmed): ${d.cls}`, 'STATUS:TENTATIVE',
    'DESCRIPTION:Requested, not yet confirmed. The FlexHaus team will confirm by email or text.',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.className = 'btn btn-ghost';
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'flexhaus-comeback.ics';
  a.textContent = 'Pencil it in';
  return a;
}
function showDone(d, mode) {
  const card = $('#card'), done = $('#card-done');
  const who = d.name ? `, ${d.name}` : '';
  const via = d.email ? 'email' : 'text';
  const h = $('#done-title'), body = $('#done-body'), extra = $('#done-extra'), acts = $('#done-actions');
  acts.textContent = '';
  if (mode === 'sent') {
    h.textContent = `Request sent. Welcome back${who}.`;
    body.textContent = `We'll confirm your ${d.cls}, ${d.slotText} by ${via} soon, usually within a day. Look out for a reminder the day before.`;
    extra.textContent = 'Need to change something? Just reply to our message.';
    say(`Request sent. We'll confirm by ${via}.`);
  } else {
    h.textContent = `Nearly there${who}.`;
    body.textContent = `Your email app should open with your request ready to send: ${d.cls}, ${d.slotText}. Hit send and we'll confirm by text or email.`;
    extra.textContent = "It's a request until the team confirms it. They'll remind you the day before.";
    const again = document.createElement('a');
    again.className = 'btn btn-ghost'; again.href = mailtoHref(d); again.textContent = "Email app didn't open? Try again";
    acts.append(again);
    const plain = document.createElement('span');
    plain.className = 'small'; plain.textContent = `Or email ${GYM_EMAIL} yourself.`;
    acts.append(plain);
    say('Your email app should open with your request ready to send.');
  }
  const ics = icsLink(d); if (ics) acts.prepend(ics);
  $('#card-body').hidden = true;
  done.hidden = false;
  card.classList.add('done');
  if (!reducedMotion) { card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse'); }
  h.focus();
  scene?.celebrate();
}
function showError(d) {
  alertBox.textContent = '';
  const a = document.createElement('a'); a.href = mailtoHref(d); a.textContent = 'email us your request';
  alertBox.append("That didn't send. Nothing's lost, your details are still here. Try again, or ", a, ' instead.');
  btnLabel.textContent = 'Try sending again';
  scene?.error();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  form.dataset.tried = '1';
  alertBox.textContent = '';
  const errs = validate();
  if (errs.length) {
    errs[0].focus();
    if (errs.length > 1) say(`${errs.length} things to fix before sending.`);
    return;
  }
  const d = summary();
  form.elements._subject.value = `Comeback request: ${d.cls}, ${d.slotText}`;
  if (form.elements._gotcha.value) { showDone(d, 'sent'); return; } // bot: pretend
  if (!FORMSPREE_ENDPOINT) { location.href = mailtoHref(d); showDone(d, 'mailto'); return; }
  setLoading(true);
  say('Sending your request…');
  try {
    const res = await fetch(FORMSPREE_ENDPOINT, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    setLoading(false);
    showDone(d, 'sent');
  } catch (err) {
    setLoading(false);
    showError(d);
  }
});

// ---- CTA anchors: move focus to the card heading ------------------------------------------
$$('a[href="#book"]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  const target = $('#card-body').hidden ? $('#done-title') : $('#book-title');
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
  history.replaceState(null, '', '#book');
}));

// ---- Sticky mobile bar + reveals --------------------------------------------------------
const bar = $('#sticky-bar'), barLink = $('a', bar);
let heroOut = false, cardIn = false;
function updateBar() {
  const show = heroOut && !cardIn;
  bar.classList.toggle('show', show);
  document.body.classList.toggle('has-bar', show && innerWidth < 768);
  bar.inert = !show; bar.setAttribute('aria-hidden', String(!show));
  barLink.tabIndex = show ? 0 : -1;
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => { heroOut = !e.isIntersecting && e.boundingClientRect.top < 0; updateBar(); }).observe($('#hero-cta'));
  new IntersectionObserver(([e]) => { cardIn = e.isIntersecting || e.boundingClientRect.top < 0; updateBar(); }).observe($('#card'));
  if (!reducedMotion) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
    root.classList.add('reveal-ready');
  }
}

// ---- Pause motion (WCAG 2.2.2) ----------------------------------------------------------
const pauseBtn = $('#pause-toggle');
function setPaused(p) {
  root.classList.toggle('paused', p);
  pauseBtn.setAttribute('aria-pressed', String(p));
  $('.pause-label', pauseBtn).textContent = p ? 'Play motion' : 'Pause motion';
  try { localStorage.setItem('fh-paused', p ? '1' : '0'); } catch (e) {}
  scene?.setPaused(p);
}
pauseBtn.addEventListener('click', () => setPaused(!root.classList.contains('paused')));

// ---- 3D boot (progressive enhancement) ----------------------------------------------------
function glSupport() {
  try {
    const c = document.createElement('canvas');
    const gl2 = c.getContext('webgl2');
    const gl = gl2 || c.getContext('webgl');
    if (!gl) return null;
    const res = { gl2: !!gl2 };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return res;
  } catch (e) { return null; }
}
function pickTier(gl2) {
  const forced = params.get('tier');
  if (['high', 'mid', 'low'].includes(forced)) return forced;
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency || 4;
  if (!gl2 || (mem && mem <= 3) || cores <= 4) return 'low';
  if (matchMedia('(pointer: fine)').matches && cores >= 8) return 'high';
  return 'mid';
}
function fallback(reason) {
  root.dataset.gl = 'fallback';
  root.classList.add('no-webgl');
  pauseBtn.hidden = true;
  $('#scene')?.remove();
  console.info('[flexhaus] static fallback:', reason);
}
function bootScene() {
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reducedMotion || saveData) { root.dataset.gl = 'off'; console.info('[flexhaus] 3D off:', reducedMotion ? 'reduced motion' : 'save-data'); return; }
  const sup = params.has('nogl') ? null : glSupport();
  if (!sup) { fallback(params.has('nogl') ? 'forced (?nogl)' : 'no WebGL'); return; }
  const go = () => import('./scene.js')
    .then((m) => m.start({
      tier: pickTier(sup.gl2),
      paused: root.classList.contains('paused'),
      watchdog: !params.has('nowatchdog'),
      onFail: fallback,
      onTier: (t) => { root.dataset.tier = t; },
      onFrozen: () => { root.dataset.gl = 'frozen'; pauseBtn.hidden = true; },
    }))
    .then((api) => { scene = api; root.dataset.gl = 'on'; pauseBtn.hidden = false; setPaused(root.classList.contains('paused')); })
    .catch((err) => fallback('load/init failed: ' + (err && err.message)));
  const idle = () => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 200));
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
}
bootScene();

// Debug only: ?at=0.5 jumps to that scroll fraction after load (used for screenshots).
if (params.has('at')) addEventListener('load', () => setTimeout(() => scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * +params.get('at'), behavior: 'instant' }), 300));

// Typing: let the scene drop to 30fps while a field has focus.
form.addEventListener('focusin', () => scene?.setFocusCap(true));
form.addEventListener('focusout', () => scene?.setFocusCap(false));
