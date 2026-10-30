/**
 * DAILY REPORT CREATIVE INDOGROUP — penghubung dashboard ke Google Sheets (versi 2.3)
 *
 * Cara pasang / update: lihat PANDUAN.md bagian "Update".
 * Ringkas: tempel seluruh isi file ini di Extensions → Apps Script, Save,
 * jalankan "setupAwal" sekali, lalu Deploy → Manage deployments → New version.
 */

// ================== PENGATURAN ==================

// Gmail atasan. Hanya akun ini yang bisa mengubah anggota tim, mengisi target,
// dan mengoreksi report siapa pun. Bisa lebih dari satu.
const ADMIN_EMAILS = [
  "creative.indogroup@gmail.com"
];

// Client ID dari Google Cloud (sama dengan di config.js)
const GOOGLE_CLIENT_ID = "408669150469-alc90o87lss37tvbb0kk92a59tqk500o.apps.googleusercontent.com";

// Berapa hari perangkat diingat setelah login Gmail pertama
const SESSION_DAYS = 90;

// ================================================

const TZ = "Asia/Jakarta";
const VERSION = "v2.3";
const BRAND_CODES = ["OLV", "KNG", "77", "MTR", "IDN", "RS", "TKS"];
const BRAND_NAMES = { OLV: "Batik Oliver", KNG: "Kenangan Fashion", "77": "Batik 77", MTR: "Batik Menteri", IDN: "Batik Indonesia", RS: "Batik Rama Shinta", TKS: "Batik Taksaka" };
const JABATAN = ["Content Creator", "Desain Grafis", "Admin", "HR", "Content Director", "Manajer Live dan Video"];
// urutan tampil: Content Creator → Desain Grafis → Admin → pengawas
const ROLE_ORDER = { cc: 0, dg: 1, admin: 2, sup: 3 };
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
const C_BLUE = "#5a6fa7", C_SOFT = "#e6eaf5", C_BAND = "#f4f6fb", C_WARN = "#fbefd6", C_ALPHA = "#f6dedc";
const STATUS = ["Cuti", "Izin", "Sakit", "Alpha"];
// file data = link Google Docs / Spreadsheet / Slides
const FILE_RE = /docs\.google\.com\/(document|spreadsheets|presentation)\//i;
function countFiles_(links) { return String(links || "").split("\n").filter(l => FILE_RE.test(l)).length; }
function filesOf_(r) { return r[20] === "" || r[20] === null || r[20] === undefined ? countFiles_(r[11]) : Number(r[20]) || 0; }
// nama lain yang dikenali saat brand ditulis manual di sheet "Anggota"
const BRAND_ALIAS = [["OLV", /oliver|^olv$/], ["KNG", /kenangan|^kng$/], ["77", /^(batik\s*)?77$/], ["MTR", /menteri|^mtr$/],
                     ["IDN", /indonesia|indo\s*group|^idn$/], ["RS", /rama\s*shinta|ramashinta|^rs$/], ["TKS", /taksaka|^tks$/]];

const SH = {
  team:   { name: "Anggota", head: ["ID", "Nama", "Jabatan", "Brand", "Gmail", "Foto (Drive)", "Versi foto"], text: [1, 4, 5, 6] },
  target: { name: "Target", head: ["ID", "Nama", "Brand", "Minggu mulai (Senin)", "Target"], text: [1, 3, 4] },
  db:     { name: "_data", head: ["Kunci", "Tanggal", "ID", "Brand", "Jumlah", "Facebook", "YouTube", "Shopee", "Jenis", "Desain campaign",
                                  "Tugas harian", "Link", "Kendala", "Solusi", "Lembur (jam)", "Diisi oleh", "Diperbarui",
                                  "Status lembur", "ACC oleh", "Waktu ACC", "File data", "File data manual"], text: [1, 2, 3, 4, 16, 17, 18, 19, 20], hidden: true },
  photo:  { name: "_foto", head: ["ID", "Thumbnail", "Besar 1", "Besar 2", "Besar 3", "Besar 4"], text: [1, 2, 3, 4, 5, 6], hidden: true },
  absen:  { name: "Kehadiran", head: ["ID", "Nama", "Tanggal", "Status", "Keterangan", "Diisi oleh", "Diperbarui"], text: [1, 3, 6, 7] }
};
const ALL_NAME = "Semua Report";

/* =============================== PINTU MASUK =============================== */

function doGet() {
  return ContentService.createTextOutput("Daily Report Creative API " + VERSION + " aktif. Buka dashboard dari link GitHub.");
}

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    ensureSheets_(false);

    if (req.action === "login") {
      const email = verifyGoogle_(req.idToken);
      const team = readTeam_();
      if (!isAdmin_(email, team) && !team.some(c => c.email === email)) return json_({ error: "not_member", email: email });
      return json_({ session: makeSession_(email), email: email, days: SESSION_DAYS });
    }

    const email = readSession_(req.session);
    const team = readTeam_();
    const isAdmin = isAdmin_(email, team);
    const me = team.find(c => c.email === email) || null;
    if (!isAdmin && !me) return json_({ error: "not_member", email: email });
    const ctx = { email: email, isAdmin: isAdmin, me: me, team: team };

    switch (req.action) {
      case "load":       return json_(load_(ctx, req));
      case "photos":     return json_(photos_(req.ids));
      case "saveEntry":  return json_(saveEntry_(ctx, req.entry || {}));
      case "saveTarget": return json_(saveTarget_(ctx, req));
      case "saveTeam":   return json_(saveTeam_(ctx, req.ccs || []));
      case "savePhoto":  return json_(savePhoto_(ctx, req));
      case "moveEntry":  return json_(moveEntry_(ctx, req));
      case "saveAbsence": return json_(saveAbsence_(ctx, req));
      case "deleteEntry": return json_(deleteEntry_(ctx, req));
      case "approveLembur": return json_(approveLembur_(ctx, req));
      default:           return json_({ error: "unknown_action" });
    }
  } catch (err) {
    const msg = String(err && err.message || err);
    if (msg.indexOf("AUTH:") === 0) return json_({ error: "auth", detail: msg.slice(5) });
    if (msg.indexOf("FORBIDDEN:") === 0) return json_({ error: "forbidden", detail: msg.slice(10) });
    if (msg.indexOf("BUSY:") === 0) return json_({ error: "busy", detail: "Google Sheet sedang dirapikan, coba lagi sebentar." });
    return json_({ error: "server", detail: msg });
  }
}

/* ============================ LOGIN & SESI 90 HARI ============================ */

function verifyGoogle_(token) {
  if (!token) throw new Error("AUTH:no_token");
  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error("AUTH:invalid");
  const info = JSON.parse(res.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID) throw new Error("AUTH:wrong_client");
  if (String(info.email_verified) !== "true") throw new Error("AUTH:unverified");
  if (Number(info.exp) * 1000 < Date.now()) throw new Error("AUTH:expired");
  return lower_(info.email);
}

