# 🤖 AutoBot WSZia — Sistem Automasi AI WhatsApp Pengeluaran 24/7 (Permanent Cloud Production System)

Sistem Automasi Jualan WhatsApp Berasaskan AI Pengeluaran Sebenar (Production-Ready) yang beroperasi **24/7 tanpa henti di awan**, bebas sepenuhnya daripada komputer riba pengguna.

---

## 🌟 Ciri-Ciri Utama Sistem

1. **24/7 Operasi Awan Berdikari**:
   * Dilengkapi sokongan **Meta WhatsApp Cloud API (Permanent Webhook)** dan **Cloud Baileys (Sesi WhatsApp Web)**.
   * Dihoskan di pelayan awan kekal (Render / Railway / VPS / Docker). Laptop boleh dimatikan sepenuhnya tanpa menjejaskan bot.

2. **Pangkalan Data Pengeluaran Kekal (SQLite WAL Mode)**:
   * Menyimpan profil pelanggan, sejarah sembang, memori entiti, rekod tempahan, dan versi flow secara kekal.
   * Data tidak akan hilang walaupun pelayan di-restart atau terputus sambungan.

3. **Visual Closing Flow Builder (Kad Interaktif)**:
   * Paparan kad langkah aliran jualan bertingkat (Greeting $\rightarrow$ Masalah $\rightarrow$ Kelayakan $\rightarrow$ Manfaat $\rightarrow$ Cadang Pakej $\rightarrow$ Tangani Bantahan $\rightarrow$ Closing $\rightarrow$ Butiran Pesanan $\rightarrow$ Pengesahan $\rightarrow$ Selesai).
   * Boleh tambah, padam, susun semula (reorder), duplikasi, dan sunting arahan AI.
   * Sistem Draf $\rightarrow$ Uji $\rightarrow$ Terbit (Draft vs Published).
   * Kawalan versi penuh (v1, v2, v3).

4. **Pengesan 16+ Niat Pelanggan & Memori Kontekstual**:
   * Mengesan niat seperti `price_inquiry`, `objection` ("Mahal"), `buying_intent`, `ready_to_order`, dan `human_handover`.
   * Mengingati nama, masalah kesihatan, pakej pilihan, dan alamat pelanggan.

5. **Pengurusan Skrip Penutup Jualan (Closing Scripts)**:
   * Skrip *Soft Close*, *Direct Close*, *Choice Close*, dan *Urgency Close*.
   * Menggantikan pembolehubah dinamik secara automatik: `{{customer_name}}`, `{{product_name}}`, `{{package_name}}`, `{{package_price}}`, `{{quantity}}`, `{{customer_problem}}`.

6. **Pematuhan Keselamatan Produk Kesihatan**:
   * Melarang dakwaan palsu atau janji sembuh muktamad.
   * Menggunakan istilah sokongan yang mematuhi etika: *"membantu menyokong keselesaan"*, *"membantu melegakan angin"*.

7. **Aliran Pesanan & Serahan Staf Manusia (Human Handover)**:
   * Merumus butiran tempahan dan meminta pengesahan pelanggan sebelum memuktamadkan pesanan.
   * Menghentikan AI secara automatik apabila pelanggan memohon bercakap dengan staf manusia atau membuat aduan.

8. **Simulator Ujian Terbina (Sandbox Simulator)**:
   * Menguji aliran jualan dengan senario pelanggan sebenar tanpa menghubungi pelanggan WhatsApp sebenar.

---

## 🚀 Memulakan Sistem Secara Tempatan (Untuk Pengurusan / Ujian)

```powershell
npm start
```
Buka pelayar web di:
👉 **[http://localhost:3000](http://localhost:3000)**

* **Nama Pengguna Lalai**: `admin`
* **Kata Laluan Lalai**: `admin123`

---

## ☁️ Panduan Penerapan Awan 24/7 (Bebas Laptop)

Sila rujuk panduan lengkap di:
📄 [**`DEPLOYMENT.md`**](DEPLOYMENT.md) untuk langkah menerapkan ke **Render.com**, **Railway**, atau **VPS Ubuntu**.
