import { getGunlukAsgariUcret } from "./asgariUcret";

export type RaporTuru = "hastalik" | "iskazasi" | "meslekhastligi" | "analik";
export type TedaviTuru = "ayakta" | "yatarak" | "karma";

export interface AyKazanc {
  ay: string; // "YYYY-MM"
  kazanc: number; // Brüt prime esas kazanç (TL)
  primGunu: number; // 0-30
}

export interface HesaplaInput {
  raporTuru: RaporTuru;
  tedaviTuru: TedaviTuru;
  raporBaslangic: string; // "YYYY-MM-DD"
  raporBitis: string; // "YYYY-MM-DD"
  // Yatarak/karma için
  yatarakGun?: number;
  ayaktaGun?: number;
  // Son 12 ay kazanç listesi (12 satır, yeniden eskiye)
  ayKazanclar: AyKazanc[];
}

export interface HesaplaResult {
  // Girdi özeti
  toplamRaporGun: number;
  odenenGun: number;
  // Günlük kazanç
  bazDonemleriKazanc: number;
  bazDonemleriGun: number;
  gunlukOrtalama: number;
  // Asgari ücret kontrolü
  raporBitisAsgariGunluk: number;
  asgariUcretUygulandimi: boolean;
  gunlukKazancEsas: number;
  // Ödenek
  ayaktaGunluk: number;
  yatarakGunluk: number;
  ayaktaToplamOdenek: number;
  yatarakToplamOdenek: number;
  toplamOdenek: number;
  // Açıklama satırları
  adimlar: string[];
}

