"use client";

import { useState, useCallback, useEffect } from "react";
import {
  hesapla, HesaplaResult, AyKazanc, RaporTuru, TedaviTuru, KarmaDonem
} from "../lib/hesapla";
import { getAsgariUcret, getGunlukAsgariUcret } from "../lib/asgariUcret";

/* ── Yardımcılar ──────────────────────────────────────── */
function getOnceki12Ay(baslangicStr: string): string[] {
  if (!baslangicStr) return Array.from({ length: 12 }, (_, i) => {
    const t = new Date(); t.setMonth(t.getMonth() - i - 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
  const d = new Date(baslangicStr);
  return Array.from({ length: 12 }, (_, i) => {
    const t = new Date(d.getFullYear(), d.getMonth() - i - 1, 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
}
const AYLAR_TR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
function ayEtiket(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${AYLAR_TR[parseInt(m) - 1]} ${y}`;
}
function getAsgariAy(yyyymm: string): number {
  return getAsgariUcret(new Date(yyyymm + "-01"));
}
function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function gunFarki(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1);
}

const RAPORT_LABELS: Record<RaporTuru, string> = {
  hastalik: "Hastalık", iskazasi: "İş Kazası",
  meslekhastligi: "Meslek Hastalığı", analik: "Analık",
};
const TEDAVI_LABELS: Record<TedaviTuru, { k: string; oran: string }> = {
  ayakta: { k: "Ayakta", oran: "2/3" },
  yatarak: { k: "Yatarak", oran: "1/2" },
  karma: { k: "Karma", oran: "Miks" },
};

/* ── Ana bileşen ──────────────────────────────────────── */
export default function HesaplamaFormu() {
  const bugun = new Date().toISOString().slice(0, 10);

  const [raporTuru, setRaporTuru] = useState<RaporTuru>("hastalik");
  const [tedaviTuru, setTedaviTuru] = useState<TedaviTuru>("ayakta");

  // Rapor tarihi GİRİŞ MODları: "tarih" | "gun"
  // Varsayılan: gün sayısı modu (başlangıç gerekmez, güncel asgari ücret kullanılır)
  const [tarihMod, setTarihMod] = useState<"tarih" | "gun">("gun");
  const [raporBaslangic, setRaporBaslangic] = useState(bugun);
  const [raporBitis, setRaporBitis] = useState(bugun);
  const [raporGunSayisi, setRaporGunSayisi] = useState(1);

  // Gün modunda bitiş = bugün - gün + 1 gün geriye → aslında bugünden itibaren hesap
  // Başlangıç tarihi gösterilmez; sadece gün girilir. Hesaplama için bugün esas alınır.
  useEffect(() => {
    if (tarihMod === "gun") {
      // Gün modunda başlangıç = bugün, bitiş = bugün + (gun-1)
      setRaporBaslangic(bugun);
      const b = addDays(bugun, raporGunSayisi - 1);
      setRaporBitis(b);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarihMod, raporGunSayisi]);

  // Karma tedavi dönemleri
  const [karmaDonemleri, setKarmaDonemleri] = useState<KarmaDonem[]>([
    { baslangic: bugun, bitis: bugun, tur: "yatarak" },
    { baslangic: bugun, bitis: bugun, tur: "ayakta" },
  ]);

  // Kazanç modu: "manuel" | "asgari"
  const [kazancMod, setKazancMod] = useState<"manuel" | "asgari">("manuel");

  const ayListesi = getOnceki12Ay(raporBaslangic);
  const [ayKazanclar, setAyKazanclar] = useState<AyKazanc[]>(() =>
    ayListesi.map((ay) => ({ ay, kazanc: 0, primGunu: 30 }))
  );

  // Emsal kazanç
  const [emsalAktif, setEmsalAktif] = useState(false);
  const [emsalKazanc, setEmsalKazanc] = useState(0);
  const [emsalPrimGunu, setEmsalPrimGunu] = useState(1);

  // Prim/ikramiye tavan
  const [normalMaasAktif, setNormalMaasAktif] = useState(false);
  const [normalMaaslar, setNormalMaaslar] = useState<number[]>(Array(12).fill(0));

  const [sonuc, setSonuc] = useState<HesaplaResult | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  /* Tarih değişimi (sadece tarih modunda kullanılır) */
  const handleBaslangicChange = (val: string) => {
    setRaporBaslangic(val);
    setSonuc(null);
    const yeniAylar = getOnceki12Ay(val);
    if (kazancMod === "asgari") {
      setAyKazanclar(yeniAylar.map((ay) => ({ ay, kazanc: getAsgariAy(ay), primGunu: 30 })));
    } else {
      setAyKazanclar((prev) =>
        yeniAylar.map((ay) => prev.find((p) => p.ay === ay) ?? { ay, kazanc: 0, primGunu: 30 })
      );
    }
  };

  // Gün modunda sadece gün sayısı değişir; başlangıç = bugün sabit
  const handleGunChange = (val: number) => {
    const g = Math.max(1, val);
    setRaporGunSayisi(g);
    setSonuc(null);
  };

  const handleBitisChange = (val: string) => {
    setRaporBitis(val);
    if (raporBaslangic && val) {
      setRaporGunSayisi(gunFarki(raporBaslangic, val));
    }
    setSonuc(null);
  };

  /* Asgari ücretle doldur — gün modunda bugün esas, tarih modunda başlangıç esas */
  const doldurAsgariUcret = useCallback(() => {
    const bazTarih = tarihMod === "gun" ? bugun : raporBaslangic;
    const aylar = getOnceki12Ay(bazTarih);
    setAyKazanclar(aylar.map((ay) => ({ ay, kazanc: getAsgariAy(ay), primGunu: 30 })));
    setKazancMod("asgari");
    setSonuc(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raporBaslangic, tarihMod]);

  const manueleMod = () => {
    setKazancMod("manuel");
    setSonuc(null);
  };

  const updateAy = (idx: number, field: "kazanc" | "primGunu", val: string) => {
    setAyKazanclar((prev) => {
      const k = [...prev];
      k[idx] = { ...k[idx], [field]: field === "kazanc" ? parseFloat(val) || 0 : parseInt(val) || 0 };
      return k;
    });
    setSonuc(null);
  };

  /* Karma dönem güncelle */
  const updateKarma = (idx: number, field: keyof KarmaDonem, val: string) => {
    setKarmaDonemleri((prev) => {
      const k = [...prev];
      k[idx] = { ...k[idx], [field]: val };
      return k;
    });
    setSonuc(null);
  };
  const addKarmaDonem = () => {
    setKarmaDonemleri((prev) => [...prev, { baslangic: raporBitis, bitis: raporBitis, tur: "ayakta" }]);
  };
  const removeKarmaDonem = (idx: number) => {
    setKarmaDonemleri((prev) => prev.filter((_, i) => i !== idx));
  };

  /* Hesapla */
  const handleHesapla = () => {
    setHata(null); setSonuc(null);
    if (tarihMod === "tarih" && (!raporBaslangic || !raporBitis)) {
      setHata("Rapor tarihlerini giriniz."); return;
    }
    if (tarihMod === "gun" && raporGunSayisi < 1) {
      setHata("Rapor gün sayısı en az 1 olmalıdır."); return;
    }
    if (tarihMod === "tarih" && new Date(raporBitis) < new Date(raporBaslangic)) {
      setHata("Bitiş tarihi başlangıçtan önce olamaz."); return;
    }

    // Gün modunda: asgari ücretle otomatik doldur, prim günü validasyonu yok
    const kullanilacakAylar: AyKazanc[] = tarihMod === "gun"
      ? getOnceki12Ay(bugun).map((ay) => ({ ay, kazanc: getAsgariAy(ay), primGunu: 30 }))
      : ayKazanclar;

    if (tarihMod === "tarih") {
      const bazGun = kullanilacakAylar.slice(0, 12).reduce((s, a) => s + a.primGunu, 0);
      if (bazGun === 0) { setHata("12 ay toplam prim günü sıfır olamaz."); return; }
    }

    try {
      const r = hesapla({
        raporTuru, tedaviTuru, raporBaslangic, raporBitis,
        karmaDonemleri: tedaviTuru === "karma" ? karmaDonemleri : undefined,
        ayKazanclar: kullanilacakAylar,
        emsalKazanc: emsalAktif ? emsalKazanc : undefined,
        emsalPrimGunu: emsalAktif ? emsalPrimGunu : undefined,
        normalMaasKazanc: normalMaasAktif ? normalMaaslar : undefined,
        asgariDolu: tarihMod === "gun" || kazancMod === "asgari",
      });
      setSonuc(r);
      setTimeout(() => document.getElementById("sonuc-alan")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setHata("Hesaplama hatası: " + (e as Error).message);
    }
  };

  const handleTemizle = () => {
    setSonuc(null); setHata(null);
    setKazancMod("manuel");
    setAyKazanclar(ayListesi.map((ay) => ({ ay, kazanc: 0, primGunu: 30 })));
    setEmsalKazanc(0); setEmsalPrimGunu(1);
    setNormalMaaslar(Array(12).fill(0));
    setRaporGunSayisi(1);
    setRaporBitis(raporBaslangic);
  };

  /* Anlık özet */
  const toplamRaporGun = raporBaslangic && raporBitis ? gunFarki(raporBaslangic, raporBitis) : 0;
  const onikiAyGun = ayKazanclar.slice(0, 12).reduce((s, a) => s + a.primGunu, 0);
  const bazKazanc = ayKazanclar.slice(0, 12).reduce((s, a) => s + a.kazanc, 0);
  const bazGun = ayKazanclar.slice(0, 12).reduce((s, a) => s + a.primGunu, 0);
  const canliOrt = bazGun > 0 ? bazKazanc / bazGun : 0;
  const bitisAsgari = raporBaslangic ? getGunlukAsgariUcret(new Date(raporBaslangic)) : 0;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "12px 12px 40px" }}>

      {/* ── Başlık ── */}
      <header style={{
        background: "linear-gradient(135deg,#1a4b8c,#0f3060)", borderRadius: 12,
        padding: "16px 18px", marginBottom: 14, color: "#fff",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{
          background: "rgba(255,255,255,0.18)", borderRadius: 10,
          width: 46, height: 46, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
        }}>🏥</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>
            SGK Geçici İş Göremezlik<br />Ödeneği Hesaplama
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.75 }}>
            SGK Geçici İş Göremezlik Ödeneği Hesaplama Aracı
          </p>
        </div>
      </header>

      {/* ── 1. Rapor Türü ── */}
      <Kart>
        <Baslik no="1" metin="Rapor Türü" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(Object.keys(RAPORT_LABELS) as RaporTuru[]).map((t) => (
            <SeçBtn key={t} aktif={raporTuru === t} renk="#1a4b8c"
              onClick={() => { setRaporTuru(t); setSonuc(null); }}>
              {RAPORT_LABELS[t]}
            </SeçBtn>
          ))}
        </div>
        <BilgiKutu renk="mavi">
          {raporTuru === "hastalik" && <>Hastalık: son <b>12 ayın tamamı</b> baz · ilk 2 gün ödenmez · 90 gün prim şartı</>}
          {raporTuru === "iskazasi" && <>İş Kazası: son <b>12 ayın tamamı</b> baz · ilk günden ödeme · 90 gün şartı aranmaz</>}
          {raporTuru === "meslekhastligi" && <>Meslek Hastalığı: son <b>12 ayın tamamı</b> baz · <b>ilk günden ödeme</b> · 90 gün şartı aranmaz</>}
          {raporTuru === "analik" && <>Analık: son <b>12 ayın tamamı</b> · ilk günden ödeme · max <b>24 hafta / 168 gün</b></>}
        </BilgiKutu>
      </Kart>

      {/* ── 2. Tedavi Türü ── */}
      <Kart>
        <Baslik no="2" metin="Tedavi Türü" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {(Object.keys(TEDAVI_LABELS) as TedaviTuru[]).map((t) => {
            const { k, oran } = TEDAVI_LABELS[t];
            return (
              <SeçBtn key={t} aktif={tedaviTuru === t} renk="#1a7a4a"
                onClick={() => { setTedaviTuru(t); setSonuc(null); }}>
                {k}<br /><span style={{ fontSize: 11 }}>({oran})</span>
              </SeçBtn>
            );
          })}
        </div>

        {/* Karma tedavi dönemleri */}
        {tedaviTuru === "karma" && (
          <div style={{ marginTop: 14 }}>
            <BilgiKutu renk="sari">
              <b>Önemli:</b> Hastalık raporunda ilk 2 gün ödenmez. Yatarak dönem rapor başında ise yatarak günlerden, ayakta başında ise ayakta günlerden düşülür. Lütfen dönemleri kronolojik sıraya göre giriniz.
            </BilgiKutu>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {karmaDonemleri.map((d, idx) => (
                <div key={idx} style={{
                  background: d.tur === "yatarak" ? "#f0f4fa" : "#f0fdf4",
                  border: `1px solid ${d.tur === "yatarak" ? "#bfdbfe" : "#86efac"}`,
                  borderRadius: 8, padding: "10px 12px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Dönem {idx + 1}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <SeçBtn aktif={d.tur === "yatarak"} renk="#1a4b8c" onClick={() => updateKarma(idx, "tur", "yatarak")} kucuk>
                        Yatarak (1/2)
                      </SeçBtn>
                      <SeçBtn aktif={d.tur === "ayakta"} renk="#1a7a4a" onClick={() => updateKarma(idx, "tur", "ayakta")} kucuk>
                        Ayakta (2/3)
                      </SeçBtn>
                      {karmaDonemleri.length > 2 && (
                        <button onClick={() => removeKarmaDonem(idx)} style={{
                          background: "#fee2e2", color: "#b91c1c", border: "none",
                          borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer",
                        }}>✕</button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={lb}>Başlangıç</label>
                      <input type="date" value={d.baslangic} min={raporBaslangic} max={raporBitis}
                        onChange={(e) => updateKarma(idx, "baslangic", e.target.value)} style={inp} />
                    </div>
                    <div>
                      <label style={lb}>Bitiş</label>
                      <input type="date" value={d.bitis} min={d.baslangic} max={raporBitis}
                        onChange={(e) => updateKarma(idx, "bitis", e.target.value)} style={inp} />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {d.baslangic && d.bitis ? `${gunFarki(d.baslangic, d.bitis)} gün` : "—"}
                  </div>
                </div>
              ))}
              <button onClick={addKarmaDonem} style={{
                background: "#f0f4fa", border: "1.5px dashed #d1dce8", borderRadius: 8,
                padding: "8px", fontSize: 13, color: "#1a4b8c", cursor: "pointer", fontWeight: 600,
              }}>+ Dönem Ekle</button>
            </div>
          </div>
        )}
      </Kart>

      {/* ── 3. Rapor Süresi ── */}
      <Kart>
        <Baslik no="3" metin="Rapor Süresi" />

        {/* Yan yana mod: Gün solda, Tarih sağda */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          border: "1.5px solid #d1dce8", borderRadius: 8,
          overflow: "hidden", marginBottom: 16,
        }}>
          <button
            onClick={() => { setTarihMod("gun"); setSonuc(null); }}
            style={{
              padding: "11px 6px", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tarihMod === "gun" ? 700 : 500,
              background: tarihMod === "gun" ? "#1a4b8c" : "#f8fafc",
              color: tarihMod === "gun" ? "#fff" : "#64748b",
              borderRight: "1px solid #d1dce8",
            }}>
            🔢 Gün Sayısı Gir
          </button>
          <button
            onClick={() => { setTarihMod("tarih"); setSonuc(null); }}
            style={{
              padding: "11px 6px", border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: tarihMod === "tarih" ? 700 : 500,
              background: tarihMod === "tarih" ? "#1a4b8c" : "#f8fafc",
              color: tarihMod === "tarih" ? "#fff" : "#64748b",
            }}>
            📅 Tarih Gir
          </button>
        </div>

        {tarihMod === "gun" ? (
          /* GÜN MODU — sadece gün sayısı, başlangıç istenmiyor */
          <div>
            <label style={lb}>Rapor Gün Sayısı</label>
            <input
              type="number" min={1} value={raporGunSayisi}
              onChange={(e) => handleGunChange(parseInt(e.target.value) || 1)}
              style={{ ...inp, maxWidth: 180, fontSize: 22, fontWeight: 800, textAlign: "center", letterSpacing: 1 }}
              placeholder="örn: 10"
            />
            <div style={{
              marginTop: 10, background: "#eff6ff", border: "1px solid #bfdbfe",
              borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1e40af", lineHeight: 1.6,
            }}>
              ℹ️ <b>Güncel asgari ücrete (2026) göre hesaplanacaktır.</b><br />
              Detaylı hesap için <b>Tarih Gir</b> kısmını seçin.
            </div>
          </div>
        ) : (
          /* TARİH MODU */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lb}>Başlangıç Tarihi</label>
              <input type="date" value={raporBaslangic}
                onChange={(e) => handleBaslangicChange(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lb}>Bitiş Tarihi</label>
              <input type="date" value={raporBitis} min={raporBaslangic}
                onChange={(e) => handleBitisChange(e.target.value)} style={inp} />
            </div>
          </div>
        )}

        {toplamRaporGun > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <Chip renk="#1a4b8c" etiket="Rapor Günü" deger={`${toplamRaporGun} gün`} />
            {tarihMod === "tarih" && <Chip renk="#475569" etiket="Bitiş Tarihi" deger={raporBitis} />}
            <Chip renk={onikiAyGun >= 90 ? "#1a7a4a" : "#c0392b"} etiket="12 Ay Prim" deger={`${onikiAyGun} gün`} />
            {canliOrt > 0 && <Chip renk={canliOrt >= bitisAsgari ? "#1a7a4a" : "#d97706"} etiket="Günlük Ort." deger={`${fmt(canliOrt)} ₺`} />}
          </div>
        )}

        {onikiAyGun > 0 && onikiAyGun < 90 && (
          <BilgiKutu renk="kirmizi">
            ⚠️ Son 12 ayda <b>{onikiAyGun} gün</b> prim var. Ödeneğe hak için <b>90 gün</b> gereklidir.
          </BilgiKutu>
        )}
      </Kart>

      {/* ── 4. Kazanç Tablosu — sadece tarih modunda göster ── */}
      {tarihMod === "tarih" && <Kart>
        <Baslik no="4" metin="Son 12 Ay Prime Esas Kazanç" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={doldurAsgariUcret} style={eylemBtn("#1a4b8c")}>
            📋 Asgari Ücretle Doldur
          </button>
          {kazancMod === "asgari" && (
            <button onClick={manueleMod} style={eylemBtn("#64748b")}>
              ✏️ Manuel Düzenle
            </button>
          )}
          <button onClick={handleTemizle} style={eylemBtn("#9ca3af")}>
            🗑️ Sıfırla
          </button>
        </div>

        {kazancMod === "asgari" ? (
          /* Asgari mod: sadece özet göster */
          <div style={{
            background: "#f0fdf4", border: "1px solid #86efac",
            borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ fontWeight: 700, color: "#1a7a4a", marginBottom: 8, fontSize: 13 }}>
              ✓ Güncel asgari ücrete göre dolduruldu (prim gün: 30)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ayKazanclar.map((a) => (
                <div key={a.ay} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#374151" }}>
                  <span>{ayEtiket(a.ay)}</span>
                  <span style={{ fontWeight: 600 }}>{fmt(a.kazanc)} ₺ / {a.primGunu} gün</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: "1px solid #86efac", marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13, color: "#1a7a4a" }}>
              <span>Toplam</span>
              <span>{fmt(bazKazanc)} ₺ / {bazGun} gün → {fmt(canliOrt)} ₺/gün</span>
            </div>
          </div>
        ) : (
          /* Manuel mod: düzenlenebilir tablo */
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2.5fr 1.2fr", gap: 6, padding: "0 2px" }}>
              <span style={th}>Ay</span>
              <span style={th}>Brüt Kazanç (₺)</span>
              <span style={th}>Prim Gün</span>
            </div>
            {ayKazanclar.map((a, idx) => {
              const ayAsgari = getAsgariAy(a.ay);
              const altSinir = a.kazanc > 0 && a.kazanc < ayAsgari;
              return (
                <div key={a.ay} style={{
                  display: "grid", gridTemplateColumns: "2fr 2.5fr 1.2fr", gap: 6,
                  background: idx % 2 === 0 ? "#fff" : "#f9fbff",
                  borderRadius: 6, padding: "4px 2px",
                  border: "1px solid #f0f4fa",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{ayEtiket(a.ay)}</span>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>Asg: {fmt(ayAsgari)} ₺</span>
                  </div>
                  <input type="number" min={0} step={0.01} value={a.kazanc || ""} placeholder="0,00"
                    onChange={(e) => updateAy(idx, "kazanc", e.target.value)}
                    style={{ ...tabloInp, borderColor: altSinir ? "#fbbf24" : "#d1dce8", background: altSinir ? "#fffbeb" : "#fff" }} />
                  <input type="number" min={0} max={30} value={a.primGunu || ""} placeholder="30"
                    onChange={(e) => updateAy(idx, "primGunu", e.target.value)}
                    style={tabloInp} />
                </div>
              );
            })}
            <div style={{
              display: "grid", gridTemplateColumns: "2fr 2.5fr 1.2fr", gap: 6,
              background: "#e8f0fa", borderRadius: 6, padding: "7px 2px", fontWeight: 700, fontSize: 13,
            }}>
              <span style={{ color: "#1a4b8c", paddingLeft: 2, fontSize: 12, display: "flex", alignItems: "center" }}>Toplam</span>
              <span style={{ color: "#1a4b8c" }}>{fmt(bazKazanc)} ₺</span>
              <span style={{ color: "#1a4b8c" }}>{bazGun}</span>
            </div>
          </div>
        )}
      </Kart>}

      {/* ── 5. Emsal Kazanç (İş Kazası/MH) ── */}
      {(raporTuru === "iskazasi" || raporTuru === "meslekhastligi") && (
        <Kart>
          <Baslik no="5" metin="Emsal Kazanç (İsteğe Bağlı)" />
          <BilgiKutu renk="sari">
            Kaza/tanı tarihinden önce o ayda hiç çalışma yoksa veya aynı gün kaza geçirildiyse emsal kazanç esas alınır.
          </BilgiKutu>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginTop: 10 }}>
            <input type="checkbox" checked={emsalAktif} onChange={(e) => setEmsalAktif(e.target.checked)} />
            Emsal kazanç uygulansın
          </label>
          {emsalAktif && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
              <div>
                <label style={lb}>Emsal Kazanç (₺)</label>
                <input type="number" min={0} value={emsalKazanc || ""} placeholder="0,00"
                  onChange={(e) => setEmsalKazanc(parseFloat(e.target.value) || 0)} style={inp} />
              </div>
              <div>
                <label style={lb}>Çalışılan Gün</label>
                <input type="number" min={1} max={30} value={emsalPrimGunu || ""}
                  onChange={(e) => setEmsalPrimGunu(parseInt(e.target.value) || 1)} style={inp} />
              </div>
            </div>
          )}
        </Kart>
      )}

      {/* ── 6. Prim/İkramiye Tavan ── */}
      <Kart>
        <Baslik no={raporTuru === "iskazasi" || raporTuru === "meslekhastligi" ? "6" : "5"} metin="Prim / İkramiye Tavan Kontrolü (İsteğe Bağlı)" />
        <BilgiKutu renk="mor">
          Kazanca prim/ikramiye eklendiyse toplam, <b>normal maaş ortalamasının %150'sini</b> geçemez.
        </BilgiKutu>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, marginTop: 10 }}>
          <input type="checkbox" checked={normalMaasAktif} onChange={(e) => setNormalMaasAktif(e.target.checked)} />
          %150 tavan kontrolü uygulansın
        </label>
        {normalMaasAktif && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>Her ay için normal maaş (prim/ikramiye hariç) brüt:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {ayKazanclar.slice(0, 12).map((a, idx) => (
                <div key={a.ay} style={{ display: "grid", gridTemplateColumns: "2fr 2fr", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{ayEtiket(a.ay)}</span>
                  <input type="number" min={0} value={normalMaaslar[idx] || ""} placeholder="Normal maaş"
                    onChange={(e) => {
                      const k = [...normalMaaslar]; k[idx] = parseFloat(e.target.value) || 0;
                      setNormalMaaslar(k);
                    }} style={tabloInp} />
                </div>
              ))}
            </div>
          </div>
        )}
      </Kart>

      {/* ── Hata ── */}
      {hata && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 14px", color: "#b91c1c", fontSize: 13, marginBottom: 12 }}>
          ❌ {hata}
        </div>
      )}

      {/* ── Hesapla ── */}
      <button onClick={handleHesapla} style={{
        width: "100%", background: "linear-gradient(135deg,#1a4b8c,#0f3060)",
        color: "#fff", border: "none", borderRadius: 10,
        padding: "15px", fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 16,
      }}>
        🧮 Hesapla
      </button>

      {/* ── Sonuç ── */}
      {sonuc && (
        <div id="sonuc-alan">
          {sonuc.uyarilar.map((u, i) => (
            <div key={i} style={{
              background: u.tip === "hata" ? "#fef2f2" : u.tip === "uyari" ? "#fffbeb" : "#eff6ff",
              border: `1px solid ${u.tip === "hata" ? "#fca5a5" : u.tip === "uyari" ? "#fde68a" : "#bfdbfe"}`,
              borderRadius: 8, padding: "10px 14px",
              color: u.tip === "hata" ? "#b91c1c" : u.tip === "uyari" ? "#92400e" : "#1e40af",
              fontSize: 13, marginBottom: 8,
            }}>
              {u.tip === "hata" ? "❌" : u.tip === "uyari" ? "⚠️" : "ℹ️"} {u.mesaj}
            </div>
          ))}

          {/* Kart özeti */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <SonKart icon="📅" etiket="Rapor Günü" deger={`${sonuc.toplamRaporGun} gün`} renk="#1a4b8c" />
            <SonKart icon="✅" etiket="Ödenecek Gün" deger={`${sonuc.odenenGun} gün`} renk="#1a7a4a" />
            <SonKart icon="📊" etiket="12 Ay Prim" deger={`${sonuc.toplamOnikiAyPrimGun} gün`}
              renk={sonuc.doksan_gun_sartiSaglandi ? "#1a7a4a" : "#c0392b"}
              alt={sonuc.doksan_gun_sartiSaglandi ? "✓ 90 gün şartı OK" : "✗ 90 gün şartı YOK"} />
            <SonKart icon="💰" etiket="Günlük Esas Kazanç" deger={`${fmt(sonuc.gunlukKazancEsas)} ₺`}
              renk={sonuc.asgariUcretUygulandimi ? "#d97706" : "#1a4b8c"}
              alt={sonuc.asgariUcretUygulandimi ? "⚠️ Asgari ücret" :
                sonuc.ikiKatTavanUygulandimi ? "⚠️ 2× asgari tavan" :
                sonuc.yuzElliTavanUygulandimi ? "⚠️ %150 tavan" : undefined} />
          </div>

          {/* Toplam */}
          <div style={{
            background: "linear-gradient(135deg,#c0392b,#922b21)",
            borderRadius: 12, padding: "18px 20px", marginBottom: 12, color: "#fff", textAlign: "center",
          }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 4 }}>TOPLAM ÖDENEK</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{fmt(sonuc.toplamOdenek)} ₺</div>
            {sonuc.ayaktaToplamOdenek > 0 && sonuc.yatarakToplamOdenek > 0 && (
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                Ayakta: {fmt(sonuc.ayaktaToplamOdenek)} ₺ · Yatarak: {fmt(sonuc.yatarakToplamOdenek)} ₺
              </div>
            )}
            {kazancMod === "asgari" && (
              <div style={{
                marginTop: 10, background: "rgba(255,255,255,0.15)", borderRadius: 6,
                padding: "6px 10px", fontSize: 11,
              }}>
                ℹ️ Güncel asgari ücrete göre hesaplanmıştır
              </div>
            )}
          </div>

          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8,
            padding: "10px 14px", fontSize: 11, color: "#92400e",
          }}>
            <strong>⚠️ Not:</strong> Bu araç bilgi amaçlıdır. Resmi ödenek tutarı SGK e-Ödenek sistemi tarafından belirlenir.
          </div>
        </div>
      )}

      <footer style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 20, paddingBottom: 8 }}>
        © 2026 drdnctgl
      </footer>
    </div>
  );
}

/* ── Alt bileşenler ─────────────────────────────────── */
function Kart({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "16px 14px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0", marginBottom: 12,
    }}>{children}</div>
  );
}
function Baslik({ no, metin }: { no: string; metin: string }) {
  return (
    <h2 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#1a4b8c", borderLeft: "3px solid #1a4b8c", paddingLeft: 9 }}>
      <span style={{ opacity: 0.5, marginRight: 5 }}>{no}.</span>{metin}
    </h2>
  );
}
function SeçBtn({ aktif, renk, onClick, children, kucuk }: {
  aktif: boolean; renk: string; onClick: () => void; children: React.ReactNode; kucuk?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      padding: kucuk ? "6px 10px" : "10px 6px", borderRadius: 8, cursor: "pointer",
      fontSize: kucuk ? 12 : 13, fontWeight: aktif ? 700 : 500, lineHeight: 1.4,
      background: aktif ? renk : "#f0f4fa",
      color: aktif ? "#fff" : renk,
      border: aktif ? `2px solid ${renk}` : "2px solid #d1dce8",
    }}>{children}</button>
  );
}
function BilgiKutu({ renk, children }: { renk: "mavi"|"sari"|"yesil"|"kirmizi"|"mor"; children: React.ReactNode }) {
  const r = { mavi:{bg:"#eff6ff",brd:"#bfdbfe",txt:"#1e40af"}, sari:{bg:"#fffbeb",brd:"#fde68a",txt:"#92400e"}, yesil:{bg:"#f0fdf4",brd:"#86efac",txt:"#166534"}, kirmizi:{bg:"#fef2f2",brd:"#fca5a5",txt:"#b91c1c"}, mor:{bg:"#faf5ff",brd:"#d8b4fe",txt:"#7e22ce"} };
  const { bg, brd, txt } = r[renk];
  return <div style={{ background: bg, border: `1px solid ${brd}`, borderRadius: 7, padding: "8px 12px", fontSize: 12, color: txt, marginTop: 10, lineHeight: 1.5 }}>{children}</div>;
}
function Chip({ renk, etiket, deger }: { renk: string; etiket: string; deger: string }) {
  return (
    <div style={{ background: `${renk}12`, border: `1px solid ${renk}30`, borderRadius: 7, padding: "5px 10px", fontSize: 11 }}>
      <div style={{ color: "#64748b" }}>{etiket}</div>
      <div style={{ color: renk, fontWeight: 700, fontSize: 13 }}>{deger}</div>
    </div>
  );
}
function SonKart({ icon, etiket, deger, renk, alt }: { icon: string; etiket: string; deger: string; renk: string; alt?: string }) {
  return (
    <div style={{ background: "#fff", border: `2px solid ${renk}25`, borderRadius: 10, padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{etiket}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: renk }}>{deger}</div>
      {alt && <div style={{ fontSize: 10, color: renk, marginTop: 2, opacity: 0.85 }}>{alt}</div>}
    </div>
  );
}
/* ── Stiller ──────────────────────────────────────────── */
const inp: React.CSSProperties = { width: "100%", border: "1.5px solid #d1dce8", borderRadius: 7, padding: "9px 10px", fontSize: 14, color: "#1e293b", background: "#fff", outline: "none", boxSizing: "border-box" };
const tabloInp: React.CSSProperties = { width: "100%", border: "1.5px solid #d1dce8", borderRadius: 6, padding: "7px 8px", fontSize: 13, color: "#1e293b", background: "#fff", outline: "none", boxSizing: "border-box" };
const lb: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 };
const th: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b" };
function eylemBtn(c: string): React.CSSProperties {
  return { background: c, color: "#fff", border: "none", borderRadius: 7, padding: "8px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
}