function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty("secret");
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty("secret", s); }
  return s;
}
function sign_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_()));
}
function makeSession_(email) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const payload = Utilities.base64EncodeWebSafe(email + "|" + exp);
  return payload + "." + sign_(payload);
}
function readSession_(tok) {
  const parts = String(tok || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("AUTH:no_session");
  if (sign_(parts[0]) !== parts[1]) throw new Error("AUTH:bad_session");
  const raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  const i = raw.lastIndexOf("|");
  if (Date.now() > Number(raw.slice(i + 1))) throw new Error("AUTH:expired");
  return lower_(raw.slice(0, i));
}
/** atasan (ADMIN_EMAILS) dan pengawas (HR, Content Director, Manajer, dll.) punya hak yang sama */
function isAdmin_(email, team) {
  if (ADMIN_EMAILS.map(lower_).indexOf(email) >= 0) return true;
  return (team || readTeam_()).some(c => c.email === email && roleOf_(c.jabatan) === "sup");
}

/* ================================= BACA ================================= */

function load_(ctx, req) {
  const start = String(req.start || ""), end = String(req.end || "");
  const targets = rows_(SH.target).filter(r => { const w = d_(r[3]); return w >= start && w <= end; })
    .map(r => ({ cc: String(r[0]), brand: brand_(r[2]), week: d_(r[3]), target: Number(r[4]) || 0 }));
  const entries = rows_(SH.db).filter(r => { const d = d_(r[1]); return d >= start && d <= end; }).map(entryFromRow_);
  const absences = rows_(SH.absen).filter(r => { const d = d_(r[2]); return String(r[0]).trim() && d >= start && d <= end; })
    .map(r => ({ cc: String(r[0]).trim(), date: d_(r[2]), status: String(r[3] || ""), note: String(r[4] || ""), by: String(r[5] || ""), updatedAt: iso_(r[6]) }));
  return {
    version: VERSION, email: ctx.email, isAdmin: ctx.isAdmin, me: ctx.me ? ctx.me.id : "",
    ccs: ctx.team.map(c => ({ id: c.id, name: c.name, jabatan: c.jabatan, brand: c.brand, email: c.email, photoVer: c.photoVer })),
    targets: targets, entries: entries, absences: absences,
    lemburPending: ctx.isAdmin ? rows_(SH.db).filter(r => String(r[17]) === "pending").map(entryFromRow_) : [],
    coverVer: PropertiesService.getScriptProperties().getProperty("coverVer") || "",
    sheetUrl: ctx.isAdmin ? SpreadsheetApp.getActive().getUrl() : ""
  };
}

function entryFromRow_(r) {
  const split = (v, sep) => String(v || "").split(sep).map(x => x.trim()).filter(String);
  return {
    key: String(r[0]), date: d_(r[1]), cc: String(r[2]), brand: brand_(r[3]),
    qty: Number(r[4]) || 0, fb: Number(r[5]) || 0, yt: Number(r[6]) || 0, shopee: Number(r[7]) || 0,
    jenis: split(r[8], "+"), campaign: split(r[9], ","),
    tugas: String(r[10] || ""), links: split(r[11], "\n"),
    kendala: String(r[12] || ""), solusi: String(r[13] || ""),
    lembur: Number(r[14]) || 0, by: String(r[15] || ""), updatedAt: iso_(r[16]),
    lemburStatus: Number(r[14]) > 0 ? (String(r[17] || "") || "acc") : "", lemburBy: String(r[18] || ""), lemburAt: iso_(r[19]),
    files: filesOf_(r), filesManual: String(r[21] || "") === "1" ? 1 : 0
  };
}

function readTeam_() {
  return rows_(SH.team).filter(r => String(r[0]).trim() && String(r[1]).trim()).map(r => ({
    id: String(r[0]).trim(), name: String(r[1]).trim(), jabatan: String(r[2] || "").trim(),
    brand: brandList_(r[3]).join(", "), email: lower_(r[4]), photoId: String(r[5] || ""), photoVer: String(r[6] || "")
  })).sort(teamSort_);
}
function teamSort_(a, b) {
  return (ROLE_ORDER[roleOf_(a.jabatan)] - ROLE_ORDER[roleOf_(b.jabatan)]) || a.name.localeCompare(b.name, "id", { sensitivity: "base" });
}

function photos_(ids) {
  const want = Array.isArray(ids) ? ids.map(String) : null;
  const out = {};
  const ver = {};
  readTeam_().forEach(c => { ver[c.id] = c.photoVer; });
  ver.__cover = PropertiesService.getScriptProperties().getProperty("coverVer") || "";
  rows_(SH.photo).forEach(r => {
    const id = String(r[0]);
    if (!want || want.indexOf(id) >= 0) out[id] = { v: ver[id] || "", data: String(r[1] || ""), big: [r[2], r[3], r[4], r[5]].map(x => String(x || "")).join("") };
  });
  return { photos: out };
}

/* ================================= SIMPAN ================================= */

function saveEntry_(ctx, e) {
  const cc = String(e.cc || ""), date = String(e.date || ""), brand = brand_(e.brand);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("FORBIDDEN:bad_date");
  if (BRAND_CODES.indexOf(brand) < 0) throw new Error("FORBIDDEN:bad_brand");
  const m = ctx.team.find(c => c.id === cc);
  if (!m) throw new Error("FORBIDDEN:unknown_member");
  if (!ctx.isAdmin && (!ctx.me || ctx.me.id !== cc)) throw new Error("FORBIDDEN:not_owner");
  const role = roleOf_(m.jabatan);
  if (role === "sup") throw new Error("FORBIDDEN:supervisor_no_report");
  if (!ctx.isAdmin && role !== "dg" && brandsOf_(m).indexOf(brand) < 0) throw new Error("FORBIDDEN:brand_not_assigned");
  const n = v => Math.max(0, Math.round(Number(v) || 0));
  const arr = v => Array.isArray(v) ? v.map(String) : [];
  const fb = role === "admin" ? n(e.fb) : 0, yt = role === "admin" ? n(e.yt) : 0, sp = role === "admin" ? n(e.shopee) : 0;
  const qty = role === "admin" ? fb + yt + sp : n(e.qty);
  const row = [
    cc + "_" + date + "_" + brand, date, cc, brand, qty, fb, yt, sp,
    role === "dg" ? arr(e.jenis).join(" + ") : "", role === "dg" ? arr(e.campaign).join(", ") : "",
    String(e.tugas || "").slice(0, 5000),
    arr(e.links).filter(l => /^https?:\/\//i.test(l)).slice(0, 20).join("\n"),
    String(e.kendala || "").slice(0, 2000), String(e.solusi || "").slice(0, 2000),
    Math.max(0, Number(e.lembur) || 0), ctx.email,
    Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss"), "", "", "", 0, ""
  ];
  // file data: otomatis dari link, kecuali diubah manual
  row[21] = +e.filesManual ? "1" : "";
  row[20] = row[21] ? Math.max(0, Math.round(Number(e.files) || 0)) : countFiles_(row[11]);
  let lemburStatus = "";
  withLock_(() => {
    // lembur: diisi sendiri → menunggu ACC; diisi/diubah atasan → langsung disetujui
    const old = rows_(SH.db).find(r => String(r[0]) === row[0]);
    const ot = row[14], oldOt = old ? Number(old[14]) || 0 : 0, oldSt = old ? String(old[17] || "") || (oldOt > 0 ? "acc" : "") : "";
    if (ot <= 0) lemburStatus = "";
    else if (ctx.isAdmin) { lemburStatus = "acc"; row[18] = ctx.email; row[19] = row[16]; }
    else if (old && ot === oldOt && oldSt) { lemburStatus = oldSt; row[18] = String(old[18] || ""); row[19] = String(old[19] || ""); }
    else lemburStatus = "pending";
    row[17] = lemburStatus;
    upsert_(SH.db, r => String(r[0]) === row[0], row);
    rebuildPerson_(m);
    markDirty_();
  });
  return { ok: true, updatedAt: new Date().toISOString(), lemburStatus: lemburStatus };
}

function saveTarget_(ctx, req) {
  if (!ctx.isAdmin) throw new Error("FORBIDDEN:admin_only");
  const cc = String(req.cc || ""), week = String(req.week || ""), brand = brand_(req.brand);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error("FORBIDDEN:bad_week");
  if (BRAND_CODES.indexOf(brand) < 0) throw new Error("FORBIDDEN:bad_brand");
  const m = ctx.team.find(c => c.id === cc);
  if (!m) throw new Error("FORBIDDEN:unknown_member");
  const row = [cc, m.name, brand, week, Math.max(0, Number(req.target) || 0)];
  withLock_(() => upsert_(SH.target, r => String(r[0]) === cc && brand_(r[2]) === brand && d_(r[3]) === week, row));
  return { ok: true };
}

function saveTeam_(ctx, ccs) {
  if (!ctx.isAdmin) throw new Error("FORBIDDEN:admin_only");
  const old = {};
  ctx.team.forEach(c => { old[c.id] = c; });
  const seen = {};
  const rows = ccs.filter(c => c && c.id && c.name && !seen[c.id] && (seen[c.id] = true)).map(c => {
    const o = old[String(c.id)] || {};
    return [String(c.id), String(c.name).trim(), String(c.jabatan || "").trim(), brandList_(c.brand).join(", "), lower_(c.email), o.photoId || "", o.photoVer || ""];
  }).sort((a, b) => teamSort_({ jabatan: a[2], name: a[1] }, { jabatan: b[2], name: b[1] }));
  withLock_(() => {
    const sh = sheet_(SH.team);
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, SH.team.head.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, SH.team.head.length).setValues(rows);
    fixMigrated_(readTeam_());
    // tab per orang & "Semua Report" dirapikan oleh jadwal otomatis (≤ 5 menit) supaya website tetap cepat
    PropertiesService.getScriptProperties().setProperty("needFull", "1");
    markDirty_();
  });
  return { ok: true };
}

function savePhoto_(ctx, req) {
  const cc = String(req.cc || "");
  if (cc === "__cover") return saveCover_(ctx, req);
  const m = ctx.team.find(c => c.id === cc);
  if (!m) throw new Error("FORBIDDEN:unknown_member");
  if (!ctx.isAdmin && (!ctx.me || ctx.me.id !== cc)) throw new Error("FORBIDDEN:not_owner");
  const thumb = String(req.thumb || "");
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(thumb) || thumb.length > 49000) throw new Error("FORBIDDEN:bad_photo");

  const big = String(req.big || "");
  const chunks = ["", "", "", ""];
  if (/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(big) && big.length <= 4 * 49000) for (let i = 0; i < 4; i++) chunks[i] = big.slice(i * 49000, (i + 1) * 49000);
  let fileId = m.photoId;
  try {
    const full = String(req.full || "");
    if (/^data:image\/jpeg;base64,/.test(full)) {
      const blob = Utilities.newBlob(Utilities.base64Decode(full.split(",")[1]), "image/jpeg", m.name + ".jpg");
      const file = photoFolder_().createFile(blob);
      if (m.photoId) { try { DriveApp.getFileById(m.photoId).setTrashed(true); } catch (x) { } }
      fileId = file.getId();
    }
  } catch (x) { /* Drive belum diizinkan: thumbnail tetap tersimpan */ }

  const ver = String(Date.now());
  withLock_(() => {
    upsert_(SH.photo, r => String(r[0]) === cc, [cc, thumb].concat(chunks));
    const sh = sheet_(SH.team);
    const data = rows_(SH.team);
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === cc) { sh.getRange(i + 2, 6, 1, 2).setValues([[fileId || "", ver]]); break; }
    }
  });
  return { ok: true, v: ver };
}

