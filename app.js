/* Daily Report Creative Indogroup — v2
   Tampilan di GitHub Pages, data di Google Sheets (lewat Apps Script).
   Login Gmail sekali, perangkat diingat 90 hari. */

// config.js selalu diambil versi terbaru (tanpa cache browser)
const CFG = await import("./config.js?v=" + Date.now()).then(m => ({ ok: true, ...m })).catch(e => ({ ok: false, err: String(e && e.message || e) }));
const SCRIPT_URL = String(CFG.SCRIPT_URL || "").trim();
const GOOGLE_CLIENT_ID = String(CFG.GOOGLE_CLIENT_ID || "").trim();

/* ---------------- konstanta ---------------- */
const BRANDS = [["OLV","Batik Oliver"],["KNG","Kenangan Fashion"],["77","Batik 77"],["MTR","Batik Menteri"],["IDN","Batik Indonesia"],["RS","Batik Rama Shinta"],["TKS","Batik Taksaka"]];
const BRAND_ALIAS = [["OLV", /oliver|^olv$/], ["KNG", /kenangan|^kng$/], ["77", /^(batik\s*)?77$/], ["MTR", /menteri|^mtr$/], ["IDN", /indonesia|indo\s*group|^idn$/], ["RS", /rama\s*shinta|ramashinta|^rs$/], ["TKS", /taksaka|^tks$/]];
const STATUS = ["Cuti","Izin","Sakit","Alpha"];
const CODES = BRANDS.map(b => b[0]);
const BNAME = Object.fromEntries(BRANDS);
const CAMP = ["Banner Marketplace","Sticker Live","Katalog Watermark","Thumbnail Live"];
const JABATAN = ["Content Creator","Desain Grafis","Admin"];
const UNIT = { cc: "video", dg: "desain", admin: "upload" };
const HARI = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const POLL_MS = 30000, AUTOSAVE_MS = 2000;

/* ---------------- util ---------------- */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const ds = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const pd = s => { const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); };
const add = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const monday = s => add(s, -((pd(s).getDay() + 6) % 7));
const longDate = s => { const d = pd(s); return HARI[d.getDay()] + ", " + d.getDate() + " " + BULAN[d.getMonth()] + " " + d.getFullYear(); };
const shortD = s => pd(s).getDate() + " " + BULAN[pd(s).getMonth()].slice(0, 3);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = n => (Math.round(n * 10) / 10).toString().replace(".", ",");
const low = s => String(s || "").trim().toLowerCase();
const TODAY = ds(new Date());
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};

/* ---------------- state ---------------- */
const S = {
  month: TODAY.slice(0, 7), sel: TODAY, view: ls.get("view") || "", brandF: ls.get("brandF") || "", brandSel: {},
  ccs: [], entries: {}, targets: {}, photos: {}, email: "", isAdmin: false, me: "",
  ready: false, pending: {}, pendingT: {}, teamDirty: 0, seq: 0, sheetUrl: "", armed: null,
  absen: {}, pendingA: {}, photosBig: {}
};
let SESSION = ls.get("sess") || "";

function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2600); }
const ccById = id => S.ccs.find(c => c.id === id);
const roleOf = c => { const j = String(c && c.jabatan || ""); return /desain|design|graf/i.test(j) ? "dg" : /admin/i.test(j) ? "admin" : "cc"; };
const brandCode = t => { const x = String(t || "").trim(); if (!x) return ""; if (CODES.includes(x.toUpperCase())) return x.toUpperCase(); const lo = x.toLowerCase().replace(/\s+/g, " "); const h = BRAND_ALIAS.find(a => a[1].test(lo) || a[1].test(lo.replace(/^batik\s+/, ""))); return h ? h[0] : ""; };
const brandList = v => { const o = []; String(v || "").split(/[,\/;+|\n]/).map(brandCode).forEach(b => { if (b && !o.includes(b)) o.push(b); }); return o.sort((a, b) => CODES.indexOf(a) - CODES.indexOf(b)); };
/** brand yang boleh diisi: Desain Grafis bebas 7 brand, yang lain sesuai pengaturan atasan (kosong = semua) */
const brandsOf = c => { if (roleOf(c) === "dg") return CODES.slice(); const l = brandList(c && c.brand); return l.length ? l : CODES.slice(); };
const assignedOf = c => brandList(c && c.brand);
const canEdit = id => S.isAdmin || (!!id && id === S.me);
const ekey = (cc, d, b) => cc + "_" + d + "_" + b;
const tgt = (cc, b, wk) => +(S.targets[cc + "_" + b + "_" + wk]?.target) || 0;
const absOf = (cc, d) => S.absen[cc + "_" + d] || null;
/** jumlah hari Cuti/Izin/Sakit (Senin–Sabtu) dalam satu minggu: mengurangi target */
const offDays = (cc, wk) => { let n = 0; for (let i = 0; i < 6; i++) { const a = absOf(cc, add(wk, i)); if (a && a.status !== "Alpha") n++; } return n; };
/** target efektif = target × hari kerja tersisa / 6 */
const tgtEff = (cc, b, wk) => { const t = tgt(cc, b, wk); return t ? Math.round(t * Math.max(0, 6 - offDays(cc, wk)) / 6) : 0; };
const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
function range() { const [y, m] = S.month.split("-").map(Number); const first = S.month + "-01", last = ds(new Date(y, m, 0)); return { first, last, start: monday(first), end: add(monday(last), 6) }; }
const curWeek = () => monday(S.sel.startsWith(S.month) ? S.sel : (TODAY.startsWith(S.month) ? TODAY : S.month + "-01"));
function curBrand() {
  const c = ccById(S.view); if (!c) return "";
  const bs = brandsOf(c); if (bs.length === 1) return bs[0];
  const b = S.brandSel[S.view];
  if (b === "" || bs.includes(b)) return b;
  if (roleOf(c) === "dg") return assignedOf(c)[0] || "";
  return bs[0];
}
/** filter aktif: halaman orang → orang + brand tab; beranda → filter brand */
const scope = () => S.view ? { cc: S.view, brand: curBrand() } : { cc: "", brand: S.brandF };
const inScope = (e, sc) => ccById(e.cc) && (!sc.cc || e.cc === sc.cc) && (!sc.brand || e.brand === sc.brand);
function ents(from, to, sc = scope()) { return Object.values(S.entries).filter(e => e.date >= from && e.date <= to && inScope(e, sc)); }
const sum = (arr, k) => arr.reduce((a, e) => a + (+e[k] || 0), 0);
/** target harian/mingguan untuk filter aktif */
function scopeTarget(wk, sc = scope()) {
  if (sc.cc) { const c = ccById(sc.cc); return (sc.brand ? [sc.brand] : brandsOf(c)).reduce((a, b) => a + tgtEff(c.id, b, wk), 0); }
  return S.ccs.reduce((a, c) => a + brandsOf(c).filter(b => !sc.brand || b === sc.brand).reduce((x, b) => x + tgtEff(c.id, b, wk), 0), 0);
}
/** brand yang ditampilkan di kartu rekap: DG = brand utama + brand yang ada isian/target */
function homeBrands(c) {
  if (roleOf(c) !== "dg") return brandsOf(c);
  const { start, end } = range(), wk = curWeek(), set = new Set(assignedOf(c));
  Object.values(S.entries).forEach(e => { if (e.cc === c.id && e.date >= start && e.date <= end) set.add(e.brand); });
  CODES.forEach(b => { if (tgt(c.id, b, wk)) set.add(b); });
  return CODES.filter(b => set.has(b));
}
const membersInScope = () => S.ccs.filter(c => !S.brandF || homeBrands(c).includes(S.brandF) || (roleOf(c) === "dg" && !homeBrands(c).length));
const absCount = (cc, from, to) => { const o = { Cuti: 0, Izin: 0, Sakit: 0, Alpha: 0 }; Object.values(S.absen).forEach(a => { if (a.cc === cc && a.date >= from && a.date <= to && o[a.status] !== undefined) o[a.status]++; }); return o; };
const absShort = o => STATUS.filter(k => o[k]).map(k => k[0] + o[k]).join(" · ");

