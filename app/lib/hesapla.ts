import { getAsgariUcret, getGunlukAsgariUcret } from "./asgariUcret";

export type RaporTuru = "hastalik" | "iskazasi" | "meslekhastligi" | "analik";
export type TedaviTuru = "ayakta" | "yatarak" | "karma";

export interface AyKazanc {
  ay: string;       // "YYYY-MM"
  kazanc: number;
  primGunu: number;
}

export interface KarmaDonem {
  // Karma tedavide her dönem için ayrı tarih + tür girilir
  baslangic: string; // "YYYY-MM-DD"
  bitis: string;
  tur: "ayakta" | "yatarak";
}

export interface HesaplaInput {
  raporTuru: RaporTuru;
  tedaviTuru: TedaviTuru;
  raporBaslangic: string;   // "YYYY-MM-DD"
  raporBitis: string;       // "YYYY-MM-DD"
  // Karma tedavide dönem listesi (opsiyonel, yoksa yatarakGun kullan)
  karmaDonemleri?: KarmaDonem[];
  yatarakGun?: number;
  // Analık: doğum öncesi ve sonrası gün sayıları
  analikOncesiGun?: number;
  analikSonrasiGun?: number;      // karmaDonemleri yoksa fallback
  ayKazanclar: AyKazanc[];  // 12 ay, en yakından eskiye
  // İş kazası/MH emsal kazanç
  emsalKazanc?: number;
  emsalPrimGunu?: number;
  // Prim/ikramiye %150 tavan için prime esas kazanç (ikramiye hariç)
  normalMaasKazanc?: number[];
  // Asgari ücretle mi dolduruldu?
  asgariDolu?: boolean;
}

export interface UyariMesaj {
  tip: "bilgi" | "uyari" | "hata";
  mesaj: string;
}

export interface HesaplaResult {
  toplamRaporGun: number;
  // Analık
  analikMaxGun: number;
  analikHaftaAsimi: boolean;
  kullanılanRaporGun: number; // max'tan sonra
  // Bekleme
  beklemeSuresi: number;
  odenenGun: number;
  // Karma tedavi dökümü
  ayaktaOdenenGun: number;
  yatarakOdenenGun: number;
  // 90 gün şartı
  toplamOnikiAyPrimGun: number;
  doksan_gun_sartiSaglandi: boolean;
  // 180 gün tavan
  yuzSeksenGunAltinda: boolean;
  ikiKatAsgariTavan: number;
  ikiKatTavanUygulandimi: boolean;
  // Baz dönem
  bazDonemleriKazanc: number;
  bazDonemleriGun: number;
  gunlukOrtalamaBrut: number;
  // %150 prim tavan
  normalMaasOrtalama: number;
  yuzElliTavanUygulandimi: boolean;
  yuzElliTavan: number;
  // Sonuç günlük kazanç
  raporBaslangicAsgariGunluk: number; // alt sınır kontrolü için
  asgariUcretUygulandimi: boolean;
  gunlukKazancEsas: number;
  // Ödenek
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

  // ── 1. Toplam rapor gün sayısı ──────────────────────────────
  const toplamRaporGun =
    Math.round((bitis.getTime() - baslangic.getTime()) / 86400000) + 1;