export function hesapla(input: HesaplaInput): HesaplaResult {
  const adimlar: string[] = [];
  const baslangic = new Date(input.raporBaslangic);
  const bitis = new Date(input.raporBitis);

  // Rapor gün sayısı (dahil-dahil)
  const toplamRaporGun =
    Math.round((bitis.getTime() - baslangic.getTime()) / 86400000) + 1;

  // Bekleme süresi: hastalık/meslek hastalığı → ilk 2 gün ödenmez
  // İş kazası ve analık → ilk günden ödenir
  const beklemeSuresi =
    input.raporTuru === "hastalik" || input.raporTuru === "meslekhastligi"
      ? 2
      : 0;

  let odenenGun = Math.max(0, toplamRaporGun - beklemeSuresi);

  if (beklemeSuresi > 0) {
    adimlar.push(
      `Hastalık raporunda ilk ${beklemeSuresi} gün ödenmez → ödenecek gün: ${toplamRaporGun} - ${beklemeSuresi} = ${odenenGun} gün`
    );
  } else {
    adimlar.push(
      `${input.raporTuru === "iskazasi" ? "İş kazası" : "Analık"} raporunda ilk günden ödeme yapılır → ödenecek gün: ${odenenGun} gün`
    );
  }

  // --- Baz dönem tespiti ---
  // İş kazası / meslek hastalığı: 12 aydaki son 3 ay
  // Hastalık / analık: 12 ayın tamamı
  const kullanilanAylar =
    input.raporTuru === "iskazasi" || input.raporTuru === "meslekhastligi"
      ? input.ayKazanclar.slice(0, 3) // en güncel 3 ay
      : input.ayKazanclar.slice(0, 12); // 12 ayın tamamı

  const bazDonemleriKazanc = kullanilanAylar.reduce(
    (s, a) => s + a.kazanc,
    0
  );
  const bazDonemleriGun = kullanilanAylar.reduce(
    (s, a) => s + a.primGunu,
    0
  );

  const donem =
    input.raporTuru === "iskazasi" || input.raporTuru === "meslekhastligi"
      ? "son 3 ay (12 ay içinde)"
      : "son 12 ay";

  adimlar.push(
    `Günlük kazanç baz dönemi: ${donem} → toplam kazanç: ${fmt(bazDonemleriKazanc)} ₺, toplam prim günü: ${bazDonemleriGun}`
  );

  const gunlukOrtalama =
    bazDonemleriGun > 0 ? bazDonemleriKazanc / bazDonemleriGun : 0;

  adimlar.push(
    `Günlük ortalama kazanç: ${fmt(bazDonemleriKazanc)} ÷ ${bazDonemleriGun} = ${fmt(gunlukOrtalama)} ₺`
  );

  // --- Asgari ücret alt sınırı kontrolü ---
  // Kural: Rapor bitiş tarihindeki günlük asgari ücretin altında olamaz
  const raporBitisAsgariGunluk = getGunlukAsgariUcret(bitis);
  const asgariUcretUygulandimi = gunlukOrtalama < raporBitisAsgariGunluk;
  const gunlukKazancEsas = asgariUcretUygulandimi
    ? raporBitisAsgariGunluk
    : gunlukOrtalama;

  if (asgariUcretUygulandimi) {
    adimlar.push(
      `⚠️ Günlük ortalama (${fmt(gunlukOrtalama)} ₺) < rapor bitiş tarihi asgari günlük ücret (${fmt(raporBitisAsgariGunluk)} ₺) → asgari ücret esas alınır`
    );
  } else {
    adimlar.push(
      `✓ Günlük ortalama (${fmt(gunlukOrtalama)} ₺) ≥ rapor bitiş tarihi asgari günlük ücret (${fmt(raporBitisAsgariGunluk)} ₺) → hesaplanan oran esas alınır`
    );
  }

  // --- Tedavi türüne göre ödenek oranı ---
  // Ayakta: 2/3, Yatarak: 1/2
  const ayaktaGunluk = gunlukKazancEsas * (2 / 3);
  const yatarakGunluk = gunlukKazancEsas * (1 / 2);

  let ayaktaGun = 0;
  let yatarakGun = 0;
  let ayaktaToplamOdenek = 0;
  let yatarakToplamOdenek = 0;

  if (input.tedaviTuru === "ayakta") {
    ayaktaGun = odenenGun;
    ayaktaToplamOdenek = ayaktaGunluk * ayaktaGun;
    adimlar.push(
      `Ayakta tedavi: ${fmt(gunlukKazancEsas)} × 2/3 = ${fmt(ayaktaGunluk)} ₺/gün × ${ayaktaGun} gün = ${fmt(ayaktaToplamOdenek)} ₺`
    );
  } else if (input.tedaviTuru === "yatarak") {
    yatarakGun = odenenGun;
    yatarakToplamOdenek = yatarakGunluk * yatarakGun;
    adimlar.push(
      `Yatarak tedavi: ${fmt(gunlukKazancEsas)} × 1/2 = ${fmt(yatarakGunluk)} ₺/gün × ${yatarakGun} gün = ${fmt(yatarakToplamOdenek)} ₺`
    );
  } else {
    // Karma
    yatarakGun = input.yatarakGun ?? 0;
    ayaktaGun = odenenGun - yatarakGun;
    if (ayaktaGun < 0) ayaktaGun = 0;

    ayaktaToplamOdenek = ayaktaGunluk * ayaktaGun;
    yatarakToplamOdenek = yatarakGunluk * yatarakGun;
    adimlar.push(
      `Karma tedavi → Ayakta: ${ayaktaGun} gün × ${fmt(ayaktaGunluk)} ₺ = ${fmt(ayaktaToplamOdenek)} ₺`
    );
    adimlar.push(
      `Karma tedavi → Yatarak: ${yatarakGun} gün × ${fmt(yatarakGunluk)} ₺ = ${fmt(yatarakToplamOdenek)} ₺`
    );
  }

  const toplamOdenek = ayaktaToplamOdenek + yatarakToplamOdenek;
  adimlar.push(`TOPLAM ÖDENEK: ${fmt(toplamOdenek)} ₺`);

  return {
    toplamRaporGun,
    odenenGun,
    bazDonemleriKazanc,
    bazDonemleriGun,
    gunlukOrtalama,
    raporBitisAsgariGunluk,
    asgariUcretUygulandimi,
    gunlukKazancEsas,
    ayaktaGunluk,
    yatarakGunluk,
    ayaktaToplamOdenek,
    yatarakToplamOdenek,
    toplamOdenek,
    adimlar,
  };
}

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
