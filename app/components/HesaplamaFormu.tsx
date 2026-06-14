"use client";

import { useState, useCallback } from "react";
import { hesapla, HesaplaResult, AyKazanc, RaporTuru, TedaviTuru, UyariMesaj } from "../lib/hesapla";
import { getAsgariUcret, getGunlukAsgariUcret } from "../lib/asgariUcret";

/* ─── Yardımcı fonksiyonlar ─────────────────────────────────── */
function getOnceki12Ay(baslangicStr: string): string[] {
  const d = new Date(baslangicStr);
  return Array.from({ length: 12 }, (_, i) => {
    const t = new Date(d.getFullYear(), d.getMonth() - i - 1, 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
  });
}
const AYLAR_TR = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const AYLAR_TR_UZUN = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
function ayEtiket(yyyymm: string, kisa = false): string {
  const [y, m] = yyyymm.split("-");
  return kisa ? `${(kisa ? AYLAR_TR : AYLAR_TR_UZUN)[parseInt(m) - 1]} ${y}` : `${AYLAR_TR_UZUN[parseInt(m) - 1]} ${y}`;
}
function getAsgariUcretForAy(yyyymm: string): number {
  return getAsgariUcret(new Date(yyyymm + "-01"));
}
function fmt(n: number): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Tipler ─────────────────────────────────────────────────── */
const RAPORT_LABELS: Record<RaporTuru, string> = {
  hastalik: "Hastalık", iskazasi: "İş Kazası", meslekhastligi: "Meslek Hastalığı", analik: "Analık",
};
const TEDAVI_LABELS: Record<TedaviTuru, { k: string; oran: string }> = {
  ayakta: { k: "Ayakta", oran: "2/3" },
  yatarak: { k: "Yatarak", oran: "1/2" },
  karma: { k: "Karma", oran: "Miks" },
};

/* ─── Ana bileşen ────────────────────────────────────────────── */
export default function HesaplamaFormu() {
  const bugun = new Date().toISOString().slice(0, 10);

  const [raporTuru, setRaporTuru] = useState<RaporTuru>("hastalik");
  const [tedaviTuru, setTedaviTuru] = useState<TedaviTuru>("ayakta");
  const [raporBaslangic, setRaporBaslangic] = useState(bugun);
  const [raporBitis, setRaporBitis] = useState(bugun);
  const [yatarakGun, setYatarakGun] = useState(0);

  // Emsal kazanç (iş kazası/MH)
  const [emsalKazanc, setEmsalKazanc] = useState(0);
  const [emsalPrimGunu, setEmsalPrimGunu] = useState(0);
  const [emsalAktif, setEmsalAktif] = useState(false);

  // Prim/ikramiye üst tavan kontrolü
  const [normalMaasAktif, setNormalMaasAktif] = useState(false);
  const [normalMaaslar, setNormalMaaslar] = useState<number[]>(Array(12).fill(0));

  const ayListesi = getOnceki12Ay(raporBaslangic);
  const [ayKazanclar, setAyKazanclar] = useState<AyKazanc[]>(() =>
    ayListesi.map((ay) => ({ ay, kazanc: 0, primGunu: 30 }))
  );

  const [sonuc, setSonuc] = useState<HesaplaResult | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [sonucAcik, setSonucAcik] = useState(false);

  /* ─── Handlers ─────────────────────────────────────────────── */
  const handleBaslangicChange = (val: string) => {
    setRaporBaslangic(val);
    setSonuc(null);
    const yeniAylar = getOnceki12Ay(val);
    setAyKazanclar((prev) =>
      yeniAylar.map((ay) => prev.find((p) => p.ay === ay) ?? { ay, kazanc: 0, primGunu: 30 })
    );
  };

  const doldurAsgariUcret = useCallback(() => {
    setAyKazanclar((prev) => prev.map((a) => ({ ...a, kazanc: getAsgariUcretForAy(a.ay) })));
    setSonuc(null);
  }, []);

  const updateAy = (idx: number, field: "kazanc" | "primGunu", val: string) => {
    setAyKazanclar((prev) => {
      const k = [...prev];
      k[idx] = { ...k[idx], [field]: field === "kazanc" ? parseFloat(val) || 0 : parseInt(val) || 0 };
      return k;
    });
    setSonuc(null);
  };

  const handleHesapla = () => {
    setHata(null); setSonuc(null);
    if (!raporBaslangic || !raporBitis) { setHata("Rapor tarihlerini giriniz."); return; }
    if (new Date(raporBitis) < new Date(raporBaslangic)) { setHata("Bitiş tarihi başlangıçtan önce olamaz."); return; }
    const isKazaMH = raporTuru === "iskazasi" || raporTuru === "meslekhastligi";
    const baz = isKazaMH ? ayKazanclar.slice(0, 3) : ayKazanclar.slice(0, 12);
    if (baz.reduce((s, a) => s + a.primGunu, 0) === 0) { setHata("Baz dönemde prim günü sıfır olamaz."); return; }
    try {
      const r = hesapla({
        raporTuru, tedaviTuru, raporBaslangic, raporBitis,
        yatarakGun: tedaviTuru === "karma" ? yatarakGun : undefined,
        ayKazanclar,
        emsalKazanc: emsalAktif ? emsalKazanc : undefined,
        emsalPrimGunu: emsalAktif ? emsalPrimGunu : undefined,
        normalMaasKazanc: normalMaasAktif ? normalMaaslar : undefined,
      });
      setSonuc(r);
      setSonucAcik(true);
      setTimeout(() => document.getElementById("sonuc-bolum")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setHata("Hesaplama hatası: " + (e as Error).message);
    }
  };

  const handleTemizle = () => {
    setSonuc(null); setHata(null);
    setAyKazanclar(ayListesi.map((ay) => ({ ay, kazanc: 0, primGunu: 30 })));
    setYatarakGun(0); setEmsalKazanc(0); setEmsalPrimGunu(0);
    setNormalMaaslar(Array(12).fill(0));
  };

  /* ─── Anlık özet ───────────────────────────────────────────── */
  const isKazaMH = raporTuru === "iskazasi" || raporTuru === "meslekhastligi";
  const bazAylar = isKazaMH ? ayKazanclar.slice(0, 3) : ayKazanclar.slice(0, 12);
  const canliToplamKazanc = bazAylar.reduce((s, a) => s + a.kazanc, 0);
  const canliToplamGun = bazAylar.reduce((s, a) => s + a.primGunu, 0);
  const canliGunlukOrt = canliToplamGun > 0 ? canliToplamKazanc / canliToplamGun : 0;
  const toplamRaporGun = raporBaslangic && raporBitis
    ? Math.max(0, Math.round((new Date(raporBitis).getTime() - new Date(raporBaslangic).getTime()) / 86400000) + 1) : 0;
  const bitisAsgari = raporBitis ? getGunlukAsgariUcret(new Date(raporBitis)) : 0;
  const onikiAyGun = ayKazanclar.slice(0, 12).reduce((s, a) => s + a.primGunu, 0);

  /* ─── Render ───────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "12px 12px 32px" }}>

      {/* ── Başlık ── */}
      <header style={{
        background: "linear-gradient(135deg,#1a4b8c,#0f3060)",
        borderRadius: 12, padding: "16px 18px", marginBottom: 14,
        color: "#fff", display: "flex", alignItems: "center", gap: 14,
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
            5510/17 · Genelge 2021/13
          </p>
        </div>
      </header>

      {/* ── 1. Rapor Türü ── */}
      <Kart>
        <BolumBaslik no="1" baslik="Rapor Türü" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(Object.keys(RAPORT_LABELS) as RaporTuru[]).map((t) => (
            <button key={t} onClick={() => { setRaporTuru(t); setSonuc(null); }}
              style={{
                padding: "10px 6px", borderRadius: 8, cursor: "pointer",
                fontSize: 13, fontWeight: raporTuru === t ? 700 : 500,
                background: raporTuru === t ? "#1a4b8c" : "#f0f4fa",
                color: raporTuru === t ? "#fff" : "#1a4b8c",
                border: raporTuru === t ? "2px solid #1a4b8c" : "2px solid #d1dce8",
              }}>
              {RAPORT_LABELS[t]}
            </button>
          ))}
        </div>
        <InfoBox renk="mavi">
          {raporTuru === "hastalik" && <>Hastalık: <strong>son 12 ayın tamamı</strong> baz alınır · ilk 2 gün ödenmez · 90 gün prim şartı</>}
          {raporTuru === "iskazasi" && <>İş Kazası: <strong>12 aydaki son 3 ay</strong> baz alınır · ilk günden ödeme · 90 gün şartı aranmaz</>}
          {raporTuru === "meslekhastligi" && <>Meslek Hastalığı: <strong>12 aydaki son 3 ay</strong> baz alınır · ilk 2 gün ödenmez</>}
          {raporTuru === "analik" && <>Analık: <strong>son 12 ayın tamamı</strong> · ilk günden ödeme · max <strong>24 hafta (168 gün)</strong></>}
        </InfoBox>
      </Kart>

      {/* ── 2. Tedavi Türü ── */}
      <Kart>
        <BolumBaslik no="2" baslik="Tedavi Türü" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {(Object.keys(TEDAVI_LABELS) as TedaviTuru[]).map((t) => {
            const { k, oran } = TEDAVI_LABELS[t];
            return (
              <button key={t} onClick={() => { setTedaviTuru(t); setSonuc(null); }}
                style={{
                  padding: "10px 4px", borderRadius: 8, cursor: "pointer",
                  fontSize: 12, fontWeight: tedaviTuru === t ? 700 : 500,
                  background: tedaviTuru === t ? "#1a7a4a" : "#f0f4fa",
                  color: tedaviTuru === t ? "#fff" : "#1a7a4a",
                  border: tedaviTuru === t ? "2px solid #1a7a4a" : "2px solid #d1dce8",
                  lineHeight: 1.4,
                }}>
                {k}<br /><span style={{ fontSize: 11, opacity: 0.85 }}>({oran})</span>
              </button>
            );
          })}
        </div>
        {tedaviTuru === "karma" && (
          <div style={{ marginTop: 12 }}>
            <Label>Yatarak tedavi gün sayısı</Label>
            <input type="number" min={0} max={toplamRaporGun} value={yatarakGun || ""}
              placeholder="0" onChange={(e) => { setYatarakGun(parseInt(e.target.value) || 0); setSonuc(null); }}
              style={{ ...inp, maxWidth: 120 }} />
            {toplamRaporGun > 0 && (
              <span style={{ marginLeft: 10, fontSize: 12, color: "#64748b" }}>
                Ayakta: {Math.max(0, toplamRaporGun - yatarakGun)} gün
              </span>
            )}
          </div>
        )}
      </Kart>

      {/* ── 3. Rapor Tarihleri ── */}
      <Kart>
        <BolumBaslik no="3" baslik="Rapor Tarihleri" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>Başlangıç</Label>
            <input type="date" value={raporBaslangic}
              onChange={(e) => handleBaslangicChange(e.target.value)} style={inp} />
          </div>
          <div>
            <Label>Bitiş</Label>
            <input type="date" value={raporBitis} min={raporBaslangic}
              onChange={(e) => { setRaporBitis(e.target.value); setSonuc(null); }} style={inp} />
          </div>
        </div>

        {/* Anlık özet chips */}
        {toplamRaporGun > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <Chip renk="#1a4b8c" etiket="Rapor Günü" deger={`${toplamRaporGun} gün`} />
            <Chip renk={onikiAyGun >= 90 ? "#1a7a4a" : "#c0392b"} etiket="12 Ay Prim Günü" deger={`${onikiAyGun} gün`} />
            <Chip renk="#1a4b8c" etiket="Bitiş Günlük Asgari" deger={`${fmt(bitisAsgari)} ₺`} />
            {canliGunlukOrt > 0 && (
              <Chip renk={canliGunlukOrt >= bitisAsgari ? "#1a7a4a" : "#d97706"} etiket="Günlük Ort." deger={`${fmt(canliGunlukOrt)} ₺`} />
            )}
          </div>
        )}

        {/* 90 gün uyarısı */}
        {onikiAyGun > 0 && onikiAyGun < 90 && (
          <InfoBox renk="kirmizi">
            ⚠️ Son 12 ayda <strong>{onikiAyGun} gün</strong> prim bulunmaktadır. Ödeneğe hak kazanmak için <strong>90 gün</strong> gerekmektedir.
          </InfoBox>
        )}
      </Kart>

      {/* ── 4. Kazanç Tablosu ── */}
      <Kart>
        <BolumBaslik no="4" baslik={`Son ${isKazaMH ? "3 Ay Kazanç (12 ay baz)" : "12 Ay Prime Esas Kazanç"}`} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={doldurAsgariUcret} style={eylemBtn("#1a4b8c")}>
            📋 Asgari Ücretle Doldur
          </button>
          <button onClick={handleTemizle} style={eylemBtn("#64748b")}>
            🗑️ Sıfırla
          </button>
        </div>

        {/* Mobil uyumlu kart tablosu */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Başlık satırı */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 6, padding: "0 4px" }}>
            <span style={kolBaslik}>Ay</span>
            <span style={kolBaslik}>Brüt Kazanç (₺)</span>
            <span style={kolBaslik}>Prim Gün</span>
          </div>

          {ayKazanclar.map((a, idx) => {
            const bazMi = isKazaMH ? idx < 3 : true;
            const ayAsgari = getAsgariUcretForAy(a.ay);
            const altSinir = a.kazanc > 0 && a.kazanc < ayAsgari;
            return (
              <div key={a.ay} style={{
                display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 6,
                background: bazMi ? (idx % 2 === 0 ? "#fff" : "#f7faff") : "#f5f5f5",
                borderRadius: 7, padding: "6px 4px",
                border: bazMi ? "1px solid #e8eef7" : "1px solid #ebebeb",
                opacity: bazMi ? 1 : 0.55,
              }}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: bazMi ? "#1e293b" : "#94a3b8" }}>
                    {ayEtiket(a.ay)}
                  </span>
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>
                    Asg: {fmt(ayAsgari)} ₺
                  </span>
                  {!bazMi && <span style={{ fontSize: 10, color: "#cbd5e1" }}>baz dışı</span>}
                </div>
                <input type="number" min={0} step={0.01} value={a.kazanc || ""} placeholder="0,00"
                  onChange={(e) => updateAy(idx, "kazanc", e.target.value)}
                  style={{
                    ...tabloGiris,
                    borderColor: altSinir ? "#fbbf24" : "#d1dce8",
                    background: altSinir ? "#fffbeb" : "#fff",
                  }} />
                <input type="number" min={0} max={30} value={a.primGunu || ""} placeholder="30"
                  onChange={(e) => updateAy(idx, "primGunu", e.target.value)}
                  style={tabloGiris} />
              </div>
            );
          })}

          {/* Toplam satırı */}
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 6,
            background: "#e8f0fa", borderRadius: 7, padding: "8px 4px",
            fontWeight: 700, fontSize: 13,
          }}>
            <span style={{ color: "#1a4b8c", fontSize: 12, display: "flex", alignItems: "center" }}>
              Baz dönem toplamı
            </span>
            <span style={{ color: "#1a4b8c" }}>{fmt(canliToplamKazanc)} ₺</span>
            <span style={{ color: "#1a4b8c" }}>{canliToplamGun}</span>
          </div>
        </div>
      </Kart>

      {/* ── 5. İş Kazası / MH Emsal Kazanç (opsiyonel) ── */}
      {isKazaMH && (
        <Kart>
          <BolumBaslik no="5" baslik="İş Kazası / MH Emsal Kazanç (İsteğe Bağlı)" />
          <InfoBox renk="sari">
            Kaza tarihinden önce o ayda hiç çalışma yoksa, sigortalının o aydaki prime esas kazanç emsal değeri dikkate alınır.
          </InfoBox>
          <div style={{ marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={emsalAktif} onChange={(e) => setEmsalAktif(e.target.checked)} />
              Emsal kazanç kullanılsın
            </label>
          </div>
          {emsalAktif && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <Label>Emsal Günlük Kazanç (₺)</Label>
                <input type="number" min={0} value={emsalKazanc || ""} placeholder="0,00"
                  onChange={(e) => setEmsalKazanc(parseFloat(e.target.value) || 0)} style={inp} />
              </div>
              <div>
                <Label>Emsal Prim Günü</Label>
                <input type="number" min={0} max={30} value={emsalPrimGunu || ""} placeholder="30"
                  onChange={(e) => setEmsalPrimGunu(parseInt(e.target.value) || 0)} style={inp} />
              </div>
            </div>
          )}
        </Kart>
      )}

      {/* ── 6. Prim/İkramiye Üst Tavan (opsiyonel) ── */}
      <Kart>
        <BolumBaslik no={isKazaMH ? "6" : "5"} baslik="Prim / İkramiye Tavan Kontrolü (İsteğe Bağlı)" />
        <InfoBox renk="mor">
          Kazançlara prim veya ikramiye eklenmiş ise, toplam kazanç <strong>normal maaş ortalamasının %150'sini</strong> geçemez.
        </InfoBox>
        <div style={{ marginTop: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={normalMaasAktif} onChange={(e) => setNormalMaasAktif(e.target.checked)} />
            Prim/İkramiye tavan kontrolü uygulansın
          </label>
        </div>
        {normalMaasAktif && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#64748b" }}>
              Her ay için normal maaş (ikramiye/prim hariç) brüt kazancı giriniz:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(isKazaMH ? ayKazanclar.slice(0, 3) : ayKazanclar.slice(0, 12)).map((a, idx) => (
                <div key={a.ay} style={{ display: "grid", gridTemplateColumns: "2fr 2fr", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{ayEtiket(a.ay)}</span>
                  <input type="number" min={0} value={normalMaaslar[idx] || ""} placeholder="Normal maaş"
                    onChange={(e) => {
                      const k = [...normalMaaslar];
                      k[idx] = parseFloat(e.target.value) || 0;
                      setNormalMaaslar(k);
                    }} style={tabloGiris} />
                </div>
              ))}
            </div>
          </div>
        )}
      </Kart>

      {/* ── Hata ── */}
      {hata && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5",
          borderRadius: 8, padding: "12px 14px", color: "#b91c1c", fontSize: 13, marginBottom: 12,
        }}>❌ {hata}</div>
      )}

      {/* ── Hesapla Butonu ── */}
      <button onClick={handleHesapla} style={{
        width: "100%", background: "linear-gradient(135deg,#1a4b8c,#0f3060)",
        color: "#fff", border: "none", borderRadius: 10,
        padding: "14px", fontSize: 16, fontWeight: 800, cursor: "pointer",
        marginBottom: 16, letterSpacing: "-0.3px",
      }}>
        🧮 Hesapla
      </button>

      {/* ── Sonuç ── */}
      {sonuc && (
        <div id="sonuc-bolum">

          {/* Uyarı mesajları */}
          {sonuc.uyarilar.map((u, i) => (
            <div key={i} style={{
              background: u.tip === "hata" ? "#fef2f2" : u.tip === "uyari" ? "#fffbeb" : "#eff6ff",
              border: `1px solid ${u.tip === "hata" ? "#fca5a5" : u.tip === "uyari" ? "#fde68a" : "#bfdbfe"}`,
              borderRadius: 8, padding: "10px 14px",
              color: u.tip === "hata" ? "#b91c1c" : u.tip === "uyari" ? "#92400e" : "#1e40af",
              fontSize: 13, marginBottom: 10,
            }}>
              {u.tip === "hata" ? "❌" : u.tip === "uyari" ? "⚠️" : "ℹ️"} {u.mesaj}
            </div>
          ))}

          {/* Ana sonuç kartları */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <SonucKart icon="📅" etiket="Rapor Günü" deger={`${sonuc.toplamRaporGun} gün`} renk="#1a4b8c" />
            <SonucKart icon="✅" etiket="Ödenecek Gün" deger={`${sonuc.odenenGun} gün`} renk="#1a7a4a" />
            <SonucKart icon="📊" etiket="12 Ay Prim Günü" deger={`${sonuc.toplamOnikiAyPrimGun} gün`}
              renk={sonuc.doksan_gun_sartiSaglandi ? "#1a7a4a" : "#c0392b"}
              alt={sonuc.doksan_gun_sartiSaglandi ? "✓ 90 gün şartı OK" : "✗ 90 gün şartı SAĞLANMADI"} />
            <SonucKart icon="💰" etiket="Günlük Esas Kazanç" deger={`${fmt(sonuc.gunlukKazancEsas)} ₺`}
              renk={sonuc.asgariUcretUygulandimi ? "#d97706" : "#1a4b8c"}
              alt={sonuc.asgariUcretUygulandimi ? "⚠️ Asgari ücret uygulandı" :
                sonuc.ikiKatTavanUygulandimi ? "⚠️ 2× asgari tavan" :
                sonuc.yuzElliTavanUygulandimi ? "⚠️ %150 tavan" : undefined} />
          </div>

          {/* Toplam ödenek */}
          <div style={{
            background: "linear-gradient(135deg,#c0392b,#922b21)",
            borderRadius: 12, padding: "18px 20px", marginBottom: 14,
            color: "#fff", textAlign: "center",
          }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 4 }}>TOPLAM ÖDENEK</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{fmt(sonuc.toplamOdenek)} ₺</div>
            {sonuc.ayaktaToplamOdenek > 0 && sonuc.yatarakToplamOdenek > 0 && (
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
                Ayakta: {fmt(sonuc.ayaktaToplamOdenek)} ₺ · Yatarak: {fmt(sonuc.yatarakToplamOdenek)} ₺
              </div>
            )}
          </div>

          {/* Detay tablosu (açılır/kapanır) */}
          <Kart>
            <button onClick={() => setSonucAcik(!sonucAcik)} style={{
              width: "100%", background: "none", border: "none", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: 0, fontSize: 14, fontWeight: 700, color: "#1a4b8c",
            }}>
              <span>📊 Hesaplama Detayı</span>
              <span style={{ fontSize: 18 }}>{sonucAcik ? "▲" : "▼"}</span>
            </button>

            {sonucAcik && (
              <div style={{ marginTop: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    <DR etiket="Baz dönem toplam kazanç" deger={`${fmt(sonuc.bazDonemleriKazanc)} ₺`} />
                    <DR etiket="Baz dönem toplam prim günü" deger={`${sonuc.bazDonemleriGun} gün`} />
                    <DR etiket="Günlük brüt ortalama" deger={`${fmt(sonuc.gunlukOrtalamaBrut)} ₺`} />
                    {sonuc.yuzElliTavanUygulandimi && (
                      <DR etiket="Normal maaş ort. × 1.5 tavan" deger={`${fmt(sonuc.normalMaasOrtalama * 1.5)} ₺`} vurgu="uyari" />
                    )}
                    {sonuc.ikiKatTavanUygulandimi && (
                      <DR etiket="180 gün altı → 2× asgari tavan" deger={`${fmt(sonuc.ikiKatAsgariTavan)} ₺`} vurgu="uyari" />
                    )}
                    <DR etiket="Rapor bitiş günlük asgari ücret" deger={`${fmt(sonuc.raporBitisAsgariGunluk)} ₺`} />
                    <DR etiket="Esas alınan günlük kazanç" deger={`${fmt(sonuc.gunlukKazancEsas)} ₺`}
                      vurgu={sonuc.asgariUcretUygulandimi ? "uyari" : "basari"}
                      not={sonuc.asgariUcretUygulandimi ? "Asgari ücret" : "Hesaplanan"} />
                    <DR etiket="Ayakta günlük ödenek (×2/3)" deger={`${fmt(sonuc.ayaktaGunluk)} ₺`} />
                    <DR etiket="Yatarak günlük ödenek (×1/2)" deger={`${fmt(sonuc.yatarakGunluk)} ₺`} />
                    {sonuc.ayaktaToplamOdenek > 0 && (
                      <DR etiket={`Ayakta toplam`} deger={`${fmt(sonuc.ayaktaToplamOdenek)} ₺`} />
                    )}
                    {sonuc.yatarakToplamOdenek > 0 && (
                      <DR etiket={`Yatarak toplam`} deger={`${fmt(sonuc.yatarakToplamOdenek)} ₺`} />
                    )}
                    <DR etiket="TOPLAM ÖDENEK" deger={`${fmt(sonuc.toplamOdenek)} ₺`} vurgu="toplam" />
                  </tbody>
                </table>

                <details style={{ marginTop: 16 }}>
                  <summary style={{ fontSize: 12, color: "#64748b", cursor: "pointer", fontWeight: 600 }}>
                    Hesaplama adımlarını göster
                  </summary>
                  <ol style={{ margin: "10px 0 0", padding: "0 0 0 18px" }}>
                    {sonuc.adimlar.map((a, i) => (
                      <li key={i} style={{
                        fontSize: 12, lineHeight: 1.6, marginBottom: 4,
                        color: a.includes("TOPLAM") ? "#c0392b" : "#374151",
                        fontWeight: a.includes("TOPLAM") ? 700 : 400,
                      }}>{a}</li>
                    ))}
                  </ol>
                </details>
              </div>
            )}
          </Kart>

          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a",
            borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#92400e",
          }}>
            <strong>⚠️ Not:</strong> Bu araç bilgi amaçlıdır. Resmi ödenek SGK e-Ödenek sistemi tarafından belirlenir.
            5510/17 · Genelge 2021/13 · Asgari ücret tablosu 1950–2026.
          </div>
        </div>
      )}

      <footer style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 20 }}>
        5510 Sayılı Kanun § 17 · SGK Genelge 2021/13
      </footer>
    </div>
  );
}