  // ── 2. Analık max süre ──────────────────────────────────────
  // Kural: D.Öncesi max 56 gün + D.Sonrası max 112 gün = 168 gün
  //        Eğer D.Öncesi yoksa (0 veya girilmemiş): D.Sonrası 168 güne kadar olabilir
  //        Toplam hiçbir zaman 168'i geçemez
  const analikMaxGun = 168;
  let kullanılanRaporGun = toplamRaporGun;
  let analikHaftaAsimi = false;
  if (input.raporTuru === "analik") {
    const girilenOncesi = input.analikOncesiGun ?? 0;
    const girilenSonrasi = input.analikSonrasiGun ?? 0;
    const herhangiGirildi = input.analikOncesiGun !== undefined || input.analikSonrasiGun !== undefined;

    if (herhangiGirildi) {
      // D.Öncesi yoksa sonrası 168'e kadar; varsa öncesi max 56, sonrası max 112
      const maxOncesi = 56;
      const maxSonrasi = girilenOncesi === 0 ? 168 : 112;
      const oncesiKesik = Math.min(girilenOncesi, maxOncesi);
      const sonrasiKesik = Math.min(girilenSonrasi, maxSonrasi);
      const hesaplananMax = Math.min(oncesiKesik + sonrasiKesik, 168);
      if (toplamRaporGun > hesaplananMax) {
        kullanılanRaporGun = hesaplananMax;
        analikHaftaAsimi = true;
        const aciklama = girilenOncesi === 0
          ? `D.Öncesi yok → D.Sonrası max 168 gün. Hesaplama ${hesaplananMax} gün.`
          : `D.Öncesi max 56 gün + D.Sonrası max 112 gün = ${hesaplananMax} gün.`;
        adimlar.push(`⚠️ Analık max: ${aciklama} (rapor: ${toplamRaporGun} gün)`);
        uyarilar.push({ tip: "uyari", mesaj: `Analık raporu sınırı aşıldı. ${aciklama} Hesaplama ${hesaplananMax} gün üzerinden yapılmaktadır.` });
      } else {
        kullanılanRaporGun = toplamRaporGun;
      }
    } else {
      // Dönem girilmemiş: toplam 168 sınırı
      if (toplamRaporGun > 168) {
        kullanılanRaporGun = 168;
        analikHaftaAsimi = true;
        adimlar.push(`⚠️ Analık max 168 gün. Hesaplama 168 gün.`);
        uyarilar.push({ tip: "uyari", mesaj: `Analık raporu maksimum 168 gün olabilir. Hesaplama 168 gün üzerinden yapılmaktadır.` });
      }
    }
  }

  // ── 3. Bekleme süresi ────────────────────────────────────────
  // Hastalık: ilk 2 gün ödenmez (3. günden başlar) — 5510 m.18/1-b
  // İş Kazası: ilk günden ödenir — 5510 m.18/1-a, Genelge 2016/21 §3.2
  // Meslek Hastalığı: ilk günden ödenir — 5510 m.18/1-a, Genelge 2016/21 §3.2
  // Analık: ilk günden ödenir — 5510 m.18/1-c
  const beklemeSuresi = input.raporTuru === "hastalik" ? 2 : 0;
  const toplamOdenenGun = Math.max(0, kullanılanRaporGun - beklemeSuresi);

  if (beklemeSuresi > 0) {
    adimlar.push(`Hastalık: ilk ${beklemeSuresi} gün ödenmez (5510 m.18/1-b) → ${kullanılanRaporGun} - ${beklemeSuresi} = ${toplamOdenenGun} ödenecek gün`);
  } else {
    const turAdi = { iskazasi: "İş kazası", meslekhastligi: "Meslek hastalığı", analik: "Analık", hastalik: "Hastalık" }[input.raporTuru];
    adimlar.push(`${turAdi}: ilk günden ödeme (5510 m.18/1-a) → ${toplamOdenenGun} ödenecek gün`);
  }

  // ── 4. Karma tedavide bekleme günü dağılımı ─────────────────
  // Kural: İlk 2 gün yatarak ise → yatarak ödenmez
  //        İlk 2 gün ayakta ise → ayakta ödenmez
  //        Karma karışık: bekletilen günler sırayla hangi türde ise o türden düşülür
  let ayaktaOdenenGun = 0;
  let yatarakOdenenGun = 0;

