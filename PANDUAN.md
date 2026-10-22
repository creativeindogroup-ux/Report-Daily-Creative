# Panduan — Daily Report Creative (GitHub + Google Sheets)

## Update ke versi 2 (lakukan sekali, ± 5 menit)

Versi 2 berisi:
- **7 brand**: OLV, KNG, 77, MTR, IDN, RS, TKS.
- **Report terpisah per brand.** Satu orang bisa memegang beberapa brand.
- **Jabatan Admin** dengan jumlah upload per platform: Facebook, YouTube, dan Shopee.
- **Login Gmail cukup sekali**, setelah itu perangkat diingat 90 hari.
- **Google Sheets lebih rapi:** satu tab per orang, urut tanggal, link bisa diklik, dan tab gabungan *Semua Report*.
- **Foto profil** setiap orang.
- **Tampilan baru.**

### A. Tampilan website (GitHub)
File `index.html`, `style.css`, `app.js`, `Code.gs`, dan `PANDUAN.md` sudah diperbarui di repository. Kalau belum, upload file-file itu lewat **Add file → Upload files → Commit changes**. File `config.js` **tidak perlu diubah**.

### B. Google Sheets (wajib, karena struktur data berubah)
1. Buka Google Sheet **Daily Report Creative**, lalu klik **Extensions → Apps Script**.
2. Klik di dalam kode, tekan **Ctrl + A**, lalu **Delete** untuk menghapus kode lama.
3. Buka file **`Code.gs`** di repository GitHub, klik ikon **Copy raw file**, lalu tempel ke editor Apps Script.
4. Periksa bagian paling atas kode:
   - `ADMIN_EMAILS` berisi Gmail atasan.
   - `GOOGLE_CLIENT_ID` sama dengan isi `config.js`. Keduanya sudah terisi, cukup dicek.
5. Klik 💾 **Save**.
6. Di kotak pilihan fungsi di toolbar, pilih **`setupAwal`**, lalu klik **▶ Run**.
   - Google akan meminta izin baru: **Google Drive** (untuk menyimpan foto) dan **jadwal otomatis** (untuk merapikan sheet tiap 5 menit).
   - Klik **Review permissions → pilih Gmail → Advanced → Go to … (unsafe) → Allow**.
7. Klik **Deploy → Manage deployments**, lalu ikon ✏️ (Edit) pada deployment yang ada.
   - Di **Version**, pilih **New version**, lalu klik **Deploy**.
   - Link Web App **tetap sama**, jadi `config.js` tidak perlu diubah.

Setelah `setupAwal` dijalankan, data lama otomatis dipindahkan:
- report lama masuk ke brand yang tercatat, atau ke brand pertama orang tersebut;
- sheet lama disembunyikan dengan nama "(lama)" sebagai cadangan.

### C. Atur tim di dashboard (atasan)
1. Buka website dan login Gmail **sekali**. Perangkat akan diingat selama 90 hari.
2. Buka **Pengaturan atasan** di bagian bawah. Untuk setiap orang:
   - pilih **Jabatan**: Content Creator, Desain Grafis, atau Admin;
   - klik **brand yang dipegang**, boleh lebih dari satu.
3. Isi **target mingguan per brand** di kartu setiap orang pada *Rekap report per nama*, atau di form harian orang tersebut.
4. Tambahkan **foto**: buka halaman orang tersebut, lalu klik **Tambah foto** di pojok foto. Setiap orang juga bisa mengganti fotonya sendiri.

### Susunan Google Sheet versi 2
| Tab | Isi |
|---|---|
| **Anggota** | Daftar tim: ID, nama, jabatan, brand (dipisah koma), Gmail. Boleh diedit langsung. |
| **Target** | Target per orang, per brand, per minggu (Senin). |
| **Semua Report** | Semua isian dikelompokkan per nama, urut tanggal, link bisa diklik. Dirapikan otomatis tiap 5 menit. |
| **(nama orang)** | Satu tab per orang: urut tanggal, dikelompokkan per bulan, link bisa diklik. Diperbarui setiap kali orang itu menyimpan report. |
| _data, _foto | Database dashboard (tersembunyi). **Jangan diubah manual.** |

Menu **Daily Report** di toolbar Google Sheet berisi:
- **Rapikan semua sheet sekarang**
- **Keluarkan semua perangkat**: semua orang wajib login Gmail lagi, misalnya kalau ada HP yang hilang.

---

## Pemasangan dari awal (untuk referensi)

Panduan ini untuk pemula. Ikuti langkah 1 sampai 6 secara berurutan. Total waktu sekitar **20–30 menit**, dan cukup dilakukan **sekali saja**.

