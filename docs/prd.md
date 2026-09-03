# PRD — Azkasir Rebuild (Aplikasi POS / Kasir)

> Versi: 1.1 · Tanggal: 2026-09-02 · Status: Draft
> Referensi: aplikasi lama `azkasir` (CodeIgniter 3 + jQuery + Bootstrap 3, DB `az_kasir`)
> Basis stack: boilerplate `supertools` (`the supertools boilerplate`) — SvelteKit 2 + Svelte 5 + PocketBase

---

## 1. Ringkasan

Azkasir adalah aplikasi Point-of-Sale (POS) web-based untuk toko ritel kecil–menengah di Indonesia. Rebuild ini bertujuan menggantikan aplikasi lama (CodeIgniter 3, UI jQuery/Bootstrap 3, password MD5, logika stok di DB trigger) dengan arsitektur modern yang lebih aman, lebih cepat, dan siap dikembangkan ke multi-outlet.

**Prinsip rebuild:**
1. **Parity dulu** — semua fitur lama harus jalan di fase pertama, tanpa kehilangan data historis.
2. **Fix fundamental** — keamanan (hash password, CSRF, validasi), integritas stok (ledger di application layer, bukan DB trigger), uang pakai desimal yang benar.
3. **Jangan over-engineer** — single-store dulu, tapi skema DB disiapkan untuk multi-outlet.

---

## 2. Masalah dengan Aplikasi Lama

| # | Masalah | Dampak |
|---|---------|--------|
| 1 | Password MD5 tanpa salt | Kredensial mudah di-crack (di dump DB sudah terlihat plaintext: `password`, `123`) |
| 2 | Logika stok di DB trigger (`insert/update/delete_product_stock`) | Sulit di-debug, tidak bisa dites, rapuh saat migrasi |
| 3 | Stok produk saat penjualan tidak dikurangi (cek stok di-disable, `$check_stock = TRUE`) | Stok tidak akurat; selisih hanya ketutup manual via stock in/out |
| 4 | Query raw dengan string concatenation (`add_where("... = '".$var."'")`) | Rentan SQL injection di beberapa endpoint |
| 5 | Uang disimpan sebagai `bigint` di beberapa tabel, `int` di tabel lain | Inkonsisten; berisiko kalau nanti butuh desimal |
| 6 | Tidak ada audit trail | Transaksi bisa diedit/dihapus tanpa jejak (kasir bisa hapus nota admin) |
| 7 | UI jQuery + Bootstrap 3, full page reload di banyak aksi | Lambat, tidak mobile-friendly, sulit dikembangkan |
| 8 | Tidak ada metode pembayaran non-tunai | Tidak bisa QRIS/debit/e-wallet |
| 9 | Wajib XAMPP lokal, tidak ada backup otomatis | Risiko kehilangan data |
| 10 | Cart "PROCESS" dibersihkan dengan DELETE saat halaman dibuka | Data transaksi hangus jika browser crash |

---

## 3. Pengguna & Peran

| Peran | Deskripsi | Hak akses |
|-------|-----------|-----------|
| **Administrator / Owner** | Pemilik toko / manajer | Semua modul: laporan laba-rugi (omzet, modal, untung), kelola user, setting toko, edit/hapus semua transaksi |
| **Kasir** | Operator kasir | Dashboard ringkas, transaksi penjualan, lihat & cetak nota miliknya sendiri, stok in/out (opsional) |

---

## 4. Fitur (Functional Requirements)

### F1 — Autentikasi & Manajemen User
- F1.1 Login username + password (bcrypt/argon2), rate-limit percobaan gagal.
- F1.2 Session-based auth dengan CSRF protection.
- F1.3 CRUD user (admin): username, nama, grup/role, aktif/nonaktif.
- F1.4 Ganti password sendiri (verifikasi password lama).
- F1.5 Soft-delete user (jaga integritas data transaksi historis).
- *Baru:* reset password oleh admin, log login terakhir.

### F2 — Dashboard
- F2.1 Kartu ringkasan: total penjualan hari ini, jumlah transaksi hari ini (kasir hanya lihat miliknya).
- F2.2 Kartu transaksi terakhir: kode nota, total, qty, waktu.
- F2.3 Widget stok menipis (ambang bisa dikonfigurasi, default < 10).
- F2.4 Grafik penjualan per bulan & produk terlaris (interaktif, bukan jpgraph).
- *Baru:* filter rentang tanggal, top produk, ringkasan laba kotor (admin).