  if (input.tedaviTuru === "karma" && beklemeSuresi > 0) {
    // karmaDonemleri varsa dönemleri kullan, yoksa yatarakGun'ı kullan
    if (input.karmaDonemleri && input.karmaDonemleri.length > 0) {
      // Dönemleri tarih sırasına göre sırala
      const sirali = [...input.karmaDonemleri].sort(
        (a, b) => new Date(a.baslangic).getTime() - new Date(b.baslangic).getTime()
      );
      // İlk 2 günü hangi tür kapsıyor?
      let beklemKalan = beklemeSuresi;
      let ayaktaBrut = 0, yatarakBrut = 0;
      for (const d of sirali) {
        const ds = new Date(d.baslangic);
        const de = new Date(d.bitis);
        const gun = Math.round((de.getTime() - ds.getTime()) / 86400000) + 1;
        if (d.tur === "ayakta") ayaktaBrut += gun;
        else yatarakBrut += gun;
      }
      // İlk 2 günü kronolojik olarak düş
      let ayaktaNet = ayaktaBrut, yatarakNet = yatarakBrut;
      for (const d of sirali) {
        if (beklemKalan <= 0) break;
        const ds = new Date(d.baslangic);
        const de = new Date(d.bitis);
        const gun = Math.round((de.getTime() - ds.getTime()) / 86400000) + 1;
        const dusen = Math.min(beklemKalan, gun);
        if (d.tur === "ayakta") ayaktaNet -= dusen;
        else yatarakNet -= dusen;
        beklemKalan -= dusen;
      }
      ayaktaOdenenGun = Math.max(0, ayaktaNet);
      yatarakOdenenGun = Math.max(0, yatarakNet);
      adimlar.push(`Karma tedavi dönemleri → Ayakta brüt: ${ayaktaBrut} gün, Yatarak brüt: ${yatarakBrut} gün`);
      adimlar.push(`İlk ${beklemeSuresi} gün kronolojik düşüldükten sonra → Ayakta: ${ayaktaOdenenGun} gün, Yatarak: ${yatarakOdenenGun} gün`);
    } else {
      // Fallback: kullanıcının girdiği yatarakGun
      // Rapordaki ilk 2 gün yatarak/ayakta dağılımını bilemiyoruz
      // Varsayılan: ilk günler yatarak ise, yatarak'tan düş; değilse ayakta'dan düş
      const yatarakBrut = input.yatarakGun ?? 0;
      const ayaktaBrut = Math.max(0, toplamOdenenGun - (yatarakBrut - 0)); // fallback
      // 2. gün kuralını ilk yatarakGun'dan düş
      const yatarakBeklem = Math.min(beklemeSuresi, yatarakBrut);
      const ayaktaBeklem = beklemeSuresi - yatarakBeklem;
      yatarakOdenenGun = Math.max(0, yatarakBrut - yatarakBeklem);
      ayaktaOdenenGun = Math.max(0, (toplamOdenenGun + beklemeSuresi - yatarakBrut) - ayaktaBeklem);
    }
    adimlar.push(`Karma ödeme: Ayakta ${ayaktaOdenenGun} gün + Yatarak ${yatarakOdenenGun} gün = ${ayaktaOdenenGun + yatarakOdenenGun} gün`);
  } else if (input.tedaviTuru === "karma") {
    // İş kazası/analık → bekleme yok
    yatarakOdenenGun = input.yatarakGun ?? 0;
    ayaktaOdenenGun = Math.max(0, toplamOdenenGun - yatarakOdenenGun);
  } else if (input.tedaviTuru === "yatarak") {
    yatarakOdenenGun = toplamOdenenGun;
  } else {
    ayaktaOdenenGun = toplamOdenenGun;
  }

  // ── 5. 90 gün şartı (hastalık ve analıkta geçerli, iş kazası/MH'da aranmaz) ──
  const toplamOnikiAyPrimGun = input.ayKazanclar.slice(0, 12).reduce((s, a) => s + a.primGunu, 0);
  const isKazaMH = input.raporTuru === "iskazasi" || input.raporTuru === "meslekhastligi";
  const doksan_gun_sartiSaglandi = isKazaMH || toplamOnikiAyPrimGun >= 90;
  if (!isKazaMH) {
    adimlar.push(`Son 12 ay prim günü: ${toplamOnikiAyPrimGun} → 90 gün şartı: ${doksan_gun_sartiSaglandi ? "✓" : "✗ SAĞLANMADI"}`);
    if (!doksan_gun_sartiSaglandi) {
      uyarilar.push({ tip: "hata", mesaj: `Ödeneğe hak kazanmak için son 1 yılda en az 90 gün prim gerekmektedir. Girilen: ${toplamOnikiAyPrimGun} gün.` });
    }
  }