/* ---------------- foto ---------------- */
function ava(c, cls = "") {
  const p = c && S.photos[c.id];
  return `<span class="ava ${cls}">${p ? `<img src="${p}" alt="">` : esc(initials(c && c.name))}</span>`;
}
async function syncPhotos() {
  const need = [];
  S.ccs.forEach(c => {
    if (!c.photoVer) { delete S.photos[c.id]; return; }
    let cached = null; try { cached = JSON.parse(ls.get("ph_" + c.id) || "null"); } catch (e) { }
    if (cached && cached.v === c.photoVer) { S.photos[c.id] = cached.data; if (cached.big) S.photosBig[c.id] = cached.big; } else need.push(c.id);
  });
  if (!need.length) return;
  try {
    const r = await api("photos", { ids: need });
    Object.entries(r.photos || {}).forEach(([id, p]) => { if (p.data) { S.photos[id] = p.data; if (p.big) S.photosBig[id] = p.big; ls.set("ph_" + id, JSON.stringify({ v: p.v, data: p.data, big: p.big || "" })); } });
    renderAll();
  } catch (e) { }
}
function loadImage(file) {
  return new Promise((res, rej) => { const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => { URL.revokeObjectURL(url); res(img); }; img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("img")); }; img.src = url; });
}
/* editor foto: geser, zoom (slider / scroll / cubit), putar */
const CROP = { img: null, cc: "", zoom: 1, x: 0, y: 0, ptrs: new Map(), pinch: 0 };
const VP = 560;
function cropBase() { const i = CROP.img; return Math.max(VP / i.width, VP / i.height); }
function cropClamp() {
  const i = CROP.img, sc = cropBase() * CROP.zoom, mx = Math.max(0, (i.width * sc - VP) / 2), my = Math.max(0, (i.height * sc - VP) / 2);
  CROP.x = Math.min(mx, Math.max(-mx, CROP.x)); CROP.y = Math.min(my, Math.max(-my, CROP.y));
}
function cropDraw(ctx, size, overlay) {
  const i = CROP.img, k = size / VP, sc = cropBase() * CROP.zoom * k, w = i.width * sc, h = i.height * sc;
  ctx.fillStyle = "#c6cee8"; ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(i, size / 2 + CROP.x * k - w / 2, size / 2 + CROP.y * k - h / 2, w, h);
  if (overlay) {
    const p = new Path2D(); p.rect(0, 0, size, size); p.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(35,37,47,.45)"; ctx.fill(p, "evenodd");
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }
}
function cropRender() { cropClamp(); cropDraw($("cropCv").getContext("2d"), VP, true); $("cropZoom").value = CROP.zoom; }
function cropExport(size, q) { const cv = document.createElement("canvas"); cv.width = cv.height = size; cropDraw(cv.getContext("2d"), size, false); return cv.toDataURL("image/jpeg", q); }
function fitJpeg(size, limit, q = 0.88) { let out; do { out = cropExport(size, q); q -= 0.08; if (q < 0.5) { size = Math.round(size * 0.85); q = 0.82; } } while (out.length > limit && size > 80); return out; }
async function openCropper(cc, file) {
  if (!file || !/^image\//.test(file.type)) { toast("Pilih file gambar (JPG/PNG)"); return; }
  try { CROP.img = await loadImage(file); } catch (e) { toast("Gambar tidak bisa dibuka, coba file JPG/PNG lain"); return; }
  CROP.cc = cc; CROP.zoom = 1; CROP.x = 0; CROP.y = 0; CROP.ptrs.clear();
  const c = ccById(cc); $("cropTitle").textContent = "Atur foto" + (c ? " " + c.name : "");
  $("cropModal").hidden = false; document.body.style.overflow = "hidden"; cropRender(); $("cropSave").focus();
}
function closeCropper() { $("cropModal").hidden = true; document.body.style.overflow = ""; CROP.img = null; }
function cropRotate() {
  const i = CROP.img, cv = document.createElement("canvas"); cv.width = i.height; cv.height = i.width;
  const cx = cv.getContext("2d"); cx.translate(cv.width / 2, cv.height / 2); cx.rotate(Math.PI / 2); cx.drawImage(i, -i.width / 2, -i.height / 2);
  CROP.img = cv; CROP.x = 0; CROP.y = 0; cropRender();
}
async function cropSave() {
  const cc = CROP.cc, btn = $("cropSave"); btn.disabled = true; btn.textContent = "Menyimpan…";
  try {
    const thumb = fitJpeg(240, 47000), big = fitJpeg(720, 190000), full = cropExport(1000, 0.88);
    const r = await api("savePhoto", { cc, thumb, big, full });
    S.photos[cc] = thumb; S.photosBig[cc] = big; ls.set("ph_" + cc, JSON.stringify({ v: r.v, data: thumb, big }));
    const c = ccById(cc); if (c) c.photoVer = r.v;
    closeCropper(); renderAll(); toast("Foto tersimpan");
  } catch (e) { toast(e && e.error === "forbidden" ? "Kamu hanya bisa mengganti fotomu sendiri" : "Foto gagal disimpan, coba lagi"); }
  finally { btn.disabled = false; btn.textContent = "Simpan foto"; }
}
function cropInit() {
  const cv = $("cropCv"), k = () => VP / cv.getBoundingClientRect().width;
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); CROP.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); CROP.pinch = 0; });
  cv.addEventListener("pointermove", e => {
    if (!CROP.ptrs.has(e.pointerId) || !CROP.img) return;
    const prev = CROP.ptrs.get(e.pointerId); CROP.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (CROP.ptrs.size === 1) { CROP.x += (e.clientX - prev.x) * k(); CROP.y += (e.clientY - prev.y) * k(); }
    else if (CROP.ptrs.size === 2) {
      const [a, b] = [...CROP.ptrs.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (CROP.pinch) CROP.zoom = Math.min(4, Math.max(1, CROP.zoom * dist / CROP.pinch));
      CROP.pinch = dist;
    }
    cropRender();
  });
  const up = e => { CROP.ptrs.delete(e.pointerId); CROP.pinch = 0; };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { e.preventDefault(); CROP.zoom = Math.min(4, Math.max(1, CROP.zoom * Math.exp(-e.deltaY * 0.0015))); cropRender(); }, { passive: false });
  cv.addEventListener("keydown", e => {
    const st = 12; let used = true;
    if (e.key === "ArrowLeft") CROP.x -= st; else if (e.key === "ArrowRight") CROP.x += st; else if (e.key === "ArrowUp") CROP.y -= st; else if (e.key === "ArrowDown") CROP.y += st;
    else if (e.key === "+" || e.key === "=") CROP.zoom = Math.min(4, CROP.zoom * 1.08); else if (e.key === "-") CROP.zoom = Math.max(1, CROP.zoom / 1.08); else used = false;
    if (used) { e.preventDefault(); cropRender(); }
  });
  $("cropZoom").addEventListener("input", e => { CROP.zoom = +e.target.value; cropRender(); });
  $("cropRotate").addEventListener("click", cropRotate);
  $("cropCancel").addEventListener("click", closeCropper);
  $("cropSave").addEventListener("click", cropSave);
  $("cropModal").addEventListener("keydown", e => { if (e.key === "Escape") closeCropper(); });
  $("cropModal").addEventListener("click", e => { if (e.target === $("cropModal")) closeCropper(); });
}

