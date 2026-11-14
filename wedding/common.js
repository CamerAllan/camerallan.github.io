// ---- Config ----
// Paste the Apps Script web app URL here after deploying. Leave empty for demo mode (fake data, nothing saved).
const API_URL = 'https://script.google.com/macros/s/AKfycbxII2fMqqJvL2AdopDELxpDiKsVlPpToaQ1FRxQECj2EuPC5ixoFGMW-yBnzFzJsPFpjg/exec';

// ---- Demo data (used only when API_URL is empty) ----
const DEMO = {
  invites: {
    DEMO01: { code:'DEMO01', guests:['Alex Smith','Jamie Smith'], plusOnesAllowed:0,
      room:{ name:'The Garden Suite', description:'Ground-floor suite opening onto the walled garden.', nights:'Fri 11 – Sun 13 June', image:'rooms/garden.svg', price:'£180 per night (£360 total)' },
      nightBefore:{ title:'Night-before party', when:'Friday 11 June 2027, from 7pm', where:'Placeholder pub, Somewhere', details:'Casual drinks and food.' },
      bridalParty:{ names:['Alex Smith'], info:[{heading:'Morning prep',details:'Hair & makeup from 9am.'},{heading:'Photos',details:'Group photos after the ceremony.'}] } },
    DEMO02: { code:'DEMO02', guests:['Sam Jones'], plusOnesAllowed:1, room:null }
  },
  menu:{ diets:['Vegan','Vegetarian','Gluten-free'], courses:[
    { name:'Starter', options:[
      {option:'Scottish Salmon Three Ways',description:'Heritage Beetroot',diets:{'Gluten-free':'on request'}},
      {option:'Goats Cheese Arancini',description:'Rocket & Red Onion | Beetroot',diets:{Vegetarian:'','Gluten-free':'on request'}}] },
    { name:'Main', options:[
      {option:'Sticky Pulled Beef Shin',description:'Beer Braised Shallot | Creamed Potato | Tender Stem | Beef Jus',diets:{'Gluten-free':''}},
      {option:'Chicken Balmoral Roulade',description:'Creamed Potato | Glazed Carrot | Whisky Sauce',diets:{}}] },
    { name:'Dessert', options:[
      {option:'Rowallan Bakery Sticky Toffee Pudding',description:'Vanilla Ice Cream | Toffee Sauce',diets:{}},
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
async function getInvite(code) {
  try { const hit = sessionStorage.getItem('invite:' + code); if (hit) return JSON.parse(hit); } catch (e) {}
  const data = await apiGet(code);
  if (data.ok) cacheInvite(code, data);
  return data;
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
