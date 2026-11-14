// ---- Config ----
// Paste the Apps Script web app URL here after deploying. Leave empty for demo mode (fake data, nothing saved).
const API_URL = 'https://script.google.com/macros/s/AKfycbxII2fMqqJvL2AdopDELxpDiKsVlPpToaQ1FRxQECj2EuPC5ixoFGMW-yBnzFzJsPFpjg/exec';

// ---- Demo data (used only when API_URL is empty) ----
const DEMO = {
  invites: {
    DEMO01: { code:'DEMO01', guests:['Alex Smith','Jamie Smith'], plusOnesAllowed:0,
      room:{ name:'The Garden Suite', description:'Ground-floor suite opening onto the walled garden.', nights:'Saturday 12 June (wedding night)', image:'rooms/garden.svg', price:'£180',
             description_es:'Suite en la planta baja con acceso al jardín amurallado.', nights_es:'Sábado 12 de junio (noche de la boda)', price_es:'180 £' },
      nightBefore:{ title:'Night-before party', when:'Friday 11 June 2027, from 7pm', where:'Placeholder pub, Somewhere', details:'Casual drinks and food.',
                    title_es:'Fiesta de la noche anterior', when_es:'Viernes 11 de junio de 2027, a partir de las 19:00', where_es:'Pub provisional', details_es:'Copas y algo de comer.' },
      bridalParty:{ names:['Alex Smith'], info:[{heading:'Morning prep',details:'Hair & makeup from 9am.',heading_es:'Preparativos',details_es:'Peluquería y maquillaje desde las 9:00.'},{heading:'Photos',details:'Group photos after the ceremony.'}] } },
    DEMO02: { code:'DEMO02', guests:['Sam Jones'], plusOnesAllowed:1, room:null },
    DEMO03: { code:'DEMO03', lang:'es', guests:['Lucía García','Javier Ruiz'], plusOnesAllowed:0,
      room:{ name:'The Loft Room', description:'Cosy room in the eaves.', description_es:'Acogedora habitación abuhardillada.', nights:'Sat 12 June', nights_es:'Sábado 12 de junio', image:'rooms/loft.svg', price:'£140', price_es:'140 £' },
      nightBefore:{ title:'Night-before party', title_es:'Fiesta de la noche anterior', when:'Friday 11 June 2027, from 7pm', when_es:'Viernes 11 de junio de 2027, a partir de las 19:00', where:'Placeholder pub', where_es:'Pub provisional' } }
  },
  menu:{ diets:['Vegan','Vegetarian','Gluten-free'], courses:[
    { name:'Starter', options:[
      {option:'Scottish Salmon Three Ways',description:'Heritage Beetroot',description_es:'Remolacha tradicional',diets:{'Gluten-free':'on request'}},
      {option:'Goats Cheese Arancini',description:'Rocket & Red Onion | Beetroot',diets:{Vegetarian:'','Gluten-free':'on request'}}] },
    { name:'Main', options:[
      {option:'Sticky Pulled Beef Shin',description:'Beer Braised Shallot | Creamed Potato | Tender Stem | Beef Jus',diets:{'Gluten-free':''}},
      {option:'Chicken Balmoral Roulade',description:'Creamed Potato | Glazed Carrot | Whisky Sauce',diets:{}}] },
    { name:'Dessert', options:[
      {option:'Rowallan Bakery Sticky Toffee Pudding',description:'Vanilla Ice Cream | Toffee Sauce',description_es:'Helado de vainilla | Salsa de toffee',diets:{}},
      {option:'Blueberry Bakewell Tart',description:'Lavender Anglaise | Madagascan Vanilla Ice Cream',diets:{}}] }
  ]},
  saved:{}
};

async function apiGet(code) {
  if (!API_URL) {
    await new Promise(r => setTimeout(r, 300));
    const inv = DEMO.invites[code];
    return inv ? { ok:true, invite:inv, menu:DEMO.menu, existing:DEMO.saved[code] || [] } : { ok:false, error:'not_found' };
  }
  const res = await fetch(API_URL + '?code=' + encodeURIComponent(code));
  return res.json();
}

async function apiPost(payload) {
  if (!API_URL) {
    await new Promise(r => setTimeout(r, 300));
    DEMO.saved[payload.code] = payload.people.map(p => ({
      guest_name:p.guest_name, is_plus_one:p.is_plus_one?'yes':'no', attending:p.attending?'yes':'no',
      diets:p.diets.join(', '), dietary_notes:p.dietary, room_accepted: payload.room_accepted===true?'yes':payload.room_accepted===false?'no':'',
      message: payload.message, night_before: p.night_before===true?'yes':p.night_before===false?'no':'', ...p.courses }));
    return { ok:true };
  }
  // text/plain avoids a CORS preflight, which Apps Script can't answer.
  const res = await fetch(API_URL, { method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body:JSON.stringify(payload) });
  return res.json();
}