/* ── Küçük bileşenler ─────────────────────────────────────── */

function Kart({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: "16px 14px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #e2e8f0", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function BolumBaslik({ no, baslik }: { no: string; baslik: string }) {
  return (
    <h2 style={{
      margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#1a4b8c",
      borderLeft: "3px solid #1a4b8c", paddingLeft: 9,
    }}>
      <span style={{ opacity: 0.55, marginRight: 5 }}>{no}.</span>{baslik}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 5 }}>{children}</label>;
}

function InfoBox({ renk, children }: { renk: "mavi" | "sari" | "yesil" | "kirmizi" | "mor"; children: React.ReactNode }) {
  const renkler = {
    mavi: { bg: "#eff6ff", brd: "#bfdbfe", txt: "#1e40af" },
    sari: { bg: "#fffbeb", brd: "#fde68a", txt: "#92400e" },
    yesil: { bg: "#f0fdf4", brd: "#86efac", txt: "#166534" },
    kirmizi: { bg: "#fef2f2", brd: "#fca5a5", txt: "#b91c1c" },
    mor: { bg: "#faf5ff", brd: "#d8b4fe", txt: "#7e22ce" },
  };
  const { bg, brd, txt } = renkler[renk];
  return (
    <div style={{
      background: bg, border: `1px solid ${brd}`, borderRadius: 7,
      padding: "8px 12px", fontSize: 12, color: txt, marginTop: 10, lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

function Chip({ renk, etiket, deger }: { renk: string; etiket: string; deger: string }) {
  return (
    <div style={{
      background: `${renk}12`, border: `1px solid ${renk}30`,
      borderRadius: 7, padding: "5px 10px", fontSize: 11,
    }}>
      <div style={{ color: "#64748b" }}>{etiket}</div>
      <div style={{ color: renk, fontWeight: 700, fontSize: 13 }}>{deger}</div>
    </div>
  );
}

function SonucKart({ icon, etiket, deger, renk, alt }: {
  icon: string; etiket: string; deger: string; renk: string; alt?: string;
}) {
  return (
    <div style={{
      background: "#fff", border: `2px solid ${renk}25`, borderRadius: 10,
      padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{etiket}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: renk }}>{deger}</div>
      {alt && <div style={{ fontSize: 10, color: renk, marginTop: 2, opacity: 0.85 }}>{alt}</div>}
    </div>
  );
}

function DR({ etiket, deger, vurgu, not }: {
  etiket: string; deger: string;
  vurgu?: "uyari" | "basari" | "toplam";
  not?: string;
}) {
  const bg = vurgu === "toplam" ? "#fef2f2" : vurgu === "uyari" ? "#fffbeb" : vurgu === "basari" ? "#f0fdf4" : "transparent";
  const renk = vurgu === "toplam" ? "#c0392b" : vurgu === "uyari" ? "#d97706" : vurgu === "basari" ? "#1a7a4a" : "#374151";
  return (
    <tr style={{ background: bg }}>
      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9", color: "#64748b", fontSize: 12 }}>
        {etiket}
        {not && <span style={{ marginLeft: 6, fontSize: 11, color: renk, fontWeight: 600 }}>[{not}]</span>}
      </td>
      <td style={{ padding: "6px 8px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: vurgu ? 700 : 500, color: renk, fontSize: 12 }}>
        {deger}
      </td>
    </tr>
  );
}

/* ── Stil sabitleri ────────────────────────────────────────── */
const inp: React.CSSProperties = {
  width: "100%", border: "1.5px solid #d1dce8", borderRadius: 7,
  padding: "9px 10px", fontSize: 14, color: "#1e293b", background: "#fff", outline: "none",
  boxSizing: "border-box",
};

const tabloGiris: React.CSSProperties = {
  width: "100%", border: "1.5px solid #d1dce8", borderRadius: 6,
  padding: "7px 8px", fontSize: 13, color: "#1e293b", background: "#fff", outline: "none",
  boxSizing: "border-box",
};

const kolBaslik: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#64748b",
};

function eylemBtn(renk: string): React.CSSProperties {
  return {
    background: renk, color: "#fff", border: "none", borderRadius: 7,
    padding: "8px 13px", fontSize: 12, fontWeight: 600, cursor: "pointer",
  };
}
