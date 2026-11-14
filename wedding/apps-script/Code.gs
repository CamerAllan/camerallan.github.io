/**
 * Wedding RSVP backend — Google Apps Script bound to the "Wedding Website Backend" sheet.
 *
 * Tabs:
 *   Guests     code | guest_names (comma-separated) | plus_ones_allowed | room_id | notes (private) | night_before
 *              Put anything (e.g. "x") in night_before to invite that household to the night-before party.
 *   Night Before   field | value  (rows: title, when, where, details). Only shown to invited households.
 *   Guests.bridal_party   names from that household who are in the bridal party (comma-separated), or "all".
 *   Bridal Party   heading | details  — only sent to households with someone in the bridal party.
 *   Rooms.price    free text, e.g. "£180 per night".
 *   Guests.language   "es" to show that household the site in Spanish (blank = English).
 *   Spanish text: any column ending in _es (e.g. Rooms.description_es, Menu.description_es) is used in place of
 *   the English column when the site is in Spanish. Night Before / Bridal Party have Spanish in columns C (and D).
 *   Rooms      room_id | name | description | nights | image
 *   Menu       course | option | description | <one column per dietary requirement, e.g. Vegetarian | Gluten-free ...>
 *              Mark a dish "x" if it suits that requirement. Any other text (e.g. "on request") also counts as
 *              suitable and is shown to guests next to the dish. Guests only see dishes that suit everything they tick.
 *   Responses  written by this script, one row per person (re-submitting replaces that invite's rows)
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * After editing this file: Deploy → Manage deployments → edit → Version: New version (keeps the same URL).
 */

var SHEET_ID = '1iSff6rU6AE22U6UkYPWBx9CT-mmakGh4iSF3ndRP8QI';
var FIXED_RESPONSE_COLS = ['updated_at', 'code', 'guest_name', 'is_plus_one', 'attending', 'diets'];
var TRAILING_RESPONSE_COLS = ['dietary_notes', 'room_accepted', 'message', 'night_before'];

