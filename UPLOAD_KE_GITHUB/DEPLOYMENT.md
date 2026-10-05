# Panduan Penerapan Awan Pengeluaran 24/7 (Production Deployment Guide) 🚀

Sistem **AutoBot WSZia** kini telah siap dibina sebagai **Production-Ready Cloud System** yang beroperasi secara bebas tanpa bergantung kepada komputer riba anda.

---

## ☁️ 3 Pilihan Penerapan Awan Kekal (Pilih Salah Satu)

---

### PILIHAN 1: Penerapan Render.com (Paling Mudah & Disyorkan)
Render menyediakan pelayan awan dengan cakera kekal (*Persistent Disk*) dan domain HTTPS rasmi percuma.

1. Daftar akaun percuma di **[Render.com](https://render.com)**.
2. Muat naik kod projek ini ke akaun **GitHub** peribadi anda.
3. Di Render Dashboard, klik **New +** > **Blueprint**.
4. Sambungkan repositori GitHub anda. Render akan membaca fail [`render.yaml`](render.yaml) secara automatik!
5. Masukkan pembolehubah persekitaran (Environment Variables) jika perlu.
6. Tekan **Apply**. Pelayan anda akan aktif secara automatik dengan URL rasmi:
   ```text
   https://autobot-wszia.onrender.com
   ```
7. Pangkalan data SQLite anda disimpan di dalam volum kekal `/app/data` (tidak akan hilang apabila pelayan dimulakan semula).

---

### PILIHAN 2: Penerapan VPS Sendiri (DigitalOcean / Linode / Contabo / AWS)
Jika anda memiliki pelayan VPS berasaskan Ubuntu atau Debian:

1. Sambung ke VPS anda melalui SSH:
   ```bash
   ssh root@ip-pelayan-anda
   ```
2. Klon atau salin fail projek ini ke dalam direktori `/var/www/autobot`:
   ```bash
   git clone <url-repo-anda> /var/www/autobot
   cd /var/www/autobot
   ```
3. Berikan kebenaran dan jalankan skrip penerapan automatik:
   ```bash
   chmod +x deploy-vps.sh
   ./deploy-vps.sh
   ```
4. Skrip ini akan secara automatik:
   * Memasang Node.js 22 LTS, PM2, dan Nginx.
   * Menetapkan proses latar belakang PM2 dengan *auto-restart* apabila pelayan reboot.
   * Mengkonfigurasikan Nginx Reverse Proxy ke port 3000.
5. Sediakan Sijil SSL HTTPS percuma:
   ```bash
   sudo certbot --nginx -d domain-anda.com
   ```

---

### PILIHAN 3: Penerapan Menggunakan Docker & Docker Compose
Jika anda menggunakan mana-mana pelayan yang menyokong Docker:

1. Di dalam folder projek, jalankan:
   ```bash
   docker compose up -d --build
   ```
2. Bekas (container) akan berjalan di latar belakang dengan tetapan `restart: always`. Walaupun pelayan dimatikan atau terhempas (*crashed*), bekas akan dimulakan semula secara automatik.

---

## 📲 Cara Menghubungkan Meta WhatsApp Cloud API (24/7 Rasmi)

Selepas anda mempunyai URL pelayan awan kekal (contoh: `https://autobot-wszia.onrender.com` atau domain VPS anda):

1. Pergi ke **[developers.facebook.com](https://developers.facebook.com)**.
2. Masuk ke aplikasi anda > **WhatsApp** > **Configuration**.
3. Di bahagian **Webhook**, tekan **Edit**:
   * **Callback URL**: `https://domain-anda.com/webhook`
   * **Verify Token**: Masukkan token rahsia anda (lalai: `autobot_wszia_verify_secret_token_2026`).
4. Tekan **Verify and save**.
5. Di bahagian **Webhook fields**, klik **Manage** dan tandakan **`messages`** (Subscribe).
6. Di Papan Pemuka Admin AutoBot WSZia (Tab **WhatsApp & Tetapan**), masukkan:
   * **Meta Access Token**
   * **WhatsApp Phone Number ID**
7. Tekan **Simpan Konfigurasi Meta**.

Mulai detik ini, setiap mesej pelanggan akan dihantar oleh pelayan Meta terus ke pelayan awan anda, diproses oleh Closing Flow AI, dan dibalas serta-merta tanpa memerlukan komputer riba anda dibuka sama sekali!

---

## 💻 Pengesahan Ketidaktergantungan Komputer Riba (Laptop Independence)

| Keadaan Komputer Riba Anda | Status Operasi AutoBot WSZia |
| :--- | :--- |
| Laptop dimatikan (*Shutdown*) | 🟢 **Tetap Aktif 24/7 di Awan** |
| Laptop ditutup (*Sleep/Lid Closed*) | 🟢 **Tetap Aktif 24/7 di Awan** |
| Laptop tiada sambungan internet | 🟢 **Tetap Aktif 24/7 di Awan** |
| Pelayar web / browser ditutup | 🟢 **Tetap Aktif 24/7 di Awan** |

Komputer riba anda sekarang hanyalah peranti untuk membuka Papan Pemuka Admin sahaja. Seluruh enjin bot, pangkalan data, dan webhook berjalan di pelayan awan kekal.