  // ── 6. Baz dönem ─────────────────────────────────────────────
  // 21.12.2024 sonrası mevzuatına göre:
  // İş kazası / MH ödenek: 12 ayın TAMAMI
  // İş kazası / MH gelir (sürekli): son 3 ay (bu araç ödenek hesaplar)
  // Hastalık / Analık: 12 ayın tamamı (2021/13 ile değişti, hâlâ geçerli)
  // → Tüm türler için 12 ayın tamamı
  const kullanilanAylar = input.ayKazanclar.slice(0, 12);

  // Emsal kazanç (iş kazası/MH, o ay hiç çalışma yoksa)
  let islemAylar = [...kullanilanAylar];
  if (isKazaMH && input.emsalKazanc && input.emsalKazanc > 0 && islemAylar[0]?.primGunu === 0) {
    islemAylar[0] = { ...islemAylar[0], kazanc: input.emsalKazanc, primGunu: input.emsalPrimGunu ?? 1 };
    adimlar.push(`İş kazası emsal kazanç uygulandı: ${fmt(input.emsalKazanc)} ₺`);
  }

  const bazDonemleriKazanc = islemAylar.reduce((s, a) => s + a.kazanc, 0);
  const bazDonemleriGun = islemAylar.reduce((s, a) => s + a.primGunu, 0);
  adimlar.push(`Baz dönem (12 ay): toplam kazanç = ${fmt(bazDonemleriKazanc)} ₺, toplam prim günü = ${bazDonemleriGun}`);

  const gunlukOrtalamaBrut = bazDonemleriGun > 0 ? bazDonemleriKazanc / bazDonemleriGun : 0;
  adimlar.push(`Günlük brüt ortalama: ${fmt(bazDonemleriKazanc)} ÷ ${bazDonemleriGun} = ${fmt(gunlukOrtalamaBrut)} ₺`);

  // ── 7. 180 gün altı tavan ────────────────────────────────────
  const yuzSeksenGunAltinda = toplamOnikiAyPrimGun < 180;
  // Tavan: rapor başlangıç tarihindeki (iş göremezliğin başladığı) günlük asgari × 2
  const ikiKatAsgariTavan = getGunlukAsgariUcret(baslangic) * 2;

  // ── 8. Prim/ikramiye %150 tavan ──────────────────────────────
  let normalMaasOrtalama = 0;
  let yuzElliTavanUygulandimi = false;
  let yuzElliTavan = 0;
  let gunlukSonuc = gunlukOrtalamaBrut;

  if (input.normalMaasKazanc && input.normalMaasKazanc.length > 0) {
    const normalToplam = input.normalMaasKazanc.slice(0, 12).reduce((s, v) => s + v, 0);
    normalMaasOrtalama = bazDonemleriGun > 0 ? normalToplam / bazDonemleriGun : 0;
    yuzElliTavan = normalMaasOrtalama * 1.5;
    if (gunlukSonuc > yuzElliTavan && normalMaasOrtalama > 0) {
      gunlukSonuc = yuzElliTavan;
      yuzElliTavanUygulandimi = true;
      adimlar.push(`⚠️ %150 tavan: prime esas kazanç ort. ${fmt(normalMaasOrtalama)} ₺ × 1.5 = ${fmt(yuzElliTavan)} ₺ → tavan uygulandı`);
      uyarilar.push({ tip: "uyari", mesaj: `Prim/ikramiye dahil kazanç prime esas kazanç ortalamasının %150'sini (${fmt(yuzElliTavan)} ₺) aştığından sınırlandırıldı.` });
    }
  }

  // ── 9. 180 gün altı tavan uygula ────────────────────────────
  let ikiKatTavanUygulandimi = false;
  if (yuzSeksenGunAltinda && gunlukSonuc > ikiKatAsgariTavan) {
    gunlukSonuc = ikiKatAsgariTavan;
    ikiKatTavanUygulandimi = true;
    adimlar.push(`⚠️ 180 gün altı tavan: asgari × 2 = ${fmt(ikiKatAsgariTavan)} ₺ uygulandı`);
    uyarilar.push({ tip: "uyari", mesaj: `Son 12 ayda 180 günden az prim (${toplamOnikiAyPrimGun} gün). Günlük kazanç asgari ücretin 2 katı (${fmt(ikiKatAsgariTavan)} ₺) ile sınırlandırıldı.` });
  }

