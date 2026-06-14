import { getAsgariUcret, getGunlukAsgariUcret } from "./asgariUcret";

export type RaporTuru = "hastalik" | "iskazasi" | "meslekhastligi" | "analik";
export type TedaviTuru = "ayakta" | "yatarak" | "karma";

export interface AyKazanc {
  ay: string;       // "YYYY-MM"
  kazanc: number;   // Brüt prime esas kazanç (prim+ikramiye dahil)
  primGunu: number; // 0-30
}

export interface HesaplaInput {
  raporTuru: RaporTuru;
  tedaviTuru: TedaviTuru;
  raporBaslangic: string;   // "YYYY-MM-DD"
  raporBitis: string;       // "YYYY-MM-DD"
  yatarakGun?: number;      // karma tedavide yatarak gün sayısı
  ayKazanclar: AyKazanc[];  // 12 ay, yeniden eskiye
  // İş kazası/MH için: kaza/tanı tarihinden önce o ay hiç çalışmadıysa
  // emsal kazanç kullanılır; bu alan o ayki/günkü prime esas kazancı tutar
  emsalKazanc?: number;
  emsalPrimGunu?: number;
  // Prim/ikramiye dahil toplam kazanç üst sınırı kontrolü için
  // normal maaş ortalamasını ayrıca alıyoruz (isteğe bağlı)
  normalMaasKazanc?: number[]; // son 12 ay normal maaş (ikramiye hariç)
}

export interface UyariMesaj {
  tip: "bilgi" | "uyari" | "hata";
  mesaj: string;
}

export interface HesaplaResult {
  toplamRaporGun: number;
  odenenGun: number;
  // 90 gün şartı
  toplamOnikiAyPrimGun: number;
  doksan_gun_sartiSaglandi: boolean;
  // 180 gün kontrolü (2x asgari tavan)
  toplamOnikiAyBildirim: number;
  yuzSeksenGunAltinda: boolean;
  // Baz dönem
  bazDonemleriKazanc: number;
  bazDonemleriGun: number;
  gunlukOrtalamaBrut: number;
  // Üst tavan: %50 fazla kuralı
  normalMaasOrtalama: number;
  yuzElliTavanUygulandimi: boolean;
  gunlukOrtalamaKontrolSonrasi: number;
  // Alt sınır: asgari ücret
  raporBitisAsgariGunluk: number;
  asgariUcretUygulandimi: boolean;
  // 180 gün altı tavan
  ikiKatAsgariTavan: number;
  ikiKatTavanUygulandimi: boolean;
  // Analık max hafta
  analikMaxHafta: number;
  analikMaxGun: number;
  analikHaftaAsimi: boolean;
  // Sonuç
  gunlukKazancEsas: number;
  ayaktaGunluk: number;
  yatarakGunluk: number;
  ayaktaToplamOdenek: number;
  yatarakToplamOdenek: number;
  toplamOdenek: number;
  adimlar: string[];
  uyarilar: UyariMesaj[];
}