/** Foto cover beranda 16:9 (hanya atasan / pengawas) */
function saveCover_(ctx, req) {
  if (!ctx.isAdmin) throw new Error("FORBIDDEN:admin_only");
  const thumb = String(req.thumb || ""), big = String(req.big || "");
  const ok = v => /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v);
  if (!ok(thumb) || thumb.length > 49000 || !ok(big) || big.length > 4 * 49000) throw new Error("FORBIDDEN:bad_photo");
  const chunks = [0, 1, 2, 3].map(i => big.slice(i * 49000, (i + 1) * 49000));
  const ver = String(Date.now());
  withLock_(() => upsert_(SH.photo, r => String(r[0]) === "__cover", ["__cover", thumb].concat(chunks)));
  PropertiesService.getScriptProperties().setProperty("coverVer", ver);
  return { ok: true, v: ver };
}

function photoFolder_() {
  const name = "Daily Report Creative - Foto";
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

/* ======================= MERAPIKAN GOOGLE SHEETS ======================= */

function rapikan_() {
  const team = readTeam_();
  const db = rows_(SH.db), ab = rows_(SH.absen);
  const ss = SpreadsheetApp.getActive();
  const keep = {};
  team.filter(m => roleOf_(m.jabatan) !== "sup").forEach(m => { keep[m.id] = true; rebuildPerson_(m, db, ab); });
  ss.getSheets().forEach(sh => {
    const id = metaId_(sh);
    if (id && !keep[id]) ss.deleteSheet(sh);
  });
  rebuildAll_(team, db, ab);
  reorder_(team);
  PropertiesService.getScriptProperties().setProperty("dirty", "0");
}

function markDirty_() { PropertiesService.getScriptProperties().setProperty("dirty", "1"); }

function maybeRebuildAll_() {
  const p = PropertiesService.getScriptProperties();
  const last = Number(p.getProperty("lastAll") || 0);
  if (Date.now() - last > 3 * 60000) rebuildAll_();
}

function metaId_(sh) {
  const md = sh.getDeveloperMetadata();
  for (let i = 0; i < md.length; i++) if (md[i].getKey() === "cc") return md[i].getValue();
  return "";
}

function personSheet_(m) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheets().find(s => metaId_(s) === m.id);
  const want = safeName_(m.name);
  if (!sh) {
    sh = ss.insertSheet(uniqueName_(want));
    sh.addDeveloperMetadata("cc", m.id);
  } else if (sh.getName() !== want && !ss.getSheetByName(want)) {
    sh.setName(want);
  }
  return sh;
}