/* ---------------- render: hero & nav ---------------- */
function renderHero() {
  const h = $("hero"), [y, m] = S.month.split("-").map(Number), per = BULAN[m - 1] + " " + y;
  if (!S.view) {
    const ms = S.ccs.slice(0, 6);
    h.className = "hero" + (ms.length ? "" : " solo");
    const me = ccById(S.me);
    h.innerHTML = `<div class="hero-l"><span class="hpill">Divisi Creative Indogroup · ${per}</span>
      <h1>Daily Report<br>Creative</h1><p class="hsub">Rekap konten video, desain grafis dan upload admin untuk 7 brand.</p>
      <div class="hfoot"><span class="arrow"></span>${me ? `<button class="pbtn" data-open="${esc(me.id)}">Isi report saya</button>` : ""}</div></div>
      ${ms.length ? `<div class="hero-r mosaic" style="--mc:${ms.length <= 3 ? ms.length : ms.length === 4 ? 2 : 3}">${ms.map(c => `<button class="tile" data-open="${esc(c.id)}" aria-label="Buka report ${esc(c.name)}" style="border:0;padding:0;cursor:pointer">${S.photos[c.id] ? `<img src="${S.photos[c.id]}" alt="">` : `<span>${esc(initials(c.name))}</span>`}<em>${esc(c.name.split(" ")[0])}</em></button>`).join("")}</div>` : ""}`;
    return;
  }
  const c = ccById(S.view); if (!c) return;
  h.className = "hero";
  h.innerHTML = `<div class="hero-l"><span class="eyebrow">${esc(c.jabatan || "Content Creator")}</span>
    <h1>${esc(c.name)}</h1><span class="hpill">${roleOf(c) === "dg" ? "Bisa mengisi semua brand" + (assignedOf(c).length ? " · utama " + assignedOf(c).join(", ") : "") : brandsOf(c).map(b => esc(b + " · " + BNAME[b])).join("&nbsp;&nbsp;|&nbsp;&nbsp;")}</span>
    <div class="hfoot"><span class="arrow"></span><button class="pbtn" data-home>Kembali ke All Creative</button></div></div>
    <div class="hero-r">${S.photos[c.id] ? `<img class="bigphoto" src="${S.photosBig[c.id] || S.photos[c.id]}" alt="Foto ${esc(c.name)}">` : `<span class="initials">${esc(initials(c.name))}</span>`}
    ${canEdit(c.id) ? `<button class="photo-btn" data-photo="${esc(c.id)}">${S.photos[c.id] ? "Ganti foto" : "Tambah foto"}</button>` : ""}</div>`;
}
function renderNav() {
  const [y, m] = S.month.split("-").map(Number); $("monthLbl").textContent = BULAN[m - 1] + " " + y;
  const sel = $("ccSel");
  sel.innerHTML = `<option value="">All Creative</option>` + S.ccs.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.id === S.me ? " (saya)" : ""}</option>`).join("");
  if (S.view && !ccById(S.view) && S.ready) S.view = "";
  sel.value = S.view;
  const bf = $("brandF"); bf.hidden = !!S.view;
  bf.innerHTML = `<option value="">Semua brand</option>` + BRANDS.map(b => `<option value="${b[0]}">${b[0]} · ${b[1]}</option>`).join("");
  bf.value = S.brandF;
}

/* ---------------- render: beranda (rekap per nama) ---------------- */
function renderPeople() {
  $("homeView").hidden = !!S.view; if (S.view) return;
  const ae = document.activeElement; if ($("people").contains(ae) && ae.tagName === "INPUT") return;
  const { first, last } = range(), wk = curWeek(), [y, m] = S.month.split("-").map(Number);
  $("rekapSub").textContent = `${BULAN[m - 1]} ${y} · minggu ${shortD(wk)} – ${shortD(add(wk, 6))}${S.brandF ? " · brand " + S.brandF + " (" + BNAME[S.brandF] + ")" : ""}`;
  const list = membersInScope();
  if (!list.length) { $("people").innerHTML = `<div class="emptyband">${!S.ccs.length ? (S.isAdmin ? "Belum ada anggota. Tambahkan di Pengaturan atasan di bawah." : "Daftar anggota belum diisi atasan.") : "Belum ada anggota yang memegang brand ini."}</div>`; return; }
  $("people").innerHTML = list.map(c => {
    const role = roleOf(c), u = UNIT[role], bs = S.brandF ? [S.brandF] : homeBrands(c);
    const sc = { cc: c.id, brand: S.brandF };
    const month = ents(first, last, sc);
    const days = new Set(month.map(e => e.date)).size;
    const lastFill = month.concat(ents(range().start, range().end, sc)).reduce((a, e) => (e.updatedAt || "") > a ? e.updatedAt : a, "");
    const lf = lastFill ? new Date(lastFill) : null;
    const rows = bs.map(b => {
      const wv = sum(ents(wk, add(wk, 6), { cc: c.id, brand: b }), "qty"), raw = tgt(c.id, b, wk), t = tgtEff(c.id, b, wk), p = t ? Math.min(100, wv / t * 100) : 0;
      const tCell = S.isAdmin ? `<input class="tin" type="number" min="0" value="${raw || ""}" placeholder="–" data-tcc="${esc(c.id)}" data-tb="${b}" data-tw="${wk}" aria-label="Target ${esc(c.name)} ${b} minggu ini">` : `${t || "–"}`;
      const adj = raw && t !== raw ? ` <small class="adj" title="Disesuaikan karena cuti/izin/sakit">→ ${t}</small>` : "";
      return `<div class="brow${t && wv >= t ? " done" : ""}"><span class="bc">${b}</span><span class="bv">${wv} / ${tCell}${S.isAdmin ? adj : ""} <small>${u} minggu ini</small></span><div class="bar"><i style="width:${p}%"></i></div></div>`;
    }).join("") || `<div class="prole">Belum ada isian bulan ini${role === "dg" ? " · bisa mengisi semua brand" : ""}</div>`;
    const ac = absCount(c.id, first, last), an = STATUS.reduce((a, k) => a + ac[k], 0);
    const plat = role === "admin" ? `<div class="plat"><span>Facebook ${sum(month, "fb")}</span><span>YouTube ${sum(month, "yt")}</span><span>Shopee ${sum(month, "shopee")}</span></div>` : "";
    return `<article class="pcard">
      <div class="phead">${ava(c)}<div style="min-width:0"><div class="pname">${esc(c.name)}</div><div class="prole">${esc(c.jabatan || "Content Creator")}</div></div></div>
      <div style="display:grid;gap:8px">${rows}</div>${plat}
      <div class="pmeta"><div><b>${sum(month, "qty")}</b><span>${u} bulan ini</span></div><div class="ot"><b>${fmt(sum(month, "lembur"))}j</b><span>lembur</span></div><div class="kd"><b>${month.filter(e => e.kendala).length}</b><span>kendala</span></div><div class="ab" title="${STATUS.map(k => k + " " + ac[k]).join(", ")}"><b>${an}</b><span>${an ? absShort(ac) : "absen"}</span></div></div>
      <div class="pfoot"><span class="last">${lf ? "Terakhir mengisi " + shortD(ds(lf)) + " " + pad(lf.getHours()) + ":" + pad(lf.getMinutes()) : `${days ? "" : "Belum mengisi bulan ini"}`}</span><button class="pbtn" data-open="${esc(c.id)}">Lihat report</button></div>
    </article>`;
  }).join("");
}

/* ---------------- render: halaman orang (tab brand + statistik) ---------------- */
function renderPersonTop() {
  $("personView").hidden = !S.view; if (!S.view) return;
  const c = ccById(S.view); if (!c) return;
  const bs = brandsOf(c), cur = curBrand(), role = roleOf(c), u = UNIT[role];
  const { first, last } = range(), wk = curWeek();
  const tabs = (bs.length > 1 ? [["", "Semua brand"]] : []).concat(bs.map(b => [b, BNAME[b]]));
  $("brandHint").textContent = role === "dg" ? "Desain Grafis bisa mengisi report untuk brand mana pun. Pilih brand yang dikerjakan, isi terpisah per brand." : "Report diisi terpisah untuk setiap brand yang dikerjakan.";
  $("brandTabs").innerHTML = tabs.map(([b, n]) => `<button class="tab" role="tab" aria-selected="${b === cur}" data-btab="${b}">${b ? `${b} <small>${esc(n)}</small>` : esc(n)}</button>`).join("");

  const sc = { cc: c.id, brand: cur };
  const wkE = ents(wk, add(wk, 6), sc), mE = ents(first, last, sc);
  const wv = sum(wkE, "qty"), t = scopeTarget(wk, sc), p = t ? Math.min(100, wv / t * 100) : 0;
  const shown = cur ? [cur] : (role === "dg" ? homeBrands(c) : bs);
  const off = offDays(c.id, wk), rawT = (cur ? [cur] : bs).reduce((a, b) => a + tgt(c.id, b, wk), 0);
  const per = shown.map(b => { const v = sum(wkE.filter(e => e.brand === b), "qty"), tt = tgtEff(c.id, b, wk); return `<div class="wkrow"><b>${b}</b><div class="prog${tt && v >= tt ? " done" : ""}"><i style="width:${tt ? Math.min(100, v / tt * 100) : 0}%"></i></div><span><b>${v}</b> / ${tt || "–"}</span></div>`; }).join("");
  const otAll = ents(first, last, { cc: c.id, brand: "" });
  $("stats").innerHTML = `
    <div class="stat wkstat"><div class="l">${u[0].toUpperCase() + u.slice(1)} minggu ini · ${shortD(wk)} – ${shortD(add(wk, 6))}</div>
      <div class="v num">${wv}<small> / ${t || "–"}</small></div>
      ${!cur && shown.length ? `<div class="wkrows">${per}</div>` : `<div class="prog${t && wv >= t ? " done" : ""}"><i style="width:${p}%"></i></div>`}
      <div class="s">${!t ? (rawT ? "Target minggu ini 0 karena tidak masuk sepanjang minggu" : "Target minggu ini belum diisi atasan") : wv >= t ? "Target minggu ini tercapai" : "Kurang " + (t - wv) + " " + u + " lagi"}${off && rawT ? ` · target disesuaikan dari ${rawT} (${off} hari cuti/izin/sakit)` : ""}</div></div>
    <div class="stat"><div class="l">Total ${u} bulan ini${cur ? " · " + cur : ""}</div><div class="v num">${sum(mE, "qty")}</div>
      <div class="s">${role === "admin" ? `Facebook ${sum(mE, "fb")} · YouTube ${sum(mE, "yt")} · Shopee ${sum(mE, "shopee")}` : new Set(mE.map(e => e.date)).size + " hari ada isian"}</div></div>
    <div class="stat ot"><div class="l">Total lembur bulan ini</div><div class="v num">${fmt(sum(otAll, "lembur"))}<small> jam</small></div>
      <div class="s">${new Set(otAll.filter(e => +e.lembur > 0).map(e => e.date)).size} hari lembur · semua brand${(() => { const o = absCount(c.id, first, last); const t2 = absShort(o); return t2 ? " · " + STATUS.filter(k => o[k]).map(k => k + " " + o[k]).join(", ") : ""; })()}</div></div>`;
}

/* ---------------- render: kalender ---------------- */
function renderCal() {
  const { first, last, start, end } = range(), sc = scope();
  $("calSub").textContent = S.view ? (canEdit(S.view) ? (sc.brand ? `Klik tanggal untuk mengisi report brand ${sc.brand}` : "Pilih satu brand di atas untuk mengisi report") : "Klik tanggal untuk melihat report") : "Klik tanggal untuk melihat isian tim" + (S.brandF ? " · brand " + S.brandF : "");
  let h = ["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map(x => `<div class="h">${x}</div>`).join("");
  for (let mon = start; mon <= end; mon = add(mon, 7)) {
    const dT = scopeTarget(mon, sc) / 6;
    for (let i = 0; i < 7; i++) {
      const s = add(mon, i), es = ents(s, s, sc), v = sum(es, "qty"), o = sum(es, "lembur"), sun = pd(s).getDay() === 0, out = s < first || s > last;
      const cls = ["cell", sun && "sun", out && "out", es.length && (dT && v >= dT ? "hit" : "has"), s === S.sel && "sel", s === TODAY && "today"].filter(Boolean).join(" ");
      let abd = "";
      if (sc.cc) { const a = absOf(sc.cc, s); if (a) abd = `<span class="abdg st-${a.status}">${a.status}</span>`; }
      else { const n = membersInScope().filter(c => absOf(c.id, s)).length; if (n) abd = `<span class="abdg">${n} absen</span>`; }
      h += `<button class="${cls}${abd && sc.cc ? " absent" : ""}" data-d="${s}" aria-label="${longDate(s)}: ${v} konten${o ? ", lembur " + fmt(o) + " jam" : ""}${abd ? ", " + abd.replace(/<[^>]+>/g, "") : ""}"><span class="n">${pd(s).getDate()}</span>${es.length ? `<span class="vid">${v}</span>` : abd}${o ? `<span class="ot">+${fmt(o)}j</span>` : ""}${es.length && abd ? abd : ""}${es.some(x => x.kendala) ? '<span class="kdot" title="Ada kendala"></span>' : ""}</button>`;
    }
  }
  $("cal").innerHTML = h;
}

/* ---------------- render: ringkasan per minggu ---------------- */
function renderSummary() {
  const { first, last, start, end } = range(), sc = scope(), wkNow = curWeek(), [y, m] = S.month.split("-").map(Number);
  const c = S.view ? ccById(S.view) : null, role = c ? roleOf(c) : "";
  const cnt = (from, to) => {
    const es = ents(from, to, sc), by = r => es.filter(e => roleOf(ccById(e.cc)) === r);
    const a = by("admin");
    const who = sc.cc ? [sc.cc] : membersInScope().map(c => c.id), ab = { Cuti: 0, Izin: 0, Sakit: 0, Alpha: 0 };
    who.forEach(id => { const o = absCount(id, from, to); STATUS.forEach(k => ab[k] += o[k]); });
    return { cc: sum(by("cc"), "qty"), dg: sum(by("dg"), "qty"), fb: sum(a, "fb"), yt: sum(a, "yt"), sp: sum(a, "shopee"), adm: sum(a, "qty"), qty: sum(es, "qty"), ot: sum(es, "lembur"), ab };
  };
  const z = n => n ? n : `<span class="z">0</span>`;
  const abT = v => { const t = absShort(v.ab); return t ? `<span class="abtxt" title="${STATUS.map(k => k + " " + v.ab[k]).join(", ")}">${t}</span>` : `<span class="z">–</span>`; };
  const rows = []; let k = 1;
  for (let mon = start; mon <= end; mon = add(mon, 7)) rows.push({ label: `Minggu ${k++}`, sub: `${shortD(mon)} – ${shortD(add(mon, 6))}`, cur: mon === wkNow, v: cnt(mon, add(mon, 6)), t: scopeTarget(mon, sc) });
  const tot = cnt(first, last), totT = rows.reduce((a, r) => a + r.t, 0);
  const cap = (v, t) => t ? `<span class="${v >= t ? "ok" : "no"}">${Math.round(v / t * 100)}%</span>` : `<span class="z">–</span>`;
  let head, line;
  if (!c) {
    head = `<th>Minggu</th><th><span class="grp">Content Creator</span>Video</th><th><span class="grp">Desain Grafis</span>Desain</th><th><span class="grp">Admin</span>Facebook</th><th><span class="grp">Admin</span>YouTube</th><th><span class="grp">Admin</span>Shopee</th><th><span class="grp">Admin</span>Total upload</th><th>Lembur</th><th>Tidak hadir</th>`;
    line = v => `<td>${z(v.cc)}</td><td>${z(v.dg)}</td><td>${z(v.fb)}</td><td>${z(v.yt)}</td><td>${z(v.sp)}</td><td>${z(v.adm)}</td><td>${v.ot ? fmt(v.ot) + " j" : z(0)}</td><td>${abT(v)}</td>`;
  } else if (role === "admin") {
    head = `<th>Minggu</th><th>Facebook</th><th>YouTube</th><th>Shopee</th><th>Total upload</th><th>Target</th><th>Capaian</th><th>Lembur</th><th>Kehadiran</th>`;
    line = (v, t) => `<td>${z(v.fb)}</td><td>${z(v.yt)}</td><td>${z(v.sp)}</td><td>${z(v.adm)}</td><td>${t || "–"}</td><td>${cap(v.adm, t)}</td><td>${v.ot ? fmt(v.ot) + " j" : z(0)}</td><td>${abT(v)}</td>`;
  } else {
    const u = UNIT[role];
    head = `<th>Minggu</th><th>${u[0].toUpperCase() + u.slice(1)}</th><th>Target</th><th>Capaian</th><th>Lembur</th><th>Kehadiran</th>`;
    line = (v, t) => `<td>${z(v.qty)}</td><td>${t || "–"}</td><td>${cap(v.qty, t)}</td><td>${v.ot ? fmt(v.ot) + " j" : z(0)}</td><td>${abT(v)}</td>`;
  }
  $("sumSub").textContent = `${c ? c.name + (sc.brand ? " · " + sc.brand : " · semua brand") : "All Creative" + (S.brandF ? " · " + S.brandF : " · semua brand")} · minggu dihitung Senin–Minggu, total hanya tanggal di ${BULAN[m - 1]}`;
  $("sumTable").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rows.map(r => `<tr class="${r.cur ? "cur" : ""}"><td>${r.label}<small>${r.sub}</small></td>${line(r.v, r.t)}</tr>`).join("")}</tbody>
    <tfoot><tr><td>Total ${BULAN[m - 1]}<small>${y}</small></td>${line(tot, totT)}</tr></tfoot>`;
}