**Cara kerjanya:**
- **GitHub** menyimpan tampilan dashboard dan memberi alamat website.
- **Google Sheets** menyimpan semua isian tim. Anda bisa membukanya kapan saja seperti spreadsheet biasa.
- **Login Gmail**: setiap anggota masuk dengan Gmail-nya dan hanya bisa mengisi report miliknya sendiri.

**Siapkan:**
- Gmail atasan. Gunakan Gmail yang sama di semua langkah.
- Laptop/PC dengan browser Chrome.
- File dari repository ini: `index.html`, `style.css`, `app.js`, `config.js`, `privacy.html`, `Code.gs`, `PANDUAN.md`.

> **Tips:** buka catatan kosong (Notepad atau Google Keep) untuk menyimpan 3 hal yang akan Anda dapat di tengah jalan:
> 1. **Alamat website** (Langkah 1)
> 2. **Client ID** (Langkah 2)
> 3. **Link Web App** (Langkah 3)

---

## Langkah 1 — Upload ke GitHub dan dapatkan alamat website

1. Buka **github.com**. Kalau belum punya akun, klik **Sign up** dan daftar dengan Gmail.
2. Setelah login, klik tombol **+** di kanan atas, lalu pilih **New repository**.
3. Isi **Repository name**: `daily-report-creative`.
   Pilih **Public**, lalu klik **Create repository**.
4. Di halaman berikutnya, klik tulisan biru **uploading an existing file**.
5. Seret semua file ke kotak upload. File `Code.gs` ikut disimpan di GitHub sebagai cadangan, tetapi yang dipakai adalah salinannya di Apps Script (Langkah 3).
6. Gulir ke bawah, lalu klik tombol hijau **Commit changes**.
7. Klik tab **Settings** (ikon roda gigi di bagian atas repository), lalu pilih menu **Pages** di sebelah kiri.
8. Di bagian *Build and deployment*:
   - **Source**: Deploy from a branch
   - **Branch**: pilih `main`, folder `/ (root)`, lalu klik **Save**.
9. Tunggu 1–2 menit, lalu refresh halaman. Di bagian atas akan muncul:
   *Your site is live at* **https://namaakun.github.io/daily-report-creative/**

   ✍️ **Catat alamat ini.** Untuk langkah berikutnya, yang dipakai hanya bagian awalnya: `https://namaakun.github.io`

---

## Langkah 2 — Buat "Client ID" untuk login Gmail

Langkah ini memberi izin agar website Anda boleh memakai tombol *Masuk dengan Google*.

1. Buka **console.cloud.google.com**, login dengan Gmail atasan. Kalau diminta, setujui Terms of Service.
2. Di bagian atas, klik kotak pemilih project (tulisannya *Select a project*), lalu klik **New Project**.
   Beri nama `daily-report-creative`, lalu klik **Create**. Tunggu sebentar, lalu pastikan project itu sudah terpilih di bagian atas.
3. Klik menu ☰ di kiri atas, lalu pilih **APIs & Services → OAuth consent screen**.
   Di beberapa akun menu ini bernama **Google Auth Platform**.
   - Klik **Get started**.
   - **App name**: `Daily Report Creative`. **User support email**: pilih Gmail Anda. Klik **Next**.
   - **Audience**: pilih **External**. Klik **Next**.
   - **Contact information**: isi Gmail Anda. Klik **Next**.
   - Centang persetujuan, lalu klik **Continue** dan **Create**.