function safeName_(s) {
  const n = String(s || "Tanpa nama").replace(/[\[\]\*\?\/\\:]/g, " ").trim().slice(0, 90);
  const reserved = [SH.team.name, SH.target.name, SH.db.name, SH.photo.name, SH.absen.name, ALL_NAME];
  return reserved.indexOf(n) >= 0 ? n + " (orang)" : n;
}
function uniqueName_(n) {
  const ss = SpreadsheetApp.getActive();
  let x = n, k = 2;
  while (ss.getSheetByName(x)) x = n + " " + (k++);
  return x;
}

function dateCell_(s) { return Utilities.parseDate(s, TZ, "yyyy-MM-dd"); }

function linkRich_(text) {
  const links = String(text || "").split("\n").map(x => x.trim()).filter(String);
  const b = SpreadsheetApp.newRichTextValue().setText(links.join("\n"));
  let pos = 0;
  links.forEach(l => { if (/^https?:\/\//i.test(l)) b.setLinkUrl(pos, pos + l.length, l); pos += l.length + 1; });
  return b.build();
}

/** Gabungkan report + kehadiran satu orang, urut tanggal. */
function personItems_(m, db, ab) {
  const items = [];
  db.filter(r => String(r[2]) === m.id).forEach(r => items.push({ d: d_(r[1]), r: r }));
  ab.filter(a => String(a[0]).trim() === m.id).forEach(a => items.push({ d: d_(a[2]), a: a }));
  return items.sort((x, y) => x.d.localeCompare(y.d) || (x.a ? -1 : 0) - (y.a ? -1 : 0) ||
    (x.r && y.r ? BRAND_CODES.indexOf(brand_(x.r[3])) - BRAND_CODES.indexOf(brand_(y.r[3])) : 0));
}
function hari_(d) { const p = d.split("-").map(Number); return HARI[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()]; }
function addDay_(d, n) { const p = d.split("-").map(Number); const x = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return x.toISOString().slice(0, 10); }
function today_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd"); }
const LSTAT = { acc: "Disetujui", pending: "Menunggu ACC", tolak: "Ditolak" };
function lemburStatus_(r) { const ot = Number(r[14]) || 0; return ot > 0 ? (String(r[17] || "") || "acc") : ""; }
function lemburAcc_(r) { return lemburStatus_(r) === "acc" ? Number(r[14]) || 0 : 0; }

/**
 * Tab per orang: SEMUA tanggal Senin–Sabtu dari awal bulan pertama sampai hari ini (hari Minggu ikut kalau ada isian).
 * Tanggal tanpa report ditulis jumlah 0. Dikelompokkan per bulan, link bisa diklik, kehadiran & status lembur ikut tercatat.
 */
function rebuildPerson_(m, db, ab) {
  const role = roleOf_(m.jabatan);
  if (role === "sup") return;
  const items = personItems_(m, db || rows_(SH.db), ab || rows_(SH.absen));

  let head = ["Tanggal", "Hari", "Kehadiran", "Brand"];
  if (role === "admin") head = head.concat(["Facebook", "YouTube", "Shopee", "Total upload"]);
  else if (role === "dg") head = head.concat(["Jumlah desain", "Jenis", "Desain campaign"]);
  else head = head.concat(["Jumlah video"]);
  head = head.concat(["File data", "Tugas harian / keterangan", "Link hasil kerja", "Kendala", "Solusi", "Lembur (jam)", "Status lembur", "Diperbarui"]);
  const W = head.length, iLink = head.indexOf("Link hasil kerja"), iKend = head.indexOf("Kendala"), iOt = head.indexOf("Lembur (jam)"), iFd = head.indexOf("File data");
  const numCols = (role === "admin" ? [4, 5, 6, 7] : [4]).concat([iFd]);   // indeks 0-based kolom angka
  const zeroRole = () => role === "admin" ? [0, 0, 0, 0] : role === "dg" ? [0, "", ""] : [0];

  // semua tanggal: dari awal bulan paling awal (atau bulan ini) sampai hari ini
  const today = today_();
  const firstData = items.length ? items[0].d : today;
  let d = (firstData < today ? firstData : today).slice(0, 8) + "01";
  const last = items.length && items[items.length - 1].d > today ? items[items.length - 1].d : today;
  const byDate = {};
  items.forEach(it => { (byDate[it.d] = byDate[it.d] || []).push(it); });

  const vals = [], bgs = [], fcs = [], fws = [], monthRows = [];
  const cnt = { Cuti: 0, Izin: 0, Sakit: 0, Alpha: 0 };
  let lastMonth = "", band = false, tot = 0, ot = 0, otPend = 0, fdTot = 0;
  for (; d <= last; d = addDay_(d, 1)) {
    const list = byDate[d] || [];
    const sunday = hari_(d) === "Minggu";
    if (sunday && !list.length) continue;
    const mo = d.slice(0, 7);
    if (mo !== lastMonth) {
      lastMonth = mo;
      const line = new Array(W).fill("");
      line[0] = BULAN[Number(mo.slice(5)) - 1] + " " + mo.slice(0, 4);
      vals.push(line); bgs.push(new Array(W).fill(C_BLUE)); fcs.push(new Array(W).fill("#ffffff")); fws.push(new Array(W).fill("bold"));
      monthRows.push(vals.length);
    }
    band = !band;
    const rows = list.length ? list : [null];
    rows.forEach(it => {
      let line, bg, fc = "#23252f";
      if (!it) {
        line = [dateCell_(d), hari_(d), d > today ? "" : "Belum diisi", "-"].concat(zeroRole()).concat([0, "", "", "", "", 0, "", ""]);
        bg = new Array(W).fill(band ? "#ffffff" : C_BAND); fc = "#8a8fa3";
      } else if (it.a) {
        const a = it.a, st = String(a[3] || "");
        line = [dateCell_(d), hari_(d), st.toUpperCase(), "-"].concat(zeroRole()).concat([0, String(a[4] || ""), "", "", "", 0, "", String(a[6] || "")]);
        bg = new Array(W).fill(st === "Alpha" ? C_ALPHA : C_WARN);
        if (cnt[st] !== undefined) cnt[st]++;
      } else {
        const r = it.r, ls = lemburStatus_(r);
        line = [dateCell_(d), hari_(d), "Hadir", brand_(r[3])];
        if (role === "admin") line.push(Number(r[5]) || 0, Number(r[6]) || 0, Number(r[7]) || 0, Number(r[4]) || 0);
        else if (role === "dg") line.push(Number(r[4]) || 0, String(r[8] || ""), String(r[9] || ""));
        else line.push(Number(r[4]) || 0);
        line.push(filesOf_(r), String(r[10] || ""), String(r[11] || ""), String(r[12] || ""), String(r[13] || ""), Number(r[14]) || 0, LSTAT[ls] || "", String(r[16] || ""));
        bg = new Array(W).fill(band ? "#ffffff" : C_BAND);
        fdTot += filesOf_(r);
        if (r[12]) bg[iKend] = C_WARN;
        if (ls === "pending") bg[iOt] = bg[iOt + 1] = C_WARN;
        if (ls === "tolak") bg[iOt] = bg[iOt + 1] = C_ALPHA;
        tot += Number(r[4]) || 0; ot += lemburAcc_(r); if (ls === "pending") otPend += Number(r[14]) || 0;
      }
      vals.push(line); bgs.push(bg); fcs.push(new Array(W).fill(fc)); fws.push(new Array(W).fill("normal"));
    });
  }

  const sh = personSheet_(m);
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), 5), Math.max(sh.getMaxColumns(), W)).breakApart();
  sh.clear();
  sh.getRange(1, 1).setValue("DAILY REPORT — " + m.name.toUpperCase()).setFontSize(14).setFontWeight("bold").setFontColor(C_BLUE);
  sh.getRange(2, 1).setValue((m.jabatan || "-") + "   ·   Brand: " + (role === "dg" ? "semua brand" + (brandList_(m.brand).length ? " (utama " + brandList_(m.brand).join(", ") + ")" : "") : brandsOf_(m).join(", ")) + "   ·   " + (m.email || "-"));
  sh.getRange(3, 1).setValue("Total: " + tot + " " + (role === "admin" ? "upload" : role === "dg" ? "desain" : "video") + "   ·   File data: " + fdTot + "   ·   Lembur disetujui: " + ot + " jam" + (otPend ? " (+" + otPend + " jam menunggu ACC)" : "") +
    "   ·   Cuti " + cnt.Cuti + " · Izin " + cnt.Izin + " · Sakit " + cnt.Sakit + " · Alpha " + cnt.Alpha +
    "   ·   Diperbarui otomatis " + Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm")).setFontColor("#6a6c78");
  sh.getRange(4, 1, 1, W).setValues([head]).setFontWeight("bold").setBackground("#23252f").setFontColor("#ffffff").setVerticalAlignment("middle").setWrap(true);
  sh.setRowHeight(4, 32);
  if (vals.length) {
    sh.getRange(5, 1, vals.length, W).setNumberFormat("@").setValues(vals).setBackgrounds(bgs).setFontColors(fcs).setFontWeights(fws).setVerticalAlignment("top").setWrap(true);
    sh.getRange(5, iLink + 1, vals.length, 1).setRichTextValues(vals.map((v, i) => [monthRows.indexOf(i + 1) >= 0 ? SpreadsheetApp.newRichTextValue().setText(v[iLink]).build() : linkRich_(v[iLink])]));
    // format angka & tanggal dikunci supaya kolom jumlah tidak berubah jadi tanggal
    sh.getRange(5, 1, vals.length, 1).setNumberFormat("dd/mm/yyyy");
    numCols.forEach(c => sh.getRange(5, c + 1, vals.length, 1).setNumberFormat("0").setHorizontalAlignment("center"));
    sh.getRange(5, iOt + 1, vals.length, 1).setNumberFormat("0.#").setHorizontalAlignment("center");
    rewriteDates_(sh, 5, vals);
    monthRows.forEach(i => sh.getRange(4 + i, 1, 1, W).merge());
  }
  sh.setFrozenRows(4);
  const widths = { "Tanggal": 92, "Hari": 70, "Kehadiran": 90, "Brand": 60, "Jenis": 120, "Desain campaign": 180, "Tugas harian / keterangan": 320, "Link hasil kerja": 300, "Kendala": 200, "Solusi": 200, "Status lembur": 110, "Diperbarui": 135 };
  head.forEach((h, i) => sh.setColumnWidth(i + 1, widths[h] || 88));
}

/** Setelah format teks dipasang, tulis ulang kolom tanggal & angka sebagai nilai asli. */
function rewriteDates_(sh, startRow, vals) {
  const W = vals[0].length;
  for (let c = 0; c < W; c++) {
    if (!vals.some(v => v[c] instanceof Date || typeof v[c] === "number")) continue;
    sh.getRange(startRow, c + 1, vals.length, 1).setValues(vals.map(v => [v[c]]));
  }
}

/** Tab "Semua Report": dikelompokkan per jabatan lalu nama, urut tanggal. Jumlah kosong ditulis 0. */
function rebuildAll_(team, db, ab) {
  team = (team || readTeam_()).filter(m => roleOf_(m.jabatan) !== "sup");
  db = db || rows_(SH.db);
  ab = ab || rows_(SH.absen);
  const head = ["Tanggal", "Hari", "Nama", "Jabatan", "Kehadiran", "Brand", "Jumlah", "Satuan", "Facebook", "YouTube", "Shopee", "File data", "Jenis", "Desain campaign",
                "Tugas harian / keterangan", "Link hasil kerja", "Kendala", "Solusi", "Lembur (jam)", "Status lembur", "Diperbarui"];
  const W = head.length, iLink = 15, iKend = 16, iOt = 18;
  const vals = [], bgs = [], fcs = [], fws = [], groupRows = [];
  team.slice().sort(teamSort_).forEach(m => {
    const role = roleOf_(m.jabatan), unit = role === "admin" ? "upload" : role === "dg" ? "desain" : "video";
    const items = personItems_(m, db, ab);
    const line0 = new Array(W).fill("");
    line0[0] = m.name.toUpperCase() + "   ·   " + (m.jabatan || "-") + "   ·   " + (role === "dg" ? "semua brand" : brandsOf_(m).join(", ")) + "   ·   " + items.filter(x => x.r).length + " report";
    vals.push(line0); bgs.push(new Array(W).fill(C_BLUE)); fcs.push(new Array(W).fill("#ffffff")); fws.push(new Array(W).fill("bold"));
    groupRows.push(vals.length);
    let lastDate = "", band = false;
    items.forEach(it => {
      const d = it.d;
      if (d !== lastDate) { band = !band; lastDate = d; }
      let bg;
      if (it.a) {
        const st = String(it.a[3] || "");
        vals.push([dateCell_(d), hari_(d), m.name, m.jabatan, st.toUpperCase(), "-", 0, unit, role === "admin" ? 0 : "-", role === "admin" ? 0 : "-", role === "admin" ? 0 : "-", 0, "", "", String(it.a[4] || ""), "", "", "", 0, "", String(it.a[6] || "")]);
        bg = new Array(W).fill(st === "Alpha" ? C_ALPHA : C_WARN);
      } else {
        const r = it.r, ls = lemburStatus_(r);
        vals.push([dateCell_(d), hari_(d), m.name, m.jabatan, "Hadir", brand_(r[3]),
          Number(r[4]) || 0, unit,
          role === "admin" ? Number(r[5]) || 0 : "-", role === "admin" ? Number(r[6]) || 0 : "-", role === "admin" ? Number(r[7]) || 0 : "-", filesOf_(r),
          String(r[8] || ""), String(r[9] || ""), String(r[10] || ""), String(r[11] || ""), String(r[12] || ""), String(r[13] || ""),
          Number(r[14]) || 0, LSTAT[ls] || "", String(r[16] || "")]);
        bg = new Array(W).fill(band ? "#ffffff" : C_BAND);
        if (r[12]) bg[iKend] = C_WARN;
        if (ls === "pending") bg[iOt] = bg[iOt + 1] = C_WARN;
        if (ls === "tolak") bg[iOt] = bg[iOt + 1] = C_ALPHA;
      }
      bgs.push(bg); fcs.push(new Array(W).fill("#23252f")); fws.push(new Array(W).fill("normal"));
    });
  });

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(ALL_NAME) || ss.insertSheet(ALL_NAME);
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), 3), Math.max(sh.getMaxColumns(), W)).breakApart();
  sh.clear();
  sh.getRange(1, 1).setValue("SEMUA REPORT — DIVISI CREATIVE INDOGROUP").setFontSize(14).setFontWeight("bold").setFontColor(C_BLUE);
  sh.getRange(2, 1).setValue("Urut jabatan (Content Creator → Desain Grafis → Admin) lalu nama, urut tanggal. Lembur hanya dihitung kalau statusnya Disetujui. Diperbarui otomatis " + Utilities.formatDate(new Date(), TZ, "dd/MM/yyyy HH:mm")).setFontColor("#6a6c78");
  sh.getRange(3, 1, 1, W).setValues([head]).setFontWeight("bold").setBackground("#23252f").setFontColor("#ffffff").setVerticalAlignment("middle").setWrap(true);
  sh.setRowHeight(3, 32);
  if (vals.length) {
    sh.getRange(4, 1, vals.length, W).setNumberFormat("@").setValues(vals).setBackgrounds(bgs).setFontColors(fcs).setFontWeights(fws).setVerticalAlignment("top").setWrap(true);
    sh.getRange(4, iLink + 1, vals.length, 1).setRichTextValues(vals.map((v, i) => [groupRows.indexOf(i + 1) >= 0 ? SpreadsheetApp.newRichTextValue().setText(v[iLink]).build() : linkRich_(v[iLink])]));
    sh.getRange(4, 1, vals.length, 1).setNumberFormat("dd/mm/yyyy");
    [6, 8, 9, 10, 11].forEach(c => sh.getRange(4, c + 1, vals.length, 1).setNumberFormat("0").setHorizontalAlignment("center"));
    sh.getRange(4, iOt + 1, vals.length, 1).setNumberFormat("0.#").setHorizontalAlignment("center");
    rewriteDates_(sh, 4, vals);
    groupRows.forEach(i => sh.getRange(3 + i, 1, 1, W).merge());
  }
  sh.setFrozenRows(3);
  const widths = [92, 70, 130, 120, 90, 60, 70, 70, 80, 80, 80, 80, 120, 170, 320, 300, 200, 200, 90, 110, 135];
  widths.forEach((w, i) => sh.setColumnWidth(i + 1, w));
  PropertiesService.getScriptProperties().setProperty("lastAll", String(Date.now()));
}

