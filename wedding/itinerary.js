// ---- Your itinerary: every event this household is invited to, each linking to its page ----
withInvite(data => {
  const events = householdEvents(data);
  const html = events.map(id => {
    const rows = rowsFor(data, id);
    if (!rows.length) return '';
    return `<div class="itin-event">
      <h3 class="itin-event-title"><a href="${EVENTS[id].page}">${esc(eventTitle(id))} <span aria-hidden="true">→</span></a></h3>
      ${timelineHtml(rows, data)}
    </div>`;
  }).join('');
  $('itinerary').innerHTML = html || `<p>${t('itinEmpty')}</p>`;
}, 'itinerary');
