// config.js selalu diambil versi terbaru (tidak memakai cache browser)
const CFG=await import("./config.js?v="+Date.now()).then(m=>({ok:true,...m})).catch(e=>({ok:false,err:String(e&&e.message||e)}));
const SCRIPT_URL=String(CFG.SCRIPT_URL||"").trim();
const GOOGLE_CLIENT_ID=String(CFG.GOOGLE_CLIENT_ID||"").trim();
function configProblems(){
  if(!CFG.ok)return["File config.js tidak bisa dibaca. Kemungkinan ada tanda kutip \" atau titik koma yang ikut terhapus saat mengedit. Bandingkan dengan contoh di PANDUAN.md Langkah 4."];
  const p=[];
  if(!SCRIPT_URL||/GANTI/i.test(SCRIPT_URL))p.push("SCRIPT_URL belum diganti dengan link Web App.");
  else if(/\/dev$/.test(SCRIPT_URL))p.push("SCRIPT_URL memakai link berakhiran /dev. Gunakan link Web App yang berakhiran /exec (Deploy → Manage deployments).");
  else if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(SCRIPT_URL))p.push("SCRIPT_URL bukan link Web App. Bentuk yang benar: https://script.google.com/macros/s/…/exec");
  if(!GOOGLE_CLIENT_ID||/GANTI/i.test(GOOGLE_CLIENT_ID))p.push("GOOGLE_CLIENT_ID belum diganti dengan Client ID.");
  else if(/(\.apps\.googleusercontent\.com){2}/.test(GOOGLE_CLIENT_ID))p.push("GOOGLE_CLIENT_ID tertulis \".apps.googleusercontent.com\" dua kali. Hapus salah satunya.");
  else if(!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID))p.push("GOOGLE_CLIENT_ID tidak sesuai format. Bentuk yang benar: 123456789012-abc….apps.googleusercontent.com (tanpa spasi).");
  return p;
}

/* ---------- konstanta & util ---------- */
const HARI=["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const BULAN=["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const BRANDS=["OLV","KNG","77","MTR","IDN"];
const CAMP=["Banner Marketplace","Sticker Live","Katalog Watermark","Thumbnail Live"];
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const ds=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const pd=s=>{const[a,b,c]=s.split("-").map(Number);return new Date(a,b-1,c)};
const add=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return ds(d)};
const monday=s=>add(s,-((pd(s).getDay()+6)%7));
const longDate=s=>{const d=pd(s);return HARI[d.getDay()]+", "+d.getDate()+" "+BULAN[d.getMonth()]+" "+d.getFullYear()};
const shortD=s=>pd(s).getDate()+" "+BULAN[pd(s).getMonth()].slice(0,3);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fmt=n=>(Math.round(n*10)/10).toString().replace(".",",");
const low=s=>String(s||"").trim().toLowerCase();
const TODAY=ds(new Date());
const RM=matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth";

/* ---------- koneksi Google Sheets ---------- */
let TOKEN="";let tokenExp=0;
const POLL_MS=30000;
const S={month:TODAY.slice(0,7),sel:TODAY,cc:"",ccs:[],entries:{},targets:{},email:"",isAdmin:false,armed:null,ready:false,pending:{},pendingT:{},teamDirty:0,seq:0,sheetUrl:""};
try{S.cc=localStorage.getItem("cc")||""}catch(e){}

function toast(m){const t=$("toast");t.textContent=m;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2600)}
const ccById=id=>S.ccs.find(c=>c.id===id);
const myCc=()=>S.ccs.find(c=>low(c.email)===S.email);
const canEdit=id=>S.isAdmin||(!!id&&low(ccById(id)?.email)===S.email);
const isDes=c=>!!c&&/desain|design|graf|graphic/i.test(c.jabatan||"");
const unit=c=>isDes(c)?"desain":"video";
const U=()=>S.cc?unit(ccById(S.cc)):"konten";
const cap=w=>w[0].toUpperCase()+w.slice(1);
const tgt=(cc,mon)=>+(S.targets[cc+"_"+mon]?.target)||0;
const T=mon=>S.cc?tgt(S.cc,mon):S.ccs.reduce((a,c)=>a+tgt(c.id,mon),0);
function range(){const[y,m]=S.month.split("-").map(Number);const first=S.month+"-01",last=ds(new Date(y,m,0));return{first,last,start:monday(first),end:add(monday(last),6)}}
const curWeek=()=>monday(S.sel.startsWith(S.month)?S.sel:(TODAY.startsWith(S.month)?TODAY:S.month+"-01"));
function onDate(s,cc){const who=cc===undefined?S.cc:cc;return Object.values(S.entries).filter(e=>e.date===s&&(!who||e.cc===who)&&ccById(e.cc))}
const sum=(arr,k)=>arr.reduce((a,e)=>a+(+e[k]||0),0);
function weekTotal(mon,cc){let v=0;for(let i=0;i<7;i++)v+=sum(onDate(add(mon,i),cc),"videos");return v}
const denied=e=>e&&(e.error==="forbidden"||e.error==="not_member");
async function api(action,payload={}){
  if(!TOKEN||Date.now()>tokenExp-60000){expireLogin();throw{error:"auth"}}
  let res;
  try{res=await fetch(SCRIPT_URL,{method:"POST",body:JSON.stringify({action,token:TOKEN,...payload})})}catch(e){throw{error:"network"}}
  let j;try{j=await res.json()}catch(e){throw{error:"server",detail:"Respon bukan JSON. Cek Deploy Apps Script (akses: Anyone)."}}
  if(j&&j.error){if(j.error==="auth")expireLogin();throw j}
  return j;
}

