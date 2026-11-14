/**
 * Wedding RSVP backend — Google Apps Script bound to the "Wedding Website Backend" sheet.
 *
 * Tabs:
 *   Guests     code | guest_names (comma-separated) | plus_ones_allowed | room_id | notes (private)
 *   Rooms      room_id | name | description | nights | image
 *   Menu       course | option | description
 *   Responses  written by this script, one row per person (re-submitting replaces that invite's rows)
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * After editing this file: Deploy → Manage deployments → edit → Version: New version (keeps the same URL).
 */

var SHEET_ID = '1iSff6rU6AE22U6UkYPWBx9CT-mmakGh4iSF3ndRP8QI';
var FIXED_RESPONSE_COLS = ['updated_at', 'code', 'guest_name', 'is_plus_one', 'attending'];
var TRAILING_RESPONSE_COLS = ['dietary', 'room_accepted', 'message'];

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
      var rec = {
        updated_at: now,
        code: code,
        guest_name: String(p.guest_name || '').slice(0, 100),
        is_plus_one: p.is_plus_one ? 'yes' : 'no',
        attending: p.attending ? 'yes' : 'no',
        dietary: String(p.dietary || '').slice(0, 500),
        room_accepted: roomAccepted,
        message: String(body.message || '').slice(0, 2000)
      };
      menu.courses.forEach(function (c) {
        var choice = p.attending && p.courses ? p.courses[c.name] : '';
        var valid = c.options.some(function (o) { return o.option === choice; });
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
    room: room
  };
}

function publicInvite_(inv) {
  // Never return the private notes column.
  return {
    code: inv.code,
    guests: inv.guests,
    plusOnesAllowed: inv.plusOnesAllowed,
    room: inv.room && {
      name: inv.room.name,
      description: inv.room.description,
      nights: inv.room.nights,
      image: inv.room.image
    }
  };
}

function readMenu_() {
  var courses = [];
  var byName = {};
  rows_('Menu').forEach(function (r) {
    var name = String(r.course || '').trim();
    var option = String(r.option || '').trim();
    if (!name || !option) return;
    if (!byName[name]) { byName[name] = { name: name, options: [] }; courses.push(byName[name]); }
    byName[name].options.push({ option: option, description: String(r.description || '') });
  });
  return { courses: courses };
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