/* ---------------- render: panel tanggal ---------------- */
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u.slice(0, 30); } }
function normUrl(v) { v = v.trim(); if (!v) return ""; if (!/^https?:\/\//i.test(v)) v = "https://" + v; return v; }
const safeUrl = u => /^https?:\/\//i.test(u) ? u : "#";
function linkRow(v) { const ok = /^https?:\/\//i.test(v || ""); return `<div class="lk"><input type="text" inputmode="url" value="${esc(v)}" placeholder="https://www.tiktok.com/@akun/video/..." aria-label="Link hasil kerja">${ok ? `<a href="${esc(v)}" target="_blank" rel="noopener">Buka</a>` : "<span></span>"}<button type="button" class="x" data-rmlink aria-label="Hapus link">✕</button></div>`; }
const linkOut = l => l && l.length ? `<span class="linkout">${l.map(x => `<a href="${esc(safeUrl(x))}" target="_blank" rel="noopener">${esc(host(x))}</a>`).join("")}</span>` : "";
function qtyText(e, c) {
  const r = roleOf(c);
  if (r === "admin") return `<span class="qty">${e.qty}</span> upload <span class="tt">(FB ${e.fb} · YT ${e.yt} · Shopee ${e.shopee})</span>`;
  return `<span class="qty">${e.qty}</span> ${UNIT[r]}`;
}
function entryBlock(e, c) {
  return `<div class="ent"><span class="tg">${esc(e.brand)}</span>${qtyText(e, c)}${+e.lembur ? `<span class="oo">+${fmt(e.lembur)} j</span>` : ""}${(e.jenis || []).map(j => `<span class="tg c">${esc(j)}</span>`).join("")}${(e.campaign || []).map(j => `<span class="tg c">${esc(j)}</span>`).join("")}</div>
    ${e.tugas ? `<div class="tt">${esc(e.tugas)}</div>` : ""}${linkOut(e.links)}${e.kendala ? `<div class="kdl"><b>Kendala:</b> ${esc(e.kendala)}${e.solusi ? ` · <b>Solusi:</b> ${esc(e.solusi)}` : ""}</div>` : ""}`;
}
function otSum(cc, a, b) { return Object.values(S.entries).filter(e => e.cc === cc && e.date >= a && e.date <= b).reduce((t, e) => t + (+e.lembur || 0), 0); }

const AUTO = { flush: null };
function renderDay() {
  const p = $("dayPanel"), s = S.sel; AUTO.flush = null;
  if (!S.ccs.length) { p.innerHTML = `<div class="dayname">Mulai di sini</div><div class="empty">${S.isAdmin ? "Belum ada anggota. Buka <b>Pengaturan atasan</b> di bawah, lalu isi nama, jabatan, brand dan Gmail." : "Daftar anggota belum diisi atasan."}</div>`; return; }

  if (!S.view) {
    const list = membersInScope(), filled = [], notyet = [];
    const absent = [];
    list.forEach(c => { const es = ents(s, s, { cc: c.id, brand: S.brandF }).sort((a, b) => CODES.indexOf(a.brand) - CODES.indexOf(b.brand)); const a = absOf(c.id, s); if (es.length) filled.push([c, es]); else if (a) absent.push([c, a]); else notyet.push([c, es]); });
    const all = ents(s, s);
    p.innerHTML = `<div class="dhead"><span class="dayname">${longDate(s)}</span></div>
      <div class="sub" style="font-size:12.5px">${sum(all, "qty")} konten · lembur ${fmt(sum(all, "lembur"))} jam · ${filled.length} dari ${list.length} orang sudah mengisi</div>
      ${filled.length ? `<ul class="dlist">${filled.map(([c, es]) => `<li class="ditem">${ava(c, "sm")}<span class="nm">${esc(c.name)} <span class="tt" style="font-weight:500">· ${esc(c.jabatan || "")}</span></span><div class="body">${es.map(e => entryBlock(e, c)).join("")}</div></li>`).join("")}</ul>` : `<div class="empty">Belum ada yang mengisi report tanggal ini.</div>`}
      ${absent.length ? `<div class="notyet"><b>Tidak hadir:</b> ${absent.map(([c, a]) => `${esc(c.name)} <span class="abdg st-${a.status}">${a.status}</span>${a.note ? ` <span class="tt">${esc(a.note)}</span>` : ""}`).join(", ")}</div>` : ""}
      ${notyet.length ? `<div class="notyet"><b>Belum mengisi:</b> ${notyet.map(([c]) => esc(c.name)).join(", ")}</div>` : ""}`;
    return;
  }

  const c = ccById(S.view); if (!c) return;
  const b = curBrand(), role = roleOf(c), u = UNIT[role], wk = monday(s);
  const ab = absOf(c.id, s), st = ab ? ab.status : "";
  const absEditable = canEdit(c.id) && !(st === "Alpha" && !S.isAdmin);
  const absBlock = absEditable
    ? `<div class="absbox" id="absBox"><div class="absrow"><span class="lbl">Kehadiran</span><div class="chips">${["", ...STATUS].map(x => `<button type="button" class="chip abs${x ? " st-" + x : ""}" data-abs="${x}" aria-pressed="${st === x}"${x === "Alpha" && !S.isAdmin ? ' disabled title="Alpha hanya diisi atasan"' : ""}>${x || "Hadir"}</button>`).join("")}</div></div>
        <div class="absmore" id="absMore" hidden><input type="text" id="absNote" placeholder="Keterangan (opsional), misalnya: cuti tahunan" value="${esc(ab ? ab.note : "")}" aria-label="Keterangan">
        <label class="until">Sampai tanggal <input type="date" id="absUntil" min="${s}" value="${s}"></label><button type="button" class="pbtn" id="absSave">Simpan</button></div></div>`
    : (st ? `<div class="absnote st-${st}"><b>${st}</b>${ab.note ? " · " + esc(ab.note) : ""}${st === "Alpha" && canEdit(c.id) ? " · hanya atasan yang bisa mengubah" : ""}</div>` : "");
  const absMsg = st ? `<div class="empty">Tercatat <b>${st}</b> di tanggal ini, jadi report tidak perlu diisi.${absEditable ? " Pilih <b>Hadir</b> kalau ternyata tetap bekerja." : ""}</div>` : "";
  const bindAbs = () => {
    const box = $("absBox"); if (!box) return;
    let pick = st;
    box.addEventListener("click", ev => {
      const ch = ev.target.closest("[data-abs]"); if (ch && !ch.disabled) {
        pick = ch.dataset.abs; box.querySelectorAll("[data-abs]").forEach(x => x.setAttribute("aria-pressed", x === ch));
        if (!pick) { saveAbsence(c.id, [s], "", ""); return; }
        $("absMore").hidden = false; $("absNote").focus(); return;
      }
      if (ev.target.id === "absSave") {
        const until = $("absUntil").value && $("absUntil").value >= s ? $("absUntil").value : s, dates = [];
        for (let d = s; d <= until && dates.length < 31; d = add(d, 1)) if (pd(d).getDay() !== 0 || d === s) dates.push(d);
        saveAbsence(c.id, dates, pick, $("absNote").value.trim());
      }
    });
  };
  if (!b) {
    const es = ents(s, s, { cc: c.id, brand: "" }).sort((x, y) => CODES.indexOf(x.brand) - CODES.indexOf(y.brand));
    p.innerHTML = `<div class="dhead"><span class="dayname">${longDate(s)}</span><span class="sub">${esc(c.name)} · semua brand</span></div>${absBlock}
      ${es.length ? `<div class="ro">${es.map(e => entryBlock(e, c)).join('<hr style="border:0;border-top:1px solid var(--hair);margin:4px 0">')}</div>` : `<div class="empty">Belum ada report tanggal ini.</div>`}
      <p class="hint">${canEdit(c.id) ? "Pilih satu brand di bagian <b>Pilih brand</b> untuk mengisi atau mengubah report." : ""}</p>`;
    bindAbs();
    return;
  }
  const e = S.entries[ekey(c.id, s, b)] || {}, t = tgt(c.id, b, wk), tE = tgtEff(c.id, b, wk), dT = t / 6;
  const tgtBox = S.isAdmin
    ? `<div class="tgtbox"><label for="wkT"><b style="font-family:var(--display)">Target ${b}</b> minggu ${shortD(wk)} – ${shortD(add(wk, 6))}</label><input type="number" id="wkT" min="0" value="${t || ""}" placeholder="–" data-tcc="${esc(c.id)}" data-tb="${b}" data-tw="${wk}"><span class="sub">${u} · diisi atasan${t && tE !== t ? ` · efektif ${tE} (ada cuti/izin/sakit)` : ""}</span></div>`
    : `<div class="tgtbox"><span><b style="font-family:var(--display)">Target ${b}</b> minggu ini</span><b>${t ? tE + " " + u : "Belum diisi atasan"}</b>${t ? `<span class="sub">± ${fmt(dT)} ${u}/hari${tE !== t ? ` · disesuaikan dari ${t} karena cuti/izin/sakit` : ""}</span>` : ""}</div>`;
  const head = `<div class="dhead"><span class="dayname">${longDate(s)}</span><span class="bbadge">${b} <small>${esc(BNAME[b])}</small></span></div>${absBlock}${tgtBox}`;

  if (!canEdit(c.id)) {
    p.innerHTML = head + (e.updatedAt ? `<div class="ro">${entryBlock(e, c)}</div>` : (st ? "" : `<div class="empty">${esc(c.name)} belum mengisi report ${b} tanggal ini.</div>`)) + `<p class="hint">Hanya ${esc(c.name)} dan atasan yang bisa mengisi report ini.</p>`;
    return;
  }
  if (st && !e.updatedAt) { p.innerHTML = head + absMsg; bindAbs(); return;
  }

  const stepper = (id, val, label) => `<div class="stepper"><button type="button" data-step="-1" data-for="${id}" aria-label="Kurangi ${label}">−</button><input type="number" id="${id}" min="0" inputmode="numeric" value="${+val || 0}" aria-label="${label}"><button type="button" data-step="1" data-for="${id}" aria-label="Tambah ${label}">+</button></div>`;
  const chip = (grp, v, on, cls) => `<button type="button" class="chip${cls ? " " + cls : ""}" data-grp="${grp}" data-v="${esc(v)}" aria-pressed="${on}">${esc(v)}</button>`;
  const ej = e.jenis || [], ec = e.campaign || [];
  let qtyBlock;
  if (role === "admin") {
    qtyBlock = `<div class="field"><span class="lbl">Video diupload hari ini per platform</span>
      <div class="plats"><div class="pl"><span>Facebook</span>${stepper("fbIn", e.fb, "Facebook")}</div><div class="pl"><span>YouTube</span>${stepper("ytIn", e.yt, "YouTube")}</div><div class="pl"><span>Shopee</span>${stepper("spIn", e.shopee, "Shopee")}</div></div>
      <span class="ptotal">Total upload: <b id="admTot">${(+e.fb || 0) + (+e.yt || 0) + (+e.shopee || 0)}</b>${dT ? ` · target harian ± ${fmt(dT)}` : ""}</span></div>`;
  } else if (role === "dg") {
    qtyBlock = `<div class="dzone">
        <div class="field"><span class="lbl">Jenis pekerjaan</span><div class="chips">${chip("jenis", "Daily", ej.includes("Daily"))}${chip("jenis", "Campaign", ej.includes("Campaign"))}</div><span class="hint">Boleh pilih keduanya kalau daily dan campaign berjalan bersamaan</span></div>
        <div class="field" id="campBox" ${ej.includes("Campaign") ? "" : "hidden"}><span class="lbl">Desain campaign</span><div class="chips">${CAMP.map(x => chip("camp", x, ec.includes(x), "camp")).join("")}</div></div>
      </div>
      <div class="field"><label class="lbl" for="qIn">Desain diselesaikan hari ini</label>${stepper("qIn", e.qty, "Jumlah desain")}${dT ? `<span class="hint">Target harian ± ${fmt(dT)} desain</span>` : ""}</div>`;
  } else {
    qtyBlock = `<div class="field"><label class="lbl" for="qIn">Video diupload hari ini</label>${stepper("qIn", e.qty, "Jumlah video")}${dT ? `<span class="hint">Target harian ± ${fmt(dT)} video</span>` : ""}</div>`;
  }
  p.innerHTML = head + `<form id="dayForm" style="display:grid;gap:12px" autocomplete="off">
      ${qtyBlock}
      <div class="field"><label class="lbl" for="tIn">Tugas harian</label><textarea id="tIn" placeholder="Tulis bebas aktivitasmu hari ini untuk brand ${b}, contoh:&#10;- Upload 3 video hardselling&#10;- Shooting konten styling di studio">${esc(e.tugas || "")}</textarea></div>
      <div class="field"><span class="lbl">Link hasil kerja</span><div class="links" id="links">${(e.links && e.links.length ? e.links : [""]).map(linkRow).join("")}</div>
        <button type="button" class="ghostbtn" id="addLink">+ Tambah link</button><span class="hint">Link TikTok, YouTube, Shopee, Google Drive atau file lain</span></div>
      <div class="two"><div class="field"><label class="lbl" for="kIn">Kendala</label><textarea id="kIn" class="short" placeholder="Kosongkan kalau tidak ada">${esc(e.kendala || "")}</textarea></div>
        <div class="field"><label class="lbl" for="sIn">Solusi</label><textarea id="sIn" class="short" placeholder="Langkah yang diambil">${esc(e.solusi || "")}</textarea></div></div>
      <div class="field"><label class="lbl" for="oIn">Lembur (jam)</label><input type="number" id="oIn" min="0" step="0.5" inputmode="decimal" value="${+e.lembur || ""}" placeholder="0">
        <div class="otsum"><span>Lembur minggu ini: <b>${fmt(otSum(c.id, wk, add(wk, 6)))} jam</b></span><span>Bulan ini: <b>${fmt(otSum(c.id, s.slice(0, 7) + "-01", s.slice(0, 7) + "-31"))} jam</b></span><span>(semua brand)</span></div></div>
      ${e.updatedAt && brandsOf(c).length > 1 ? `<details class="move"><summary>Salah pilih brand? Pindahkan report ini</summary>
        <div class="moverow"><span class="sub">Pindahkan report ${b} tanggal ini ke</span><select id="mvTo" aria-label="Brand tujuan">${brandsOf(c).filter(x => x !== b).map(x => `<option value="${x}">${x} · ${esc(BNAME[x])}</option>`).join("")}</select><button type="button" class="ghostbtn" id="mvBtn">Pindahkan</button></div></details>` : ""}
      <div class="saverow"><span class="saved" id="saveState">${e.updatedAt ? "Tersimpan " + new Date(e.updatedAt).toTimeString().slice(0, 5) : "Tersimpan otomatis saat diisi"}</span><button class="pbtn" type="submit">Simpan report</button></div>
    </form>`;

  const f = $("dayForm"), cc = c.id;
  const num = id => Math.max(0, parseInt($(id).value) || 0);
  const collect = () => {
    const d = { tugas: $("tIn").value.trim(), links: [...f.querySelectorAll(".lk input")].map(i => normUrl(i.value)).filter(Boolean), kendala: $("kIn").value.trim(), solusi: $("sIn").value.trim(), lembur: Math.max(0, parseFloat($("oIn").value) || 0) };
    if (role === "admin") { d.fb = num("fbIn"); d.yt = num("ytIn"); d.shopee = num("spIn"); d.qty = d.fb + d.yt + d.shopee; }
    else d.qty = num("qIn");
    if (role === "dg") { const on = g => [...f.querySelectorAll(`.chip[data-grp="${g}"][aria-pressed="true"]`)].map(x => x.dataset.v); d.jenis = on("jenis"); d.campaign = d.jenis.includes("Campaign") ? on("camp") : []; }
    return d;
  };
  const same = (d, old) => Object.keys(d).every(k => JSON.stringify(d[k]) === JSON.stringify(old[k] === undefined ? (Array.isArray(d[k]) ? [] : typeof d[k] === "number" ? 0 : "") : old[k]));
  let timer = null;
  const flush = () => { clearTimeout(timer); timer = null; AUTO.flush = null; if (!document.body.contains(f)) return; const d = collect(); if (same(d, S.entries[ekey(cc, s, b)] || {})) { $("saveState").textContent = "Tersimpan"; return; } saveEntry(cc, s, b, d, true); };
  const schedule = () => { clearTimeout(timer); $("saveState").textContent = "Menyimpan…"; $("saveState").classList.remove("err"); timer = setTimeout(flush, AUTOSAVE_MS); AUTO.flush = flush; if ($("admTot")) $("admTot").textContent = num("fbIn") + num("ytIn") + num("spIn"); };
  f.addEventListener("input", schedule);
  f.addEventListener("click", ev => {
    const st = ev.target.closest("[data-step]"); if (st) { const i = $(st.dataset.for); i.value = Math.max(0, (+i.value || 0) + +st.dataset.step); schedule(); return; }
    const ch = ev.target.closest(".chip"); if (ch) { ch.setAttribute("aria-pressed", ch.getAttribute("aria-pressed") !== "true"); if (ch.dataset.v === "Campaign") $("campBox").hidden = ch.getAttribute("aria-pressed") !== "true"; schedule(); return; }
    if (ev.target.id === "addLink") { $("links").insertAdjacentHTML("beforeend", linkRow("")); $("links").lastElementChild.querySelector("input").focus(); return; }
    const r = ev.target.closest("[data-rmlink]"); if (r) { const rows = $("links").children; if (rows.length > 1) r.parentElement.remove(); else rows[0].querySelector("input").value = ""; schedule(); }
    if (ev.target.id === "mvBtn") { if (AUTO.flush) AUTO.flush(); moveEntry(cc, s, b, $("mvTo").value); }
  });
  f.querySelectorAll("#mvTo").forEach(x => x.addEventListener("input", ev => ev.stopPropagation()));
  f.addEventListener("submit", ev => {
    ev.preventDefault(); clearTimeout(timer); AUTO.flush = null;
    const d = collect(); if (role === "dg" && d.jenis.includes("Campaign") && !d.campaign.length) { toast("Pilih jenis desain campaign-nya"); return; }
    saveEntry(cc, s, b, d, false);
  });
  bindAbs();
}

/* ---------------- render: pengaturan atasan ---------------- */
const bchips = (val, attrs = "") => CODES.map(b => `<button type="button" aria-pressed="${brandList(val).includes(b)}" data-bc="${b}" ${attrs} title="${BNAME[b]}">${b}</button>`).join("");
function renderSettings() {
  $("setBox").hidden = !S.isAdmin; if (!S.isAdmin) return;
  const jab = v => (JABATAN.includes(v) || !v ? JABATAN : JABATAN.concat([v])).map(j => `<option${j === (v || "Content Creator") ? " selected" : ""}>${esc(j)}</option>`).join("");
  $("ccList").innerHTML = S.ccs.length ? `<div class="ccrow cchead"><span>Nama</span><span>Jabatan</span><span>Brand yang dipegang</span><span>Gmail</span><span></span></div>` + S.ccs.map(c => `<div class="ccrow" data-id="${esc(c.id)}">
      <input type="text" value="${esc(c.name)}" data-f="name" data-cid="${esc(c.id)}" aria-label="Nama">
      <select data-f="jabatan" data-cid="${esc(c.id)}" aria-label="Jabatan ${esc(c.name)}">${jab(c.jabatan)}</select>
      <div class="bchips" data-cid="${esc(c.id)}">${bchips(c.brand)}${roleOf(c) === "dg" ? `<span class="dgnote">brand utama · DG bisa isi semua brand</span>` : ""}</div>
      <input type="text" value="${esc(c.email || "")}" data-f="email" data-cid="${esc(c.id)}" placeholder="nama@gmail.com" aria-label="Gmail ${esc(c.name)}" inputmode="email">
      <button class="x${S.armed === c.id ? " confirm" : ""}" data-rm="${esc(c.id)}">${S.armed === c.id ? "Hapus?" : "Hapus"}</button></div>`).join("") : `<div class="hint">Belum ada anggota.</div>`;
  const nb = $("ccBrand"); nb.innerHTML = bchips(nb.dataset.val);
}

let lastDay = "";
function renderAll() {
  renderHero(); renderNav(); renderPeople(); renderPersonTop(); renderCal(); renderSummary();
  const key = [S.view, S.sel, curBrand(), S.ccs.length, S.isAdmin].join("|"), dp = $("dayPanel");
  if (!(dp.contains(document.activeElement) && key === lastDay && document.activeElement.tagName !== "BUTTON")) renderDay();
  lastDay = key;
  const ae = document.activeElement;
  if (!($("setBox").contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName))) renderSettings();
}

/* ---------------- koneksi ke Google Sheets ---------------- */
async function api(action, payload = {}, noSession) {
  if (!noSession && !SESSION) { showLogin(); throw { error: "auth" }; }
  let res;
  try { res = await fetch(SCRIPT_URL, { method: "POST", body: JSON.stringify({ action, session: SESSION, ...payload }) }); }
  catch (e) { throw { error: "network" }; }
  let j; try { j = await res.json(); } catch (e) { throw { error: "server", detail: "Respon bukan JSON. Cek Deploy Apps Script (akses: Anyone)." }; }
  if (j && j.error) { if (j.error === "auth" && !noSession) { SESSION = ""; ls.del("sess"); showLogin("Sesi login sudah berakhir. Silakan masuk lagi dengan Gmail."); } throw j; }
  return j;
}
const errMsg = (e, own) => e && e.error === "forbidden" ? own : e && e.error === "network" ? "Gagal tersambung, periksa koneksi internet" : e && e.error === "auth" ? "Silakan masuk lagi" : "Gagal menyimpan, coba lagi";

const qE = {}, qT = {}; let qC = Promise.resolve();
function saveEntry(cc, s, b, d, silent) {
  const id = ekey(cc, s, b), body = { key: id, cc, date: s, brand: b, ...d, by: S.email, updatedAt: new Date().toISOString() };
  S.entries[id] = body; S.pending[id] = body; if (!silent) lastDay = ""; renderAll();
  const st = (txt, err) => { const x = $("saveState"); if (x) { x.textContent = txt; x.classList.toggle("err", !!err); } };
  qE[id] = (qE[id] || Promise.resolve()).then(() => api("saveEntry", { entry: body }))
    .then(() => { if (S.pending[id] === body) delete S.pending[id]; st((silent ? "Tersimpan otomatis " : "Tersimpan ") + new Date().toTimeString().slice(0, 5)); if (!silent) toast(`Report ${b} ${shortD(s)} tersimpan`); })
    .catch(e => { st("Belum tersimpan", true); toast(errMsg(e, "Kamu hanya bisa mengisi report milikmu sendiri untuk brand yang kamu pegang")); });
}
function saveTarget(cc, b, wk, val) {
  const id = cc + "_" + b + "_" + wk, n = Math.max(0, parseInt(val) || 0); if (n === tgt(cc, b, wk)) return;
  const v = { cc, brand: b, week: wk, target: n }; S.targets[id] = v; S.pendingT[id] = v;
  qT[id] = (qT[id] || Promise.resolve()).then(() => api("saveTarget", { cc, brand: b, week: wk, target: n }))
    .then(() => { if (S.pendingT[id] === v) delete S.pendingT[id]; toast(`Target ${b} minggu ${shortD(wk)} tersimpan`); renderAll(); })
    .catch(e => { delete S.pendingT[id]; toast(errMsg(e, "Hanya atasan yang bisa mengisi target")); });
}
function saveAbsence(cc, dates, status, note) {
  const prev = {};
  dates.forEach(d => { const k = cc + "_" + d; prev[k] = S.absen[k]; if (status) S.absen[k] = S.pendingA[k] = { cc, date: d, status, note, by: S.email, updatedAt: new Date().toISOString() }; else { delete S.absen[k]; S.pendingA[k] = null; } });
  lastDay = ""; renderAll();
  api("saveAbsence", { cc, dates, status, note })
    .then(() => { dates.forEach(d => delete S.pendingA[cc + "_" + d]); toast(status ? `${status} tercatat${dates.length > 1 ? " untuk " + dates.length + " hari" : ""}` : "Kehadiran diubah menjadi Hadir"); })
    .catch(e => { Object.entries(prev).forEach(([k, v]) => { delete S.pendingA[k]; if (v) S.absen[k] = v; else delete S.absen[k]; }); lastDay = ""; renderAll(); toast(e && e.detail === "alpha_admin_only" ? "Alpha hanya bisa diisi atau diubah atasan" : errMsg(e, "Kamu hanya bisa mengisi kehadiranmu sendiri")); });
}
async function moveEntry(cc, s, from, to) {
  const k = ekey(cc, s, from), nk = ekey(cc, s, to);
  if (S.entries[nk]) { toast(`Sudah ada report ${to} di tanggal ini. Hapus isinya dulu atau pilih brand lain.`); return; }
  try {
    await (qE[k] || Promise.resolve());
    await api("moveEntry", { cc, date: s, from, to });
    const e = S.entries[k]; delete S.entries[k]; delete S.pending[k];
    if (e) S.entries[nk] = { ...e, brand: to, key: nk };
    S.brandSel[S.view] = to; lastDay = ""; renderAll(); toast(`Report dipindahkan ke ${to}`);
  } catch (e) { toast(e && e.detail === "target_exists" ? `Sudah ada report ${to} di tanggal ini` : errMsg(e, "Kamu tidak bisa memindahkan report ke brand itu")); }
}
function saveCfg() {
  renderAll(); S.teamDirty++;
  const ccs = S.ccs.map(c => ({ id: c.id, name: c.name, jabatan: c.jabatan || "Content Creator", brand: brandList(c.brand).join(", "), email: low(c.email) }));
  qC = qC.then(() => api("saveTeam", { ccs })).then(() => toast("Pengaturan tersimpan")).catch(e => toast(errMsg(e, "Hanya atasan yang bisa mengubah pengaturan"))).finally(() => { S.teamDirty--; });
}

async function refresh() {
  if (!SESSION) return;
  const my = ++S.seq, { start, end } = range();
  let r;
  try { r = await api("load", { start, end }); }
  catch (e) {
    if (my !== S.seq) return;
    if (e.error === "not_member") { SESSION = ""; ls.del("sess"); showLogin(`${e.email || "Gmail ini"} belum ada di daftar tim. Minta atasan menambahkan Gmail ini di Pengaturan atasan (atau sheet "Anggota").`, "Akun belum terdaftar"); return; }
    if (e.error === "auth") return;
    if (!S.ready) showGate("Gagal memuat", e.error === "network" ? "Periksa koneksi internet lalu muat ulang halaman." : "Server belum siap: " + (e.detail || e.error) + ". Cek pengaturan Apps Script di PANDUAN.md.");
    else { $("notice").hidden = false; $("notice").textContent = "Koneksi ke Google Sheets terputus, mencoba lagi otomatis…"; }
    return;
  }
  if (my !== S.seq) return;
  $("notice").hidden = true;
  S.email = r.email; S.isAdmin = !!r.isAdmin; S.me = r.me || ""; S.sheetUrl = r.sheetUrl || ""; $("sheetBtn").hidden = !S.sheetUrl;
  if (!S.teamDirty) S.ccs = (r.ccs || []).map(c => ({ ...c }));
  const ent = {}; (r.entries || []).forEach(e => { ent[ekey(e.cc, e.date, e.brand)] = e; }); Object.assign(ent, S.pending); S.entries = ent;
  const tg = {}; (r.targets || []).forEach(t => { tg[t.cc + "_" + t.brand + "_" + t.week] = t; }); Object.assign(tg, S.pendingT); S.targets = tg;
  const ab = {}; (r.absences || []).forEach(a => { ab[a.cc + "_" + a.date] = a; }); Object.entries(S.pendingA).forEach(([k, v]) => { if (v) ab[k] = v; else delete ab[k]; }); S.absen = ab;
  const first = !S.ready; S.ready = true;
  if (first) {
    if (S.view && !ccById(S.view)) S.view = "";
    if (!S.view && !S.isAdmin && S.me) S.view = S.me;
    if (!S.ccs.length && S.isAdmin) $("setBox").open = true;
  }
  $("userEmail").textContent = S.email; $("nav").hidden = false;
  $("gate").hidden = true; $("app").hidden = false;
  renderAll();
  syncPhotos();
}
setInterval(() => { if (document.visibilityState === "visible" && S.ready && !AUTO.flush) refresh(); }, POLL_MS);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.ready) refresh(); });

