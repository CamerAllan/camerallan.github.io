// ---- UI ----
let state = null; // { invite, menu, existing }

const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const OTHER = 'Other';

function personBlock(idx, name, isPlusOne, existing) {
  const ticked = splitList(existing?.diets);
  const dietNames = [...(state.menu.diets || []), OTHER];
  const diets = dietNames.map(d => `
      <label><input type="checkbox" class="pdiet-tick" value="${esc(d)}" ${ticked.includes(d)?'checked':''}> ${esc(term(d))}</label>`).join('');
  // Dish lists are filled in by refreshOptions() so they can be filtered by the ticked diets.
  const courses = state.menu.courses.map((c, ci) => `
    <fieldset class="course" data-ci="${ci}" data-course="${esc(c.name)}" data-initial="${esc(existing?.[c.name])}">
      <legend>${esc(term(c.name))}</legend>
      <div class="dishes"></div>
      <p class="muted none-fit hidden">${esc(t('noneFit', { course: term(c.name).toLowerCase() }))}</p>
    </fieldset>`).join('');
  const att = existing ? existing.attending : '';
  return `
  <div class="card person" data-idx="${idx}" data-plus-one="${isPlusOne}">
    ${isPlusOne
      ? `<label for="p${idx}-name">${t('guestName')}</label><input type="text" id="p${idx}-name" class="pname" value="${esc(name)}" maxlength="100" required>`
      : `<h3>${esc(name)}</h3><input type="hidden" class="pname" value="${esc(name)}">`}
    ${isPlusOne ? '' : `<div class="choices att-choices">
      <label><input type="radio" class="att" name="att${idx}" value="yes" ${att==='yes'?'checked':''}> ${t('accepts')}</label>
      <label><input type="radio" class="att" name="att${idx}" value="no" ${att==='no'?'checked':''}> ${t('declines')}</label>
    </div>`}
    <div class="meal ${isPlusOne || att==='yes'?'':'hidden'}">
      <label>${t('dietary')}</label>
      <div class="stack">${diets}</div>
      <div class="other-wrap ${ticked.includes(OTHER)?'':'hidden'}">
        <label for="p${idx}-diet">${t('tellUs')}</label>
        <input type="text" id="p${idx}-diet" class="pdiet" maxlength="500" value="${esc(existing?.dietary_notes)}">
      </div>
      ${courses}
    </div>
  </div>`;
}

// Plus-ones are only on the form when "I'm bringing a guest" is ticked, so they're always attending.
function isPlusOne(el) { return el.dataset.plusOne === 'true'; }
function isActive(el) { return !el.closest('.po-body.hidden'); }
function isAttending(el) { return isPlusOne(el) ? isActive(el) : el.querySelector('input.att:checked')?.value === 'yes'; }
function personName(el) { return isPlusOne(el) ? (el.querySelector('.pname').value.trim() || t('yourGuest')) : el.querySelector('.pname').value; }

function tickedDiets(el) {
  return [...el.querySelectorAll('.pdiet-tick:checked')].map(c => c.value);
}

/** Rebuild each course's dish list to show only dishes that suit every ticked diet. */
function refreshOptions(el) {
  const ticked = tickedDiets(el);
  show(el.querySelector('.other-wrap'), ticked.includes(OTHER));
  const diets = ticked.filter(d => d !== OTHER); // "Other" is free text, so it doesn't filter dishes
  const idx = el.dataset.idx;
  el.querySelectorAll('.course').forEach(fs => {
    const course = state.menu.courses[fs.dataset.ci];
    const current = fs.querySelector('input:checked')?.value || fs.dataset.initial || '';
    fs.dataset.initial = '';
    const fits = course.options.filter(o => diets.every(d => o.diets && d in o.diets));
    const name = `p${idx}-c${fs.dataset.ci}`;
    fs.querySelector('.dishes').innerHTML = fits.map((o, oi) => {
      // e.g. "✓ Vegetarian · ✓ Gluten-free (on request)" for the diets this guest ticked
      const tags = diets.map(d => '✓ ' + esc(term(d)) + (o.diets[d] ? ' (' + esc(term(o.diets[d])) + ')' : '')).join(' · ');
      return `<label class="dish">
        <input type="radio" name="${name}" value="${esc(o.option)}" ${o.option === current ? 'checked' : ''}>
        <span><strong>${esc(o.option)}</strong>
          ${L(o, 'description') ? `<span class="desc">${esc(L(o, 'description'))}</span>` : ''}
          ${tags ? `<span class="tags">${tags}</span>` : ''}</span>
      </label>`;
    }).join('');
    show(fs.querySelector('.none-fit'), fits.length === 0);
  });
}

