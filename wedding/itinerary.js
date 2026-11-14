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

function renderItinerary() {
  if (!itinData) return;
  const items = itinData.itinerary;
  if (!items || !items.length) { $('itinerary').innerHTML = `<p>${t('itinEmpty')}</p>`; return; }
  // Group consecutive rows by day, keeping the sheet's order.
  const days = [];
  items.forEach(it => {
    const day = L(it, 'day');
    if (!days.length || days.at(-1).day !== day) days.push({ day, items: [] });
    days.at(-1).items.push(it);
  });
  $('itinerary').innerHTML = days.map(d => `
    <h3 class="itin-day">${esc(d.day)}</h3>
    <ul class="timeline itin">
      ${d.items.map(it => `<li>
        <span class="time">${esc(L(it, 'time'))}</span>
        <span class="itin-body">
          <strong>${esc(L(it, 'title'))}</strong>
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
    const data = await getInvite(getCode());
    if (data.ok) { itinData = data; renderItinerary(); }
    else $('itinerary').innerHTML = `<p>${t('wentWrong')}</p>`;
  } catch (e) { $('itinerary').innerHTML = `<p>${t('unreachable')}</p>`; }
});