/* ---------------- login (sekali, diingat 90 hari) ---------------- */
function showGate(title, text, showBtn) {
  $("gate").hidden = false; $("app").hidden = true; $("nav").hidden = true;
  $("gateTitle").textContent = title; $("gateText").textContent = text; $("gbtn").hidden = !showBtn;
  const h = $("hero"); h.className = "hero solo";
  h.innerHTML = `<div class="hero-l"><span class="hpill">Divisi Creative Indogroup</span><h1>Daily Report<br>Creative</h1><p class="hsub">Laporan harian tim konten, desain grafis dan admin.</p></div>`;
}
let gsiReady = false;
function showLogin(msg, title) {
  S.ready = false;
  showGate(title || "Masuk ke Daily Report", msg || "Gunakan akun Gmail yang sudah didaftarkan atasan. Cukup sekali, perangkat ini akan diingat selama 90 hari.", true);
  (function wait(n) {
    if (window.google?.accounts?.id) {
      if (!gsiReady) { google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential, auto_select: false, cancel_on_tap_outside: true, use_fedcm_for_prompt: true }); gsiReady = true; }
      $("gbtn").innerHTML = ""; google.accounts.id.renderButton($("gbtn"), { theme: "outline", size: "large", shape: "pill", text: "signin_with", locale: "id" });
    } else if (n > 100) showGate("Gagal memuat login Google", "Periksa koneksi internet lalu muat ulang halaman.");
    else setTimeout(() => wait(n + 1), 100);
  })(0);
}
async function onCredential(resp) {
  if (!resp || !resp.credential) { toast("Login gagal, coba lagi"); return; }
  showGate("Memuat data…", "Sebentar, sedang mengambil data tim dari Google Sheets.");
  try {
    const r = await api("login", { idToken: resp.credential }, true);
    SESSION = r.session; ls.set("sess", SESSION);
    S.pending = {}; S.pendingT = {};
    refresh();
  } catch (e) {
    if (e.error === "not_member") showLogin(`${e.email || "Gmail ini"} belum ada di daftar tim. Minta atasan menambahkan Gmail ini di Pengaturan atasan (atau sheet "Anggota").`, "Akun belum terdaftar");
    else if (e.error === "auth") showLogin("Login Google tidak valid (" + (e.detail || "") + "). Cek GOOGLE_CLIENT_ID di Code.gs dan config.js harus sama.", "Login gagal");
    else showLogin(e.error === "network" ? "Gagal tersambung. Periksa koneksi internet lalu coba lagi." : "Server belum siap: " + (e.detail || e.error), "Login gagal");
  }
}
function logout() {
  SESSION = ""; ls.del("sess"); ls.del("view");
  S.ready = false; S.email = ""; S.entries = {}; S.targets = {}; S.absen = {}; S.ccs = []; S.view = ""; S.me = "";
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
  showLogin();
}
function configProblems() {
  if (!CFG.ok) return ["File config.js tidak bisa dibaca. Kemungkinan ada tanda kutip \" atau titik koma yang ikut terhapus saat mengedit."];
  const p = [];
  if (!SCRIPT_URL || /GANTI/i.test(SCRIPT_URL)) p.push("SCRIPT_URL belum diganti dengan link Web App.");
  else if (/\/dev$/.test(SCRIPT_URL)) p.push("SCRIPT_URL memakai link berakhiran /dev. Gunakan link Web App yang berakhiran /exec.");
  else if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(SCRIPT_URL)) p.push("SCRIPT_URL bukan link Web App. Bentuk yang benar: https://script.google.com/macros/s/…/exec");
  if (!GOOGLE_CLIENT_ID || /GANTI/i.test(GOOGLE_CLIENT_ID)) p.push("GOOGLE_CLIENT_ID belum diganti dengan Client ID.");
  else if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID)) p.push("GOOGLE_CLIENT_ID tidak sesuai format (123456789012-abc….apps.googleusercontent.com).");
  return p;
}

