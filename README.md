# SGK Geçici İş Göremezlik Ödeneği Hesaplama

5510 Sayılı Kanun Madde 17 ve SGK 2021/13 Sayılı Genelge kapsamında geçici iş göremezlik ödeneği hesaplama aracı.

## Özellikler

- **Rapor türüne göre hesaplama:** Hastalık, İş Kazası, Meslek Hastalığı, Analık
- **Tedavi türü:** Ayakta (2/3), Yatarak (1/2), Karma
- **Baz dönem:** Hastalık/Analık → 12 ayın tamamı | İş Kazası/Meslek Hastalığı → 12 aydaki son 3 ay
- **Bekleme süresi:** Hastalık/Meslek Hastalığı → ilk 2 gün ödenmez | İş Kazası/Analık → ilk günden ödenir
- **Asgari ücret alt sınırı:** Rapor bitiş tarihindeki günlük asgari ücretten az olamaz
- **Asgari ücrete göre otomatik doldur** (1950–2026 tablosu dahil)

## Kurulum

```bash
npm install
npm run dev
```

## Vercel Deployment

GitHub'a push edin, Vercel'de "Import Project" ile içe aktarın. Build komutları otomatik algılanır.

## Yasal Dayanak

- 5510 Sayılı Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu, Madde 17
- SGK Genelge 2021/13 (Hastalık/Analık için 12 ay baz dönem)
- SGK Genelge 2024 (Asgari ücret alt sınırı - rapor bitiş tarihi esas)