const $ = id => document.getElementById(id);
const show = (el, on=true) => el.classList.toggle('hidden', !on);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---- Remembered invite code (shared by all pages) ----
// Any page opened with ?code=XXXX remembers it, so the other pages can show that household's details.
const CODE_KEY = 'weddingInviteCode';
function storeCode(code) { try { localStorage.setItem(CODE_KEY, code); } catch (e) {} }
function getCode() {
  const fromUrl = new URLSearchParams(location.search).get('code');
  if (fromUrl) { storeCode(fromUrl.trim().toUpperCase()); return fromUrl.trim().toUpperCase(); }
  try { return localStorage.getItem(CODE_KEY) || ''; } catch (e) { return ''; }
}

// Cache the invite for this browser session so moving between pages doesn't wait on Google each time.
function cacheInvite(code, data) { try { sessionStorage.setItem('invite:' + code, JSON.stringify(data)); } catch (e) {} }
const invitePromises = {};
function getInvite(code) {
  try { const hit = sessionStorage.getItem('invite:' + code); if (hit) return Promise.resolve(JSON.parse(hit)); } catch (e) {}
  if (!invitePromises[code]) {
    invitePromises[code] = apiGet(code).then(data => { if (data.ok) cacheInvite(code, data); else delete invitePromises[code]; return data; },
                                              err => { delete invitePromises[code]; throw err; });
  }
  return invitePromises[code];
}

// Keep the code on nav links too, in case the browser blocks storage.
document.addEventListener('DOMContentLoaded', () => {
  const code = getCode();
  if (!code) return;
  document.querySelectorAll('.site-nav a, a[data-keep-code]').forEach(a => {
    const u = new URL(a.href, location.href);
    u.searchParams.set('code', code);
    a.href = u.pathname.split('/').pop() + u.search;
  });
});

// ---- Language (English / Spanish) ----
// Static page text is written twice, in <span data-lang="en"> and <span data-lang="es">, and CSS shows the right one
// based on <html lang>. Text built in JavaScript uses t('key'). Sheet text uses L(obj, 'field'), which picks the
// field_es column when the site is in Spanish and it has been filled in.
const LANG_KEY = 'weddingLang', LANG_MANUAL_KEY = 'weddingLangManual';
function getLang() { return document.documentElement.lang === 'es' ? 'es' : 'en'; }
function setLang(lang, manual) {
  document.documentElement.lang = lang;
  try { localStorage.setItem(LANG_KEY, lang); if (manual) localStorage.setItem(LANG_MANUAL_KEY, '1'); } catch (e) {}
  document.dispatchEvent(new Event('langchange'));
}
/** Switch to the household's language from the sheet, unless the visitor has picked one themselves. */
function adoptInviteLang(invite) {
  let manual = null;
  try { manual = localStorage.getItem(LANG_MANUAL_KEY); } catch (e) {}
  if (!manual && invite && invite.lang && invite.lang !== getLang()) setLang(invite.lang, false);
}
function L(obj, field) { return (obj && getLang() === 'es' && obj[field + '_es']) || (obj && obj[field]) || ''; }

// Names from the sheet's column headers (courses, dietary requirements). Unknown names are shown as written.
const TERMS_ES = { 'Starter':'Entrante', 'Main':'Plato principal', 'Dessert':'Postre', 'Vegan':'Vegano', 'Vegetarian':'Vegetariano',
                   'Gluten-free':'Sin gluten', 'Other':'Otro', 'on request':'bajo petición' };
function term(s) { return (getLang() === 'es' && TERMS_ES[s]) || s; }