/* ---------------- event ---------------- */
const flushAuto = () => { if (AUTO.flush) AUTO.flush(); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAuto(); });
addEventListener("pagehide", flushAuto);
document.addEventListener("pointerdown", e => { if (AUTO.flush && !e.target.closest("#dayForm")) flushAuto(); }, true);

function openView(id) {
  flushAuto(); S.view = id || ""; ls.set("view", S.view); lastDay = ""; renderAll(); scrollTo({ top: 0, behavior: RM });
}
document.addEventListener("click", e => {
  const o = e.target.closest("[data-open]"); if (o) { openView(o.dataset.open); return; }
  if (e.target.closest("[data-home]")) { openView(""); return; }
  const ph = e.target.closest("[data-photo]"); if (ph) { const inp = $("photoIn"); inp.dataset.cc = ph.dataset.photo; inp.value = ""; inp.click(); return; }
  const bt = e.target.closest("[data-btab]"); if (bt) { flushAuto(); S.brandSel[S.view] = bt.dataset.btab; lastDay = ""; renderAll(); return; }
});
$("photoIn").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) openCropper(e.target.dataset.cc, f); });
cropInit();
$("ccSel").addEventListener("change", e => openView(e.target.value));
$("brandF").addEventListener("change", e => { S.brandF = e.target.value; ls.set("brandF", S.brandF); renderAll(); });
document.addEventListener("change", e => { const t = e.target.closest("[data-tcc]"); if (t) saveTarget(t.dataset.tcc, t.dataset.tb, t.dataset.tw, t.value); });
$("cal").addEventListener("click", e => {
  const c = e.target.closest("[data-d]"); if (!c) return;
  S.sel = c.dataset.d; const m = S.sel.slice(0, 7);
  if (m !== S.month) { S.month = m; refresh(); }
  renderAll(); if (innerWidth < 900) $("dayPanel").scrollIntoView({ behavior: RM, block: "start" });
});
const shift = k => { flushAuto(); let [y, m] = S.month.split("-").map(Number); m += k; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } S.month = y + "-" + pad(m); S.sel = S.month === TODAY.slice(0, 7) ? TODAY : S.month + "-01"; renderAll(); refresh(); };
$("prevM").addEventListener("click", () => shift(-1)); $("nextM").addEventListener("click", () => shift(1));
$("logoutBtn").addEventListener("click", () => { flushAuto(); setTimeout(logout, 300); });
$("sheetBtn").addEventListener("click", () => { if (S.sheetUrl) window.open(S.sheetUrl, "_blank", "noopener"); });
$("exportBtn").addEventListener("click", () => exportXlsx());