function reorder_(team) {
  const ss = SpreadsheetApp.getActive();
  const order = [SH.team.name, SH.target.name, SH.absen.name, ALL_NAME];
  let pos = 1;
  const move = sh => { if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(pos++); } };
  order.forEach(n => move(ss.getSheetByName(n)));
  (team || readTeam_()).slice().sort(teamSort_).forEach(m => move(ss.getSheets().find(s => metaId_(s) === m.id)));
  [SH.db, SH.photo].forEach(def => { const s = ss.getSheetByName(def.name); if (s && !s.isSheetHidden()) s.hideSheet(); });
  const first = ss.getSheetByName(ALL_NAME) || ss.getSheetByName(SH.team.name);
  if (first) ss.setActiveSheet(first);
}

/* ===================== PINDAH BRAND, KEHADIRAN, PERBAIKAN DATA ===================== */

/** Pindahkan satu report ke brand lain (misalnya salah pilih brand). */
function moveEntry_(ctx, req) {
  const cc = String(req.cc || ""), date = String(req.date || ""), from = brand_(req.from), to = brand_(req.to);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || BRAND_CODES.indexOf(from) < 0 || BRAND_CODES.indexOf(to) < 0 || from === to) throw new Error("FORBIDDEN:bad_request");
  const m = ctx.team.find(c => c.id === cc);
  if (!m) throw new Error("FORBIDDEN:unknown_member");
  if (!ctx.isAdmin && (!ctx.me || ctx.me.id !== cc)) throw new Error("FORBIDDEN:not_owner");
  if (!ctx.isAdmin && roleOf_(m.jabatan) !== "dg" && brandsOf_(m).indexOf(to) < 0) throw new Error("FORBIDDEN:brand_not_assigned");
  const kFrom = cc + "_" + date + "_" + from, kTo = cc + "_" + date + "_" + to;
  withLock_(() => {
    const data = rows_(SH.db);
    if (data.some(r => String(r[0]) === kTo)) throw new Error("FORBIDDEN:target_exists");
    const i = data.findIndex(r => String(r[0]) === kFrom);
    if (i < 0) throw new Error("FORBIDDEN:not_found");
    const sh = sheet_(SH.db);
    sh.getRange(i + 2, 1).setValue(kTo);
    sh.getRange(i + 2, 4).setValue(to);
    rebuildPerson_(m);
    markDirty_();
  });
  return { ok: true };
}

