// ---- Details: one section per event this household is invited to ----
// Each section: title, when & where, free-text details (Events tab), RSVP status, then that event's timeline
// (Itinerary tab). The wedding section also links to parking. Bridal party rows (Itinerary for = bridal_party)
// simply appear in the timelines of households with someone in the bridal party.

const MAP = q => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

/** Event info from the sheet, or sensible defaults if the backend hasn't been updated yet. */
function eventsFor(data) {
  if (Array.isArray(data.events) && data.events.length) return data.events;
  const nb = data.invite.nightBefore || {};
  const defaults = {
    night_before: { title: nb.title, title_es: nb.title_es, when: nb.when, when_es: nb.when_es, location: nb.where, location_es: nb.where_es, details: nb.details, details_es: nb.details_es },
    wedding: { when: 'Saturday 12th June 2027', when_es: 'Sábado, 12 de junio de 2027', location: 'Rowallan Castle, Kilmaurs, Ayrshire KA3 2LP' },
    morning_after: { when: 'Sunday 13th June 2027', when_es: 'Domingo, 13 de junio de 2027', location: 'Rowallan Castle' }
  };
  return householdEvents(data).map(id => ({ event: id, ...defaults[id] }));
}


withInvite(data => {
  $('events').innerHTML = eventsFor(data).map(ev => {
    const id = ev.event;
    const title = L(ev, 'title') || eventTitle(id);
    const loc = L(ev, 'location');
    const details = L(ev, 'details');
    const rows = rowsFor(data, id);
    return `<section class="event-section" id="${id}">
      <h2>${esc(title)}</h2>
      <p class="event-meta">
        ${L(ev, 'when') ? `<span>${esc(L(ev, 'when'))}</span>` : ''}
        ${loc ? `<a href="${MAP(loc)}" target="_blank" rel="noopener">${esc(loc)}</a>` : ''}
      </p>
      <div class="event-status">${statusBadge(EVENTS[id].status, data.existing)}</div>
      ${details ? details.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join('') : ''}
      ${id === 'wedding' ? `<p><a href="travel.html#parking">${t('parkingLink')}</a></p>` : ''}
      ${rows.length ? `<div class="event-timeline">${timelineHtml(rows, data, {
          skipStatus: EVENTS[id].status,                                 // already shown at the top of the section
          dayHeadings: spansDays(rows)                                   // otherwise the date is already in the section heading
        })}</div>` : ''}
    </section>`;
  }).join('');
  // Jump to a section if the link asked for one (e.g. old event-page links).
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}, 'events');