// pengaturan atasan
$("ccBrand").addEventListener("click", e => { const b = e.target.closest("[data-bc]"); if (!b) return; const box = $("ccBrand"); const l = brandList(box.dataset.val); const v = b.dataset.bc; box.dataset.val = (l.includes(v) ? l.filter(x => x !== v) : l.concat(v)).join(", "); b.setAttribute("aria-pressed", brandList(box.dataset.val).includes(v)); });
$("ccForm").addEventListener("submit", e => {
  e.preventDefault(); const n = $("ccName").value.trim(); if (!n) { $("ccName").focus(); return; }
  const em = low($("ccEmail").value); if (em && S.ccs.some(c => low(c.email) === em)) { toast("Gmail itu sudah dipakai anggota lain"); return; }
  let id = n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cc"; while (ccById(id)) id += "-2";
  S.ccs.push({ id, name: n, jabatan: $("ccJab").value, brand: $("ccBrand").dataset.val || "", email: em, photoVer: "" });
  $("ccName").value = ""; $("ccEmail").value = ""; $("ccBrand").dataset.val = ""; saveCfg();
});
$("ccList").addEventListener("change", e => {
  const t = e.target.closest("[data-f]"); if (!t) return; const c = ccById(t.dataset.cid); if (!c) return;
  const f = t.dataset.f, v = f === "email" ? low(t.value) : t.value.trim();
  if (f === "email" && v && S.ccs.some(x => x !== c && low(x.email) === v)) { toast("Gmail itu sudah dipakai anggota lain"); t.value = c.email || ""; return; }
  if (f === "name" && !v) { t.value = c.name; return; }
  if (c[f] === v) return;
  c[f] = v; t.blur(); saveCfg();
});
$("ccList").addEventListener("click", e => {
  const bc = e.target.closest("[data-bc]");
  if (bc) { const c = ccById(bc.closest(".bchips").dataset.cid); if (!c) return; const l = brandList(c.brand), v = bc.dataset.bc; c.brand = (l.includes(v) ? l.filter(x => x !== v) : l.concat(v)).join(", "); saveCfg(); return; }
  const b = e.target.closest("[data-rm]"); if (!b) return; const id = b.dataset.rm;
  if (S.armed !== id) { S.armed = id; renderSettings(); setTimeout(() => { if (S.armed === id) { S.armed = null; renderSettings(); } }, 3000); return; }
  S.armed = null; S.ccs = S.ccs.filter(c => c.id !== id); if (S.view === id) S.view = ""; saveCfg(); toast("Anggota dihapus dari daftar");
});