const STR = {
  en: {
    doneNew: 'Thank you, your RSVP is in.', doneExisting: 'You’ve already replied. Here’s your RSVP:',
    whosComing: 'Who’s coming', mealChoices: 'Meal choices', alsoInvitedShort: 'You’re also invited to the night before!',
    greeting: 'Hello {names}! We’d love to know if you can make it.',
    guestName: 'Guest’s name', yourGuest: 'Your guest', accepts: 'Joyfully accepts', declines: 'Regretfully declines',
    dietary: 'Dietary requirements', tellUs: 'Please tell us your requirements',
    noneFit: 'None of our {course} options suit those requirements yet. We’ll speak to the venue and be in touch.',
    bringingGuest: 'I’m bringing a guest', alsoInvited: 'You’re also invited: {title}', nightBefore: 'Night-before party',
    willBeThere: 'Will be there', cantMake: 'Can’t make it',
    roomSaved: 'We’ve saved a room for you: {room}', yesPlease: 'Yes please', noThanks: 'No thanks',
    breakfast: 'Breakfast is included, served from 9:30am.',
    needAnswer: 'A few things still need an answer:', enterGuestName: 'Please enter your guest’s name',
    letUsKnow: '{who}: please let us know if you can come', tellDiet: '{who}: please tell us your dietary requirements',
    chooseCourse: '{who}: please choose a {course}', nbQuestion: '{who}: will you be at the {title}?',
    roomQuestion: 'Please let us know if you’d like {room}',
    attending: 'Attending', notAttending: 'Not attending', willBeThereLc: 'will be there', cantMakeLc: 'can’t make it',
    loading1: 'Finding your invite…', loading2: 'Fetching the menu…', loading3: 'Nearly there…', loading4: 'Still going, thanks for your patience…',
    notFound: 'We couldn’t find that code. Please check your invitation, or get in touch.',
    wentWrong: 'Something went wrong. Please try again in a moment.', unreachable: 'Couldn’t reach the RSVP service. Please try again in a moment.',
    sending: 'Sending…', send: 'Send RSVP', sendFailed: 'Sorry, that didn’t send. Please try again.',
    bridalTitle: 'For the bridal party', bridalIntro: '{names}, here’s what you need to know.',
    yourRoom: 'Your room', accepted: 'You’ve accepted this room.', declined: 'You’ve declined this room.',
    changeAnswer: 'Change your answer', letUsKnowRoom: 'Let us know if you’d like it'
  },
  es: {
    doneNew: '¡Gracias! Hemos recibido vuestra respuesta.', doneExisting: 'Ya nos habéis respondido. Esta es vuestra respuesta:',
    whosComing: '¿Quién viene?', mealChoices: 'Menú', alsoInvitedShort: '¡También estáis invitados a la noche anterior!',
    greeting: '¡Hola, {names}! Nos encantaría saber si podéis venir.',
    guestName: 'Nombre de tu acompañante', yourGuest: 'Tu acompañante', accepts: 'Sí, asistiré', declines: 'Lamentablemente, no podré asistir',
    dietary: 'Requisitos alimentarios', tellUs: 'Cuéntanos tus requisitos',
    noneFit: 'Por ahora ninguna opción de {course} se ajusta a estos requisitos. Hablaremos con el lugar y te diremos algo.',
    bringingGuest: 'Vendré con acompañante', alsoInvited: 'También estáis invitados: {title}', nightBefore: 'Fiesta de la noche anterior',
    willBeThere: 'Allí estaré', cantMake: 'No podré ir',
    roomSaved: 'Os hemos reservado una habitación: {room}', yesPlease: 'Sí, por favor', noThanks: 'No, gracias',
    breakfast: 'El desayuno está incluido y se sirve a partir de las 9:30.',
    needAnswer: 'Aún faltan algunas respuestas:', enterGuestName: 'Escribe el nombre de tu acompañante',
    letUsKnow: '{who}: dinos si puedes venir', tellDiet: '{who}: cuéntanos tus requisitos alimentarios',
    chooseCourse: '{who}: elige un {course}', nbQuestion: '{who}: ¿vendrás a la {title}?',
    roomQuestion: 'Dinos si queréis la habitación {room}',
    attending: 'Asistirá', notAttending: 'No asistirá', willBeThereLc: 'allí estará', cantMakeLc: 'no podrá ir',
    loading1: 'Buscando tu invitación…', loading2: 'Cargando el menú…', loading3: 'Ya casi está…', loading4: 'Seguimos en ello, gracias por tu paciencia…',
    notFound: 'No encontramos ese código. Revisa tu invitación o ponte en contacto con nosotros.',
    wentWrong: 'Algo ha fallado. Inténtalo de nuevo en un momento.', unreachable: 'No hemos podido conectar con el servicio. Inténtalo de nuevo en un momento.',
    sending: 'Enviando…', send: 'Enviar respuesta', sendFailed: 'Lo sentimos, no se ha enviado. Inténtalo de nuevo.',
    bridalTitle: 'Para el cortejo nupcial', bridalIntro: '{names}, esto es lo que necesitáis saber.',
    yourRoom: 'Vuestra habitación', accepted: 'Habéis aceptado esta habitación.', declined: 'Habéis rechazado esta habitación.',
    changeAnswer: 'Cambiar la respuesta', letUsKnowRoom: 'Decidnos si la queréis'
  }
};
function t(key, vars) {
  let str = (STR[getLang()] && STR[getLang()][key]) ?? STR.en[key] ?? key;
  Object.entries(vars || {}).forEach(([k, v]) => { str = str.replaceAll('{' + k + '}', v); });
  return str;
}

// Language links in the nav, and picking up the household's language from the sheet on any page.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-set-lang]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    setLang(a.dataset.setLang, true);
  }));
  const code = getCode();
  if (code) getInvite(code).then(d => { if (d.ok) adoptInviteLang(d.invite); }).catch(() => {});
});
