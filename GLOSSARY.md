# Stocks1

Aplikasi web berlangganan yang melacak aktivitas broker di saham IDX, untuk melihat siapa yang mengumpulkan dan siapa yang melepas barang.

## Language

**Broker**:
Anggota bursa yang tercatat dengan kode dua huruf (misalnya YP, CC) di setiap transaksi BEI.
_Avoid_: Sekuritas, bandar (kecuali sudah didefinisikan sebagai peran)

**Kelompok Broker**:
Beberapa Broker yang dianggap bertindak untuk pihak yang sama. Ada tiga asal: Kelompok Resmi dari admin dengan sumber berita terverifikasi, Kelompok Pribadi buatan pengguna yang hanya terlihat olehnya, dan Kelompok Dugaan: dua Broker yang tertangkap Crossing bersama, selalu ditampilkan dengan peringatan bahwa ini perkiraan.
_Avoid_: Afiliasi, grup bandar, institusi

**Broker Summary**:
Rekap beli dan jual per Broker untuk satu saham dalam satu hari bursa, disusun dari Done Detail. Baru tersedia setelah pasar tutup.
_Avoid_: Brosum, data bandar

**Done Detail**:
Daftar setiap transaksi satu saham: harga, lot, waktu, Broker pembeli, dan Broker penjual. Kode Broker baru terbuka setelah pasar tutup.
_Avoid_: Trade log, running trade (running trade tidak memuat kode Broker selama sesi)

**Sinyal Perkiraan**:
Dugaan akumulasi atau distribusi selama sesi berjalan, dihitung dari Tekanan Beli/Jual tanpa kode Broker. Diganti oleh Broker Summary setelah pasar tutup.
_Avoid_: Data realtime broker, sinyal bandar

**Tekanan Beli/Jual**:
Perbandingan volume yang terjadi di harga offer (dihitung beli) dengan volume di harga bid (dihitung jual).
_Avoid_: Buy/sell pressure, haka/haki ratio

**Timeframe**:
Ukuran irisan waktu untuk grafik dan Tekanan Beli/Jual: 5 menit, 10 menit, 15 menit, 30 menit, 4 jam, atau 1 hari.
_Avoid_: Interval, candle

**Rentang**:
Jumlah hari bursa ke belakang yang menjadi dasar perhitungan pola Broker.
_Avoid_: Periode, range, lookback

### Pola Broker

**Akumulasi**:
Broker net beli di satu saham selama Rentang, dengan rata-rata harga belinya di bawah harga terakhir.
_Avoid_: Akum, collect, nampung

**Akumulasi Masif**:
Akumulasi oleh Broker yang net beli di minimal 80% hari bursa dalam Rentang dan bukan Akumulasi Pasif. Satu-dua hari net jual kecil tidak membatalkannya.
_Avoid_: Akum besar, big accumulation

**Akumulasi Pasif**:
Akumulasi pelan: net beli Broker di bawah 5% volume harian saham itu.
_Avoid_: Akum kecil

**Silent Akumulasi**:
Akumulasi Masif saat harga saham Sideways selama seluruh Rentang.
_Avoid_: Akum diam-diam, hidden accumulation

**Sideways**:
Harga tertinggi dan terendah saham selama hari-hari pola berselisih paling besar 5% dari harga terendah.
_Avoid_: Datar, flat, harga diam

**Distribusi**:
Cermin Akumulasi: Broker net jual dengan rata-rata harga jual di atas harga terakhir. Distribusi Masif, Distribusi Pasif, dan Silent Distribusi mengikuti aturan yang sama dengan arah terbalik.
_Avoid_: Dist, buang barang, guyur

**Penampung**:
Broker yang net beli di minimal separuh hari turun dalam Rentang (penutupan di bawah penutupan sebelumnya), dengan sebagian besar beliannya di bawah VWAP hari itu.
_Avoid_: Penadah, buyer on dip

**Lonjakan Volume**:
Hari ketika volume satu saham mencapai 3,5 kali rata-rata volume 20 hari sebelumnya. Ini kejadian pada saham, bukan pola Broker.
_Avoid_: Akum pasif, spike, volume meledak

**Lonjakan Volume Intraday**:
Saat pasar buka, volume satu saham sejak pembukaan sampai jam tertentu mencapai 3,5 kali rata-rata volume sampai jam yang sama selama 20 hari sebelumnya.
_Avoid_: Spike realtime

### Fitur

**Scanner**:
Daftar semua saham yang sedang memenuhi satu pola tertentu, misalnya Scanner Silent Akumulasi atau Scanner Lonjakan Volume Intraday. Bisa dinyalakan dan dimatikan pengguna.
_Avoid_: Screener, filter

**Order Block**:
Zona harga dari candle berlawanan terakhir sebelum harga menembus swing high atau swing low. Digambar otomatis di grafik dan bisa dinyalakan atau dimatikan pengguna.
_Avoid_: OB, supply/demand zone

**Notifikasi Perkiraan**:
Pesan saat pasar buka yang berasal dari Sinyal Perkiraan, tanpa nama Broker.
_Avoid_: Alert realtime

**Notifikasi Broker**:
Pesan setelah pasar tutup dengan format "[saham] diakumulasi/didistribusi [Broker] dengan [lot] lot di avg [harga]".
_Avoid_: Alert bandar

**Crossing**:
Dua atau lebih Broker saling beli dan saling jual saham yang sama untuk membentuk volume, padahal barang hanya bertukar tempat tanpa pemilik baru. Ditandai bila dalam satu hari A jual ke B dan B jual ke A dengan selisih lot paling besar 10%, dan totalnya minimal 5% volume harian saham itu.
_Avoid_: Cross, wash trade, goreng volume

**Crossing Ketat**:
Crossing yang bolak-baliknya terjadi di dalam irisan 15 menit yang sama. Bukti lebih kuat dari Crossing harian.
_Avoid_: Crossing cepat
