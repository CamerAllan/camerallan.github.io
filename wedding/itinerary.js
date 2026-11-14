// ---- Your itinerary ----
// Events come from the sheet's Itinerary tab, already filtered by the backend to what this household is
// invited to. Each event can carry an RSVP status icon (wedding / night_before / room).
let itinData = null;

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
  if (s === 'yes') return `<span class="status yes" title="${esc(t('stYes'))}">✓ ${t('stYes')}</span>`;
  if (s === 'no') return `<span class="status no" title="${esc(t('stNo'))}">✗ ${t('stNo')}</span>`;
  return `<a class="status todo" href="rsvp.html">● ${t('stTodo')}</a>`;
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

function renderItinerary() {
  if (!itinData) return;
  const items = itinData.itinerary;
  if (!items || !items.length) { $('itinerary').innerHTML = `<p>${t('itinEmpty')}</p>`; return; }
  // Group consecutive rows by day, keeping the sheet's order.
  const days = [];
  items.forEach(it => {
    const day = tidy(L(it, 'day'), 'day');
    if (!days.length || days.at(-1).day !== day) days.push({ day, items: [] });
    days.at(-1).items.push(it);
  });
  $('itinerary').innerHTML = days.map(d => `
    <h3 class="itin-day">${esc(d.day)}</h3>
    <ul class="timeline itin">
      ${d.items.map(it => `<li>
        <span class="time">${esc(tidy(L(it, 'time'), 'time'))}</span>
        <span class="itin-body">
          <span class="itin-title">${esc(L(it, 'title'))}</span>
          ${it.rsvp === 'room' && itinData.invite.room ? `<span class="muted"> · ${esc(L(itinData.invite.room, 'name'))}</span>` : ''}
          ${L(it, 'details') ? `<span class="desc">${esc(L(it, 'details'))}</span>` : ''}
          ${statusBadge(it.rsvp, itinData.existing)}
        </span></li>`).join('')}
    </ul>`).join('');
  $('legend').textContent = t('itinLegend');
}

document.addEventListener('langchange', renderItinerary);
whenUnlocked(async () => {
  try {
    let data = await getInvite(getCode());
    // Data saved earlier in this browser session may predate the itinerary: fetch a fresh copy.
    if (data.ok && !Array.isArray(data.itinerary)) {
      data = await apiGet(getCode(), getVerified()?.name);
      if (data.ok) cacheInvite(getCode(), data);
    }
    if (data.ok) { itinData = data; renderItinerary(); }
    else $('itinerary').innerHTML = `<p>${t('wentWrong')}</p>`;
  } catch (e) { $('itinerary').innerHTML = `<p>${t('unreachable')}</p>`; }
});