/* ---------- render ---------- */
function renderHeader(){
  const[y,m]=S.month.split("-").map(Number);$("monthLbl").textContent=BULAN[m-1]+" "+y;
  const sel=$("ccSel");sel.innerHTML=`<option value="">All Creative</option>`+S.ccs.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${low(c.email)===S.email?" (saya)":""}</option>`).join("");
  if(S.cc&&!ccById(S.cc)&&S.ready)S.cc="";sel.value=S.cc;
}
function renderProfile(){
  const p=$("profile");
  if(!S.cc){p.className="profile home";p.innerHTML=`<div><div class="v">ALL TEAM</div></div><div class="sub" style="padding-right:16px">${S.ccs.length} anggota creative</div>`;return}
  const c=ccById(S.cc)||{};p.className="profile";
  const cell=(l,v)=>`<div><div class="l">${l}</div><div class="v${v?"":" mute"}">${v?esc(v):"Belum diisi"}</div></div>`;
  p.innerHTML=cell("Nama",c.name)+cell("Jabatan",c.jabatan)+cell("Brand",c.brand||(isDes(c)?"Berganti tiap hari":""));
}
function renderStats(){
  $("stats").hidden=!S.cc;if(!S.cc)return;
  const wk=curWeek(),t=T(wk),wv=weekTotal(wk),pct=t?Math.min(100,wv/t*100):0,u=U();
  const{first,last}=range();let mv=0,ot=0,days=0,otDays=0;
  for(let s=first;s<=last;s=add(s,1)){const es=onDate(s);const v=sum(es,"videos"),o=sum(es,"lembur");mv+=v;ot+=o;if(v)days++;if(o)otDays++}
  $("stWeek").innerHTML=`<div class="l">${cap(u)} minggu ini · ${shortD(wk)} – ${shortD(add(wk,6))}</div><div class="v num">${wv}<small> / ${t||"–"}</small></div>
    <div class="prog${t&&wv>=t?" done":""}"><i style="width:${pct}%"></i></div>
    <div class="s">${!t?"Target minggu ini belum diisi atasan":wv>=t?"Target minggu ini tercapai":"Kurang "+(t-wv)+" "+u+" lagi"}</div>`;
  $("stMonth").innerHTML=`<div class="l">Total ${u} bulan ini</div><div class="v num">${mv}</div><div class="s">${days} hari ada ${u==="video"?"upload":"desain"}</div>`;
  $("stOt").innerHTML=`<div class="l">Total lembur</div><div class="v num">${fmt(ot)}<small> jam</small></div><div class="s">${otDays} hari lembur</div>`;
}
function renderRekap(){
  const panel=$("rekapPanel");panel.hidden=!!S.cc;if(S.cc)return;
  const{first,last}=range(),wk=curWeek();const[y,m]=S.month.split("-").map(Number);
  $("rekapSub").textContent=`${BULAN[m-1]} ${y} · minggu ${shortD(wk)} – ${shortD(add(wk,6))}`;
  if(!S.ccs.length){$("rekap").innerHTML=`<tbody><tr><td><div class="empty">${S.isAdmin?"Belum ada anggota. Tambahkan di Pengaturan atasan di bawah.":"Daftar anggota belum diisi atasan."}</div></td></tr></tbody>`;return}
  const F={wv:0,wt:0,mv:0,hari:0,ot:0,kd:0};
  const rows=S.ccs.map(c=>{
    let mv=0,hari=0,ot=0,kd=0,lastFill="";
    for(let s=first;s<=last;s=add(s,1)){const e=S.entries[c.id+"_"+s];if(e){mv+=+e.videos||0;hari++;ot+=+e.lembur||0;if(e.kendala)kd++;if((e.updatedAt||"")>lastFill)lastFill=e.updatedAt}}
    const wv=weekTotal(wk,c.id),t=tgt(c.id,wk),p=t?Math.min(100,wv/t*100):0,u=unit(c);
    F.wv+=wv;F.wt+=t;F.mv+=mv;F.hari+=hari;F.ot+=ot;F.kd+=kd;
    const tCell=S.isAdmin?`<span class="tin">/ <input type="number" min="0" value="${t||""}" placeholder="–" data-tcc="${esc(c.id)}" data-tw="${wk}" aria-label="Target minggu ini ${esc(c.name)}"></span>`:`/ ${t||"–"}`;
    const lf=lastFill?new Date(lastFill):null;
    return `<tr><td><button class="nm" data-open="${esc(c.id)}">${esc(c.name)}</button><span class="jb">${esc(c.jabatan||"")}</span></td>
      <td><div class="mini${t&&wv>=t?" done":""}"><span class="n">${wv} ${tCell} <span class="sub" style="font-family:var(--body);font-weight:500">${u}</span></span><div class="bar"><i style="width:${p}%"></i></div></div></td>
      <td class="n">${mv} <span class="sub" style="font-family:var(--body);font-weight:500">${u}</span></td><td class="n">${hari}</td><td class="n ot">${fmt(ot)} j</td><td class="n ${kd?"kd":""}">${kd}</td>
      <td class="sub">${lf?shortD(ds(lf))+" "+pad(lf.getHours())+":"+pad(lf.getMinutes()):"–"}</td></tr>`}).join("");
  $("rekap").innerHTML=`<thead><tr><th>Nama</th><th>Minggu ini / target</th><th>Total bulan ini</th><th>Hari mengisi</th><th>Lembur</th><th>Kendala</th><th>Terakhir mengisi</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td>ALL TEAM</td><td class="n">${F.wv} / ${F.wt||"–"}</td><td class="n">${F.mv}</td><td class="n">${F.hari}</td><td class="n ot">${fmt(F.ot)} j</td><td class="n">${F.kd}</td><td></td></tr></tfoot>`;
}
function renderCal(){
  const{first,last,start,end}=range();
  $("calSub").textContent=S.cc?(canEdit(S.cc)?"Klik tanggal untuk mengisi report":"Klik tanggal untuk melihat report"):"Klik tanggal untuk melihat isian tim";
  let h=["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map(x=>`<div class="h">${x}</div>`).join("")+`<div class="h">Minggu</div>`;
  for(let mon=start;mon<=end;mon=add(mon,7)){
    const t=T(mon),dT=t/6;
    for(let i=0;i<7;i++){
      const s=add(mon,i),es=onDate(s),v=sum(es,"videos"),o=sum(es,"lembur"),sun=pd(s).getDay()===0,out=s<first||s>last;
      const cls=["cell",sun&&"sun",out&&"out",v&&(dT&&v>=dT?"hit":"has"),s===S.sel&&"sel",s===TODAY&&"today"].filter(Boolean).join(" ");
      h+=`<button class="${cls}" data-d="${s}" aria-label="${longDate(s)}: ${v} ${U()}${o?", lembur "+fmt(o)+" jam":""}"><span class="n">${pd(s).getDate()}</span>${v?`<span class="vid">${v}</span>`:""}${o?`<span class="ot">+${fmt(o)}j</span>`:""}${es.some(x=>x.kendala)?'<span class="kdot" title="Ada kendala"></span>':""}</button>`;
    }
    const wv=weekTotal(mon),p=t?Math.min(100,wv/t*100):0;
    h+=`<div class="wk${t&&wv>=t?" done":""}"><b class="num">${wv}${t?"/"+t:""}</b><div class="bar"><i style="width:${p}%"></i></div><span>${t?Math.round(wv/t*100)+"%":U()}</span></div>`;
  }
  $("cal").innerHTML=h;
}
function host(u){try{return new URL(u).hostname.replace(/^www\./,"")}catch(e){return u.slice(0,30)}}
function normUrl(v){v=v.trim();if(!v)return"";if(!/^https?:\/\//i.test(v))v="https://"+v;return v}
const safeUrl=u=>/^https?:\/\//i.test(u)?u:"#";
function linkRow(v){const ok=/^https?:\/\//i.test(v||"");return `<div class="lk"><input type="text" inputmode="url" value="${esc(v)}" placeholder="https://www.tiktok.com/@akun/video/..." aria-label="Link hasil kerja">${ok?`<a href="${esc(v)}" target="_blank" rel="noopener">Buka</a>`:"<span></span>"}<button type="button" class="x" data-rmlink aria-label="Hapus link">✕</button></div>`}
const linkOut=ls=>ls&&ls.length?`<span class="linkout">${ls.map(l=>`<a href="${esc(safeUrl(l))}" target="_blank" rel="noopener">${esc(host(l))}</a>`).join("")}</span>`:"";
const tagsOut=e=>e&&((e.brands||[]).length||(e.jenis||[]).length)?`<span class="tagrow">${(e.brands||[]).map(b=>`<span class="tg">${esc(b)}</span>`).join("")}${(e.jenis||[]).map(j=>`<span class="tg c">${esc(j)}</span>`).join("")}${(e.campaign||[]).map(j=>`<span class="tg c">${esc(j)}</span>`).join("")}</span>`:"";
function otSum(cc,a,b){return Object.values(S.entries).filter(e=>e.cc===cc&&e.date>=a&&e.date<=b).reduce((t,e)=>t+(+e.lembur||0),0)}

const AUTO={flush:null};
function renderDay(){
  const p=$("dayPanel"),s=S.sel;AUTO.flush=null;
  if(!S.ccs.length){p.innerHTML=`<h2>Mulai di sini</h2><div class="empty">${S.isAdmin?"Belum ada anggota. Buka <b>Pengaturan atasan</b> di bawah, lalu isi nama, jabatan, brand dan Gmail tiap anggota.":"Daftar anggota belum diisi atasan."}</div>`;return}
  if(!S.cc){
    const es=onDate(s,"");
    p.innerHTML=`<div class="phead"><span class="dayname">${longDate(s)}</span></div>
      <div class="sub">${sum(es,"videos")} konten · lembur ${fmt(sum(es,"lembur"))} jam · ${es.length} dari ${S.ccs.length} orang sudah mengisi</div>
      <ul class="team">${S.ccs.map(c=>{const e=es.find(x=>x.cc===c.id);return `<li><span>${esc(c.name)}</span><span class="vv">${e?e.videos+" "+unit(c):"–"}</span><span class="oo">${e&&+e.lembur?"+"+fmt(e.lembur)+" j":""}</span>${tagsOut(e)}${e&&e.tugas?`<span class="tt">${esc(e.tugas)}</span>`:""}${linkOut(e&&e.links)}${e&&e.kendala?`<span class="kdl"><b>Kendala:</b> ${esc(e.kendala)}${e.solusi?` · <b>Solusi:</b> ${esc(e.solusi)}`:""}</span>`:""}</li>`}).join("")}</ul>
      <p class="hint" style="margin:0">${myCc()?`Untuk mengisi report, pilih <b>${esc(myCc().name)}</b> di bagian atas.`:"Pilih nama di bagian atas untuk melihat report tiap orang."}</p>`;
    return;
  }
  const c=ccById(S.cc),e=S.entries[S.cc+"_"+s]||{},wk=monday(s),t=tgt(S.cc,wk),dT=t/6,des=isDes(c),u=unit(c);
  const tgtBox=S.isAdmin
    ?`<div class="tgtbox"><label class="lbl" for="wkT" style="color:var(--indigo)">Target minggu ${shortD(wk)} – ${shortD(add(wk,6))}</label><input type="number" id="wkT" min="0" value="${t||""}" placeholder="–" data-tcc="${esc(S.cc)}" data-tw="${wk}"><span class="sub">${u} · diisi atasan</span></div>`
    :`<div class="tgtbox"><span class="lbl" style="color:var(--indigo)">Target minggu ini</span><b>${t?t+" "+u:"Belum diisi atasan"}</b>${t?`<span class="sub">± ${fmt(dT)} ${u}/hari</span>`:""}</div>`;
  const headH=`<div class="phead"><span class="dayname">${longDate(s)}</span><span class="sub">${esc(c.name)}</span></div>${tgtBox}`;

  if(!canEdit(S.cc)){
    p.innerHTML=headH+(e.updatedAt?`<div class="ro">
      <div><div class="k">${des?"Desain":"Video"}</div><div class="vid" style="font-family:var(--mono);font-weight:700;font-size:22px">${+e.videos||0}</div></div>
      ${tagsOut(e)}
      ${e.tugas?`<div><div class="k">Tugas harian</div><div class="t">${esc(e.tugas)}</div></div>`:""}
      ${e.links&&e.links.length?`<div><div class="k">Link</div>${linkOut(e.links)}</div>`:""}
      ${e.kendala?`<div class="kdl"><b>Kendala:</b> ${esc(e.kendala)}${e.solusi?` · <b>Solusi:</b> ${esc(e.solusi)}`:""}</div>`:""}
      ${+e.lembur?`<div><div class="k">Lembur</div><b style="color:var(--soga)">${fmt(e.lembur)} jam</b></div>`:""}
    </div>`:`<div class="empty">${esc(c.name)} belum mengisi report tanggal ini.</div>`)+`<p class="hint" style="margin:0">Hanya ${esc(c.name)} yang bisa mengisi report ini.</p>`;
    return;
  }

  const eb=e.brands||[],ej=e.jenis||[],ec=e.campaign||[],other=eb.filter(b=>!BRANDS.includes(b)).join(", ");
  const chip=(grp,v,on,cls)=>`<button type="button" class="chip${cls?" "+cls:""}" data-grp="${grp}" data-v="${esc(v)}" aria-pressed="${on}">${esc(v)}</button>`;
  const desBlock=des?`<div class="dzone">
      <div class="field"><span class="lbl">Brand yang dikerjakan hari ini</span>
        <div class="chips">${BRANDS.map(b=>chip("brand",b,eb.includes(b))).join("")}</div>
        <input type="text" id="bOther" value="${esc(other)}" placeholder="Brand lain (pisahkan dengan koma)" aria-label="Brand lain"></div>
      <div class="field"><span class="lbl">Jenis pekerjaan</span>
        <div class="chips">${chip("jenis","Daily",ej.includes("Daily"))}${chip("jenis","Campaign",ej.includes("Campaign"))}</div>
        <span class="hint">Boleh pilih keduanya kalau daily dan campaign berjalan bersamaan</span></div>
      <div class="field" id="campBox" ${ej.includes("Campaign")?"":"hidden"}><span class="lbl">Desain campaign</span>
        <div class="chips">${CAMP.map(x=>chip("camp",x,ec.includes(x),"camp")).join("")}</div></div>
    </div>`:"";
  p.innerHTML=headH+`
    <form id="dayForm" style="display:grid;gap:12px" autocomplete="off">
      ${desBlock}
      <div class="field"><label class="lbl" for="vIn">${des?"Desain diselesaikan hari ini":"Video diupload hari ini"}</label>
        <div class="stepper"><button type="button" data-step="-1" aria-label="Kurangi">−</button><input type="number" id="vIn" min="0" inputmode="numeric" value="${+e.videos||0}"><button type="button" data-step="1" aria-label="Tambah">+</button></div>
        ${dT?`<span class="hint">Target harian ± ${fmt(dT)} ${u}</span>`:""}</div>
      <div class="field"><label class="lbl" for="tIn">Tugas harian</label><textarea id="tIn" placeholder="Tulis bebas aktivitasmu hari ini, contoh:&#10;- Upload 3 video hardselling Batik Oliver&#10;- Shooting konten styling di studio">${esc(e.tugas||"")}</textarea></div>
      <div class="field"><span class="lbl">Link hasil kerja</span>
        <div class="links" id="links">${(e.links&&e.links.length?e.links:[""]).map(linkRow).join("")}</div>
        <button type="button" class="btn ghost sm" id="addLink">+ Tambah link</button>
        <span class="hint">Link TikTok, Google Drive, atau file lain sesuai pekerjaanmu</span></div>
      <div class="two">
        <div class="field"><label class="lbl" for="kIn">Kendala</label><textarea id="kIn" class="short" placeholder="Kosongkan kalau tidak ada">${esc(e.kendala||"")}</textarea></div>
        <div class="field"><label class="lbl" for="sIn">Solusi</label><textarea id="sIn" class="short" placeholder="Langkah yang diambil">${esc(e.solusi||"")}</textarea></div>
      </div>
      <div class="field"><label class="lbl" for="oIn">Lembur (jam)</label><input type="number" id="oIn" min="0" step="0.5" inputmode="decimal" value="${+e.lembur||""}" placeholder="0">
        <div class="otsum"><span>Lembur minggu ini: <b>${fmt(otSum(S.cc,wk,add(wk,6)))} jam</b></span><span>Bulan ini: <b>${fmt(otSum(S.cc,s.slice(0,7)+"-01",s.slice(0,7)+"-31"))} jam</b></span></div></div>
      <div class="row" style="justify-content:space-between"><span class="saved" id="saveState">${e.updatedAt?"Tersimpan "+new Date(e.updatedAt).toTimeString().slice(0,5):"Tersimpan otomatis saat diisi"}</span><button class="btn" type="submit">Simpan report</button></div>
    </form>`;
  const f=$("dayForm");
  const collect=()=>{
    const links=[...f.querySelectorAll(".lk input")].map(i=>normUrl(i.value)).filter(Boolean);
    const d={videos:Math.max(0,parseInt($("vIn").value)||0),lembur:Math.max(0,parseFloat($("oIn").value)||0),tugas:$("tIn").value.trim(),links,kendala:$("kIn").value.trim(),solusi:$("sIn").value.trim()};
    if(des){const on=g=>[...f.querySelectorAll(`.chip[data-grp="${g}"][aria-pressed="true"]`)].map(x=>x.dataset.v);
      d.brands=[...on("brand"),...$("bOther").value.split(",").map(x=>x.trim()).filter(Boolean)];d.jenis=on("jenis");d.campaign=d.jenis.includes("Campaign")?on("camp"):[]}
    return d};
  const same=(d,old)=>Object.keys(d).every(k=>JSON.stringify(d[k])===JSON.stringify(old[k]===undefined?(Array.isArray(d[k])?[]:typeof d[k]==="number"?0:""):old[k]));
  let timer=null;const cc=S.cc;
  const flush=()=>{clearTimeout(timer);timer=null;AUTO.flush=null;if(!document.body.contains(f))return;const d=collect();if(same(d,S.entries[cc+"_"+s]||{}))return;saveEntry(cc,s,d,true)};
  const schedule=()=>{clearTimeout(timer);$("saveState").textContent="Menyimpan…";timer=setTimeout(flush,1200);AUTO.flush=flush};
  f.addEventListener("input",schedule);
  f.addEventListener("click",ev=>{
    const b=ev.target.closest("[data-step]");if(b){const i=$("vIn");i.value=Math.max(0,(+i.value||0)+ +b.dataset.step);schedule();return}
    const ch=ev.target.closest(".chip");if(ch){ch.setAttribute("aria-pressed",ch.getAttribute("aria-pressed")!=="true");if(ch.dataset.v==="Campaign")$("campBox").hidden=ch.getAttribute("aria-pressed")!=="true";schedule();return}
    if(ev.target.id==="addLink"){$("links").insertAdjacentHTML("beforeend",linkRow(""));$("links").lastElementChild.querySelector("input").focus();return}
    const r=ev.target.closest("[data-rmlink]");if(r){const rows=$("links").children;if(rows.length>1)r.parentElement.remove();else rows[0].querySelector("input").value="";schedule()}
  });
  f.addEventListener("submit",ev=>{ev.preventDefault();clearTimeout(timer);AUTO.flush=null;
    const d=collect();if(des&&d.jenis.includes("Campaign")&&!d.campaign.length){toast("Pilih jenis desain campaign-nya");return}
    saveEntry(cc,s,d,false)});
}
function renderSettings(){
  $("setBox").hidden=!S.isAdmin;if(!S.isAdmin)return;
  $("ccList").innerHTML=S.ccs.length?`<div class="ccrow cchead"><span>Nama</span><span>Jabatan</span><span>Brand</span><span>Gmail</span><span></span></div>`+S.ccs.map(c=>`<div class="ccrow" data-id="${esc(c.id)}">
    <span style="font-weight:600">${esc(c.name)}</span>
    <input type="text" value="${esc(c.jabatan||"")}" data-f="jabatan" data-cid="${esc(c.id)}" placeholder="Jabatan" aria-label="Jabatan ${esc(c.name)}">
    <input type="text" value="${esc(c.brand||"")}" data-f="brand" data-cid="${esc(c.id)}" placeholder="Brand" aria-label="Brand ${esc(c.name)}">
    <input type="text" value="${esc(c.email||"")}" data-f="email" data-cid="${esc(c.id)}" placeholder="nama@gmail.com" aria-label="Gmail ${esc(c.name)}" inputmode="email">
    <button class="x${S.armed===c.id?" confirm":""}" data-rm="${esc(c.id)}">${S.armed===c.id?"Hapus?":"Hapus"}</button></div>`).join(""):`<div class="hint">Belum ada anggota.</div>`;
}
let lastDay="";
function renderAll(){
  renderHeader();renderProfile();renderStats();
  if(!$("rekap").contains(document.activeElement))renderRekap();else $("rekapPanel").hidden=!!S.cc;
  renderCal();
  const key=S.cc+"|"+S.sel+"|"+S.ccs.length+"|"+S.isAdmin,dp=$("dayPanel");
  if(!(dp.contains(document.activeElement)&&key===lastDay&&document.activeElement.tagName!=="BUTTON"))renderDay();lastDay=key;
  if(!$("setBox").contains(document.activeElement))renderSettings();
}

/* ---------- simpan ---------- */
const qE={},qT={};let qC=Promise.resolve();
const errMsg=(e,own)=>e&&e.error==="forbidden"?own:e&&e.error==="network"?"Gagal tersambung, periksa koneksi internet":e&&e.error==="auth"?"Sesi login habis, silakan masuk lagi":"Gagal menyimpan, coba lagi";
function saveEntry(cc,s,d,silent){
  const id=cc+"_"+s,body={cc,date:s,month:s.slice(0,7),...d,by:S.email,updatedAt:new Date().toISOString()};
  S.entries[id]=body;S.pending[id]=body;if(!silent)lastDay="";renderAll();
  const st=()=>{const x=$("saveState");if(x)x.textContent=(silent?"Tersimpan otomatis ":"Tersimpan ")+new Date().toTimeString().slice(0,5)};
  qE[id]=(qE[id]||Promise.resolve()).then(()=>api("saveEntry",{entry:body})).then(()=>{if(S.pending[id]===body)delete S.pending[id];st();if(!silent)toast("Report "+pd(s).getDate()+" "+BULAN[pd(s).getMonth()]+" tersimpan")})
    .catch(e=>{const x=$("saveState");if(x)x.textContent="Belum tersimpan";toast(errMsg(e,"Kamu hanya bisa mengisi report milikmu sendiri"))});
}
function saveTarget(cc,wk,val){
  const id=cc+"_"+wk,n=Math.max(0,parseInt(val)||0);if(n===tgt(cc,wk))return;
  const v={cc,week:wk,target:n};S.targets[id]=v;S.pendingT[id]=v;
  qT[id]=(qT[id]||Promise.resolve()).then(()=>api("saveTarget",{cc,week:wk,target:n})).then(()=>{if(S.pendingT[id]===v)delete S.pendingT[id];toast("Target minggu "+shortD(wk)+" tersimpan");renderAll()})
    .catch(e=>{delete S.pendingT[id];toast(errMsg(e,"Hanya atasan yang bisa mengisi target"))});
}
function saveCfg(){
  renderAll();S.teamDirty++;
  const ccs=S.ccs.map(c=>({id:c.id,name:c.name,jabatan:c.jabatan||"",brand:c.brand||"",email:low(c.email)}));
  qC=qC.then(()=>api("saveTeam",{ccs})).then(()=>toast("Pengaturan tersimpan")).catch(e=>toast(errMsg(e,"Hanya atasan yang bisa mengubah pengaturan"))).finally(()=>{S.teamDirty--});
}

/* ---------- event ---------- */
const flushAuto=()=>{if(AUTO.flush)AUTO.flush()};
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flushAuto()});
addEventListener("pagehide",flushAuto);
$("cal").addEventListener("pointerdown",flushAuto,true);
$("ccSel").addEventListener("focus",flushAuto);
const openCC=id=>{flushAuto();S.cc=id;try{localStorage.setItem("cc",S.cc)}catch(_){}lastDay="";renderAll();scrollTo({top:0,behavior:RM})};
$("ccSel").addEventListener("change",e=>openCC(e.target.value));
$("rekap").addEventListener("click",e=>{const b=e.target.closest("[data-open]");if(b)openCC(b.dataset.open)});
document.addEventListener("change",e=>{const t=e.target.closest("[data-tcc]");if(t)saveTarget(t.dataset.tcc,t.dataset.tw,t.value)});
$("cal").addEventListener("click",e=>{const c=e.target.closest("[data-d]");if(!c)return;S.sel=c.dataset.d;const m=S.sel.slice(0,7);if(m!==S.month){S.month=m;refresh()}renderAll();if(innerWidth<900)$("dayPanel").scrollIntoView({behavior:RM})});
const shift=k=>{flushAuto();let[y,m]=S.month.split("-").map(Number);m+=k;if(m<1){m=12;y--}if(m>12){m=1;y++}S.month=y+"-"+pad(m);S.sel=S.month===TODAY.slice(0,7)?TODAY:S.month+"-01";renderAll();refresh()};
$("prevM").addEventListener("click",()=>shift(-1));$("nextM").addEventListener("click",()=>shift(1));
$("ccForm").addEventListener("submit",e=>{e.preventDefault();const n=$("ccName").value.trim();if(!n){$("ccName").focus();return}
  const em=low($("ccEmail").value);if(em&&S.ccs.some(c=>low(c.email)===em)){toast("Gmail itu sudah dipakai anggota lain");return}
  let id=n.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"cc";while(ccById(id))id+="-2";
  S.ccs.push({id,name:n,jabatan:$("ccJab").value.trim(),brand:$("ccBrand").value.trim(),email:em});
  ["ccName","ccJab","ccBrand","ccEmail"].forEach(i=>$(i).value="");saveCfg()});
$("ccList").addEventListener("change",e=>{const t=e.target.closest("[data-f]");if(!t)return;const c=ccById(t.dataset.cid);if(!c)return;
  const f=t.dataset.f,v=f==="email"?low(t.value):t.value.trim();
  if(f==="email"&&v&&S.ccs.some(x=>x!==c&&low(x.email)===v)){toast("Gmail itu sudah dipakai anggota lain");t.value=c.email||"";return}
  c[f]=v;t.blur();saveCfg()});
$("ccList").addEventListener("click",e=>{const b=e.target.closest("[data-rm]");if(!b)return;const id=b.dataset.rm;
  if(S.armed!==id){S.armed=id;renderSettings();setTimeout(()=>{if(S.armed===id){S.armed=null;renderSettings()}},3000);return}
  S.armed=null;S.ccs=S.ccs.filter(c=>c.id!==id);if(S.cc===id)S.cc="";saveCfg();toast("Anggota dihapus dari daftar")});
$("logoutBtn").addEventListener("click",()=>{flushAuto();setTimeout(logout,300)});
$("sheetBtn").addEventListener("click",()=>{if(S.sheetUrl)window.open(S.sheetUrl,"_blank","noopener")});

/* ---------- export excel ---------- */
function loadExcel(){
  if(window.ExcelJS)return Promise.resolve();
  return new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";s.onload=()=>window.ExcelJS?res():rej();s.onerror=rej;document.head.appendChild(s)});
}
async function exportXlsx(){
  const btn=$("exportBtn");btn.disabled=true;btn.textContent="Menyiapkan…";
  try{
    await loadExcel();
    const{first,last,start,end}=range();const[y,m]=S.month.split("-").map(Number);const periode=BULAN[m-1]+" "+y;
    const wb=new ExcelJS.Workbook();wb.creator="Daily Report Creative Indogroup";
    const IND="FF2E3D8F",SOFT="FFE3E7F8",GREY="FFEFF0F4",SUBT="FFF5E8DC",LINE={style:"thin",color:{argb:"FFD5D8E2"}};
    const box={top:LINE,left:LINE,bottom:LINE,right:LINE};
    const head=row=>{row.eachCell(c=>{c.font={bold:true,color:{argb:"FFFFFFFF"}};c.fill={type:"pattern",pattern:"solid",fgColor:{argb:IND}};c.alignment={vertical:"middle",horizontal:"center",wrapText:true};c.border=box});row.height=30};
    const fill=(row,argb)=>row.eachCell({includeEmpty:true},c=>c.fill={type:"pattern",pattern:"solid",fgColor:{argb}});
    const days=[];for(let s=first;s<=last;s=add(s,1))days.push(s);
    const mons=[];for(let w=start;w<=end;w=add(w,7))mons.push(w);
    const ent=(cc,s)=>S.entries[cc+"_"+s];
    const fmtTs=t=>{if(!t)return"";const d=new Date(t);return ds(d)+" "+pad(d.getHours())+":"+pad(d.getMinutes())};

    const rk=wb.addWorksheet("Rekap",{views:[{state:"frozen",ySplit:4}]});
    rk.mergeCells("A1:J1");rk.getCell("A1").value="REKAP DAILY REPORT – ALL TEAM CREATIVE INDOGROUP";rk.getCell("A1").font={bold:true,size:14,color:{argb:IND}};
    rk.getCell("A2").value="Periode: "+periode;rk.getCell("A2").font={italic:true,color:{argb:"FF5B6176"}};
    rk.columns=[{width:24},{width:20},{width:18},{width:10},{width:14},{width:13},{width:12},{width:13},{width:14},{width:11}];
    rk.getRow(4).values=["Nama","Jabatan","Brand","Satuan","Target bulan*","Total konten","Capaian","Hari mengisi","Total lembur (jam)","Kendala"];head(rk.getRow(4));
    S.ccs.forEach((c,i)=>{let tot=0,hari=0,ot=0,kd=0;days.forEach(s=>{const e=ent(c.id,s);if(e){tot+=+e.videos||0;hari++;ot+=+e.lembur||0;if(e.kendala)kd++}});
      const tb=mons.reduce((a,w)=>a+tgt(c.id,w),0);
      const r=rk.getRow(5+i);r.values=[c.name,c.jabatan||"",c.brand||"",unit(c),tb,tot,tb?tot/tb:"",hari,ot,kd];r.getCell(7).numFmt="0%";
      r.eachCell({includeEmpty:true},x=>{x.border=box;x.alignment={vertical:"middle",wrapText:true}});if(i%2)fill(r,GREY)});
    const n=4+S.ccs.length,rt=rk.getRow(n+1);
    rt.values=["ALL TEAM","","","konten",{formula:`SUM(E5:E${n})`},{formula:`SUM(F5:F${n})`},{formula:`IF(E${n+1}=0,"",F${n+1}/E${n+1})`},"",{formula:`SUM(I5:I${n})`},{formula:`SUM(J5:J${n})`}];rt.getCell(7).numFmt="0%";
    rt.eachCell({includeEmpty:true},x=>{x.font={bold:true};x.border=box;x.fill={type:"pattern",pattern:"solid",fgColor:{argb:SOFT}}});
    rk.getCell("A"+(n+3)).value="* Target bulan = jumlah target mingguan yang diisi atasan untuk minggu-minggu di bulan ini";rk.getCell("A"+(n+3)).font={italic:true,size:9,color:{argb:"FF5B6176"}};

    const used=new Set(["Rekap","Raw Data"]);
    S.ccs.forEach(c=>{
      let nm=(c.name||"CC").replace(/[\\\/\?\*\[\]:]/g," ").slice(0,31).trim()||"CC";let k=2;while(used.has(nm))nm=nm.slice(0,28)+" "+(k++);used.add(nm);
      const des=isDes(c),u=unit(c);
      const cols=[["No",5],["Hari",9],["Tanggal",12],["Jumlah "+u,11],["Target harian",10],["Status",15]];
      if(des)cols.push(["Brand",16],["Jenis",14],["Desain campaign",26]);
      cols.push(["Tugas harian",46],["Link hasil kerja",42],["Kendala",28],["Solusi",28],["Lembur (jam)",10],["Diisi pada",16]);
      const ws=wb.addWorksheet(nm,{views:[{state:"frozen",ySplit:7,xSplit:3}]});
      ws.columns=cols.map(x=>({width:x[1]}));const L=cols.length;const colL=i=>String.fromCharCode(64+i);
      ws.mergeCells(`A1:${colL(L)}1`);ws.getCell("A1").value="DAILY REPORT – "+(c.name||"").toUpperCase();ws.getCell("A1").font={bold:true,size:14,color:{argb:IND}};
      [["Nama",c.name],["Jabatan",c.jabatan||"-"],["Brand",c.brand||(des?"Berganti tiap hari":"-")],["Periode",periode]].forEach((p,i)=>{
        const r=ws.getRow(2+i);r.getCell(1).value=p[0];r.getCell(1).font={bold:true,color:{argb:"FF5B6176"}};ws.mergeCells(2+i,2,2+i,3);r.getCell(2).value=p[1]});
      ws.getRow(7).values=cols.map(x=>x[0]);head(ws.getRow(7));
      const iLink=des?11:8,iKend=des?12:9;
      let row=8,no=0,wk=1,wTot=0,wOt=0,mTot=0,mOt=0;
      const subtotal=s=>{const t=tgt(c.id,monday(s));const r=ws.getRow(row++);const v=[];v[2]="Total minggu ke-"+wk;v[4]=wTot;v[5]=t||"";v[6]=t?(wTot>=t?"Tercapai":"Kurang "+(t-wTot)):"Target belum diisi";v[L-1]=wOt;r.values=v;
        ws.mergeCells(r.number,2,r.number,3);r.eachCell({includeEmpty:true},x=>{x.font={bold:true};x.border=box;x.fill={type:"pattern",pattern:"solid",fgColor:{argb:SUBT}}});
        r.getCell(6).font={bold:true,color:{argb:t&&wTot>=t?"FF2C7A4C":"FFB0332B"}};wk++;wTot=0;wOt=0};
      days.forEach(s=>{
        const d=pd(s),sun=d.getDay()===0,e=ent(c.id,s),dT=Math.round(tgt(c.id,monday(s))/6*10)/10;no++;
        const v=e?+e.videos||0:"";const st=e?(dT?(v>=dT?"Capai target":"Di bawah target"):"Terisi"):(sun?"Libur":"Belum diisi");
        const vals=[no,HARI[d.getDay()],d,v,sun||!dT?"":dT,st];
        if(des)vals.push(e?(e.brands||[]).join(", "):"",e?(e.jenis||[]).join(" + "):"",e?(e.campaign||[]).join(", "):"");
        vals.push(e?e.tugas||"":"",e?(e.links||[]).join("\n"):"",e?e.kendala||"":"",e?e.solusi||"":"",e?+e.lembur||0:"",e?fmtTs(e.updatedAt):"");
        const r=ws.getRow(row++);r.values=vals;r.getCell(3).numFmt="dd/mm/yyyy";
        r.eachCell({includeEmpty:true},x=>{x.border=box;x.alignment={vertical:"top",wrapText:true}});
        [1,4,5,L-1].forEach(i=>r.getCell(i).alignment={vertical:"top",horizontal:"center"});
        r.getCell(6).font={bold:true,color:{argb:st==="Capai target"?"FF2C7A4C":st==="Di bawah target"?"FFA36D0B":"FF8A8FA3"}};
        if(sun&&!e)fill(r,GREY);
        const li=(e&&e.links)||[];if(li.length===1){const lc=r.getCell(iLink);lc.value={text:li[0],hyperlink:li[0]};lc.font={color:{argb:"FF2E3D8F"},underline:true}}
        if(e&&e.kendala)r.getCell(iKend).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFBEFD6"}};
        if(e){wTot+=v;wOt+=+e.lembur||0;mTot+=v;mOt+=+e.lembur||0}
        if(sun||s===last)subtotal(s);
      });
      const r=ws.getRow(row+1);const v=[];v[2]="TOTAL "+periode.toUpperCase();v[4]=mTot;v[L-1]=mOt;r.values=v;ws.mergeCells(r.number,2,r.number,3);
      r.eachCell({includeEmpty:true},x=>{x.font={bold:true,color:{argb:"FFFFFFFF"}};x.fill={type:"pattern",pattern:"solid",fgColor:{argb:IND}};x.border=box});
      ws.autoFilter={from:{row:7,column:1},to:{row:7,column:L}};
      ws.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0};
    });

    const raw=wb.addWorksheet("Raw Data",{views:[{state:"frozen",ySplit:1}]});
    const rc=[["Tanggal",12],["Hari",9],["Nama",20],["Jabatan",18],["Jumlah",9],["Satuan",9],["Target minggu",11],["Brand",16],["Jenis",14],["Desain campaign",26],["Tugas harian",46],["Link",42],["Kendala",28],["Solusi",28],["Lembur (jam)",10],["Diisi pada",16]];
    raw.columns=rc.map(x=>({width:x[1]}));raw.getRow(1).values=rc.map(x=>x[0]);head(raw.getRow(1));
    const rows=Object.values(S.entries).filter(e=>e.date>=first&&e.date<=last&&ccById(e.cc)).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(ccById(a.cc).name>ccById(b.cc).name?1:-1));
    rows.forEach((e,i)=>{const c=ccById(e.cc);const r=raw.getRow(2+i);
      r.values=[pd(e.date),HARI[pd(e.date).getDay()],c.name,c.jabatan||"",+e.videos||0,unit(c),tgt(c.id,monday(e.date))||"",(e.brands||[]).join(", ")||c.brand||"",(e.jenis||[]).join(" + "),(e.campaign||[]).join(", "),e.tugas||"",(e.links||[]).join("\n"),e.kendala||"",e.solusi||"",+e.lembur||0,fmtTs(e.updatedAt)];
      r.getCell(1).numFmt="dd/mm/yyyy";r.eachCell({includeEmpty:true},x=>{x.border=box;x.alignment={vertical:"top",wrapText:true}})});
    raw.autoFilter={from:{row:1,column:1},to:{row:1,column:rc.length}};
    const buf=await wb.xlsx.writeBuffer();
    const url=URL.createObjectURL(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const a=document.createElement("a");a.href=url;a.download=`Daily Report Creative ${periode}.xlsx`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
    toast("File Excel diunduh");
  }catch(e){console.error(e);toast("Export gagal, coba lagi")}
  finally{btn.disabled=false;btn.textContent="Export Excel"}
}
$("exportBtn").addEventListener("click",exportXlsx);

/* ---------- data: ambil ulang tiap 30 detik ---------- */
async function refresh(){
  if(!TOKEN)return;
  const my=++S.seq;const{start,end}=range();
  let r;
  try{r=await api("load",{start,end})}
  catch(e){
    if(my!==S.seq)return;
    if(e.error==="not_member"){showGate("Akun belum terdaftar",`${e.email||S.email} belum ada di daftar tim. Minta atasan menambahkan Gmail ini di Pengaturan atasan (atau langsung di sheet "Anggota").`,false);return}
    if(e.error==="auth")return;
    if(!S.ready)showGate("Gagal memuat",e.error==="network"?"Periksa koneksi internet lalu muat ulang halaman.":"Server belum siap: "+(e.detail||e.error)+". Cek pengaturan Apps Script di panduan.",false);
    else{$("notice").hidden=false;$("notice").textContent="Koneksi ke Google Sheets terputus, mencoba lagi otomatis…"}
    return;
  }
  if(my!==S.seq)return;
  $("notice").hidden=true;
  S.email=r.email;S.isAdmin=!!r.isAdmin;S.sheetUrl=r.sheetUrl||"";$("sheetBtn").hidden=!S.sheetUrl;
  if(!S.teamDirty)S.ccs=(r.ccs||[]).map(c=>({...c}));
  const ent={};(r.entries||[]).forEach(e=>{ent[e.cc+"_"+e.date]=e});Object.assign(ent,S.pending);S.entries=ent;
  const tg={};(r.targets||[]).forEach(t=>{tg[t.cc+"_"+t.week]=t});Object.assign(tg,S.pendingT);S.targets=tg;
  const first=!S.ready;S.ready=true;
  if(first){if(!S.cc&&!S.isAdmin&&myCc())S.cc=myCc().id;if(!S.ccs.length&&S.isAdmin)$("setBox").open=true}
  $("userEmail").textContent=S.email;$("ctrls").hidden=false;
  $("gate").hidden=true;$("app").hidden=false;$("exportBtn").hidden=false;
  renderAll();
}
setInterval(()=>{if(document.visibilityState==="visible"&&S.ready&&!AUTO.flush)refresh()},POLL_MS);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.ready)refresh()});

/* ---------- login Gmail (Google Identity Services) ---------- */
function showGate(title,text,showLogin){
  $("gate").hidden=false;$("app").hidden=true;$("ctrls").hidden=!S.email;$("exportBtn").hidden=true;
  $("gateTitle").textContent=title;$("gateText").textContent=text;$("gateText").style.textAlign=text.includes("\n")?"left":"center";$("gbtn").hidden=!showLogin;
}
function parseJwt(t){try{const p=t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(decodeURIComponent(atob(p).split("").map(c=>"%"+("00"+c.charCodeAt(0).toString(16)).slice(-2)).join("")))}catch(e){return null}}
function setToken(t){
  const p=parseJwt(t);if(!p||!p.exp)return false;
  TOKEN=t;tokenExp=p.exp*1000;S.email=low(p.email);
  try{localStorage.setItem("idt",t)}catch(e){}
  return true;
}
function expireLogin(){
  TOKEN="";tokenExp=0;try{localStorage.removeItem("idt")}catch(e){}
  if(S.ready){S.ready=false;showGate("Sesi login habis","Klik tombol di bawah untuk masuk lagi. Isian yang sudah tersimpan tetap aman.",true)}
  else showGate("Masuk ke Daily Report","Gunakan akun Gmail yang sudah didaftarkan atasan.",true);
  if(window.google?.accounts?.id)google.accounts.id.prompt();
}
function logout(){
  TOKEN="";tokenExp=0;S.ready=false;S.email="";S.entries={};S.targets={};S.ccs=[];S.cc="";
  try{localStorage.removeItem("idt");localStorage.removeItem("cc")}catch(e){}
  if(window.google?.accounts?.id)google.accounts.id.disableAutoSelect();
  showGate("Masuk ke Daily Report","Gunakan akun Gmail yang sudah didaftarkan atasan.",true);
}
function resendPending(){
  Object.values(S.pending).forEach(b=>{const id=b.cc+"_"+b.date;qE[id]=(qE[id]||Promise.resolve()).then(()=>api("saveEntry",{entry:b})).then(()=>{if(S.pending[id]===b)delete S.pending[id]}).catch(()=>{})});
}
function onCredential(resp){
  const prev=S.email;
  if(!resp||!resp.credential||!setToken(resp.credential)){toast("Login gagal, coba lagi");return}
  if(prev&&prev!==S.email){S.pending={};S.pendingT={};S.cc=""}
  if(!S.ready)showGate("Memuat data…","Sebentar, sedang mengambil data tim dari Google Sheets.",false);
  resendPending();refresh();
}
// perpanjang login otomatis sebelum habis (token Google berlaku 1 jam)
setInterval(()=>{if(TOKEN&&tokenExp-Date.now()<10*60000&&window.google?.accounts?.id)google.accounts.id.prompt()},5*60000);
function initLogin(){
  const prob=configProblems();
  if(prob.length){showGate("Dashboard belum dihubungkan","Yang perlu diperbaiki di file config.js:\n• "+prob.join("\n• ")+"\n\nSetelah Commit di GitHub, tunggu 1–2 menit lalu muat ulang halaman.",false);return}
  google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:onCredential,auto_select:true,cancel_on_tap_outside:false,use_fedcm_for_prompt:true});
  google.accounts.id.renderButton($("gbtn"),{theme:"outline",size:"large",shape:"pill",text:"signin_with",locale:"id"});
  let saved="";try{saved=localStorage.getItem("idt")||""}catch(e){}
  if(saved&&setToken(saved)&&Date.now()<tokenExp-60000){showGate("Memuat data…","Sebentar, sedang mengambil data tim dari Google Sheets.",false);refresh();return}
  try{localStorage.removeItem("idt")}catch(e){}
  showGate("Masuk ke Daily Report","Gunakan akun Gmail yang sudah didaftarkan atasan.",true);
  google.accounts.id.prompt();
}
(function waitGsi(n){
  if(window.google?.accounts?.id)initLogin();
  else if(n>100)showGate("Gagal memuat login Google","Periksa koneksi internet lalu muat ulang halaman.",false);
  else setTimeout(()=>waitGsi(n+1),100);
})(0);
