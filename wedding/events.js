// ---- Events: shared by Home, the itinerary and the three event pages ----
// Itinerary rows come from the sheet (already filtered to what this household is invited to). Each row's
// "event" column puts it on an event page; each row's "rsvp" column decides its status icon.

const EVENTS = {
  night_before:  { page: 'night-before.html',  status: 'night_before', en: 'The night before',  es: 'La noche anterior' },
  wedding:       { page: 'wedding.html',       status: 'wedding',      en: 'The wedding',       es: 'La boda' },
  morning_after: { page: 'morning-after.html', status: 'room',         en: 'The morning after', es: 'La mañana siguiente' }
};
const EVENT_ORDER = ['night_before', 'wedding', 'morning_after'];
const eventTitle = id => EVENTS[id][getLang()];

/** Which event a row belongs to. Falls back to a guess if the sheet's "event" column isn't there yet. */
function eventOf(it) {
  if (EVENTS[it.event]) return it.event;
  if (it.rsvp === 'night_before') return 'night_before';
  if (/sunday|domingo/i.test((it.day || '') + ' ' + (it.day_es || ''))) return 'morning_after';
  return 'wedding';
}

/** The household's invite + itinerary, refetching if this browser's saved copy predates the itinerary. */
async function loadInviteData() {
  let data = await getInvite(getCode());
  if (data.ok && !Array.isArray(data.itinerary)) {
    data = await apiGet(getCode(), getVerified()?.name);
    if (data.ok) cacheInvite(getCode(), data);
  }
  return data;
}

/** Events this household is invited to, in order. */
function householdEvents(data) {
  const ids = new Set((data.itinerary || []).map(eventOf));
  ids.add('wedding');
  if (data.invite.nightBefore) ids.add('night_before');
  return EVENT_ORDER.filter(id => ids.has(id));
}
const rowsFor = (data, id) => (data.itinerary || []).filter(it => eventOf(it) === id);

/** This household's answer for one RSVP item: 'yes', 'no' or '' (not answered yet). */
function rsvpStatus(kind, existing) {
  if (!existing || !existing.length) return '';
  if (kind === 'room') return existing[0].room_accepted || '';
  const field = kind === 'night_before' ? 'night_before' : 'attending';
  const answers = existing.map(e => e[field]).filter(Boolean);
  if (answers.includes('yes')) return 'yes';
  return answers.length ? 'no' : '';
}

function statusBadge(kind, existing) {
  if (!kind) return '';
  const s = rsvpStatus(kind, existing);
  if (s === 'yes') return `<span class="status yes">${t('stYes')}</span>`;
  if (s === 'no') return `<span class="status no">${t('stNo')}</span>`;
  return `<a class="status todo" href="rsvp.html">${t('stTodo')}</a>`;
}

// If a cell ever arrives as a full date string ("Fri Jun 11 2027 19:00:00 GMT+0100 …"), show just the useful part.
function tidy(value, kind) {
  if (!/\d{2}:\d{2}:\d{2} GMT/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d)) return value;
  const locale = getLang() === 'es' ? 'es-ES' : 'en-GB';
  if (kind === 'day') return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  // Take the clock time as written (1899 dates carry odd historical time-zone offsets).
  const [, hh, mm] = value.match(/(\d{2}):(\d{2}):\d{2} GMT/);
  const h = Number(hh);
  return getLang() === 'es' ? `${hh}:${mm}` : `${h % 12 || 12}:${mm}${h < 12 ? 'am' : 'pm'}`;
}
const dayOf = it => tidy(L(it, 'day'), 'day');

/** Timeline for some itinerary rows, with a heading for each day. */
function timelineHtml(items, data, { badges = true } = {}) {
  const days = [];
  items.forEach(it => {
    const day = dayOf(it);
    if (!days.length || days.at(-1).day !== day) days.push({ day, items: [] });
    days.at(-1).items.push(it);
  });
  return days.map(d => `
    <h3 class="itin-day">${esc(d.day)}</h3>
    <ul class="timeline itin">
      ${d.items.map(it => `<li>
        <span class="time">${esc(tidy(L(it, 'time'), 'time'))}</span>
        <span class="itin-body">
          <span class="itin-title">${esc(L(it, 'title'))}</span>
          ${it.rsvp === 'room' && data.invite.room ? `<span class="muted"> · ${esc(L(data.invite.room, 'name'))}</span>` : ''}
          ${L(it, 'details') ? `<span class="desc">${esc(L(it, 'details'))}</span>` : ''}
          ${badges ? statusBadge(it.rsvp, data.existing) : ''}
        </span></li>`).join('')}
    </ul>`).join('');
}

/** Run render(data) once the guest is unlocked and their data has loaded, and again on language change. */
function withInvite(render, target) {
  let data = null;
  const draw = () => { if (data) render(data); };
  document.addEventListener('langchange', draw);
  whenUnlocked(async () => {
    try {
      data = await loadInviteData();
      if (!data.ok) { if (target) $(target).innerHTML = `<p>${t('wentWrong')}</p>`; data = null; return; }
      draw();
    } catch (e) { if (target) $(target).innerHTML = `<p>${t('unreachable')}</p>`; }
  });
}