### F3 — Master Produk
- F3.1 CRUD produk: barcode (unik, auto-generate dengan prefix dari setting), nama, kategori, satuan, harga jual, harga modal, harga grosir, stok, deskripsi, foto.
- F3.2 Pencarian cepat by nama/barcode (untuk dipakai di POS).
- F3.3 Cetak label barcode (pilih produk → cetak strip barcode).
- F3.4 Import/export CSV & Excel (produk baru + update by barcode).
- F3.5 CRUD kategori produk & satuan produk.
- F3.6 CRUD customer: nama, gender, alamat, telepon + **harga khusus per customer per produk** (`customer_price`).
- F3.7 CRUD supplier: nama, alamat, telepon, deskripsi.

### F4 — Manajemen Stok
- F4.1 Stok masuk (pembelian/retur): pilih produk, qty, supplier, catatan → stok bertambah.
- F4.2 Stok keluar (rusak/hilang/koreksi): pilih produk, qty, alasan → stok berkurang.
- F4.3 **Stock card / buku besar stok**: semua pergerakan (masuk, keluar, penjualan) sebagai ledger `stock_movements` — satu sumber kebenaran; saldo stok dihitung/di-update di **application layer dalam DB transaction**, bukan trigger.
- F4.4 Setiap penjualan yang dibayar **wajib** mengurangi stok dan mencatat movement `sale` (memperbaiki bug #3).
- F4.5 Validasi stok tidak boleh minus (konfigurabel: block atau warning).
- F4.6 Laporan stok masuk/keluar dengan filter tanggal, produk, supplier.

### F5 — Transaksi Penjualan (POS) — *inti aplikasi*
- F5.1 Layar kasir: scan barcode → item masuk keranjang; cari produk manual; qty; harga satuan (jual/grosir bisa dipilih, harga khusus customer otomatis terpakai).
- F5.2 Edit item di keranjang: harga, qty, diskon per item. Hapus item.
- F5.3 Hold / tahan transaksi (status PENDING) — bisa dipanggil lagi, tidak hilang saat browser refresh (disimpan server-side per kasir + sesi).
- F5.4 Pembayaran: pilih customer (opsional), diskon transaksi, uang diterima → kembalian dihitung otomatis.
- F5.5 Metode pembayaran: **tunai** (fase 1), **QRIS / debit / e-wallet** (fase 2 — dicatat sebagai referensi, tanpa integrasi payment gateway dulu).
- F5.6 Kode nota: `{prefix}{YYMMDD}{random}` (contoh `AZPJ260902A1B2C3`), unik.
- F5.7 Cetak struk Thermal 58/80mm via print CSS (layout sama dengan `v_print_al` lama: nama toko, alamat, telp, item, qty, harga, diskon, total, bayar, kembalian, kasir). Cetak ulang nota dari riwayat.
- F5.8 Transaksi menyimpan harga modal saat jual (snapshot) agar laporan laba tidak berubah saat harga modal produk diedit.
- *Baru:* keyboard shortcut POS (F2 cari, F4 bayar, Esc batal), mode fullscreen, responsif untuk tablet.

### F6 — Riwayat & Laporan
- F6.1 Daftar transaksi (admin: semua; kasir: miliknya) dengan filter: rentang tanggal, customer, kasir. Detail item expandable di baris.
- F6.2 Ringkasan periode terpilih: omzet (`total_final_price`), total modal, **laba kotor** (omzet − modal).
- F6.3 Edit transaksi (buka lagi di layar kasir) — hanya admin, tercatat di audit log.
- F6.4 Hapus transaksi (admin) — soft, tercatat di audit log, stok dikembalikan.
- F6.5 Laporan stok in/out.
- *Baru (fase 2):* laporan per kasir (shift), rekap harian PDF, laporan laba per produk/kategori.

### F7 — Pengaturan
- F7.1 Info toko: nama, alamat/deskripsi, telepon (muncul di struk).
- F7.2 Prefix nota & prefix barcode.
- F7.3 Bahasa: Indonesia / English.
- *Baru:* ambang stok menipis, pajak/service charge (opsional, default off), footer struk, logo toko.

### F8 — Audit & Keamanan
- F8.1 Audit log: create/update/delete pada transaksi, produk, user, setting (siapa, kapan, data lama→baru).
- F8.2 Semua endpoint tervalidasi (Form Request), authorize per role.
- F8.3 Password hashing modern, session secure.

---

## 5. Non-Functional Requirements

| Kategori | Kriteria |
|----------|----------|
| Performa | Scan barcode → item tampil < 200 ms. Load halaman < 1 s di jaringan lokal. |
| Deployment | Bisa jalan offline di toko (PocketBase + SvelteKit node di 1 mini PC / server LAN) ATAU di VPS — tanpa dependensi cloud wajib. |
| Data | Backup DB otomatis harian. Migrasi data dari `az_kasir` lama (user, produk, kategori, satuan, customer, supplier, stok, transaksi historis). |
| Keamanan | bcrypt, CSRF, validasi server-side semua input, role middleware. |
| Kompatibilitas printer | Struk via browser print dialog (thermal 58mm/80mm & A4 inkjet), tanpa driver khusus. |
| Browser | Chrome/Edge terbaru (target utama), layout tablet 10". |
| i18n | Indonesia default, English tersedia. |
| Rupiah | Simpan sebagai `decimal(14,2)` (atau integer sen bila perlu), format separator ribuan Indonesia. |

---

## 6. Tech Stack

> Keputusan: rebuild memakai **stack yang sama dengan boilerplate `supertools`** (`the supertools boilerplate`), dan app POS dibangun **di atas template tersebut** — dashboard shell, sidebar, auth PocketBase, dan i18n-nya sudah jadi, tinggal tambah modul POS.

### Stack final

| Layer | Pilihan | Alasan |
|-------|---------|--------|
| **Framework** | **SvelteKit 2 + Svelte 5 (runes) + TypeScript** | Sesuai template; UX SPA-like untuk layar kasir (tanpa full page reload), server logic + UI dalam satu project. |
| **Runtime & package manager** | **Bun** (`bun install`, `bun run dev`, `bun test`) | Konsisten dengan template; cepat. |
| **Styling & UI** | **Tailwind CSS v4 + shadcn-svelte (bits-ui)** | Komponen dashboard (sidebar, sheet, card, dropdown, tooltip) sudah ada di template; basis warna zinc + dark mode siap pakai. |
| **Auth** | **PocketBase** (`users` collection, `auth-with-password`) + session cookie httpOnly `nekotools_session` | Pola `src/lib/server/auth.ts` di template sudah berfungsi: login, verify JWT, refresh, update profile, guard di `hooks.server.ts`. Password hashing aman (bcrypt) ditangani PocketBase. |
| **Database** | **PocketBase (SQLite)** sebagai DB + file storage | Satu binary Go: DB, auth, storage, realtime, admin UI. Deploy di VPS maupun mini PC toko gampang; backup = copy satu file SQLite. API rules per-collection untuk authorize role. |
| **Logika bisnis** | Service layer `$lib/server/*.ts` (SvelteKit server) + **PocketBase Batch API** untuk tulisan atomik | Checkout (transaksi + items + stock movements + totals) = satu batch transactional. Konsisten dengan pola template (`$lib/server/finance-report.ts` dkk). |
| **i18n** | **Paraglide JS (inlang)** — locale `id` (default) & `en` | Sudah terpasang di template; pengganti `app_lang.php` app lama. |
| **Cetak struk** | Print CSS (`@media print`) + browser print, layout thermal 58/80mm | Tanpa dependensi; ESC/POS direct (QZ Tray / node-escpos) = fase lanjutan opsional. |
| **Barcode** | **JsBarcode** / **bwip-js** (render SVG client-side) + scanner USB keyboard-wedge | Scanner standar "ketik + enter", tidak butuh integrasi khusus. |
| **Grafik dashboard** | **LayerChart** (Svelte 5) — alternatif: Chart.js | Native Svelte, ringan. |
| **Import/Export** | **SheetJS (`xlsx`)** di server action (CSV/XLSX) | Pengganti AZPHPExcel. |
| **Realtime (bonus)** | PocketBase Realtime Subscriptions (SSE) | Stok & transaksi ter-update otomatis di semua layar tanpa polling. |
| **Deploy** | `adapter-node` (atau adapter-auto) + PocketBase binary, dijalankan bare-metal/Docker di VPS atau mini PC toko | Template sudah jalan dengan domain custom; POS LAN = server & kasir satu jaringan. |
| **Testing** | **bun test** (unit — kalkulasi cart/stok/uang) + Playwright (e2e alur kasir) | Mencegah regresi logika uang & stok. |

### Catatan penting stack

- **Uang = integer rupiah** (IDR praktis tanpa sen). JavaScript number aman sampai 2^53 (≈ 9 quadriliun rupiah) — cukup; hindari float desimal untuk harga.
- **Stok tanpa trigger DB.** Semua perubahan stok lewat satu service (`stock.ts`: `recordMovement()`) yang selalu dipanggil dalam batch transaksional — pengganti trigger `product_stock` di app lama.
- **Atomicity:** PocketBase punya `/api/batch` (transactional). Kalau versi PocketBase yang dipakai belum stabil batch-nya, fallback: `pb_hooks` (JSVM) atau validasi + reconcile job.

### Alternatif yang dipertimbangkan

| Opsi | Kelebihan | Kekurangan | Keputusan |
|------|-----------|------------|-----------|
| **Laravel 11 + Inertia + React** | Ekosistem matang, admin panel cepat | Beda bahasa/ekosistem dari boilerplate yang sudah dimiliki & dikuasai; deploy lebih berat | Skip — tidak reuse `supertools` |
| **Next.js + Supabase** | Populer, managed Postgres | Cloud-first, self-host di toko lebih ribet; 2 service (DB + auth + storage) terpisah | Skip |
| **TALL stack** | Minim JS | POS butuh interaktivitas tinggi; clunky di Livewire | Skip |
| **Uni-app / Flutter** | Offline-first native | Dev cost tinggi, cetak & scanner ribet | Fase jauh (mobile kasir) |

> **Catatan offline-first:** fase 1 tetap butuh server aktif (LAN lokal di toko cukup — PocketBase + SvelteKit node jalan bare-metal di mini PC, tanpa Docker sekalipun). PWA + sync offline = fase lanjutan, jangan dibawa ke MVP.

---

## 7. Arsitektur

```
┌───────────────────────────────────────────────┐
│  Browser (Kasir / Admin)                      │
│  SvelteKit + Svelte 5 + shadcn-svelte         │
└──────────────┬────────────────────────────────┘
               │ HTTP(S)
┌──────────────▼────────────────────────────────┐
│  SvelteKit server (adapter-node, Bun/Node)    │
│  ├─ hooks.server.ts: guard auth + i18n        │
│  ├─ +page.server.ts / form actions            │
│  ├─ $lib/server/ services:                    │
│  │    auth.ts (PocketBase JWT session)        │
│  │    pos.ts (cart → checkout atomik)         │
│  │    stock.ts (stock movements ledger)       │
│  │    report.ts, product.ts, master.ts        │
│  └─ Audit log via helper di setiap service    │
└──────────────┬────────────────────────────────┘
               │ PocketBase SDK / REST
        ┌──────▼────────────┐
        │  PocketBase       │
        │  ├─ SQLite (data) │
        │  ├─ Auth (users)  │
        │  ├─ API rules     │
        │  ├─ Realtime SSE  │
        │  └─ File storage  │
        └───────────────────┘
```

Aturan penting:
- **Semua akses DB dari SvelteKit server saja** (bukan dari browser langsung ke PocketBase) — API rules PocketBase diset ketat sebagai lapisan pertahanan kedua.
- **Semua perubahan stok** lewat `stock.ts::recordMovement()` dalam batch transaksional — tidak ada trigger DB.
- **Semua perubahan uang/qty** lewat `pos.ts` (cart → checkout atomic: buat transaksi + items + movements + totals dalam 1 batch).
- Harga modal & nama produk di-*snapshot* ke baris transaksi saat checkout.
- Role: field `role` (`admin` | `kasir`) di collection `users`; authorize di server service + API rules.

---

## 8. Data Model (PocketBase Collections)

Semua collection punya `id` (15 char), `created`, `updated` otomatis dari PocketBase. Uang = integer rupiah.

```
users             (email, name, role: select[admin,kasir], is_active: bool, avatar: file)
                  -- auth bawaan PocketBase (password bcrypt)

product_categories (name)
product_units      (name)
products           (category: →product_categories, unit: →product_units,
                    barcode TEXT unique, name,
                    sell_price NUM, cost_price NUM, wholesale_price NUM>0=schema kosong berarti null,
                    stock NUM, min_stock NUM default 10, photo: file, description)
customers          (name, gender: select, address, phone)
customer_prices    (customer: →customers cascade, product: →products cascade, price NUM)
suppliers          (name, address, phone, description)

transactions       (code TEXT unique, user: →users, customer: →customers =null, outlet: =null (disiapkan),
                    transaction_date DATE,
                    total_gross NUM, total_discount NUM, total_final NUM,
                    paid_amount NUM, change_amount NUM,
                    payment_method: select[cash,qris,debit,ewallet], payment_reference TEXT =null,
                    status: select[completed,voided,pending], note)
transaction_items  (transaction: →transactions cascade, product: →products,
                    product_name TEXT,                -- snapshot
                    qty NUM, sell_price NUM, cost_price NUM,  -- snapshot harga
                    discount NUM, final_price NUM)
stock_movements    (product: →products, transaction: →transactions =null,
                    user: →users, supplier: →suppliers =null,
                    moved_at DATE,
                    type: select[in,out,sale,sale_void,adjustment],
                    reference TEXT, qty NUM, note)
settings           (key TEXT unique, value)          -- store_name, store_phone, prefix_nota,
                                                      -- prefix_barcode, min_stock_alert, receipt_footer
audit_logs         (user: →users, action TEXT, collection TEXT, record_id TEXT,
                    old_data JSON, new_data JSON)
outlets            (name, address, phone)            -- disiapkan, tidak dipakai fase 1
```

API rules PocketBase (lapisan pertahanan kedua): semua collection `list/view` butuh auth; `create/update/delete` hanya dari server (superuser token) untuk collection transaksi & stok, kecuali yang memang via UI admin.

Perubahan penting vs schema lama:
- `transaction` + `transaction_group` → `transactions` (header) + `transaction_items` (rename agar eksplisit).
- Trigger stok dihapus → `stock_movements` + service layer.
- Tambah `cost_price` snapshot di item, `payment_method`, `status voided` (soft void, bukan delete fisik).
- Audit log terpusat (bukan kolom `createdby/updatedby` per tabel — tetap dipakai seperlunya untuk kompatibilitas mental dengan app lama).

---

## 9. Migrasi Data

1. Script `scripts/import-legacy.ts` (bun) membaca DB `az_kasir` lama (via `mysql2` connect ke MySQL lama, atau baca dump SQL):
   - Collections dibuat via **PocketBase migration/JSVM atau admin API** (pocketbase serve --hooks), lalu import data:
   - `user` → `users` (password di-reset wajib ganti saat login pertama; hash MD5 tidak dipindah).
   - `product`, `product_category`, `product_unit`, `customer`, `customer_price`, `supplier` → collections baru (uang → integer rupiah).
   - `transaction_group` (status OK) + `transaction` → `transactions` + `transaction_items` + `stock_movements` (type `sale`, backdate).
   - Saldo stok akhir produk → recompute dari ledger + stok awal (penyesuaian `adjustment`).
2. Transaksi status PROCESS/PENDING lama → dibuang (data sampah).
3. Verifikasi: total omzet lama vs baru per bulan harus identik.

---

## 10. Roadmap

| Fase | Isi | Estimasi |
|------|-----|----------|
| **0 — Fondasi** | Fork boilerplate `supertools` → project POS; tambah field `role` di `users`; setup collections PocketBase + API rules; layout admin POS (sidebar menu ala app lama); audit log helper | 1 minggu |
| **1 — Master data** | Produk, kategori, satuan, customer (+harga khusus), supplier, import/export, cetak barcode | 1–2 minggu |
| **2 — Stok** | Stok in/out, stock ledger, laporan stok, validasi minus | 1 minggu |
| **3 — POS (inti)** | Layar kasir, scan/cart/hold, pembayaran tunai, cetak struk, keyboard shortcut | 2 minggu |
| **4 — Laporan & dashboard** | Riwayat transaksi + filter + cetak ulang, dashboard + grafik, laba kotor | 1 minggu |
| **5 — Migrasi & rilis** | Import data legacy, uji paralel dengan app lama, deploy | 1 minggu |
| **6 (pasca-MVP)** | Pembayaran QRIS/debit (catat referensi), laporan PDF & per kasir, PWA offline mode, multi-outlet | — |

---

## 11. Metrik Keberhasilan

- Semua fitur lama terpakai tanpa kehilangan fungsi (checklist parity ✔).
- Angka omzet & stok hasil migrasi = angka di app lama (validasi per periode).
- Kasir bisa menyelesaikan 1 transaksi scan ≤ 15 detik.
- Tidak ada selisih stok akhir hari (stok fisik vs sistem) selain koreksi manual yang tercatat.

---

## 12. Out of Scope (dulu)

- Integrasi payment gateway sungguhan (Midtrans/Xendit) — fase 2+ hanya pencatatan manual.
- E-commerce / online store sync.
- Multi-outlet & gudang pusat (skema disiapkan, fitur belum).
- Mobile app kasir.
- Multi-currency.