export function hesapla(input: HesaplaInput): HesaplaResult {
  const adimlar: string[] = [];
  const uyarilar: UyariMesaj[] = [];

  const baslangic = new Date(input.raporBaslangic);
  const bitis = new Date(input.raporBitis);

  // --- Rapor gün sayısı (dahil-dahil) ---
  const toplamRaporGun =
    Math.round((bitis.getTime() - baslangic.getTime()) / 86400000) + 1;

  // --- Analık max süre kontrolü (24 hafta = 168 gün) ---
  const analikMaxHafta = 24;
  const analikMaxGun = analikMaxHafta * 7; // 168
  let odenenGunBrut = toplamRaporGun;
  let analikHaftaAsimi = false;

  if (input.raporTuru === "analik" && toplamRaporGun > analikMaxGun) {
    odenenGunBrut = analikMaxGun;
    analikHaftaAsimi = true;
    uyarilar.push({
      tip: "uyari",
      mesaj: `Analık raporu maksimum ${analikMaxHafta} hafta (${analikMaxGun} gün) olabilir. Rapor ${toplamRaporGun} gün ancak hesaplama ${analikMaxGun} gün üzerinden yapılmaktadır.`,
    });
    adimlar.push(`⚠️ Analık max ${analikMaxHafta} hafta = ${analikMaxGun} gün → kullanılan gün: ${analikMaxGun}`);
  }

  // --- Bekleme süresi ---
  const beklemeSuresi =
    input.raporTuru === "hastalik" || input.raporTuru === "meslekhastligi" ? 2 : 0;
  let odenenGun = Math.max(0, odenenGunBrut - beklemeSuresi);

  if (beklemeSuresi > 0) {
    adimlar.push(`Hastalık/MH → ilk ${beklemeSuresi} gün ödenmez: ${odenenGunBrut} - ${beklemeSuresi} = ${odenenGun} ödenecek gün`);
  } else {
    const tur = input.raporTuru === "iskazasi" ? "İş kazası" : input.raporTuru === "analik" ? "Analık" : "Meslek hastalığı";
    adimlar.push(`${tur} → ilk günden ödeme başlar: ödenecek gün = ${odenenGun}`);
  }

  // --- 12 ay toplam prim günü (90 gün şartı) ---
  const toplamOnikiAyPrimGun = input.ayKazanclar
    .slice(0, 12)
    .reduce((s, a) => s + a.primGunu, 0);
  const doksan_gun_sartiSaglandi = toplamOnikiAyPrimGun >= 90;

  adimlar.push(`Son 12 ay toplam prim günü: ${toplamOnikiAyPrimGun} → 90 gün şartı: ${doksan_gun_sartiSaglandi ? "✓ SAĞLANDI" : "✗ SAĞLANAMADI"}`);

  if (!doksan_gun_sartiSaglandi) {
    uyarilar.push({
      tip: "hata",
      mesaj: `Ödeneğe hak kazanmak için rapor tarihinden önceki 1 yıl içinde en az 90 gün prim ödenmiş olması gerekmektedir. Girilen toplam: ${toplamOnikiAyPrimGun} gün.`,
    });
  }

  // --- 180 gün kontrolü (2x asgari tavan) ---
  const toplamOnikiAyBildirim = toplamOnikiAyPrimGun;
  const yuzSeksenGunAltinda = toplamOnikiAyBildirim < 180;
  const ikiKatAsgariTavan = getGunlukAsgariUcret(bitis) * 2;

  if (yuzSeksenGunAltinda) {
    adimlar.push(`Son 12 ay prim günü ${toplamOnikiAyBildirim} < 180 → günlük kazanç asgari ücretin 2 katını (${fmt(ikiKatAsgariTavan)} ₺) geçemez`);
    uyarilar.push({
      tip: "uyari",
      mesaj: `Son 12 ayda 180 günden az kısa vadeli sigorta primi bildirilmiştir (${toplamOnikiAyBildirim} gün). Günlük kazanç asgari ücretin 2 katı olan ${fmt(ikiKatAsgariTavan)} ₺ ile sınırlandırılmıştır.`,
    });
  }

  // --- Baz dönem: iş kazası/MH → son 3 ay; hastalık/analık → 12 ay ---
  const isKazaMH = input.raporTuru === "iskazasi" || input.raporTuru === "meslekhastligi";
  let kullanilanAylar = isKazaMH
    ? input.ayKazanclar.slice(0, 3)
    : input.ayKazanclar.slice(0, 12);

  // İş kazası/MH emsal kazanç: kaza tarihinden önce o ayda hiç çalışma yok ise
  // sistem o aya ait prime esas kazanç alt sınırını (asgari ücret) emsal alır.
  // Kullanıcı emsalKazanc/emsalPrimGunu girdiyse bunu en güncel aya yaz
  if (isKazaMH && input.emsalKazanc !== undefined && input.emsalKazanc > 0) {
    // En yakın ayın verisi yoksa emsal uygula
    if (kullanilanAylar[0]?.primGunu === 0) {
      kullanilanAylar = [
        { ...kullanilanAylar[0], kazanc: input.emsalKazanc, primGunu: input.emsalPrimGunu ?? 30 },
        ...kullanilanAylar.slice(1),
      ];
      adimlar.push(`İş kazası emsal kazanç uygulandı: ${fmt(input.emsalKazanc)} ₺ / ${input.emsalPrimGunu ?? 30} gün`);
    }
  }

  const bazDonemleriKazanc = kullanilanAylar.reduce((s, a) => s + a.kazanc, 0);
  const bazDonemleriGun = kullanilanAylar.reduce((s, a) => s + a.primGunu, 0);
  const donem = isKazaMH ? "12 aydaki son 3 ay" : "son 12 ayın tamamı";

  adimlar.push(`Baz dönem (${donem}): toplam kazanç = ${fmt(bazDonemleriKazanc)} ₺, toplam prim günü = ${bazDonemleriGun}`);

  const gunlukOrtalamaBrut = bazDonemleriGun > 0 ? bazDonemleriKazanc / bazDonemleriGun : 0;
  adimlar.push(`Günlük brüt ortalama: ${fmt(bazDonemleriKazanc)} ÷ ${bazDonemleriGun} = ${fmt(gunlukOrtalamaBrut)} ₺`);

  // --- %150 üst tavan (prim/ikramiye şişirme kuralı) ---
  // Girilen kazanç normalMaasKazanc'dan %50 fazla olamaz
  let normalMaasOrtalama = 0;
  let yuzElliTavanUygulandimi = false;
  let gunlukOrtalamaKontrolSonrasi = gunlukOrtalamaBrut;

  if (input.normalMaasKazanc && input.normalMaasKazanc.length > 0) {
    const normalKazancToplam = isKazaMH
      ? input.normalMaasKazanc.slice(0, 3).reduce((s, v) => s + v, 0)
      : input.normalMaasKazanc.slice(0, 12).reduce((s, v) => s + v, 0);
    const normalGunSayisi = bazDonemleriGun; // aynı dönem
    normalMaasOrtalama = normalGunSayisi > 0 ? normalKazancToplam / normalGunSayisi : 0;
    const yuzElliTavan = normalMaasOrtalama * 1.5;

    if (gunlukOrtalamaBrut > yuzElliTavan && normalMaasOrtalama > 0) {
      gunlukOrtalamaKontrolSonrasi = yuzElliTavan;
      yuzElliTavanUygulandimi = true;
      adimlar.push(`⚠️ Prim/ikramiye %50 tavan: normal maaş ort. ${fmt(normalMaasOrtalama)} ₺ × 1.5 = ${fmt(yuzElliTavan)} ₺ → tavan uygulandı`);
      uyarilar.push({
        tip: "uyari",
        mesaj: `Prim/ikramiye dahil kazanç, normal maaş ortalamasının %50 fazlasını (${fmt(yuzElliTavan)} ₺) aştığından günlük kazanç bu tavanla sınırlandırılmıştır.`,
      });
    }
  } else {
    gunlukOrtalamaKontrolSonrasi = gunlukOrtalamaBrut;
  }

  // --- 180 gün altı tavan uygula ---
  let ikiKatTavanUygulandimi = false;
  if (yuzSeksenGunAltinda && gunlukOrtalamaKontrolSonrasi > ikiKatAsgariTavan) {
    gunlukOrtalamaKontrolSonrasi = ikiKatAsgariTavan;
    ikiKatTavanUygulandimi = true;
    adimlar.push(`180 gün altı tavan: ${fmt(ikiKatAsgariTavan)} ₺ uygulandı`);
  }

  // --- Asgari ücret alt sınırı ---
  const raporBitisAsgariGunluk = getGunlukAsgariUcret(bitis);
  const asgariUcretUygulandimi = gunlukOrtalamaKontrolSonrasi < raporBitisAsgariGunluk;
  const gunlukKazancEsas = asgariUcretUygulandimi
    ? raporBitisAsgariGunluk
    : gunlukOrtalamaKontrolSonrasi;

  // Üst sınır: asgari ücretin 6.5 katı
  const ustTavan = raporBitisAsgariGunluk * 6.5;
  const gunlukKazancEsasSinirli = Math.min(gunlukKazancEsas, ustTavan);
  if (gunlukKazancEsas > ustTavan) {
    adimlar.push(`⚠️ Üst tavan (asgari × 6.5 = ${fmt(ustTavan)} ₺) aşıldı → tavan uygulandı`);
    uyarilar.push({ tip: "uyari", mesaj: `Günlük kazanç asgari ücretin 6.5 katı olan ${fmt(ustTavan)} ₺ tavanı ile sınırlandırılmıştır.` });
  }

  if (asgariUcretUygulandimi) {
    adimlar.push(`⚠️ Alt sınır: ort. ${fmt(gunlukOrtalamaKontrolSonrasi)} ₺ < asgari ${fmt(raporBitisAsgariGunluk)} ₺ → asgari ücret esas alındı`);
  } else {
    adimlar.push(`✓ Esas günlük kazanç: ${fmt(gunlukKazancEsasSinirli)} ₺`);
  }

  // --- Tedavi türüne göre ödenek hesabı ---
  const ayaktaGunluk = gunlukKazancEsasSinirli * (2 / 3);
  const yatarakGunluk = gunlukKazancEsasSinirli * (1 / 2);

  let ayaktaGun = 0;
  let yatarakGun = 0;
  let ayaktaToplamOdenek = 0;
  let yatarakToplamOdenek = 0;

  if (input.tedaviTuru === "ayakta") {
    ayaktaGun = odenenGun;
    ayaktaToplamOdenek = ayaktaGunluk * ayaktaGun;
    adimlar.push(`Ayakta: ${fmt(gunlukKazancEsasSinirli)} × 2/3 = ${fmt(ayaktaGunluk)} ₺ × ${ayaktaGun} gün = ${fmt(ayaktaToplamOdenek)} ₺`);
  } else if (input.tedaviTuru === "yatarak") {
    yatarakGun = odenenGun;
    yatarakToplamOdenek = yatarakGunluk * yatarakGun;
    adimlar.push(`Yatarak: ${fmt(gunlukKazancEsasSinirli)} × 1/2 = ${fmt(yatarakGunluk)} ₺ × ${yatarakGun} gün = ${fmt(yatarakToplamOdenek)} ₺`);
  } else {
    yatarakGun = Math.min(input.yatarakGun ?? 0, odenenGun);
    ayaktaGun = Math.max(0, odenenGun - yatarakGun);
    ayaktaToplamOdenek = ayaktaGunluk * ayaktaGun;
    yatarakToplamOdenek = yatarakGunluk * yatarakGun;
    adimlar.push(`Karma → Ayakta: ${ayaktaGun} gün × ${fmt(ayaktaGunluk)} ₺ = ${fmt(ayaktaToplamOdenek)} ₺`);
    adimlar.push(`Karma → Yatarak: ${yatarakGun} gün × ${fmt(yatarakGunluk)} ₺ = ${fmt(yatarakToplamOdenek)} ₺`);
  }

  const toplamOdenek = ayaktaToplamOdenek + yatarakToplamOdenek;
  adimlar.push(`TOPLAM ÖDENEK: ${fmt(toplamOdenek)} ₺`);

  return {
    toplamRaporGun,
    odenenGun,
    toplamOnikiAyPrimGun,
    doksan_gun_sartiSaglandi,
    toplamOnikiAyBildirim,
    yuzSeksenGunAltinda,
    bazDonemleriKazanc,
    bazDonemleriGun,
    gunlukOrtalamaBrut,
    normalMaasOrtalama,
    yuzElliTavanUygulandimi,
    gunlukOrtalamaKontrolSonrasi,
    raporBitisAsgariGunluk,
    asgariUcretUygulandimi,
    ikiKatAsgariTavan,
    ikiKatTavanUygulandimi,
    analikMaxHafta,
    analikMaxGun,
    analikHaftaAsimi,
    gunlukKazancEsas: gunlukKazancEsasSinirli,
    ayaktaGunluk,
    yatarakGunluk,
    ayaktaToplamOdenek,
    yatarakToplamOdenek,
    toplamOdenek,
    adimlar,
    uyarilar,
  };
}

function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