/** Hapus satu report yang salah (pemilik report atau atasan/pengawas). */
function deleteEntry_(ctx, req) {
  const cc = String(req.cc || ""), date = String(req.date || ""), brand = brand_(req.brand);
  const m = ctx.team.find(c => c.id === cc);
  if (!m) throw new Error("FORBIDDEN:unknown_member");
  if (!ctx.isAdmin && (!ctx.me || ctx.me.id !== cc)) throw new Error("FORBIDDEN:not_owner");
  const key = cc + "_" + date + "_" + brand;
  withLock_(() => {
    const i = rows_(SH.db).findIndex(r => String(r[0]) === key);
    if (i >= 0) sheet_(SH.db).deleteRow(i + 2);
    rebuildPerson_(m);
    markDirty_();
  });
  return { ok: true };
}

/** ACC / tolak lembur (atasan & pengawas). keys = daftar kunci report. */
function approveLembur_(ctx, req) {
  if (!ctx.isAdmin) throw new Error("FORBIDDEN:admin_only");
  const decision = req.decision === "tolak" ? "tolak" : req.decision === "acc" ? "acc" : "";
  if (!decision) throw new Error("FORBIDDEN:bad_decision");
  const keys = (Array.isArray(req.keys) ? req.keys : []).map(String).slice(0, 200);
  const now = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
  const touched = {};
  let n = 0;
  withLock_(() => {
    const sh = sheet_(SH.db), data = rows_(SH.db);
    data.forEach((r, i) => {
      if (keys.indexOf(String(r[0])) < 0 || !(Number(r[14]) > 0)) return;
      sh.getRange(i + 2, 18, 1, 3).setValues([[decision, ctx.email, now]]);
      touched[String(r[2])] = true; n++;
    });
    ctx.team.filter(m => touched[m.id]).forEach(m => rebuildPerson_(m));
    markDirty_();
  });
  return { ok: true, count: n, decision: decision };
}

