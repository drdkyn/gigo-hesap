"use client";

import { useState, useCallback, useEffect } from "react";
import {
  hesapla, HesaplaResult, AyKazanc, RaporTuru, TedaviTuru, KarmaDonem
} from "../lib/hesapla";
import { getAsgariUcret, getGunlukAsgariUcret } from "../lib/asgariUcret";
import AnalikHesap, { AnalikSonuc } from "./AnalikHesap";

/* ── Yardımcılar ─────────────────────────────────────── */
function gunFarki(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1);
}
function getOnceki12Ay(baslangicStr: string): string[] {
  const d = baslangicStr ? new Date(baslangicStr) : new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const t = new Date(d.getFullYear(), d.getMonth() - i - 1, 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
}
const AYLAR_TR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
function ayEtiket(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  return `${AYLAR_TR[parseInt(m) - 1]} ${y}`;
}
function getAsgariAy(yyyymm: string) { return getAsgariUcret(new Date(yyyymm + "-01")); }
function fmt(n: number) { return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ── Veri yapıları ───────────────────────────────────── */
interface AyKazancSatir { id: number; ay: string; kazanc: number; primGunu: number; }
let _aysatirId = 100;

interface RaporSatir {
  id: number;
  tur: "ayakta" | "yatarak";
  donemTip: "oncesi" | "sonrasi" | null;
  gun: number | null;
  baslangic: string;
  bitis: string;
}

let satirSayac = 3;
function yeniSatir(tur: "ayakta" | "yatarak" = "ayakta"): RaporSatir {
  return { id: satirSayac++, tur, donemTip: "oncesi", gun: null, baslangic: "", bitis: "" };
}

export default function HesaplamaFormu() {
  const bugun = new Date().toISOString().slice(0, 10);

  // 1. Rapor türü
  const [raporTuru, setRaporTuru] = useState<RaporTuru>("hastalik");

  // 2. Rapor süresi ve şekli
  const [tarihMod, setTarihMod] = useState<"gun" | "tarih">("gun");
  const [satirlar, setSatirlar] = useState<RaporSatir[]>([
    { id: 1, tur: "ayakta", donemTip: "oncesi", gun: null, baslangic: "", bitis: "" },
    { id: 2, tur: "ayakta", donemTip: "sonrasi", gun: null, baslangic: "", bitis: "" },
  ]);

  // Hesaplama için türetilen değerler
  const [raporBaslangic, setRaporBaslangic] = useState(bugun);
  const [raporBitis, setRaporBitis] = useState(bugun);
  const [tedaviTuru, setTedaviTuru] = useState<TedaviTuru>("ayakta");
  const [karmaDonemleri, setKarmaDonemleri] = useState<KarmaDonem[]>([]);

  // Satırlardan hesaplama parametrelerini türet
  useEffect(() => {
    const gecerli = satirlar.filter(s =>
      tarihMod === "gun" ? (s.gun ?? 0) > 0 : (s.baslangic && s.bitis)
    );
    if (gecerli.length === 0) return;

    if (tarihMod === "gun") {
      // Toplam gün: satırlardaki gün toplamı, bugünden itibaren
      const toplamGun = gecerli.reduce((s, r) => s + (r.gun ?? 0), 0);
      setRaporBaslangic(bugun);
      setRaporBitis(addDays(bugun, toplamGun - 1));
    } else {
      // En erken başlangıç - en geç bitiş
      const baslangiclar = gecerli.map(s => s.baslangic).sort();
      const bitisler = gecerli.map(s => s.bitis).sort();
      setRaporBaslangic(baslangiclar[0]);
      setRaporBitis(bitisler[bitisler.length - 1]);
    }

    // Tedavi türü: tüm satırlar aynı ise o tür, karışıksa karma
    const turler = new Set(gecerli.map(s => s.tur));
    if (turler.size === 1) {
      const tek = gecerli[0].tur;
      setTedaviTuru(tek);
      setKarmaDonemleri([]);
    } else {
      setTedaviTuru("karma");
      if (tarihMod === "tarih") {
        setKarmaDonemleri(gecerli.map(s => ({
          baslangic: s.baslangic,
          bitis: s.bitis,
          tur: s.tur,
        })));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satirlar, tarihMod]);

  // 3. Kazanç — her ay birden fazla satır olabilir
  const [kazancMod, setKazancMod] = useState<"manuel" | "asgari">("manuel");
  const ayListesi = getOnceki12Ay(raporBaslangic);
  const [ayKazancSatirlar, setAyKazancSatirlar] = useState<AyKazancSatir[]>(() =>
    ayListesi.map((ay) => ({ id: _aysatirId++, ay, kazanc: 0, primGunu: 0 }))
  );

  const [emsalAktif, setEmsalAktif] = useState(false);
  const [emsalKazanc, setEmsalKazanc] = useState(0);
  const [emsalPrimGunu, setEmsalPrimGunu] = useState(1);
  const [normalMaasAktif, setNormalMaasAktif] = useState(false);
  const [normalMaaslar, setNormalMaaslar] = useState<number[]>(Array(12).fill(0));

  const [sonuc, setSonuc] = useState<HesaplaResult | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [analikSonuc, setAnalikSonuc] = useState<AnalikSonuc | null>(null);

  /* Satır işlemleri */
  const updateSatir = (id: number, field: keyof RaporSatir, val: string | number | null) => {
    setSatirlar(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
    setSonuc(null);
  };
  const addSatir = () => { setSatirlar(prev => [...prev, yeniSatir()]); setSonuc(null); };
  const removeSatir = (id: number) => {
    setSatirlar(prev => prev.length > 1 ? prev.filter(s => s.id !== id) : prev);
    setSonuc(null);
  };

  /* Kazanç */
  const handleBaslangicChange = (val: string) => {
    const yeniAylar = getOnceki12Ay(val);
    if (kazancMod === "asgari") {
      setAyKazancSatirlar(yeniAylar.map((ay) => ({ id: _aysatirId++, ay, kazanc: getAsgariAy(ay), primGunu: 30 })));
    } else {
      // Mevcut ayların ilk satırını koru, yeni aylar için boş ekle
      setAyKazancSatirlar((prev) => {
        const result: AyKazancSatir[] = [];
        for (const ay of yeniAylar) {
          const mevcutlar = prev.filter(s => s.ay === ay);
          if (mevcutlar.length > 0) result.push(...mevcutlar);
          else result.push({ id: _aysatirId++, ay, kazanc: 0, primGunu: 0 });
        }
        return result;
      });
    }
  };
  const doldurAsgariUcret = useCallback(() => {
    const bazTarih = tarihMod === "gun" ? bugun : raporBaslangic;
    const aylar = getOnceki12Ay(bazTarih);
    setAyKazancSatirlar(aylar.map((ay) => ({ id: _aysatirId++, ay, kazanc: getAsgariAy(ay), primGunu: 30 })));
    setKazancMod("asgari"); setSonuc(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raporBaslangic, tarihMod]);
  const manueleMod = () => { setKazancMod("manuel"); setSonuc(null); };
  const updateAySatir = (id: number, field: "kazanc" | "primGunu", val: string) => {
    setAyKazancSatirlar((prev) => prev.map(s => s.id === id
      ? { ...s, [field]: field === "kazanc" ? parseFloat(val) || 0 : parseInt(val) || 0 }
      : s));
    setSonuc(null);
  };
  const addAySatir = (ay: string) => {
    setAyKazancSatirlar((prev) => {
      // O ayın son satırından sonra ekle
      const sonIdx = prev.map((s, i) => s.ay === ay ? i : -1).filter(i => i >= 0).pop() ?? prev.length - 1;
      const yeni = [...prev];
      yeni.splice(sonIdx + 1, 0, { id: _aysatirId++, ay, kazanc: 0, primGunu: 0 });
      return yeni;
    });
    setSonuc(null);
  };
  const removeAySatir = (id: number) => {
    setAyKazancSatirlar((prev) => {
      const satir = prev.find(s => s.id === id);
      if (!satir) return prev;
      // O aya ait en az 1 satır kalmalı
      const ayinSatirlari = prev.filter(s => s.ay === satir.ay);
      if (ayinSatirlari.length <= 1) return prev;
      return prev.filter(s => s.id !== id);
    });
    setSonuc(null);
  };

  /* Hesapla */
  const handleHesapla = () => {
    setHata(null); setSonuc(null);

    // Analık + tarih modunda satırlar AnalikHesap'tan geliyor
    const analikTarihAktif = raporTuru === "analik" && tarihMod === "tarih";

    if (!analikTarihAktif) {
      const gecerli = satirlar.filter(s =>
        tarihMod === "gun" ? (s.gun ?? 0) > 0 : (s.baslangic && s.bitis)
      );
      if (gecerli.length === 0) {
        setHata(tarihMod === "gun" ? "En az bir satıra gün sayısı giriniz." : "En az bir satıra tarih giriniz.");
        return;
      }
      if (tarihMod === "tarih") {
        for (const s of gecerli) {
          if (new Date(s.bitis) < new Date(s.baslangic)) {
            setHata("Bir satırda bitiş tarihi başlangıçtan önce."); return;
          }
        }
      }
    }

    // Analık + tarih: doğum tarihi zorunlu
    if (analikTarihAktif && !analikSonuc) {
      setHata("Doğum tarihini giriniz."); return;
    }

    const gecerli = satirlar.filter(s =>
      tarihMod === "gun" ? (s.gun ?? 0) > 0 : (s.baslangic && s.bitis)
    );

    const kullanilacakAylar: AyKazanc[] = tarihMod === "gun"
      ? getOnceki12Ay(bugun).map((ay) => ({ ay, kazanc: getAsgariAy(ay), primGunu: 30 }))
      : (() => {
          // Aynı aya ait satırları topla
          const ayMap = new Map<string, AyKazanc>();
          for (const s of ayKazancSatirlar) {
            const mevcut = ayMap.get(s.ay);
            if (mevcut) {
              mevcut.kazanc += s.kazanc;
              mevcut.primGunu += s.primGunu;
            } else {
              ayMap.set(s.ay, { ay: s.ay, kazanc: s.kazanc, primGunu: s.primGunu });
            }
          }
          return getOnceki12Ay(raporBaslangic).map(ay => ayMap.get(ay) ?? { ay, kazanc: 0, primGunu: 0 });
        })();

    if (tarihMod === "tarih" && kullanilacakAylar.slice(0, 12).reduce((s, a) => s + a.primGunu, 0) === 0) {
      setHata("12 ay toplam prim günü sıfır olamaz."); return;
    }

    // Analık + tarih modunda AnalikSonuc'tan değerleri al
    let analikOncesiGunHesap = analikOncesiGun;
    let analikSonrasiGunHesap = analikSonrasiGun;
    let karmaDon: KarmaDonem[] | undefined = undefined;
    let yatarakGunSayisi: number | undefined = undefined;
    let hesapBaslangic = raporBaslangic;
    let hesapBitis = raporBitis;

    if (raporTuru === "analik" && tarihMod === "tarih" && analikSonuc) {
      // AnalikHesap bileşeninden gelen tüm satırları donemTip ile işaretle
      const tumSatirlar = [
        ...analikSonuc.oncesiSatirlar.map((s, i) => ({ id: 1 + i, baslangic: s.baslangic, bitis: s.bitis, tur: s.tur as "ayakta" | "yatarak", donemTip: "oncesi" as const, gun: null })),
        ...analikSonuc.sonrasiSatirlar.map((s, i) => ({ id: 100 + i, baslangic: s.baslangic, bitis: s.bitis, tur: s.tur as "ayakta" | "yatarak", donemTip: "sonrasi" as const, gun: null })),
      ].filter(s => s.baslangic && s.bitis);

      if (tumSatirlar.length === 0) {
        setHata("Analık raporu tarih bilgileri eksik."); return;
      }
      
      // State'e ekle (analikOncesiGun doğru hesaplanması için)
      setSatirlar(tumSatirlar);

      const turlerSet = new Set(tumSatirlar.map(s => s.tur));
      if (turlerSet.size > 1) {
        karmaDon = tumSatirlar;
      }

      hesapBaslangic = analikSonuc.oncesiBaslangic || analikSonuc.sonrasiBaslangic;
      hesapBitis = analikSonuc.sonrasiBitis || analikSonuc.oncesiBitis;
      
      // Doğum öncesi/sonrası gün doğrudan AnalikHesap sonuçlarından al
      analikOncesiGunHesap = analikSonuc.oncesiGun > 0 ? Math.min(analikSonuc.oncesiGun, 56) : 0;
      // Sonrası: 112 + aktarılan + erken, toplam 168 aşılamaz (geç aşım ayrı)
      const sonrasiMaxHesap = Math.min(112 + analikSonuc.aktarilanGun + analikSonuc.erkenDogumEkGun, 168);
      analikSonrasiGunHesap = analikSonuc.sonrasiGun > 0 
        ? Math.min(analikSonuc.sonrasiGun - analikSonuc.gecAsimGun, sonrasiMaxHesap)
        : 0;
    } else {
      // Normal karma hesap
      if (tedaviTuru === "karma") {
        if (tarihMod === "tarih") {
          karmaDon = gecerli.map(s => ({ baslangic: s.baslangic, bitis: s.bitis, tur: s.tur }));
        } else {
          let offset = 0;
          karmaDon = gecerli.map(s => {
            const bas = addDays(bugun, offset);
            const bit = addDays(bugun, offset + (s.gun ?? 1) - 1);
            offset += (s.gun ?? 1);
            return { baslangic: bas, bitis: bit, tur: s.tur };
          });
          yatarakGunSayisi = gecerli.filter(s => s.tur === "yatarak").reduce((sum, s) => sum + (s.gun ?? 0), 0);
        }
      }
    }

    try {
      const r = hesapla({
        raporTuru, tedaviTuru: karmaDon ? "karma" : tedaviTuru,
        raporBaslangic: hesapBaslangic, raporBitis: hesapBitis,
        karmaDonemleri: karmaDon,
        yatarakGun: tedaviTuru === "karma" && tarihMod === "gun" ? yatarakGunSayisi : undefined,
        ayKazanclar: kullanilacakAylar,
        analikOncesiGun: raporTuru === "analik" ? analikOncesiGunHesap : undefined,
        analikSonrasiGun: raporTuru === "analik" ? analikSonrasiGunHesap : undefined,
        gecAsimGun: raporTuru === "analik" ? analikSonuc?.gecAsimGun : undefined,
        emsalKazanc: emsalAktif ? emsalKazanc : undefined,
        emsalPrimGunu: emsalAktif ? emsalPrimGunu : undefined,
        normalMaasKazanc: normalMaasAktif ? normalMaaslar : undefined,
        asgariDolu: tarihMod === "gun" || kazancMod === "asgari",
      });
      setSonuc(r);
      setTimeout(() => document.getElementById("sonuc-alan")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { setHata("Hesaplama hatası: " + (e as Error).message); }
  };

  const handleTemizle = () => {
    setSonuc(null); setHata(null); setKazancMod("manuel");
    setAyKazancSatirlar(ayListesi.map((ay) => ({ id: _aysatirId++, ay, kazanc: 0, primGunu: 0 })));
    setSatirlar([
      { id: 1, tur: "ayakta", donemTip: "oncesi", gun: null, baslangic: "", bitis: "" },
      { id: 2, tur: "ayakta", donemTip: "sonrasi", gun: null, baslangic: "", bitis: "" },
    ]);
  };

  /* Anlık özetler */
  // Analık özel hesap: doğum öncesi + doğum sonrası (arası kesilmiş olabilir)
  let toplamRaporGun = 0;
  if (raporTuru === "analik" && tarihMod === "tarih" && analikSonuc) {
    toplamRaporGun = analikSonuc.oncesiGun + analikSonuc.sonrasiGun;
  } else {
    toplamRaporGun = raporBaslangic && raporBitis ? gunFarki(raporBaslangic, raporBitis) : 0;
  }
  const onikiAyGun = ayKazancSatirlar.reduce((s, a) => s + a.primGunu, 0);
  const bazKazanc = ayKazancSatirlar.reduce((s, a) => s + a.kazanc, 0);
  const bazGun = onikiAyGun;
  const canliOrt = bazGun > 0 ? bazKazanc / bazGun : 0;

  // Analık dönem kontrolleri
  // Analık gün hesabı
  // Tarih modunda: AnalikSonuc'tan al (doğum öncesi/sonrası ayrı hesaplanmış)
  // Normal modda: satirlar'dan hesapla
  let analikOncesiGun = 0;
  let analikSonrasiGun = 0;
  
  if (analikTarihModu && analikSonuc) {
    // Tarih modu: doğrudan AnalikSonuc'tan
    analikOncesiGun = analikSonuc.oncesiGun;
    analikSonrasiGun = analikSonuc.sonrasiGun;
  } else {
    // Gun modu veya normal: satirlar'dan
    analikOncesiGun = satirlar
      .filter(s => s.donemTip === "oncesi")
      .reduce((sum, s) => {
        if (tarihMod === "gun") return sum + (s.gun ?? 0);
        if (s.baslangic && s.bitis) return sum + gunFarki(s.baslangic, s.bitis);
        return sum;
      }, 0);
    analikSonrasiGun = satirlar
      .filter(s => s.donemTip === "sonrasi")
      .reduce((sum, s) => {
        if (tarihMod === "gun") return sum + (s.gun ?? 0);
        if (s.baslangic && s.bitis) return sum + gunFarki(s.baslangic, s.bitis);
        return sum;
      }, 0);
  }
  // Analık + tarih modunda AnalikHesap bileşeni kendi uyarılarını gösterir
  const analikTarihModu = raporTuru === "analik" && tarihMod === "tarih";
  const analikOncesiAsim = !analikTarihModu && raporTuru === "analik" && analikOncesiGun > 56;
  const analikSonrasiMaxGun = analikOncesiGun === 0 ? 168 : 112;
  const analikSonrasiAsim = !analikTarihModu && raporTuru === "analik" && analikSonrasiGun > analikSonrasiMaxGun;
  const bitisAsgari = raporBaslangic ? getGunlukAsgariUcret(new Date(raporBaslangic)) : 0;
  const isKazaMH = raporTuru === "iskazasi" || raporTuru === "meslekhastligi";

  /* ── RENDER ──────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: "var(--gray-bg)" }}>

      {/* ── Başlık ── */}
      <header className="site-header" style={{
        background: "linear-gradient(135deg, #1a4b8c 0%, #0d2d5e 100%)",
        color: "#fff", boxShadow: "0 3px 16px rgba(26,75,140,0.35)",
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div className="header-ikon" style={{
            width: 46, height: 46, flexShrink: 0, background: "#ffffff",
            borderRadius: 12, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          }}>🩺</div>
          <div style={{ flex: 1 }}>
            <h1 className="header-title" style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-0.3px" }}>
              SGK Geçici İş Göremezlik Ödeneği Hesaplama
            </h1>
            <p className="header-sub" style={{ margin: "2px 0 0", fontSize: 11, opacity: 0.7 }}>
              Hastalık · İş Kazası · Meslek Hastalığı · Analık
            </p>
          </div>
        </div>
      </header>

      {/* ── Ana içerik ── */}
      <div className="main-wrap" style={{ maxWidth: 1400, margin: "0 auto", padding: "12px 14px 32px" }}>
        <div className="pc-grid">

          {/* ── SOL: Form ── */}
          <div className="pc-left" style={{ display: "flex", flexDirection: "column", gap: 5 }}>

            {/* ── 1. RAPOR TÜRÜ ── */}
            <Kart>
              <Baslik no="1" metin="Rapor Türü" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
                <TogBtn aktif={raporTuru === "hastalik"} renk="var(--blue)"
                  onClick={() => { setRaporTuru("hastalik"); setSonuc(null); }}>
                  Hastalık
                </TogBtn>
                <TogBtn aktif={raporTuru === "analik"} renk="var(--blue)"
                  onClick={() => { setRaporTuru("analik"); setSonuc(null); }}>
                  Analık
                </TogBtn>
                <TogBtn aktif={isKazaMH} renk="var(--blue)"
                  onClick={() => { setRaporTuru(raporTuru === "iskazasi" ? "meslekhastligi" : "iskazasi"); setSonuc(null); }}>
                  İşkazası /<br /><span style={{ fontSize: 10 }}>Meslek Hst.</span>
                </TogBtn>
              </div>
              <BilgiKutu renk="mavi">
                {raporTuru === "hastalik" && <>Son 12 ay ortalaması baz alınır, ilk 2 gün ödenmez. 90 gün prim şartı var.</>}
                {raporTuru === "analik"   && <>Son 12 ay ortalaması baz alınır, ilk günden ödeme. 90 gün prim şartı var. Max 24 hafta / 168 gün.</>}
                {isKazaMH                && <>Son 12 ay ortalaması baz alınır, ilk günden ödeme. 90 gün şartı aranmaz.</>}
              </BilgiKutu>
            </Kart>

            {/* ── 2. RAPOR SÜRESİ VE ŞEKLİ ── */}
            <Kart>
              <Baslik no="2" metin="Rapor Süresi ve Şekli" />

              {/* Mod toggle - kompakt */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1.5px solid var(--border)", borderRadius: 7, overflow: "hidden", marginBottom: 6 }}>
                <button onClick={() => { setTarihMod("gun"); setSonuc(null); }} style={{
                  padding: "7px 4px", border: "none", cursor: "pointer", fontSize: 12,
                  fontWeight: tarihMod === "gun" ? 700 : 500,
                  background: tarihMod === "gun" ? "var(--blue)" : "#f8fafc",
                  color: tarihMod === "gun" ? "#fff" : "var(--muted)",
                  borderRight: "1px solid var(--border)",
                }}>🔢 Gün Sayısı Gir</button>
                <button onClick={() => { setTarihMod("tarih"); setSonuc(null); }} style={{
                  padding: "7px 4px", border: "none", cursor: "pointer", fontSize: 12,
                  fontWeight: tarihMod === "tarih" ? 700 : 500,
                  background: tarihMod === "tarih" ? "var(--blue)" : "#f8fafc",
                  color: tarihMod === "tarih" ? "#fff" : "var(--muted)",
                }}>📅 Tarih Gir</button>
              </div>

              {/* Uyarı: sadece hastalıkta göster */}
              {raporTuru === "hastalik" && (
                <div style={{
                  background: "#fffbeb", border: "1px solid #fde68a",
                  borderRadius: 6, padding: "5px 10px", fontSize: 11,
                  color: "#92400e", marginBottom: 6, fontWeight: 600,
                }}>
                  ⚠️ Rapordaki sırası ile giriniz. (İlk 2 gün ödenmez kuralı satır sırasına göre uygulanır.)
                </div>
              )}

              {/* Analık + Tarih modu: özel hesap bileşeni */}
              {raporTuru === "analik" && tarihMod === "tarih" ? (
                <AnalikHesap onChange={setAnalikSonuc} />
              ) : (
              <>
              {/* Satırlar */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {satirlar.map((s, idx) => (
                  <div key={s.id} style={{
                    background: s.tur === "yatarak" ? "#f0f4fa" : "#f0fdf4",
                    border: `1.5px solid ${s.tur === "yatarak" ? "#bfdbfe" : "#86efac"}`,
                    borderRadius: 7, padding: "5px 8px",
                  }}>
                    {tarihMod === "gun" ? (
                      /* GÜN MODU: tek satır */
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, color: "var(--muted)", minWidth: 12, flexShrink: 0 }}>{idx + 1}.</span>
                        <input
                          type="number" min={1} value={s.gun ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateSatir(s.id, "gun", v === "" ? null : Math.max(1, parseInt(v) || 1));
                          }}
                          className="gun-input"
                          style={{ ...inp, width: 72, fontSize: 13, fontWeight: 700, textAlign: "center", padding: "4px 5px", flexShrink: 0 }}
                          placeholder="Gün" />
                        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                          <TogBtn aktif={s.tur === "ayakta"} renk="var(--green)" onClick={() => updateSatir(s.id, "tur", "ayakta")} kucuk>Ayakta</TogBtn>
                          <TogBtn aktif={s.tur === "yatarak"} renk="var(--blue)" onClick={() => updateSatir(s.id, "tur", "yatarak")} kucuk>Yatarak</TogBtn>
                        </div>
                        {raporTuru === "analik" && (
                          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                            <TogBtn aktif={s.donemTip === "oncesi"} renk="#7c3aed" onClick={() => updateSatir(s.id, "donemTip", "oncesi")} kucuk>D.Önc.</TogBtn>
                            <TogBtn aktif={s.donemTip === "sonrasi"} renk="#b45309" onClick={() => updateSatir(s.id, "donemTip", "sonrasi")} kucuk>D.Son.</TogBtn>
                          </div>
                        )}
                        {satirlar.length > 1 && (
                          <button onClick={() => removeSatir(s.id)} style={{ background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 5, padding: "2px 6px", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>✕</button>
                        )}
                      </div>
                    ) : (
                      /* TARİH MODU: üstte tarihler, altta butonlar */
                      <div>
                        {/* Üst satır: numara + tarihler + sil */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--muted)", minWidth: 12, flexShrink: 0 }}>{idx + 1}.</span>
                          <input type="date" value={s.baslangic}
                            onChange={(e) => { updateSatir(s.id, "baslangic", e.target.value); handleBaslangicChange(e.target.value); }}
                            style={{ ...inp, padding: "4px 6px", fontSize: 12, flex: 1, minWidth: 0 }} />
                          <span style={{ fontSize: 9, color: "var(--muted)", flexShrink: 0 }}>→</span>
                          <input type="date" value={s.bitis} min={s.baslangic}
                            onChange={(e) => updateSatir(s.id, "bitis", e.target.value)}
                            style={{ ...inp, padding: "4px 6px", fontSize: 12, flex: 1, minWidth: 0 }} />
                          {s.baslangic && s.bitis && (
                            <span style={{ fontSize: 9, color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{gunFarki(s.baslangic, s.bitis)}g</span>
                          )}
                          {satirlar.length > 1 && (
                            <button onClick={() => removeSatir(s.id)} style={{ background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 5, padding: "2px 5px", fontSize: 10, cursor: "pointer", flexShrink: 0 }}>✕</button>
                          )}
                        </div>
                        {/* Alt satır: tür + analık dönem */}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <TogBtn aktif={s.tur === "ayakta"} renk="var(--green)" onClick={() => updateSatir(s.id, "tur", "ayakta")} kucuk>Ayakta</TogBtn>
                          <TogBtn aktif={s.tur === "yatarak"} renk="var(--blue)" onClick={() => updateSatir(s.id, "tur", "yatarak")} kucuk>Yatarak</TogBtn>
                          {raporTuru === "analik" && (
                            <>
                              <TogBtn aktif={s.donemTip === "oncesi"} renk="#7c3aed" onClick={() => updateSatir(s.id, "donemTip", "oncesi")} kucuk>D.Öncesi</TogBtn>
                              <TogBtn aktif={s.donemTip === "sonrasi"} renk="#b45309" onClick={() => updateSatir(s.id, "donemTip", "sonrasi")} kucuk>D.Sonrası</TogBtn>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Yeni satır ekle */}
                <button onClick={addSatir} style={{
                  background: "#f8fafc", border: "1.5px dashed var(--border)", borderRadius: 6,
                  padding: "5px", fontSize: 11, color: "var(--blue)", cursor: "pointer", fontWeight: 600,
                }}>+ Yeni Rapor Satırı Ekle</button>
              </div>
              </> /* analık tarih modu fragment kapanışı */
              )}

              {/* Gün modu bilgi kutusu */}
              {tarihMod === "gun" && (
                <div className="gun-bilgi" style={{
                  marginTop: 8, background: "#eff6ff", border: "1px solid #bfdbfe",
                  borderRadius: 8, padding: "10px 14px", color: "#1e40af", lineHeight: 1.7,
                  fontSize: 13,
                }}>
                  ℹ️ Güncel asgari ücrete (2026) göre hesaplanacaktır.{" "}
                  Detaylı hesap için{" "}
                  <span
                    onClick={() => { setTarihMod("tarih"); setSonuc(null); }}
                    style={{
                      fontSize: 15, fontWeight: 700,
                      textDecoration: "underline", cursor: "pointer",
                    }}
                  >Tarih Gir'i</span>{" "}seçin.
                </div>
              )}

              {/* Anlık özet chips */}
              {toplamRaporGun > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                  <Chip
                    renk={raporTuru === "analik" && (analikOncesiAsim || analikSonrasiAsim) ? "var(--red)" : "var(--blue)"}
                    etiket="Toplam Rapor"
                    deger={`${toplamRaporGun} gün`}
                  />
                  {tarihMod === "tarih" && <Chip renk="#475569" etiket="Bitiş" deger={raporBitis} />}
                  <Chip renk={onikiAyGun >= 90 ? "var(--green)" : "var(--red)"} etiket="12 Ay Prim" deger={`${onikiAyGun} gün`} />
                  {canliOrt > 0 && <Chip renk={canliOrt >= bitisAsgari ? "var(--green)" : "#d97706"} etiket="Günlük Ort." deger={`${fmt(canliOrt)} ₺`} />}
                  {raporTuru === "analik" && analikOncesiGun > 0 && (
                    <Chip renk={analikOncesiAsim ? "var(--red)" : "#7c3aed"} etiket="D.Öncesi" deger={`${analikOncesiGun} / 56 gün${analikOncesiAsim ? " ⚠️" : ""}`} />
                  )}
                  {raporTuru === "analik" && analikSonrasiGun > 0 && (
                    <Chip renk={analikSonrasiAsim ? "var(--red)" : "#b45309"} etiket="D.Sonrası" deger={`${analikSonrasiGun} / ${analikSonrasiMaxGun} gün${analikSonrasiAsim ? " ⚠️" : ""}`} />
                  )}
                </div>
              )}
              {onikiAyGun > 0 && onikiAyGun < 90 && !isKazaMH && raporTuru !== "analik" && (
                <BilgiKutu renk="kirmizi">⚠️ Son 12 ayda <b>{onikiAyGun} gün</b> prim var. Hak için <b>90 gün</b> gerekli.</BilgiKutu>
              )}
              {tarihMod === "tarih" && onikiAyGun > 0 && onikiAyGun < 180 && canliOrt > 0 && (() => {
                const bitisD = new Date(raporBaslangic);
                const asgariX2 = getGunlukAsgariUcret(bitisD) * 2;
                return canliOrt > asgariX2 ? (
                  <BilgiKutu renk="sari">
                    ⚠️ Son 12 ayda <b>{onikiAyGun} gün</b> prim var (180 günden az). Günlük kazanç günlük asgari ücretin 2 katı olan <b>{fmt(asgariX2)} ₺</b> ile sınırlandırılacaktır.
                  </BilgiKutu>
                ) : null;
              })()}
              {analikOncesiAsim && (
                <BilgiKutu renk="kirmizi">⚠️ Doğum öncesi raporu maksimum <b>56 gün (8 hafta)</b> olabilir. Girilen: <b>{analikOncesiGun} gün</b>.</BilgiKutu>
              )}
              {analikSonrasiAsim && (
                <BilgiKutu renk="kirmizi">⚠️ Doğum sonrası raporu{analikOncesiGun === 0 ? " (doğum öncesi yoksa)" : ""} maksimum <b>{analikSonrasiMaxGun} gün</b> olabilir. Girilen: <b>{analikSonrasiGun} gün</b>.</BilgiKutu>
              )}
              {raporTuru === "analik" && toplamRaporGun > 168 && (
                <BilgiKutu renk="kirmizi">⚠️ Analık raporu maksimum <b>24 hafta (168 gün)</b> olabilir. Girilen: <b>{toplamRaporGun} gün</b>. Hesaplama 168 gün üzerinden yapılır.</BilgiKutu>
              )}
            </Kart>

            {/* ── 3. Kazanç Tablosu — sadece tarih modunda ── */}
            {tarihMod === "tarih" && <Kart>
              <Baslik no="3" metin="Son 12 Ay Prime Esas Kazanç" />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <button onClick={doldurAsgariUcret} style={eylemBtn("var(--blue)")}>📋 Asgari Ücretle Doldur</button>
                {kazancMod === "asgari" && <button onClick={manueleMod} style={eylemBtn("#64748b")}>✏️ Manuel Düzenle</button>}
                <button onClick={handleTemizle} style={eylemBtn("#9ca3af")}>🗑️ Sıfırla</button>
              </div>

              {kazancMod === "asgari" ? (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: 6, fontSize: 12 }}>✓ Güncel asgari ücrete göre dolduruldu (prim gün: 30)</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {ayKazancSatirlar.map((a) => (
                      <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#374151" }}>
                        <span>{ayEtiket(a.ay)}</span>
                        <span style={{ fontWeight: 600 }}>{fmt(a.kazanc)} ₺ / {a.primGunu} gün</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px solid #86efac", marginTop: 8, paddingTop: 6, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12, color: "var(--green)" }}>
                    <span>Toplam</span>
                    <span>{fmt(bazKazanc)} ₺ / {bazGun} gün → {fmt(canliOrt)} ₺/gün</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {/* Başlık */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 2.5fr 1.2fr 20px", gap: 4, padding: "0 2px" }}>
                    <span style={th}>Ay</span><span style={th}>Brüt Kazanç (₺)</span><span style={th}>Prim Gün</span><span />
                  </div>

                  {/* Ayları grupla ve render et */}
                  {(() => {
                    const aylar = getOnceki12Ay(raporBaslangic);
                    return aylar.map((ay, ayIdx) => {
                      const ayAsgari = getAsgariAy(ay);
                      const satirlar = ayKazancSatirlar.filter(s => s.ay === ay);
                      return satirlar.map((s, sIdx) => {
                        const altSinir = s.kazanc > 0 && s.kazanc < ayAsgari && sIdx === 0;
                        return (
                          <div key={s.id} style={{
                            display: "grid", gridTemplateColumns: "2fr 2.5fr 1.2fr 20px", gap: 4,
                            background: ayIdx % 2 === 0 ? "#fff" : "#f9fbff",
                            borderRadius: sIdx === 0 ? "6px 6px 0 0" : sIdx === satirlar.length - 1 ? "0 0 6px 6px" : 0,
                            padding: "3px 2px",
                            border: "1px solid #f0f4fa",
                            borderTop: sIdx > 0 ? "1px dashed #e2e8f0" : "1px solid #f0f4fa",
                          }}>
                            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 2 }}>
                              {sIdx === 0 ? (
                                <>
                                  <span style={{ fontSize: 11, fontWeight: 600 }}>{ayEtiket(ay)}</span>
                                  <span style={{ fontSize: 9, color: "var(--muted)" }}>Asg: {fmt(ayAsgari)} ₺</span>
                                </>
                              ) : (
                                <span style={{ fontSize: 9, color: "var(--muted)", paddingLeft: 6 }}>↳ ek satır</span>
                              )}
                            </div>
                            <input type="number" min={0} step={0.01} value={s.kazanc || ""} placeholder="0,00"
                              onChange={(e) => updateAySatir(s.id, "kazanc", e.target.value)}
                              style={{ ...tabloInp, borderColor: altSinir ? "#fbbf24" : "var(--border)", background: altSinir ? "#fffbeb" : "#fff" }} />
                            <input type="number" min={0} max={30} value={s.primGunu || ""} placeholder=""
                              onChange={(e) => updateAySatir(s.id, "primGunu", e.target.value)} style={tabloInp} />
                            {/* Son satırda + ekle, ek satırlarda ✕ sil */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                              {sIdx === satirlar.length - 1 && (
                                <button onClick={() => addAySatir(ay)} title="Bu aya satır ekle" style={{
                                  background: "none", border: "none", color: "var(--blue)",
                                  fontSize: 14, cursor: "pointer", padding: "0 2px", lineHeight: 1, fontWeight: 700,
                                }}>+</button>
                              )}
                              {satirlar.length > 1 && (
                                <button onClick={() => removeAySatir(s.id)} style={{
                                  background: "none", border: "none", color: "#b91c1c",
                                  fontSize: 11, cursor: "pointer", padding: "0 2px", lineHeight: 1,
                                }}>✕</button>
                              )}
                            </div>
                          </div>
                        );
                      });
                    });
                  })()}

                  {/* Toplam */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 2.5fr 1.2fr 20px", gap: 4, background: "#e8f0fa", borderRadius: 6, padding: "6px 2px", fontWeight: 700, fontSize: 12 }}>
                    <span style={{ color: "var(--blue)", paddingLeft: 2, display: "flex", alignItems: "center" }}>Toplam</span>
                    <span style={{ color: "var(--blue)" }}>{fmt(bazKazanc)} ₺</span>
                    <span style={{ color: "var(--blue)" }}>{bazGun}</span>
                    <span />
                  </div>
                </div>
              )}
            </Kart>}

            {/* ── 4. Emsal Kazanç ── */}
            {isKazaMH && (
              <Kart>
                <Baslik no="4" metin="Emsal Kazanç (İsteğe Bağlı)" />
                <BilgiKutu renk="sari">Kaza/tanı tarihinden önce o ayda hiç çalışma yoksa emsal kazanç esas alınır.</BilgiKutu>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginTop: 8 }}>
                  <input type="checkbox" checked={emsalAktif} onChange={(e) => setEmsalAktif(e.target.checked)} />
                  Emsal kazanç uygulansın
                </label>
                {emsalAktif && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                    <div><label style={lb}>Emsal Kazanç (₺)</label>
                      <input type="number" min={0} value={emsalKazanc || ""} placeholder="0,00" onChange={(e) => setEmsalKazanc(parseFloat(e.target.value) || 0)} style={inp} /></div>
                    <div><label style={lb}>Çalışılan Gün</label>
                      <input type="number" min={1} max={30} value={emsalPrimGunu || ""} onChange={(e) => setEmsalPrimGunu(parseInt(e.target.value) || 1)} style={inp} /></div>
                  </div>
                )}
              </Kart>
            )}

            {/* ── 5. Prim/İkramiye Tavan ── */}
            <Kart>
              <Baslik no={isKazaMH ? "5" : "4"} metin="Prim / İkramiye Tavan Kontrolü (İsteğe Bağlı)" />
              <BilgiKutu renk="mor">Prim/ikramiye dahilse toplam <b>prime esas kazanç ortalamasının %150'sini</b> geçemez.</BilgiKutu>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginTop: 8 }}>
                <input type="checkbox" checked={normalMaasAktif} onChange={(e) => setNormalMaasAktif(e.target.checked)} />
                %150 tavan kontrolü uygulansın
              </label>
              {normalMaasAktif && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 11, color: "var(--muted)" }}>Her ay için prime esas kazanç (prim/ikramiye hariç) brüt:</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {getOnceki12Ay(raporBaslangic).map((ay, idx) => (
                      <div key={ay} style={{ display: "grid", gridTemplateColumns: "2fr 2fr", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "#475569" }}>{ayEtiket(ay)}</span>
                        <input type="number" min={0} value={normalMaaslar[idx] || ""} placeholder="Prime esas kazanç"
                          onChange={(e) => { const k = [...normalMaaslar]; k[idx] = parseFloat(e.target.value) || 0; setNormalMaaslar(k); }} style={tabloInp} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Kart>

            {/* Hata */}
            {hata && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", color: "#b91c1c", fontSize: 13 }}>❌ {hata}</div>
            )}

            {/* Hesapla + Temizle */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <button onClick={handleHesapla} className="hesapla-btn" style={{
                background: "linear-gradient(135deg, #1a4b8c, #0f3060)",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "11px", fontSize: 14, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(26,75,140,0.4)",
              }}>🧮 Hesapla</button>
              <button onClick={handleTemizle} style={{
                background: "#f1f5f9", color: "#475569",
                border: "1.5px solid #d1dce8", borderRadius: 10,
                padding: "11px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>🗑️ Temizle</button>
            </div>

          </div>{/* / sol */}

          {/* ── SAĞ: Sonuç ── */}
          <div className="pc-right" id="sonuc-alan">
            {!sonuc && (
              <Kart>
                <div className="sonuc-placeholder" style={{ textAlign: "center", padding: "36px 16px", color: "var(--muted)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>Hesaplama Sonucu</div>
                  <div style={{ fontSize: 11 }}>Formu doldurup Hesapla butonuna basın.</div>
                </div>
              </Kart>
            )}

            {sonuc && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sonuc.uyarilar.map((u, i) => (
                  <div key={i} style={{
                    background: u.tip === "hata" ? "#fef2f2" : u.tip === "uyari" ? "#fffbeb" : "#eff6ff",
                    border: `1px solid ${u.tip === "hata" ? "#fca5a5" : u.tip === "uyari" ? "#fde68a" : "#bfdbfe"}`,
                    borderRadius: 8, padding: "9px 12px",
                    color: u.tip === "hata" ? "#b91c1c" : u.tip === "uyari" ? "#92400e" : "#1e40af",
                    fontSize: 12,
                  }}>
                    {u.tip === "hata" ? "❌" : u.tip === "uyari" ? "⚠️" : "ℹ️"} {u.mesaj}
                  </div>
                ))}

                {/* Toplam ödenek */}
                <div className="toplam-kart" style={{
                  background: "linear-gradient(135deg, #c0392b 0%, #922b21 100%)",
                  borderRadius: 14, padding: "20px 18px", color: "#fff", textAlign: "center",
                  boxShadow: "0 4px 18px rgba(192,57,43,0.35)",
                }}>
                  <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4, letterSpacing: 1, textTransform: "uppercase" }}>Toplam Ödenek</div>
                  <div className="toplam-rakam" style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-1px" }}>
                    {fmt(raporTuru === "analik" ? sonuc.toplamOdenek + sonuc.gecAsimTutar : sonuc.toplamOdenek)} ₺
                  </div>
                  {raporTuru === "analik" && (
                    <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4 }}>
                      Analık: {fmt(sonuc.toplamOdenek)} ₺ {sonuc.gecAsimTutar > 0 && <>+ Aşım: {fmt(sonuc.gecAsimTutar)} ₺</>}
                    </div>
                  )}
                  {sonuc.ayaktaToplamOdenek > 0 && sonuc.yatarakToplamOdenek > 0 && (
                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6, display: "flex", gap: 14, justifyContent: "center" }}>
                      <span>Ayakta: {fmt(sonuc.ayaktaToplamOdenek)} ₺</span>
                      <span>Yatarak: {fmt(sonuc.yatarakToplamOdenek)} ₺</span>
                    </div>
                  )}
                  {(tarihMod === "gun" || kazancMod === "asgari") && (
                    <div style={{ marginTop: 8, background: "rgba(255,255,255,0.15)", borderRadius: 7, padding: "5px 10px", fontSize: 10 }}>
                      ℹ️ Güncel asgari ücrete göre hesaplanmıştır
                    </div>
                  )}
                </div>

                {/* Özet kartlar */}
                <div className="sonuc-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <SonKart icon="📅" etiket="Rapor Günü" deger={`${sonuc.toplamRaporGun} gün`} renk="var(--blue)" />
                  {raporTuru === "analik" ? (
                    <SonKart icon="💵" etiket={raporTuru === "analik" ? "Analık Ödeneği" : "Ödenecek Tutar"} deger={`${fmt(sonuc.toplamOdenek)} ₺`} renk="var(--red)" />
                  ) : (
                    <SonKart icon="✅" etiket="Ödenecek Gün" deger={`${sonuc.odenenGun} gün`} renk="var(--green)" />
                  )}
                  {raporTuru === "analik" && sonuc.gecAsimGun > 0 && (
                    <SonKart icon="⏰" etiket="Geç Doğum Aşımı" deger={`${fmt(sonuc.gecAsimTutar)} ₺`} renk="#d97706"
                      alt={`${sonuc.gecAsimGun} gün (168 dışında)`} />
                  )}
                  <SonKart icon="📊" etiket="12 Ay Prim Günü" deger={`${sonuc.toplamOnikiAyPrimGun} gün`}
                    renk={sonuc.doksan_gun_sartiSaglandi ? "var(--green)" : "var(--red)"}
                    alt={sonuc.doksan_gun_sartiSaglandi ? "✓ 90 gün şartı OK" : "✗ Şart sağlanmadı"} />
                  <SonKart icon="💰" etiket="Günlük Esas Kazanç" deger={`${fmt(sonuc.gunlukKazancEsas)} ₺`}
                    renk={sonuc.asgariUcretUygulandimi ? "#d97706" : "var(--blue)"}
                    alt={sonuc.asgariUcretUygulandimi ? "⚠️ Asgari ücret uygulandı" : sonuc.ikiKatTavanUygulandimi ? "⚠️ 180 gün altı — asgari×2 tavanı" : sonuc.yuzElliTavanUygulandimi ? "⚠️ %150 tavan uygulandı" : undefined} />
                </div>

                {/* Günlük oranlar */}
                <Kart>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div className="oran-kutu" style={{ textAlign: "center", background: "#f0fdf4", borderRadius: 9, padding: "12px 8px" }}>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3 }}>Ayakta Günlük</div>
                      <div className="oran-val" style={{ fontSize: 18, fontWeight: 800, color: "var(--green)" }}>{fmt(sonuc.ayaktaGunluk)} ₺</div>
                      {raporTuru === "analik" && sonuc.ayaktaToplamOdenek > 0 && (
                        <div style={{ fontSize: 10, color: "var(--green)", marginTop: 3, fontWeight: 700 }}>{fmt(sonuc.ayaktaToplamOdenek)} ₺ ({sonuc.ayaktaOdenenGun} gün)</div>
                      )}
                      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>× 2/3</div>
                    </div>
                    <div className="oran-kutu" style={{ textAlign: "center", background: "#eff6ff", borderRadius: 9, padding: "12px 8px" }}>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3 }}>Yatarak Günlük</div>
                      <div className="oran-val" style={{ fontSize: 18, fontWeight: 800, color: "var(--blue)" }}>{fmt(sonuc.yatarakGunluk)} ₺</div>
                      {raporTuru === "analik" && sonuc.yatarakToplamOdenek > 0 && (
                        <div style={{ fontSize: 10, color: "var(--blue)", marginTop: 3, fontWeight: 700 }}>{fmt(sonuc.yatarakToplamOdenek)} ₺ ({sonuc.yatarakOdenenGun} gün)</div>
                      )}
                      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>× 1/2</div>
                    </div>
                  </div>
                </Kart>

                <div className="not-kutu" style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "9px 12px", fontSize: 11, color: "#92400e" }}>
                  <strong>⚠️ Not:</strong> Bilgi amaçlıdır. Resmi ödenek tutarı SGK e-Ödenek sistemi tarafından belirlenir.
                </div>
              </div>
            )}
          </div>{/* / sağ */}

        </div>
      </div>
    </div>
  );
}

/* ── Alt bileşenler ─────────────────────────────────── */
function Kart({ children }: { children: React.ReactNode }) {
  return (
    <div className="kart" style={{ background: "var(--card-bg)", borderRadius: 12, padding: "12px 12px", boxShadow: "var(--shadow)", border: "1px solid #e2e8f0" }}>
      {children}
    </div>
  );
}
function Baslik({ no, metin }: { no: string; metin: string }) {
  return (
    <h2 className="bolum-baslik" style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "var(--blue)", borderLeft: "3px solid var(--blue)", paddingLeft: 8 }}>
      <span style={{ opacity: 0.5, marginRight: 4 }}>{no}.</span>{metin}
    </h2>
  );
}
function TogBtn({ aktif, renk, onClick, children, kucuk }: { aktif: boolean; renk: string; onClick: () => void; children: React.ReactNode; kucuk?: boolean }) {
  return (
    <button onClick={onClick} className={kucuk ? "tog-btn-kucuk" : "tog-btn"} style={{
      padding: kucuk ? "6px 10px" : "9px 6px", borderRadius: 8, cursor: "pointer",
      fontSize: kucuk ? 12 : 13, fontWeight: aktif ? 700 : 500, lineHeight: 1.3,
      background: aktif ? renk : "#f0f4fa", color: aktif ? "#fff" : renk,
      border: aktif ? `2px solid ${renk}` : "2px solid var(--border)",
    }}>{children}</button>
  );
}
function BilgiKutu({ renk, children }: { renk: "mavi"|"sari"|"yesil"|"kirmizi"|"mor"; children: React.ReactNode }) {
  const r = { mavi:{bg:"#eff6ff",brd:"#bfdbfe",txt:"#1e40af"}, sari:{bg:"#fffbeb",brd:"#fde68a",txt:"#92400e"}, yesil:{bg:"#f0fdf4",brd:"#86efac",txt:"#166534"}, kirmizi:{bg:"#fef2f2",brd:"#fca5a5",txt:"#b91c1c"}, mor:{bg:"#faf5ff",brd:"#d8b4fe",txt:"#7e22ce"} };
  const { bg, brd, txt } = r[renk];
  return <div className="bilgi-kutu" style={{ background: bg, border: `1px solid ${brd}`, borderRadius: 7, padding: "7px 11px", fontSize: 12, color: txt, marginTop: 8, lineHeight: 1.5 }}>{children}</div>;
}
function Chip({ renk, etiket, deger }: { renk: string; etiket: string; deger: string }) {
  return (
    <div className="chip" style={{ background: `${renk}15`, border: `1px solid ${renk}35`, borderRadius: 7, padding: "4px 9px" }}>
      <div style={{ color: "var(--muted)", fontSize: 10 }}>{etiket}</div>
      <div className="chip-val" style={{ color: renk, fontWeight: 700, fontSize: 12 }}>{deger}</div>
    </div>
  );
}
function SonKart({ icon, etiket, deger, renk, alt }: { icon: string; etiket: string; deger: string; renk: string; alt?: string }) {
  return (
    <div className="son-kart" style={{ background: "var(--card-bg)", border: `2px solid ${renk}25`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div className="son-kart-icon" style={{ fontSize: 18, marginBottom: 3 }}>{icon}</div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}>{etiket}</div>
      <div className="son-kart-val" style={{ fontSize: 14, fontWeight: 800, color: renk }}>{deger}</div>
      {alt && <div style={{ fontSize: 10, color: renk, marginTop: 2, opacity: 0.85 }}>{alt}</div>}
    </div>
  );
}

/* ── Stiller ─────────────────────────────────────────── */
const inp: React.CSSProperties = { width: "100%", border: "1.5px solid var(--border)", borderRadius: 7, padding: "8px 10px", fontSize: 13, color: "var(--text)", background: "#fff", outline: "none", boxSizing: "border-box" };
const tabloInp: React.CSSProperties = { width: "100%", border: "1.5px solid var(--border)", borderRadius: 6, padding: "6px 7px", fontSize: 12, color: "var(--text)", background: "#fff", outline: "none", boxSizing: "border-box" };
const lb: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4 };
const th: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: "var(--muted)" };
function eylemBtn(c: string): React.CSSProperties {
  return { background: c, color: "#fff", border: "none", borderRadius: 7, padding: "7px 11px", fontSize: 11, fontWeight: 600, cursor: "pointer" };
}