function wirePerson(el) {
  const meal = el.querySelector('.meal');
  el.querySelectorAll('input.att').forEach(r => r.addEventListener('change', () => {
    show(meal, el.querySelector('input.att:checked')?.value === 'yes');
    refreshOptions(el);
  }));
  el.querySelectorAll('.pdiet-tick').forEach(c => c.addEventListener('change', () => refreshOptions(el)));
  refreshOptions(el);
}

function renderForm() {
  const { invite, existing } = state;
  const byName = Object.fromEntries(existing.filter(e => e.is_plus_one !== 'yes').map(e => [e.guest_name, e]));
  const plusExisting = existing.filter(e => e.is_plus_one === 'yes');

  $('greeting').textContent = t('greeting', { names: listNames(invite.guests) });
  $('people').innerHTML = invite.guests.map((g, i) => personBlock(i, g, false, byName[g])).join('');

  // Plus-ones
  const po = $('plus-ones');
  po.innerHTML = '';
  if (invite.plusOnesAllowed > 0) {
    for (let k = 0; k < invite.plusOnesAllowed; k++) {
      const idx = invite.guests.length + k;
      const ex = plusExisting[k];
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <div class="choices"><label><input type="checkbox" class="po-toggle" ${ex?'checked':''}> ${t('bringingGuest')}</label></div>
        <div class="po-body ${ex?'':'hidden'}">${personBlock(idx, ex?.guest_name || '', true, ex)}</div>`;
      po.appendChild(wrap);
      const body = wrap.querySelector('.po-body');
      const toggle = wrap.querySelector('.po-toggle');
      const setReq = () => body.querySelectorAll('input,select').forEach(i => { if (!toggle.checked) i.disabled = true; else i.disabled = false; });
      toggle.addEventListener('change', () => { show(body, toggle.checked); setReq(); refreshOptions(body.querySelector('.person')); syncNightBefore(); });
      body.querySelector('.pname').addEventListener('input', syncNightBefore);
      setReq();
    }
  }

  // Night-before party (details only come back from the server for invited households)
  const nbEl = $('night-before');
  if (invite.nightBefore) {
    const n = invite.nightBefore;
    const nbExisting = Object.fromEntries(existing.map(e => [e.guest_name, e.night_before]));
    const rows = [...invite.guests.map((g, i) => ({ idx:i, name:g })),
                  ...Array.from({ length: invite.plusOnesAllowed }, (_, k) => ({ idx: invite.guests.length + k, name: plusExisting[k]?.guest_name || '', plus:true }))];
    nbEl.innerHTML = `
      <div class="card">
        <h3>${esc(t('alsoInvited', { title: L(n, 'title') || t('nightBefore') }))}</h3>
        ${L(n, 'when') ? `<p style="margin:0">${esc(L(n, 'when'))}</p>` : ''}
        ${L(n, 'where') ? `<p style="margin:0">${esc(L(n, 'where'))}</p>` : ''}
        ${L(n, 'details') ? `<p>${esc(L(n, 'details'))}</p>` : ''}
        ${rows.map(r => {
          const v = nbExisting[r.name] || '';
          return `<div class="nb-row" data-idx="${r.idx}" ${r.plus ? 'data-plus-one="true"' : ''}>
            <span class="nb-name">${esc(r.name)}</span>
            <span class="choices">
              <label><input type="radio" name="nb${r.idx}" value="yes" ${v==='yes'?'checked':''}> ${t('willBeThere')}</label>
              <label><input type="radio" name="nb${r.idx}" value="no" ${v==='no'?'checked':''}> ${t('cantMake')}</label>
            </span></div>`;
        }).join('')}
      </div>`;
    show(nbEl, true);
  } else {
    nbEl.innerHTML = '';
    show(nbEl, false);
  }

  // Room
  const roomEl = $('room');
  if (invite.room) {
    const r = invite.room;
    const acc = existing[0]?.room_accepted || '';
    roomEl.innerHTML = `
      <div class="card room">
        ${r.image ? `<img src="${esc(r.image)}" alt="${esc(r.name)}">` : ''}
        <h3>${esc(t('roomSaved', { room: L(r, 'name') }))}</h3>
        ${L(r, 'nights') ? `<p class="muted" style="margin:0 0 6px">${esc(L(r, 'nights'))}</p>` : ''}
        ${L(r, 'price') ? `<p class="price">${esc(L(r, 'price'))}</p>` : ''}
        <p style="margin-top:0">${esc(L(r, 'description'))}</p>
        <p class="muted" style="margin-top:0">${t('breakfast')}</p>
        <div class="choices">
          <label><input type="radio" name="room" value="yes" ${acc==='yes'?'checked':''}> ${t('yesPlease')}</label>
          <label><input type="radio" name="room" value="no" ${acc==='no'?'checked':''}> ${t('noThanks')}</label>
        </div>
      </div>`;
    show(roomEl, true);
  } else {
    roomEl.innerHTML = '';
    show(roomEl, false);
  }

  $('message').value = existing[0]?.message || '';
  document.querySelectorAll('.person').forEach(wirePerson);
  syncNightBefore();
  attempted = false;
  show($('form-notice'), false);
  show($('code-form'), false);
  show($('done'), false);
  show($('rsvp-form'), true);
}

/** Show the plus-one's night-before row only when they're coming, labelled with their name. */
function syncNightBefore() {
  document.querySelectorAll('.nb-row[data-plus-one]').forEach(row => {
    const person = document.querySelector(`.person[data-idx="${row.dataset.idx}"]`);
    const on = person && isActive(person);
    show(row, on);
    if (on) row.querySelector('.nb-name').textContent = personName(person);
  });
}

let attempted = false;

/** Returns a list of { el, msg } for everything still missing, and marks those parts of the form. */
function validate() {
  const problems = [];
  const add = (el, msg) => problems.push({ el, msg });
  document.querySelectorAll('.person').forEach(el => {
    if (!isActive(el)) return;
    const who = personName(el);
    if (isPlusOne(el) && !el.querySelector('.pname').value.trim()) add(el.querySelector('.pname'), t('enterGuestName'));
    if (!isPlusOne(el) && !el.querySelector('input.att:checked')) { add(el.querySelector('.att-choices'), t('letUsKnow', { who })); return; }
    if (!isAttending(el)) return;
    if (tickedDiets(el).includes(OTHER) && !el.querySelector('.pdiet').value.trim()) add(el.querySelector('.pdiet'), t('tellDiet', { who }));
    el.querySelectorAll('.course').forEach(fs => {
      if (fs.querySelector('.dish') && !fs.querySelector('input:checked')) add(fs, t('chooseCourse', { who, course: term(fs.dataset.course).toLowerCase() }));
    });
  });
  document.querySelectorAll('.nb-row').forEach(row => {
    if (row.classList.contains('hidden') || row.querySelector('input:checked')) return;
    add(row, t('nbQuestion', { who: row.querySelector('.nb-name').textContent, title: L(state.invite.nightBefore, 'title') || t('nightBefore') }));
  });
  if (state.invite.room && !document.querySelector('input[name=room]:checked')) add($('room').firstElementChild, t('roomQuestion', { room: L(state.invite.room, 'name') }));

  document.querySelectorAll('.invalid').forEach(x => x.classList.remove('invalid'));
  problems.forEach(p => p.el.classList.add('invalid'));
  const notice = $('form-notice');
  notice.innerHTML = problems.length ? `<strong>${t('needAnswer')}</strong><ul>${problems.map((p, i) => `<li><a href="#" data-i="${i}">${esc(p.msg)}</a></li>`).join('')}</ul>` : '';
  notice.querySelectorAll('a').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    problems[a.dataset.i].el.scrollIntoView({ behavior:'smooth', block:'center' });
  }));
  show(notice, problems.length > 0);
  return problems;
}

// Once they've tried to submit, keep the notice up to date as they fix things.
$('rsvp-form').addEventListener('input', () => { if (attempted) validate(); });
$('rsvp-form').addEventListener('change', () => { if (attempted) validate(); });

function listNames(names) {
  const first = names.map(n => n.split(' ')[0]);
  const and = getLang() === 'es' ? ' y ' : ' & ';
  return first.length <= 1 ? first.join('') : first.slice(0, -1).join(', ') + and + first.at(-1);
}

function collect() {
  const people = [];
  document.querySelectorAll('.person').forEach(el => {
    if (el.closest('.po-body.hidden')) return; // plus-one not ticked
    const attending = isAttending(el);
    const diets = attending ? tickedDiets(el) : [];
    const nb = document.querySelector(`input[name="nb${el.dataset.idx}"]:checked`)?.value;
    const courses = {};
    el.querySelectorAll('.course').forEach(fs => courses[fs.dataset.course] = attending ? (fs.querySelector('input:checked')?.value || '') : '');
    people.push({
      guest_name: el.querySelector('.pname').value.trim(),
      is_plus_one: el.dataset.plusOne === 'true',
      attending,
      courses,
      diets,
      dietary: diets.includes(OTHER) ? el.querySelector('.pdiet').value.trim() : '',
      night_before: nb === 'yes' ? true : nb === 'no' ? false : null
    });
  });
  const roomVal = document.querySelector('input[name=room]:checked')?.value;
  return {
    code: state.invite.code,
    people,
    room_accepted: roomVal === 'yes' ? true : roomVal === 'no' ? false : null,
    message: $('message').value.trim()
  };
}

function renderSummary(payload) {
  const rows = payload.people.map(p => `<dt>${esc(p.guest_name)}</dt><dd>${p.attending
    ? t('attending') + ' · ' + [...p.diets.filter(d => d !== OTHER).map(term), ...Object.values(p.courses).filter(Boolean), p.dietary].filter(Boolean).map(esc).join(' · ')
    : t('notAttending')}</dd>`);
  if (state.invite.nightBefore) {
    const title = L(state.invite.nightBefore, 'title') || t('nightBefore');
    rows.push(`<dt>${esc(title)}</dt><dd>${payload.people.map(p => esc(p.guest_name) + ': ' + (p.night_before ? t('willBeThereLc') : t('cantMakeLc'))).join('<br>')}</dd>`);
  }
  if (state.invite.room) rows.push(`<dt>${esc(L(state.invite.room, 'name'))}</dt><dd>${payload.room_accepted ? t('yesPlease') : t('noThanks')}</dd>`);
  $('summary').innerHTML = rows.join('');
}

const LOADING_MESSAGES = [[0, 'loading1'], [2500, 'loading2'], [5000, 'loading3'], [9000, 'loading4']];
let loadingTimers = [];
function setLoading(on) {
  loadingTimers.forEach(clearTimeout);
  loadingTimers = [];
  show($('loading'), on);
  if (!on) return;
  LOADING_MESSAGES.forEach(([ms, text]) => loadingTimers.push(setTimeout(() => {
    const el = $('loading-text');
    el.textContent = t(text);
    el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''; // replay fade-in
  }, ms)));
}

async function loadInvite(code) {
  code = code.trim().toUpperCase();
  show($('code-error'), false);
  show($('code-form'), false);
  setLoading(true);
  try {
    const data = await apiGet(code);
    if (!data.ok) {
      $('code-error').textContent = data.error === 'not_found' ? t('notFound') : t('wentWrong');
      show($('code-error'), true);
      show($('code-form'), true);
      return;
    }
    state = data;
    adoptInviteLang(data.invite);
    storeCode(code);
    cacheInvite(code, data);
    const url = new URL(location.href);
    url.searchParams.set('code', code);
    history.replaceState(null, '', url);
    renderForm();
  } catch (e) {
    $('code-error').textContent = t('unreachable');
    show($('code-error'), true);
    show($('code-form'), true);
  } finally {
    setLoading(false);
  }
}

$('code-form').addEventListener('submit', e => { e.preventDefault(); loadInvite($('code-input').value); });

$('rsvp-form').addEventListener('submit', async e => {
  e.preventDefault();
  attempted = true;
  if (validate().length) return;
  const payload = collect();
  const btn = $('submit-btn');
  btn.disabled = true; btn.textContent = t('sending');
  show($('submit-error'), false);
  try {
    const res = await apiPost(payload);
    if (!res.ok) throw new Error(res.error);
    state.existing = toExisting(payload);
    lastPayload = payload;
    cacheInvite(state.invite.code, state);
    renderSummary(payload);
    show($('rsvp-form'), false);
    show($('done'), true);
    $('rsvp').scrollIntoView({ behavior:'smooth' });
  } catch (err) {
    $('submit-error').textContent = t('sendFailed');
    show($('submit-error'), true);
  } finally {
    btn.disabled = false; btn.textContent = t('send');
  }
});

$('edit-btn').addEventListener('click', renderForm);

/** Convert a submitted payload into the same shape as saved rows, so the form can be re-filled from it. */
function toExisting(payload) {
  const yn = v => v === true ? 'yes' : v === false ? 'no' : '';
  return payload.people.map(p => ({ ...p.courses, guest_name:p.guest_name, is_plus_one:p.is_plus_one?'yes':'no',
    attending:p.attending?'yes':'no', diets:p.diets.join(', '), dietary_notes:p.dietary,
    room_accepted: yn(payload.room_accepted), message:payload.message, night_before: yn(p.night_before) }));
}
let lastPayload = null;

// Switching language re-draws the form in place, keeping anything already filled in.
document.addEventListener('langchange', () => {
  if (!state) return;
  if (!$('rsvp-form').classList.contains('hidden')) {
    const wasAttempted = attempted;
    state.existing = toExisting(collect());
    renderForm();
    if (wasAttempted) { attempted = true; validate(); }
  } else if (!$('done').classList.contains('hidden') && lastPayload) {
    renderSummary(lastPayload);
  }
});

// Load straight away if we know their code (from the link, or remembered from another page).
const initial = getCode();
if (initial) { show($('code-form'), false); loadInvite(initial); }