/** Cuti / Izin / Sakit / Alpha untuk satu atau beberapa tanggal. Status kosong = hadir (hapus catatan). */
function saveAbsence_(ctx, req) {
  const cc = String(req.cc || ""), status = String(req.status || ""), note = String(req.note || "").slice(0, 500);
  const dates = (Array.isArray(req.dates) ? req.dates : []).map(String).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!dates.length || dates.length > 31) throw new Error("FORBIDDEN:bad_dates");
  if (status && STATUS.indexOf(status) < 0) throw new Error("FORBIDDEN:bad_status");
  const m = ctx.team.find(c => c.id === cc);
  if (!m) throw new Error("FORBIDDEN:unknown_member");
  if (!ctx.isAdmin && (!ctx.me || ctx.me.id !== cc)) throw new Error("FORBIDDEN:not_owner");
  if (!ctx.isAdmin && status === "Alpha") throw new Error("FORBIDDEN:alpha_admin_only");
  withLock_(() => {
    const sh = sheet_(SH.absen);
    const data = rows_(SH.absen);
    const idx = {};
    data.forEach((r, i) => { idx[String(r[0]).trim() + "|" + d_(r[2])] = i; });
    if (!ctx.isAdmin && dates.some(d => idx[cc + "|" + d] !== undefined && String(data[idx[cc + "|" + d]][3]) === "Alpha")) throw new Error("FORBIDDEN:alpha_admin_only");
    const now = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");
    const del = [];
    dates.forEach(d => {
      const i = idx[cc + "|" + d];
      if (!status) { if (i !== undefined) del.push(i + 2); return; }
      const row = [cc, m.name, d, status, note, ctx.email, now];
      if (i !== undefined) sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
      else sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    });
    del.sort((a, b) => b - a).forEach(r => sh.deleteRow(r));
    rebuildPerson_(m);
    markDirty_();
  });
  return { ok: true };
}

/**
 * Data dari versi 1 yang dipindahkan ke brand yang salah (karena kolom Brand kosong / tidak terbaca)
 * dipindahkan ke brand yang benar sesuai sheet "Anggota". Hanya menyentuh baris hasil pindahan versi 1.
 */
function fixMigrated_(team) {
  const ss = SpreadsheetApp.getActive();
  const oldR = ss.getSheets().find(s => /^Report Harian \(lama\)/.test(s.getName()));
  const oldT = ss.getSheets().find(s => /^Target Mingguan \(lama\)/.test(s.getName()));
  const mem = {};
  team.forEach(m => { mem[m.id] = m; });
  const fixedBrands = m => (m && roleOf_(m.jabatan) !== "dg") ? brandList_(m.brand) : [];
  let moved = 0;
  if (oldR && oldR.getLastRow() > 1) {
    const sig = {};
    oldR.getRange(2, 1, oldR.getLastRow() - 1, 18).getValues().forEach(r => {
      const id = String(r[3]).trim(), d = d_(r[1]);
      if (!id || !d) return;
      const up = r[17] instanceof Date ? Utilities.formatDate(r[17], TZ, "yyyy-MM-dd HH:mm:ss") : String(r[17] || "");
      sig[id + "|" + d + "|" + up] = brandList_(r[8]);
    });
    const sh = sheet_(SH.db), data = rows_(SH.db), keys = {};
    data.forEach(r => { keys[String(r[0])] = true; });
    data.forEach((r, i) => {
      const id = String(r[2]), d = d_(r[1]), assigned = fixedBrands(mem[id]), cur = brand_(r[3]);
      if (!assigned.length || assigned.indexOf(cur) >= 0) return;
      const pref = sig[id + "|" + d + "|" + String(r[16] || "")];
      if (!pref) return;
      const nb = pref.find(b => assigned.indexOf(b) >= 0) || assigned[0];
      const nk = id + "_" + d + "_" + nb;
      if (keys[nk]) return;
      delete keys[String(r[0])]; keys[nk] = true;
      sh.getRange(i + 2, 1).setValue(nk); sh.getRange(i + 2, 4).setValue(nb); moved++;
    });
  }
  if (oldT && oldT.getLastRow() > 1) {
    const sig = {};
    oldT.getRange(2, 1, oldT.getLastRow() - 1, 4).getValues().forEach(r => { sig[String(r[0]).trim() + "|" + d_(r[2])] = true; });
    const sh = sheet_(SH.target), data = rows_(SH.target), keys = {};
    data.forEach(r => { keys[String(r[0]) + "|" + brand_(r[2]) + "|" + d_(r[3])] = true; });
    data.forEach((r, i) => {
      const id = String(r[0]), w = d_(r[3]), assigned = fixedBrands(mem[id]), cur = brand_(r[2]);
      if (!assigned.length || assigned.indexOf(cur) >= 0 || !sig[id + "|" + w]) return;
      const nk = id + "|" + assigned[0] + "|" + w;
      if (keys[nk]) return;
      delete keys[id + "|" + cur + "|" + w]; keys[nk] = true;
      sh.getRange(i + 2, 3).setValue(assigned[0]); moved++;
    });
  }
  return moved;
}

/* ======================= STRUKTUR SHEET & MIGRASI ======================= */

/**
 * Menyiapkan struktur sheet versi terbaru.
 * full = true (dari setupAwal): sekalian merapikan semua tab, boleh menunggu lama.
 * full = false (dari website): hanya struktur & migrasi ringan, perapian diserahkan ke jadwal otomatis.
 */