function doGet(e) {
  try {
    var code = normaliseCode_(e && e.parameter && e.parameter.code);
    if (!code) return json_({ ok: false, error: 'missing_code' });
    var invite = findInvite_(code);
    if (!invite) return json_({ ok: false, error: 'not_found' });
    return json_({
      ok: true,
      invite: publicInvite_(invite),
      menu: readMenu_(),
      existing: readExisting_(code)
    });
  } catch (err) {
    return json_({ ok: false, error: 'server_error', detail: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var code = normaliseCode_(body.code);
    var invite = code && findInvite_(code);
    if (!invite) return json_({ ok: false, error: 'not_found' });

    var menu = readMenu_();
    var people = Array.isArray(body.people) ? body.people : [];
    var invited = invite.guests;
    var plusOnes = people.filter(function (p) { return p.is_plus_one; });

    // Validate: named guests must be on the invite; plus-ones within allowance.
    var named = people.filter(function (p) { return !p.is_plus_one; });
    for (var i = 0; i < named.length; i++) {
      if (invited.indexOf(named[i].guest_name) === -1) return json_({ ok: false, error: 'unknown_guest' });
    }
    if (plusOnes.length > invite.plusOnesAllowed) return json_({ ok: false, error: 'too_many_plus_ones' });

    var roomAccepted = invite.room ? (body.room_accepted === true ? 'yes' : body.room_accepted === false ? 'no' : '') : '';
    var sheet = ss_().getSheetByName('Responses');
    var header = ensureHeader_(sheet, menu.courses.map(function (c) { return c.name; }));
    deleteRowsForCode_(sheet, header, code);

    var now = new Date();
    var rows = people.map(function (p) {
      var ticked = (Array.isArray(p.diets) ? p.diets : []);
      var diets = ticked.filter(function (d) { return menu.diets.indexOf(d) !== -1; }); // these filter dishes
      var hasOther = ticked.indexOf('Other') !== -1; // free-text requirement in dietary_notes
      var rec = {
        updated_at: now,
        code: code,
        guest_name: String(p.guest_name || '').slice(0, 100),
        is_plus_one: p.is_plus_one ? 'yes' : 'no',
        attending: p.attending ? 'yes' : 'no',
        diets: p.attending ? diets.concat(hasOther ? ['Other'] : []).join(', ') : '',
        dietary_notes: p.attending && hasOther ? String(p.dietary || '').slice(0, 500) : '',
        room_accepted: roomAccepted,
        message: String(body.message || '').slice(0, 2000),
        night_before: invite.nightBefore ? (p.night_before === true ? 'yes' : p.night_before === false ? 'no' : '') : ''
      };
      menu.courses.forEach(function (c) {
        var choice = p.attending && p.courses ? p.courses[c.name] : '';
        var valid = c.options.some(function (o) {
          return o.option === choice && diets.every(function (d) { return o.diets.hasOwnProperty(d); });
        });
        rec[c.name] = valid ? choice : '';
      });
      return header.map(function (h) { return rec.hasOwnProperty(h) ? rec[h] : ''; });
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, header.length).setValues(rows);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'server_error', detail: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- helpers ----------

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normaliseCode_(c) { return String(c || '').trim().toUpperCase(); }

function rows_(name) {
  var values = ss_().getSheetByName(name).getDataRange().getValues();
  var header = values.shift().map(function (h) { return String(h).trim(); });
  return values.map(function (r) {
    var o = {};
    header.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
}

function findInvite_(code) {
  var g = rows_('Guests').filter(function (r) { return normaliseCode_(r.code) === code; })[0];
  if (!g) return null;
  var room = null;
  var roomId = String(g.room_id || '').trim();
  if (roomId) {
    room = rows_('Rooms').filter(function (r) { return String(r.room_id).trim() === roomId; })[0] || null;
  }
  return {
    code: code,
    guests: String(g.guest_names).split(',').map(function (s) { return s.trim(); }).filter(String),
    plusOnesAllowed: Number(g.plus_ones_allowed) || 0,
    room: room,
    nightBefore: String(g.night_before || '').trim() !== '',
    lang: String(g.language || '').trim().toLowerCase().indexOf('es') === 0 ? 'es' : 'en',
    bridalParty: bridalNames_(String(g.bridal_party || ''), String(g.guest_names).split(',').map(function (s) { return s.trim(); }).filter(String))
  };
}

function publicInvite_(inv) {
  // Never return the private notes column.
  return {
    code: inv.code,
    guests: inv.guests,
    plusOnesAllowed: inv.plusOnesAllowed,
    lang: inv.lang,
    room: inv.room && roomPublic_(inv.room),
    // Bridal party info is only sent when someone in this household is in the bridal party.
    bridalParty: inv.bridalParty.length ? { names: inv.bridalParty, info: readBridalInfo_() } : null,
    // Party details are only sent to invited households, so they never appear in the public page.
    nightBefore: inv.nightBefore ? readNightBefore_() : null
  };
}

/** All Rooms columns (name, description, nights, image, price, and any *_es translations) except room_id. */
function roomPublic_(room) {
  var out = {};
  Object.keys(room).forEach(function (k) { if (k && k !== 'room_id') out[k] = String(room[k] == null ? '' : room[k]); });
  return out;
}

function bridalNames_(cell, guests) {
  cell = cell.trim();
  if (!cell) return [];
  if (cell.toLowerCase() === 'all' || cell.toLowerCase() === 'x') return guests;
  return cell.split(',').map(function (s) { return s.trim(); }).filter(function (n) { return guests.indexOf(n) !== -1; });
}

function readBridalInfo_() {
  var sheet = ss_().getSheetByName('Bridal Party');
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1)
    .filter(function (r) { return String(r[0] || r[1] || '').trim(); })
    .map(function (r) {
      return { heading: String(r[0] || ''), details: String(r[1] || ''), heading_es: String(r[2] || ''), details_es: String(r[3] || '') };
    });
}

function readNightBefore_() {
  var out = {};
  var sheet = ss_().getSheetByName('Night Before');
  if (!sheet) return { title: 'Night-before party' };
  sheet.getDataRange().getValues().slice(1).forEach(function (r) {
    var k = String(r[0] || '').trim().toLowerCase();
    if (k) { out[k] = String(r[1] || ''); out[k + '_es'] = String(r[2] || ''); }
  });
  return out;
}

/** Menu: first three columns are course/option/description; every later column is a dietary requirement. */
function readMenu_() {
  var values = ss_().getSheetByName('Menu').getDataRange().getValues();
  var header = values.shift().map(function (h) { return String(h).trim(); });
  // Every column after description is a dietary requirement, except translations (ending in _es).
  var dietCols = [];
  for (var i = 3; i < header.length; i++) {
    if (header[i] && !/_es$/i.test(header[i])) dietCols.push({ idx: i, name: header[i] });
  }
  var descEs = header.indexOf('description_es');

  var courses = [];
  var byName = {};
  values.forEach(function (r) {
    var name = String(r[0] || '').trim();
    var option = String(r[1] || '').trim();
    if (!name || !option) return;
    var diets = {}; // diet name -> note ('' when simply marked "x")
    dietCols.forEach(function (d) {
      var cell = String(r[d.idx] || '').trim();
      if (cell) diets[d.name] = cell.toLowerCase() === 'x' ? '' : cell;
    });
    if (!byName[name]) { byName[name] = { name: name, options: [] }; courses.push(byName[name]); }
    byName[name].options.push({
      option: option,
      description: String(r[2] || ''),
      description_es: descEs > -1 ? String(r[descEs] || '') : '',
      diets: diets
    });
  });
  return { diets: dietCols.map(function (d) { return d.name; }), courses: courses };
}

function readExisting_(code) {
  return rows_('Responses')
    .filter(function (r) { return normaliseCode_(r.code) === code; })
    .map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { if (k !== 'updated_at') o[k] = r[k]; });
      return o;
    });
}

/** Make sure Responses has fixed columns + one column per course; returns header array. */
function ensureHeader_(sheet, courseNames) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }).filter(String);
  var wanted = FIXED_RESPONSE_COLS.concat(courseNames, TRAILING_RESPONSE_COLS);
  var changed = false;
  wanted.forEach(function (w) { if (header.indexOf(w) === -1) { header.push(w); changed = true; } });
  if (changed || sheet.getLastColumn() === 0) sheet.getRange(1, 1, 1, header.length).setValues([header]);
  return header;
}

function deleteRowsForCode_(sheet, header, code) {
  var col = header.indexOf('code') + 1;
  var last = sheet.getLastRow();
  if (last < 2) return;
  var codes = sheet.getRange(2, col, last - 1, 1).getValues();
  for (var i = codes.length - 1; i >= 0; i--) {
    if (normaliseCode_(codes[i][0]) === code) sheet.deleteRow(i + 2);
  }
}
