# 🎵 TikTok Live Song Request System

Sistem request lagu dari komentar TikTok Live dengan tampilan overlay retro untuk OBS.

---

## 🚀 Quick Start (Lokal)

```bash
# 1. Install dependencies
npm install

# 2. Konfigurasi
copy .env.example .env
# Edit .env dengan username TikTok dan API key Anda

# 3. Jalankan
npm start
```

Buka **http://localhost:3000/dashboard**

---

## 📋 Konfigurasi `.env`

| Variabel | Wajib | Keterangan |
|---|---|---|
| `TIKTOK_USERNAME` | ✅ | Username TikTok tanpa @ |
| `YOUTUBE_API_KEY` | ❌ | Untuk thumbnail (opsional) |
| `REQUEST_PREFIX` | ❌ | Default: `!req` |
| `MAX_QUEUE_SIZE` | ❌ | Default: `50` |
| `PORT` | ❌ | Default: `3000` |
| `NODE_ENV` | ❌ | `development` / `production` |
| `ALLOWED_ORIGINS` | ❌ | CORS origins, default: `*` |
| `ENABLE_SIMULATOR` | ❌ | Aktifkan simulator di production |

> **YouTube API Key** — Dapatkan gratis di [Google Cloud Console](https://console.cloud.google.com/) → Enable **YouTube Data API v3** → Create **API Key**

---

## 🖥️ Akses Halaman

| Halaman | URL |
|---|---|
| Dashboard Admin | `/dashboard` |
| OBS Overlay | `/overlay` |
| Health Check | `/health` |
| Simulator (dev) | `POST /api/simulate` |

---

## 🎬 Setup OBS

1. Buka OBS → **Sources** → tambah **Browser Source**
2. URL: `http://localhost:3000/overlay` *(atau URL production)*
3. **Width**: `420`, **Height**: `110`
4. Centang **"Shutdown source when not visible"**
5. Posisikan sesuai keinginan di canvas OBS

---

## 📖 Cara Pakai

1. Jalankan server → buka Dashboard
2. Masukkan username TikTok → klik **CONNECT**
3. Penonton ketik di komentar live:
   ```
   !req Shape of You
   !req Hati-Hati di Jalan Pamungkas
   ```
4. Lagu muncul di antrian dan overlay OBS otomatis
5. Klik **⏭ NEXT** setelah selesai memainkan lagu

---

## 🌐 Deploy ke Railway (Rekomendasi)

Railway adalah platform cloud yang mudah dan memiliki free tier.

### Langkah 1 — Buat akun dan project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Buat project baru
railway init
```

### Langkah 2 — Deploy

```bash
# Deploy ke Railway
railway up
```

### Langkah 3 — Set Environment Variables

Di Railway Dashboard → Settings → Variables, tambahkan:

```
TIKTOK_USERNAME   = nama_tiktok_anda
YOUTUBE_API_KEY   = isi_jika_punya
NODE_ENV          = production
ALLOWED_ORIGINS   = https://nama-app.railway.app
```

### Langkah 4 — Dapatkan URL

```bash
railway domain
# Output: https://tiktok-song-request-xxxxx.railway.app
```

URL Dashboard: `https://nama-app.railway.app/dashboard`  
URL OBS Overlay: `https://nama-app.railway.app/overlay`

---

## 🌐 Deploy ke Render (Alternatif Gratis)

1. Push kode ke GitHub
2. Buka [render.com](https://render.com) → **New Web Service**
3. Connect repository GitHub
4. Render akan otomatis baca `render.yaml`
5. Tambahkan Environment Variables di dashboard Render
6. Deploy!

> ⚠️ **Catatan Free Tier**: Render free tier akan sleep setelah 15 menit tidak ada request. Untuk streaming aktif, gunakan Railway atau upgrade plan.

---

## 🐳 Deploy dengan Docker

```bash
# Build image
docker build -t tiktok-song-request .

# Jalankan container
docker run -d \
  -p 3000:3000 \
  -e TIKTOK_USERNAME=nama_tiktok \
  -e YOUTUBE_API_KEY=api_key \
  -e NODE_ENV=production \
  --name song-request \
  tiktok-song-request
```

---

## 🧪 Testing Tanpa Live

Di Dashboard, gunakan panel **⚗ SIMULATOR**:

| Input | Contoh |
|---|---|
| Username | `test_user` |
| Komentar | `!req Shape of You` |

Atau klik **▶ AUTO DEMO** untuk kirim 6 request otomatis.

---

## 📁 Struktur Proyek

```
tiktok-song-request/
├── server/
│   ├── config.js       ← Konfigurasi global
│   ├── queue.js        ← Queue manager
│   ├── youtube.js      ← YouTube API
│   ├── tiktok.js       ← TikTok Live Connector
│   └── simulator.js    ← Mode testing
├── public/
│   ├── dashboard/      ← Admin panel
│   └── overlay/        ← OBS browser source
├── index.js            ← Entry point
├── Dockerfile          ← Docker deployment
├── railway.toml        ← Railway config
├── render.yaml         ← Render config
├── .env                ← Config lokal (jangan di-commit!)
└── .env.example        ← Template config
```

---

## ⚠️ Catatan Penting

> [!WARNING]
> TikTok tidak memiliki API publik resmi untuk live comments. Library `tiktok-live-connector` menggunakan reverse-engineering dan dapat berubah sewaktu-waktu.

> [!NOTE]
> Akun TikTok harus **publik** (tidak private) dan harus **sedang live** saat melakukan connect.

> [!TIP]
> Untuk production, selalu set `ALLOWED_ORIGINS` ke domain spesifik Anda (bukan `*`) untuk keamanan lebih baik.