function ensureSheets_(full) {
  const props = PropertiesService.getScriptProperties();
  if (!full && props.getProperty("ready") === VERSION) return;
  withLock_(() => {
    if (!full && props.getProperty("ready") === VERSION) return;
    const ss = SpreadsheetApp.getActive();
    try { ss.setSpreadsheetTimeZone(TZ); } catch (x) { }
    const oldTarget = ss.getSheetByName("Target Mingguan");
    const oldReport = ss.getSheetByName("Report Harian");

    Object.keys(SH).forEach(k => {
      const def = SH[k];
      const sh = sheet_(def);
      sh.getRange(1, 1, 1, def.head.length).setValues([def.head]).setFontWeight("bold").setBackground("#23252f").setFontColor("#ffffff");
      sh.setFrozenRows(1);
      def.text.forEach(col => sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat("@"));
    });
    const team = sheet_(SH.team);
    team.getRange(2, 3, team.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(JABATAN, true).setAllowInvalid(true).build());
    team.getRange(1, 4).setNote("Kode brand dipisah koma, contoh: OLV, KNG\nPilihan: " + BRAND_CODES.join(", ") + "\nKosongkan = boleh semua brand.");

    const members = {};
    readTeam_().forEach(m => { members[m.id] = m; });
    const firstBrand = id => (members[id] ? brandsOf_(members[id])[0] : "OLV");

    if (oldTarget && rows_(SH.target).length === 0) {
      const last = oldTarget.getLastRow();
      if (last > 1) {
        const rows = oldTarget.getRange(2, 1, last - 1, 4).getValues().filter(r => String(r[0]).trim())
          .map(r => [String(r[0]), String(r[1]), firstBrand(String(r[0])), d_(r[2]), Number(r[3]) || 0]);
        if (rows.length) sheet_(SH.target).getRange(2, 1, rows.length, 5).setValues(rows);
      }
      oldTarget.setName(uniqueName_("Target Mingguan (lama)")); oldTarget.hideSheet();
    }
    if (oldReport && rows_(SH.db).length === 0) {
      const last = oldReport.getLastRow();
      if (last > 1) {
        const rows = oldReport.getRange(2, 1, last - 1, 18).getValues().filter(r => String(r[3]).trim() && d_(r[1])).map(r => {
          const id = String(r[3]), d = d_(r[1]);
          const b = brandList_(r[8])[0] || firstBrand(id);
          return [id + "_" + d + "_" + b, d, id, b, Number(r[6]) || 0, 0, 0, 0, String(r[9] || ""), String(r[10] || ""),
            String(r[11] || ""), String(r[12] || ""), String(r[13] || ""), String(r[14] || ""), Number(r[15]) || 0, String(r[16] || ""),
            r[17] instanceof Date ? Utilities.formatDate(r[17], TZ, "yyyy-MM-dd HH:mm:ss") : String(r[17] || "")];
        });
        if (rows.length) sheet_(SH.db).getRange(2, 1, rows.length, rows[0].length).setValues(rows);
      }
      oldReport.setName(uniqueName_("Report Harian (lama)")); oldReport.hideSheet();
    }
    // lembur dari versi sebelumnya (belum ada status) dianggap sudah disetujui
    const dbs = sheet_(SH.db), dbr = rows_(SH.db);
    dbr.forEach((r, i) => { if (Number(r[14]) > 0 && !String(r[17] || "")) dbs.getRange(i + 2, 18).setValue("acc"); });
    if (readTeam_().length) fixMigrated_(readTeam_());
    if (full) { if (readTeam_().length) rapikan_(); else reorder_([]); props.setProperty("needFull", "0"); }
    else { props.setProperty("needFull", "1"); props.setProperty("dirty", "1"); }
    props.setProperty("ready", VERSION);
  }, full ? 300000 : 8000);
}

/* ================================ BANTUAN ================================ */

/** cc = Content Creator, dg = Desain Grafis, admin = Admin upload, sup = pengawas (HR, Content Director, Manajer, lainnya) */
function roleOf_(j) {
  j = String(j || "").trim();
  if (!j || /creator|^cc$/i.test(j)) return "cc";
  if (/desain|design|graf/i.test(j)) return "dg";
  if (/^admin/i.test(j)) return "admin";
  return "sup";
}
function brand_(v) { const s = String(v == null ? "" : v).trim().toUpperCase(); return s === "77.0" ? "77" : s; }
function brandCode_(t) {
  const s = String(t == null ? "" : t).trim();
  if (!s) return "";
  const up = brand_(s);
  if (BRAND_CODES.indexOf(up) >= 0) return up;
  const lo = s.toLowerCase().replace(/\s+/g, " ");
  const hit = BRAND_ALIAS.find(a => a[1].test(lo) || a[1].test(lo.replace(/^batik\s+/, "")));
  return hit ? hit[0] : "";
}
function brandList_(v) {
  const out = [];
  String(v || "").split(/[,\/;+|\n]/).map(brandCode_).forEach(b => { if (b && out.indexOf(b) < 0) out.push(b); });
  return out.sort((a, b) => BRAND_CODES.indexOf(a) - BRAND_CODES.indexOf(b));
}
function brandsOf_(m) { const l = brandList_(m.brand); return l.length ? l : BRAND_CODES.slice(); }

function sheet_(def) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(def.name) || ss.insertSheet(def.name);
}
function rows_(def) {
  const sh = sheet_(def);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, def.head.length).getValues();
}
function upsert_(def, match, row) {
  const sh = sheet_(def);
  const data = rows_(def);
  for (let i = 0; i < data.length; i++) {
    if (match(data[i])) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); return; }
  }
  sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}
/** Jalankan fn dengan kunci. waitMs = berapa lama menunggu proses lain selesai. */
function withLock_(fn, waitMs) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs || 25000)) throw new Error("BUSY:lock");
  try { fn(); SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
}
function d_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  return String(v || "").trim().slice(0, 10);
}
function iso_(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return new Date(s.replace(" ", "T") + "+07:00").toISOString();
  return s;
}
function lower_(v) { return String(v || "").trim().toLowerCase(); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

/* ====================== DIJALANKAN DARI EDITOR / MENU ====================== */

/** Jalankan SEKALI dari editor (pilih "setupAwal" lalu ▶ Run) setiap kali Code.gs diperbarui. */
function setupAwal() {
  ensureSheets_(true);
  photoFolder_();
  UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=x", { muteHttpExceptions: true });
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === "autoRapikan") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("autoRapikan").timeBased().everyMinutes(5).create();
  try { SpreadsheetApp.getActive().toast("Siap (" + VERSION + "). Lanjutkan: Deploy → Manage deployments → New version.", "Daily Report", 10); } catch (x) { }
}

/** Dijalankan otomatis tiap 5 menit: merapikan tab "Semua Report" kalau ada isian baru. */
function autoRapikan() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty("dirty") !== "1" && p.getProperty("needFull") !== "1") return;
  try {
    withLock_(() => {
      if (p.getProperty("needFull") === "1") { rapikan_(); p.setProperty("needFull", "0"); }
      else rebuildAll_();
      p.setProperty("dirty", "0");
    }, 5000);
  } catch (e) { if (String(e.message).indexOf("BUSY:") !== 0) throw e; }   // sedang dipakai: coba lagi 5 menit kemudian
}

function rapikanSemua() {
  withLock_(rapikan_, 300000);
  try { SpreadsheetApp.getActive().toast("Semua sheet sudah dirapikan.", "Daily Report", 5); } catch (x) { }
}

/** Memaksa semua HP/laptop login Gmail ulang (misalnya kalau ada perangkat hilang). */
function keluarkanSemuaPerangkat() {
  PropertiesService.getScriptProperties().deleteProperty("secret");
  try { SpreadsheetApp.getActive().toast("Semua perangkat harus login ulang.", "Daily Report", 5); } catch (x) { }
}

/** Memindahkan data versi 1 yang salah brand ke brand yang benar (sesuai sheet "Anggota"). */
function perbaikiBrandDataLama() {
  let n = 0;
  withLock_(() => { n = fixMigrated_(readTeam_()); rapikan_(); }, 300000);
  try { SpreadsheetApp.getActive().toast(n + " baris dipindahkan ke brand yang benar.", "Daily Report", 6); } catch (x) { }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Daily Report")
    .addItem("Rapikan semua sheet sekarang", "rapikanSemua")
    .addItem("Perbaiki brand data lama", "perbaikiBrandDataLama")
    .addSeparator()
    .addItem("Keluarkan semua perangkat (wajib login ulang)", "keluarkanSemuaPerangkat")
    .addToUi();
}