  // ── 10. Alt sınır: rapor başlangıç tarihindeki asgari ücret ─
  // Genelge: "iş göremezliğin başladığı tarihteki günlük prime esas kazanç alt sınırı"
  const raporBaslangicAsgariGunluk = getGunlukAsgariUcret(baslangic);
  const asgariUcretUygulandimi = gunlukSonuc < raporBaslangicAsgariGunluk;
  if (asgariUcretUygulandimi) {
    gunlukSonuc = raporBaslangicAsgariGunluk;
    adimlar.push(`⚠️ Alt sınır: ort. < asgari (${fmt(raporBaslangicAsgariGunluk)} ₺) → asgari ücret esas alındı`);
  } else {
    adimlar.push(`✓ Esas günlük kazanç: ${fmt(gunlukSonuc)} ₺`);
  }

  // Üst tavan: asgari × 6.5
  const ustTavan = raporBaslangicAsgariGunluk * 6.5;
  if (gunlukSonuc > ustTavan) {
    gunlukSonuc = ustTavan;
    adimlar.push(`⚠️ Üst tavan (asgari × 6.5 = ${fmt(ustTavan)} ₺) aşıldı → tavan uygulandı`);
    uyarilar.push({ tip: "uyari", mesaj: `Günlük kazanç asgari ücretin 6.5 katı olan ${fmt(ustTavan)} ₺ tavanını aştı.` });
  }

  const gunlukKazancEsas = gunlukSonuc;

  // ── 11. Ödenek hesabı ────────────────────────────────────────
  const ayaktaGunluk = gunlukKazancEsas * (2 / 3);
  const yatarakGunluk = gunlukKazancEsas * (1 / 2);
  const ayaktaToplamOdenek = ayaktaGunluk * ayaktaOdenenGun;
  const yatarakToplamOdenek = yatarakGunluk * yatarakOdenenGun;

  if (input.tedaviTuru === "ayakta") {
    adimlar.push(`Ayakta: ${fmt(gunlukKazancEsas)} × 2/3 = ${fmt(ayaktaGunluk)} ₺ × ${ayaktaOdenenGun} gün = ${fmt(ayaktaToplamOdenek)} ₺`);
  } else if (input.tedaviTuru === "yatarak") {
    adimlar.push(`Yatarak: ${fmt(gunlukKazancEsas)} × 1/2 = ${fmt(yatarakGunluk)} ₺ × ${yatarakOdenenGun} gün = ${fmt(yatarakToplamOdenek)} ₺`);
  } else {
    adimlar.push(`Karma → Ayakta: ${ayaktaOdenenGun} gün × ${fmt(ayaktaGunluk)} ₺ = ${fmt(ayaktaToplamOdenek)} ₺`);
    adimlar.push(`Karma → Yatarak: ${yatarakOdenenGun} gün × ${fmt(yatarakGunluk)} ₺ = ${fmt(yatarakToplamOdenek)} ₺`);
  }

  const toplamOdenek = ayaktaToplamOdenek + yatarakToplamOdenek;
  adimlar.push(`TOPLAM ÖDENEK: ${fmt(toplamOdenek)} ₺`);

  return {
    toplamRaporGun,
    analikMaxGun,
    analikHaftaAsimi,
    kullanılanRaporGun,
    beklemeSuresi,
    odenenGun: toplamOdenenGun,
    ayaktaOdenenGun,
    yatarakOdenenGun,
    toplamOnikiAyPrimGun,
    doksan_gun_sartiSaglandi,
    yuzSeksenGunAltinda,
    ikiKatAsgariTavan,
    ikiKatTavanUygulandimi,
    bazDonemleriKazanc,
    bazDonemleriGun,
    gunlukOrtalamaBrut,
    normalMaasOrtalama,
    yuzElliTavanUygulandimi,
    yuzElliTavan,
    raporBaslangicAsgariGunluk,
    asgariUcretUygulandimi,
    gunlukKazancEsas,
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