4. Masih di menu yang sama, klik **Audience** di kiri, lalu klik **Publish app → Confirm**.
   *Langkah ini penting.* Tanpa ini, hanya akun yang didaftarkan manual yang bisa login.

   **Kalau tombol *Publish app* abu-abu** dan muncul tulisan *"To publish your app, you must complete your configuration on the Branding page"*, pilih salah satu cara berikut.

   **Cara A — Lengkapi Branding lalu Publish (disarankan, cukup sekali)**
   1. Pastikan file `privacy.html` sudah diupload ke GitHub bersama file lainnya.
      Cek dengan membuka `https://namaakun.github.io/daily-report-creative/privacy.html`; halamannya harus muncul.
   2. Klik **Branding** di menu kiri, lalu isi:
      - **App name**: `Daily Report Creative`
      - **User support email**: Gmail Anda
      - **App logo**: **kosongkan.** Kalau diisi, Google akan meminta verifikasi yang lama.
      - **Application home page**: `https://namaakun.github.io/daily-report-creative/`
      - **Application privacy policy link**: `https://namaakun.github.io/daily-report-creative/privacy.html`
      - **Application terms of service link**: boleh dikosongkan.
      - **Authorized domains**: klik **+ Add domain**, lalu isi `namaakun.github.io`
      - **Developer contact information**: Gmail Anda
   3. Klik **Save** di bagian paling bawah.
   4. Kembali ke **Audience**. Tombol **Publish app** sekarang bisa diklik. Klik **Publish app → Confirm**.
   5. Status berubah menjadi **In production**. Kalau muncul tulisan *needs verification*, abaikan saja. Untuk login yang hanya membaca email, aplikasi tetap bisa dipakai siapa pun tanpa menunggu verifikasi.

   **Cara B — Tetap "Testing", daftarkan Gmail tim satu per satu (paling cepat)**
   1. Di halaman **Audience**, gulir ke bagian **Test users**, lalu klik **+ Add users**.
   2. Masukkan Gmail atasan dan semua anggota tim (maksimal 100), lalu klik **Save**.
   3. Selesai. Hanya Gmail di daftar ini yang bisa login. Setiap ada anggota baru, ulangi langkah ini selain menambahkannya di dashboard.
5. Klik **Clients** di kiri (di tampilan lama: **Credentials → + Create credentials → OAuth client ID**).
   - Klik **+ Create client**.
   - **Application type**: **Web application**.
   - **Name**: `dashboard`.
   - Di **Authorized JavaScript origins**, klik **+ Add URI** lalu isi alamat dari Langkah 1 **tanpa nama repository dan tanpa garis miring di akhir**:
     `https://namaakun.github.io`
   - Klik **Create**.
6. Akan muncul **Client ID** dengan bentuk seperti `123456789012-abc123xyz.apps.googleusercontent.com`.

   ✍️ **Salin dan catat Client ID ini.** Bagian *Client secret* tidak dipakai.

---

## Langkah 3 — Siapkan Google Sheets sebagai database

1. Buka **sheets.new** untuk membuat spreadsheet baru, lalu beri nama `Daily Report Creative` (klik judul di kiri atas).
2. Di menu atas spreadsheet, klik **Extensions → Apps Script**. Tab baru akan terbuka.
3. Di editor Apps Script, **hapus semua tulisan** yang ada (`function myFunction() {...}`).
4. Buka file `Code.gs` di repository GitHub, klik ikon **Copy raw file** (dua kotak bertumpuk), lalu tempel ke editor.
5. Di bagian paling atas kode, isi 2 pengaturan:
   ```js
   const ADMIN_EMAILS = [
     "gmailatasan@gmail.com"
   ];
   const GOOGLE_CLIENT_ID = "123456789012-abc123xyz.apps.googleusercontent.com";
   ```
   Gunakan Gmail atasan dan Client ID dari Langkah 2. Pastikan tetap ada tanda kutip `"…"`.
   Kalau atasannya lebih dari satu: `"atasan1@gmail.com", "atasan2@gmail.com"`.
6. Klik ikon 💾 **Save** (atau tekan Ctrl+S).
7. **Jalankan setup sekali:**
   - Di toolbar atas editor ada kotak pilihan nama fungsi. Pilih **`setupAwal`**, lalu klik **▶ Run**.
   - Muncul *Authorization required*. Klik **Review permissions** lalu pilih Gmail Anda.
   - Muncul peringatan *Google hasn't verified this app*. Ini normal, karena script ini buatan Anda sendiri.
     Klik **Advanced**, lalu **Go to Daily Report (unsafe)**, lalu **Allow**.
   - Kembali ke tab spreadsheet. Akan ada 3 sheet baru: **Anggota**, **Target Mingguan**, dan **Report Harian**.
8. **Terbitkan sebagai Web App:**
   - Di editor Apps Script, klik tombol biru **Deploy → New deployment**.
   - Klik ikon ⚙️ di sebelah *Select type*, lalu pilih **Web app**.
   - **Description**: `dashboard`.
   - **Execute as**: **Me (gmail Anda)**.
   - **Who has access**: **Anyone**.
   - Klik **Deploy**. Kalau diminta izin lagi, ulangi proses *Advanced → Allow*.
9. Akan muncul **Web app URL** dengan bentuk seperti `https://script.google.com/macros/s/AKfy.../exec`.

   ✍️ **Salin dan catat link ini.**

> Pilihan "Anyone" tidak membuat data bisa dibaca orang lain. Script tetap memeriksa login Gmail dan hanya melayani Gmail yang terdaftar di sheet **Anggota** atau di `ADMIN_EMAILS`.

---

## Langkah 4 — Hubungkan website ke Google Sheets