/* ---------------- export Excel ---------------- */
function loadExcel() {
  if (window.ExcelJS) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"; s.onload = () => window.ExcelJS ? res() : rej(); s.onerror = rej; document.head.appendChild(s); });
}
async function exportXlsx() {
  const btn = $("exportBtn"); btn.disabled = true; btn.textContent = "Menyiapkan…";
  try {
    await loadExcel();
    const { first, last, start, end } = range(); const [y, m] = S.month.split("-").map(Number); const periode = BULAN[m - 1] + " " + y;
    const wb = new ExcelJS.Workbook(); wb.creator = "Daily Report Creative Indogroup";
    const BLUE = "FF5A6FA7", SOFT = "FFE6EAF5", GREY = "FFF1F1EE", SUBT = "FFEFEDDE", DARK = "FF23252F", LINE = { style: "thin", color: { argb: "FFD9D8D3" } };
    const box = { top: LINE, left: LINE, bottom: LINE, right: LINE };
    const fillC = argb => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
    const head = row => { row.eachCell(c => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = fillC(DARK); c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = box; }); row.height = 30; };
    const paint = (row, argb, font) => row.eachCell({ includeEmpty: true }, c => { c.fill = fillC(argb); c.border = box; if (font) c.font = font; });
    const title = (ws, text, cols) => { ws.mergeCells(1, 1, 1, cols); const c = ws.getCell("A1"); c.value = text; c.font = { bold: true, size: 14, color: { argb: BLUE } }; };
    const days = []; for (let s = first; s <= last; s = add(s, 1)) days.push(s);
    const mons = []; for (let w = start; w <= end; w = add(w, 7)) mons.push(w);
    const all = Object.values(S.entries).filter(e => ccById(e.cc));
    const inMonth = all.filter(e => e.date >= first && e.date <= last);
    const xd = v => { const [a, b, c] = v.split("-").map(Number); return new Date(Date.UTC(a, b - 1, c)); }; // tanggal Excel tanpa geser zona waktu
    const fmtTs = t => { if (!t) return ""; const d = new Date(t); return ds(d) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };
    const bsort = (a, b) => CODES.indexOf(a.brand) - CODES.indexOf(b.brand);
    const setLink = (cell, links) => { if (links.length === 1) { cell.value = { text: links[0], hyperlink: links[0] }; cell.font = { color: { argb: BLUE }, underline: true }; } else cell.value = links.join("\n"); };

    // 1. Rekap per orang per brand
    const rk = wb.addWorksheet("Rekap", { views: [{ state: "frozen", ySplit: 3 }] });
    const rkCols = [["Nama", 22], ["Jabatan", 17], ["Brand", 9], ["Satuan", 9], ["Target bulan*", 12], ["Total", 10], ["Capaian", 10], ["Facebook", 10], ["YouTube", 10], ["Shopee", 10], ["Hari mengisi", 11], ["Lembur (jam)", 11], ["Kendala", 9]];
    rk.columns = rkCols.map(c => ({ width: c[1] })); title(rk, "REKAP DAILY REPORT – ALL CREATIVE · " + periode.toUpperCase(), rkCols.length);
    rk.getCell("A2").value = "* Target bulan = jumlah target mingguan (Senin–Minggu) yang diisi atasan, sudah dikurangi hari cuti/izin/sakit"; rk.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF6A6C78" } };
    rk.getRow(3).values = rkCols.map(c => c[0]); head(rk.getRow(3));
    let r = 4;
    S.ccs.forEach((c, ci) => {
      const role = roleOf(c);
      brandsOf(c).forEach(b => {
        const es = inMonth.filter(e => e.cc === c.id && e.brand === b), tb = mons.reduce((a, w) => a + tgtEff(c.id, b, w), 0), tot = sum(es, "qty");
        if (!es.length && !tb) return;
        const row = rk.getRow(r++);
        row.values = [c.name, c.jabatan || "", b, UNIT[role], tb, tot, tb ? tot / tb : "", role === "admin" ? sum(es, "fb") : "", role === "admin" ? sum(es, "yt") : "", role === "admin" ? sum(es, "shopee") : "", new Set(es.map(e => e.date)).size, sum(es, "lembur"), es.filter(e => e.kendala).length];
        row.getCell(7).numFmt = "0%"; paint(row, ci % 2 ? GREY : "FFFFFFFF");
      });
    });
    if (r > 4) {
      const t = rk.getRow(r); const L = r - 1;
      t.values = ["ALL CREATIVE", "", "", "konten", { formula: `SUM(E4:E${L})` }, { formula: `SUM(F4:F${L})` }, { formula: `IF(E${r}=0,"",F${r}/E${r})` }, { formula: `SUM(H4:H${L})` }, { formula: `SUM(I4:I${L})` }, { formula: `SUM(J4:J${L})` }, "", { formula: `SUM(L4:L${L})` }, { formula: `SUM(M4:M${L})` }];
      t.getCell(7).numFmt = "0%"; paint(t, SOFT, { bold: true });
    }

    // 2. Ringkasan mingguan
    const sm = wb.addWorksheet("Ringkasan Mingguan");
    const smCols = [["Minggu", 12], ["Periode", 22], ["Video (CC)", 12], ["Desain (DG)", 12], ["Facebook", 11], ["YouTube", 11], ["Shopee", 11], ["Total upload (Admin)", 14], ["Lembur (jam)", 12]];
    sm.columns = smCols.map(c => ({ width: c[1] })); title(sm, "RINGKASAN PER MINGGU · " + periode.toUpperCase(), smCols.length);
    sm.getRow(3).values = smCols.map(c => c[0]); head(sm.getRow(3));
    const agg = es => { const by = q => es.filter(e => roleOf(ccById(e.cc)) === q); const a = by("admin"); return [sum(by("cc"), "qty"), sum(by("dg"), "qty"), sum(a, "fb"), sum(a, "yt"), sum(a, "shopee"), sum(a, "qty"), sum(es, "lembur")]; };
    mons.forEach((w, i) => { const row = sm.getRow(4 + i); row.values = ["Minggu " + (i + 1), shortD(w) + " – " + shortD(add(w, 6)), ...agg(all.filter(e => e.date >= w && e.date <= add(w, 6)))]; paint(row, i % 2 ? GREY : "FFFFFFFF"); });
    const smT = sm.getRow(4 + mons.length); smT.values = ["Total " + BULAN[m - 1], "tanggal 1–" + pd(last).getDate(), ...agg(inMonth)]; paint(smT, BLUE, { bold: true, color: { argb: "FFFFFFFF" } });

    // 3. Sheet per orang
    const used = new Set(["Rekap", "Ringkasan Mingguan", "Raw Data", "Kehadiran"]);
    S.ccs.forEach(c => {
      let nm = (c.name || "CC").replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31).trim() || "CC"; let k = 2; while (used.has(nm)) nm = nm.slice(0, 28) + " " + (k++); used.add(nm);
      const role = roleOf(c), u = UNIT[role], bs = brandsOf(c);
      const cols = [["No", 5], ["Hari", 9], ["Tanggal", 12], ["Brand", 8]];
      if (role === "admin") cols.push(["Facebook", 10], ["YouTube", 10], ["Shopee", 10], ["Total upload", 11]);
      else if (role === "dg") cols.push(["Jumlah desain", 11], ["Jenis", 14], ["Desain campaign", 26]);
      else cols.push(["Jumlah video", 11]);
      cols.push(["Target harian", 10], ["Status", 15], ["Tugas harian", 46], ["Link hasil kerja", 42], ["Kendala", 28], ["Solusi", 28], ["Lembur (jam)", 10], ["Diisi pada", 16]);
      const L = cols.length, iQty = role === "admin" ? 8 : 5, iT = cols.findIndex(x => x[0] === "Target harian") + 1, iSt = iT + 1, iLink = iSt + 2, iKend = iSt + 3, iOt = L - 1;
      const ws = wb.addWorksheet(nm, { views: [{ state: "frozen", ySplit: 7, xSplit: 3 }] });
      ws.columns = cols.map(x => ({ width: x[1] })); title(ws, "DAILY REPORT – " + (c.name || "").toUpperCase(), L);
      [["Nama", c.name], ["Jabatan", c.jabatan || "-"], ["Brand", bs.map(b => b + " (" + BNAME[b] + ")").join(", ")], ["Periode", periode]].forEach((p, i) => {
        const row = ws.getRow(2 + i); row.getCell(1).value = p[0]; row.getCell(1).font = { bold: true, color: { argb: "FF6A6C78" } }; ws.mergeCells(2 + i, 2, 2 + i, 6); row.getCell(2).value = p[1];
      });
      ws.getRow(7).values = cols.map(x => x[0]); head(ws.getRow(7));
      let row = 8, no = 0, wkN = 1, wT = 0, wO = 0, mT = 0, mO = 0;
      const subtotal = s => {
        const wk = monday(s), t = bs.reduce((a, b) => a + tgtEff(c.id, b, wk), 0), rr = ws.getRow(row++), v = [];
        v[2] = "Total minggu ke-" + wkN; v[iQty] = wT; v[iT] = t || ""; v[iSt] = t ? (wT >= t ? "Tercapai" : "Kurang " + (t - wT)) : "Target belum diisi"; v[iOt] = wO; rr.values = v;
        ws.mergeCells(rr.number, 2, rr.number, 4); paint(rr, SUBT, { bold: true });
        rr.getCell(iSt).font = { bold: true, color: { argb: t && wT >= t ? "FF3D7B52" : "FFB23B32" } }; wkN++; wT = 0; wO = 0;
      };
      days.forEach(s => {
        const d = pd(s), sun = d.getDay() === 0, es = inMonth.filter(e => e.cc === c.id && e.date === s).sort(bsort);
        const wk = monday(s);
        (es.length ? es : [null]).forEach(e => {
          no++;
          const dT = e ? Math.round(tgt(c.id, e.brand, wk) / 6 * 10) / 10 : 0;
          const ab = absOf(c.id, s);
          const st = e ? (dT ? (e.qty >= dT ? "Capai target" : "Di bawah target") : "Terisi") : ab ? ab.status : (sun ? "Libur" : "Belum diisi");
          const vals = [no, HARI[d.getDay()], xd(s), e ? e.brand : ""];
          if (role === "admin") vals.push(e ? e.fb : "", e ? e.yt : "", e ? e.shopee : "", e ? e.qty : "");
          else if (role === "dg") vals.push(e ? e.qty : "", e ? (e.jenis || []).join(" + ") : "", e ? (e.campaign || []).join(", ") : "");
          else vals.push(e ? e.qty : "");
          vals.push(dT || "", st, e ? e.tugas || "" : (ab ? ab.note || "" : ""), "", e ? e.kendala || "" : "", e ? e.solusi || "" : "", e ? +e.lembur || 0 : "", e ? fmtTs(e.updatedAt) : "");
          const rr = ws.getRow(row++); rr.values = vals; rr.getCell(3).numFmt = "dd/mm/yyyy";
          rr.eachCell({ includeEmpty: true }, x => { x.border = box; x.alignment = { vertical: "top", wrapText: true }; });
          rr.getCell(iSt).font = { bold: true, color: { argb: st === "Capai target" ? "FF3D7B52" : st === "Di bawah target" ? "FF9C6A12" : st === "Alpha" ? "FFB23B32" : "FF8A8FA3" } };
          if (sun && !e && !ab) paint(rr, GREY);
          if (!e && ab) paint(rr, ab.status === "Alpha" ? "FFF6DEDC" : "FFFBEFD6");
          if (e) { setLink(rr.getCell(iLink), e.links || []); if (e.kendala) rr.getCell(iKend).fill = fillC("FFFBEFD6"); wT += e.qty; wO += +e.lembur || 0; mT += e.qty; mO += +e.lembur || 0; }
        });
        if (sun || s === last) subtotal(s);
      });
      const tr = ws.getRow(row + 1), v = []; v[2] = "TOTAL " + periode.toUpperCase(); v[iQty] = mT; v[iOt] = mO; tr.values = v; ws.mergeCells(tr.number, 2, tr.number, 4);
      paint(tr, BLUE, { bold: true, color: { argb: "FFFFFFFF" } });
      ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: L } };
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    });

    // 4. Kehadiran
    const kh = wb.addWorksheet("Kehadiran");
    const khCols = [["Nama", 22], ["Jabatan", 17], ["Cuti", 8], ["Izin", 8], ["Sakit", 8], ["Alpha", 8], ["Total", 8], ["Rincian tanggal", 70]];
    kh.columns = khCols.map(c => ({ width: c[1] })); title(kh, "KEHADIRAN · " + periode.toUpperCase(), khCols.length);
    kh.getRow(3).values = khCols.map(c => c[0]); head(kh.getRow(3));
    S.ccs.forEach((c, i) => {
      const o = absCount(c.id, first, last), list = Object.values(S.absen).filter(a => a.cc === c.id && a.date >= first && a.date <= last).sort((a, b) => a.date.localeCompare(b.date));
      const row = kh.getRow(4 + i);
      row.values = [c.name, c.jabatan || "", o.Cuti, o.Izin, o.Sakit, o.Alpha, list.length, list.map(a => shortD(a.date) + " " + a.status + (a.note ? " (" + a.note + ")" : "")).join("; ")];
      paint(row, i % 2 ? GREY : "FFFFFFFF"); row.getCell(8).alignment = { wrapText: true, vertical: "top" };
    });
    used.add("Kehadiran");

    // 5. Raw data
    const raw = wb.addWorksheet("Raw Data", { views: [{ state: "frozen", ySplit: 1 }] });
    const rc = [["Tanggal", 12], ["Hari", 9], ["Nama", 20], ["Jabatan", 16], ["Brand", 8], ["Jumlah", 9], ["Satuan", 9], ["Facebook", 10], ["YouTube", 10], ["Shopee", 10], ["Target minggu", 11], ["Jenis", 14], ["Desain campaign", 26], ["Tugas harian", 46], ["Link", 42], ["Kendala", 28], ["Solusi", 28], ["Lembur (jam)", 10], ["Diisi pada", 16]];
    raw.columns = rc.map(x => ({ width: x[1] })); raw.getRow(1).values = rc.map(x => x[0]); head(raw.getRow(1));
    inMonth.slice().sort((a, b) => ccById(a.cc).name.localeCompare(ccById(b.cc).name) || a.date.localeCompare(b.date) || bsort(a, b)).forEach((e, i) => {
      const c = ccById(e.cc), role = roleOf(c), rr = raw.getRow(2 + i);
      rr.values = [xd(e.date), HARI[pd(e.date).getDay()], c.name, c.jabatan || "", e.brand, e.qty, UNIT[role], role === "admin" ? e.fb : "", role === "admin" ? e.yt : "", role === "admin" ? e.shopee : "", tgt(c.id, e.brand, monday(e.date)) || "", (e.jenis || []).join(" + "), (e.campaign || []).join(", "), e.tugas || "", "", e.kendala || "", e.solusi || "", +e.lembur || 0, fmtTs(e.updatedAt)];
      rr.getCell(1).numFmt = "dd/mm/yyyy"; setLink(rr.getCell(15), e.links || []);
      rr.eachCell({ includeEmpty: true }, x => { x.border = box; x.alignment = { vertical: "top", wrapText: true }; });
    });
    raw.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: rc.length } };

    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = `Daily Report Creative ${periode}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("File Excel diunduh");
  } catch (e) { console.error(e); toast("Export gagal, coba lagi"); }
  finally { btn.disabled = false; btn.textContent = "Export Excel"; }
}

/* ---------------- mulai ---------------- */
(function init() {
  const prob = configProblems();
  if (prob.length) { showGate("Dashboard belum dihubungkan", "Yang perlu diperbaiki di file config.js:\n• " + prob.join("\n• ") + "\n\nSetelah Commit di GitHub, tunggu 1–2 menit lalu muat ulang halaman."); return; }
  if (SESSION) { showGate("Memuat data…", "Sebentar, sedang mengambil data tim dari Google Sheets."); refresh(); }
  else showLogin();
})();
