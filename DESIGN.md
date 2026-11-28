# Secret: arah desain

Nama produk: Secret (repo: Stocks1). Logo belum ada: `[LOGO]`. Istilah mengikuti [GLOSSARY.md](GLOSSARY.md).

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

Design Read: terminal analisis aktivitas Broker IDX untuk trader yang paham bandarmologi. Navy gelap dengan aksen biru, kartu bersudut 14 px, sidebar di desktop dan tab bar di mobile, dengan kode Broker berkotak sebagai motif.

Acuan visual: desain contoh "SahamPulse UI" di dokumen FigCraft "UI Antigrafity" (dipilih pemilik produk). Diambil gaya dan tata letaknya. Fitur di luar glossary (Portofolio, Berita, RSI, EMA, Foreign Flow, LQ45, USD/IDR) tidak dipakai.

Pengecualian yang diputuskan pemilik: lingkaran inisial saham memakai satu warna (bukan warna-warni seperti contoh), abu kecil dinaikkan ke `#8291A7` dan merah di panel terang ke `#FB7185` agar lolos WCAG AA, dan label "BEI LIVE" diganti "DATA CONTOH".

## Warna (tema gelap, berlaku)

| Peran | Hex |
|---|---|
| Latar | `#0B0E14` |
| Sidebar, header | `#0E121A` |
| Kartu | `#131823` |
| Kartu terangkat, pil | `#1A2130` |
| Pilihan aktif | `#172542` dengan teks `#60A5FA` |
| Garis | `#1E2636` |
| Teks | `#F8FAFC` |
| Redup | `#94A3B8` |
| Redup kecil | `#8291A7` (5,0 sampai 5,5:1) |
| Aksen, tombol utama | `#2563EB` dengan teks putih (5,17:1), garis aktif `#3B82F6` |
| Naik / Akumulasi | `#10B981`, teks `#34D399`, latar pil `#0D2E24` |
| Turun / Distribusi | `#F43F5E`, teks `#FB7185`, latar pil `#33131E` |

Bagian "Warna" di bawah ini adalah arah lama (netral + putih) dan sudah diganti oleh tabel di atas.

## Arah lama (diganti)

Dial lama: ENERGY 1 / RHYTHM 2 / MOTION 1. Design Read lama: gelap, netral, dan tenang, dengan kode Broker berkotak sebagai motif.

## Pengguna

Trader yang sudah kenal Broker Summary, Akumulasi, dan Distribusi. Mereka ingin cepat tahu siapa yang mengumpulkan dan siapa yang melepas, tanpa penjelasan panjang di layar.

## Mood

Gelap, tenang, enak dilihat lama. Tidak ada dekorasi yang tidak membawa data. Gerak hanya di hover dan focus.

Kerapatan sedang: baris tabel rapat supaya banyak Broker terlihat, tapi ada ruang napas yang jelas antar bagian.

## Warna (tema gelap)

| Peran | Hex | Alasan | Kontras di #141414 / #1E1E1E |
|---|---|---|---|
| Latar | `#141414` | Abu netral, tidak berwarna, agar hijau dan merah satu-satunya warna di layar | |
| Panel | `#1E1E1E` | Satu tingkat di atas latar, memisahkan bagian tanpa garis tebal | |
| Teks | `#EDEDED` | Putih lembut, tidak menyilaukan | 15,74 / 14,24 |
| Redup | `#9E9E9E` | Label, keterangan, tanggal | 6,88 / 6,22 |
| Aksen | `#FFFFFF` tebal | Aksen adalah kontras dan bobot, bukan warna: kode saham dan Broker, pilihan aktif | 18,42 / 16,67 |
| Naik / Akumulasi | `#4FB37A` | Kebiasaan aplikasi saham Indonesia | 7,07 / 6,40 |
| Turun / Distribusi | `#E0605A` | Kebiasaan aplikasi saham Indonesia | 5,26 / 4,76 |

Hijau dan merah hanya untuk arah (harga, net lot, Akumulasi/Distribusi), tidak pernah untuk dekorasi. Arah juga selalu ditulis atau diberi tanda +/-, tidak hanya lewat warna.

Tema terang dibuat setelah tema gelap disetujui. Tombol ganti tema tetap ada, dan kedua tema harus lolos WCAG AA.

## Huruf

Inter untuk semua teks, dengan angka tabular (`font-variant-numeric: tabular-nums`) di setiap angka. Alasannya: jelas di ukuran kecil dan tabel, kolom angka tetap rata, dan bisa dirender di FigCraft maupun web, jadi mockup sama dengan hasil akhir. Source Sans 3 sempat dipilih, tapi tidak terender di FigCraft.

Hierarki dibentuk dari ukuran dan bobot, bukan warna.

## Motif identitas: kode Broker berkotak

Kode dua huruf Broker (Q1, YP) selalu tampil tebal dalam kotak dengan lebar tetap, di mana pun muncul: kalimat sinyal, tabel, Crossing, Kelompok. Alasannya: kode Broker adalah inti produk, dan kotak yang sama di semua tempat membuat mata langsung menemukannya.

Kotak: garis 1 px warna redup, sudut kecil, isi teks putih tebal. Kelompok memakai kotak yang sama untuk setiap anggota.

## Layar

Desktop 1440 px dan mobile 390 px dirancang bersamaan.

### Header (semua layar)

Desktop: sidebar 220 px berisi "Secret" dengan `[LOGO]`, menu Ringkasan Pasar, Scanner, dan Watchlist (yang aktif bergaris biru di kiri), dan kartu DATA CONTOH di bawah. Header atas berisi kotak cari kode saham, ticker IHSG, label DATA CONTOH, dan tombol tema. Mobile: tab bar bawah dengan tiga menu yang sama. Klik saham di daftar mana pun membuka halaman saham.

### Scanner

Satu halaman dengan pilihan pola: Silent Akumulasi, Akumulasi Masif, Akumulasi Pasif, Distribusi Masif, Distribusi Pasif, Penampung, dan Lonjakan Volume Intraday, masing-masing dengan jumlah sahamnya. Silent hanya untuk Masif. Setiap saham menampilkan harga, kalimat sinyal, dan "Ditampung oleh": tiga Broker dengan net beli terbesar, net lot, dan avg beli.

### Watchlist

Tombol "+ Pantau" di halaman saham. Halaman Watchlist berisi saham pantauan dengan harga, sinyal terbaru, "Ditampung oleh", dan tombol Hapus. Disimpan di browser sampai akun tersedia. Keadaan kosong menjelaskan cara menambah saham.

### Ringkasan Pasar (layar pertama)

1. Grafik candle IHSG dengan pilihan Timeframe yang sama seperti halaman saham.
2. 10 saham paling diakumulasi dan 10 paling didistribusi, dalam format kalimat sinyal ("ZZAK diakumulasi [Q1] dengan 12.000 lot di avg 995"), ditambah harga dan perubahan harian. Pilihan Rentang 5, 20, 60 hari, bawaan 20, dan ikut terbawa ke halaman saham.
3. Selama sesi berjalan: daftar memakai hari bursa terakhir yang lengkap, dengan tanggal jelas. Sinyal Perkiraan hari ini tampil terpisah, tanpa nama Broker, berlabel perkiraan.
4. Scanner.

### Halaman saham

Fokus layar adalah Sinyal utama di paling atas. Setelah itu grafik dengan Order Block, tabel Akumulasi/Distribusi per Broker, Crossing, Kelompok Dugaan, dan Scanner.

## Data di mockup

Mockup memakai data contoh dari generator (saham dan Broker fiktif, IHSG contoh). Label "DATA CONTOH" terlihat di setiap layar.