1. Kembali ke repository GitHub Anda, lalu klik file **`config.js`**.
2. Klik ikon ✏️ (Edit) di kanan atas isi file.
3. Ganti dua baris berikut:
   ```js
   export const SCRIPT_URL = "https://script.google.com/macros/s/AKfy.../exec";
   export const GOOGLE_CLIENT_ID = "123456789012-abc123xyz.apps.googleusercontent.com";
   ```
   Isi `SCRIPT_URL` dengan link dari Langkah 3, dan `GOOGLE_CLIENT_ID` dengan Client ID dari Langkah 2.
4. Klik **Commit changes…**, lalu **Commit changes** lagi.
5. Tunggu 1–2 menit sampai GitHub memperbarui website.

---

## Langkah 5 — Coba login dan daftarkan tim

1. Buka alamat website dari Langkah 1.
2. Klik **Masuk dengan Google**, lalu pilih Gmail atasan.
3. Di bagian bawah dashboard, buka **Pengaturan atasan: anggota tim**. Untuk setiap anggota isi **Nama**, **Jabatan**, **Brand**, dan **Gmail**, lalu klik **Tambah**.
   - Jabatan yang mengandung kata *Desain* atau *Graphic* otomatis memakai form desain grafis.
   - Daftar ini juga bisa diisi langsung di sheet **Anggota** di Google Sheets.
     Kolom **ID** cukup diisi nama pendek tanpa spasi, misalnya `monik`.
4. Di beranda (**All Creative**), isi **target mingguan** setiap nama di tabel *Rekap report per nama*, pada kolom angka setelah tanda `/`.
5. Tombol **Buka Google Sheets** di bagian atas (hanya terlihat oleh atasan) langsung membuka spreadsheet datanya.

## Langkah 6 — Bagikan ke tim

Kirim alamat website ke grup tim. Setiap anggota cukup:
1. Membuka link.
2. Klik **Masuk dengan Google** memakai Gmail yang sudah didaftarkan atasan.
3. Dashboard otomatis membuka form miliknya. Klik tanggal, lalu isi report. Isian **tersimpan otomatis**.

Data semua orang diperbarui otomatis **setiap ±30 detik** di layar masing-masing.

---

## Kalau ada masalah

| Yang muncul | Penyebab & solusi |
|---|---|
| *Dashboard belum dihubungkan* | `config.js` belum diisi atau masih ada tulisan `GANTI`. Ulangi Langkah 4. |
| Tombol Google tidak muncul / *Error 400: origin_mismatch* | Alamat di Langkah 2 nomor 5 salah. Isi harus persis `https://namaakun.github.io`, tanpa `/` di akhir dan tanpa nama repository. Setelah diubah, tunggu ±5 menit. |
| *Akun belum terdaftar* | Gmail tersebut belum ada di sheet **Anggota** (atau salah ketik). Atasan menambahkannya di Pengaturan atasan. |
| *Server belum siap: wrong_client* | `GOOGLE_CLIENT_ID` di `Code.gs` berbeda dengan di `config.js`. Samakan, simpan, lalu lakukan **Deploy ulang** (lihat bawah). |
| *Respon bukan JSON* | Saat Deploy, *Who has access* belum diset ke **Anyone**, atau link yang disalin bukan yang berakhiran `/exec`. |
| *Sesi login sudah berakhir* | Perangkat diingat 90 hari. Setelah itu, atau kalau atasan menjalankan menu *Keluarkan semua perangkat*, cukup login Gmail sekali lagi. |
| Hanya akun tertentu yang bisa login / *Error 403: access_denied* | Aplikasi masih berstatus **Testing**. Pakai Cara A di Langkah 2 nomor 4 (Publish), atau tambahkan Gmail tersebut ke **Test users** (Cara B). |

### Mengubah `Code.gs` di kemudian hari (misalnya ganti Gmail atasan)

1. Ubah kode di editor Apps Script, lalu klik **Save**.
2. Klik **Deploy → Manage deployments**, klik ✏️ pada deployment yang ada.
3. Di **Version**, pilih **New version**, lalu klik **Deploy**.

Link Web App tetap sama, jadi `config.js` tidak perlu diubah.

### Mengubah tampilan dashboard

Edit file di GitHub (ikon ✏️), lalu **Commit**. Website ter-update dalam 1–2 menit, dan data di Google Sheets tidak terpengaruh.

### Biaya & batas

Semuanya **gratis**. Batas harian Google Apps Script untuk akun Gmail biasa jauh di atas kebutuhan tim 10–30 orang yang mengisi report setiap hari.
