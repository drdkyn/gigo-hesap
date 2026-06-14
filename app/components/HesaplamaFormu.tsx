"use client";

import { useState, useCallback } from "react";
import { hesapla, HesaplaResult, AyKazanc, RaporTuru, TedaviTuru } from "../lib/hesapla";
import { getAsgariUcret, getGunlukAsgariUcret, ASGARI_UCRET_TABLOSU } from "../lib/asgariUcret";

// Verilen tarihten geriye doğru 12 ayın listesini üret (YYYY-MM)
function getOnceki12Ay(baslangicStr: string): string[] {
  const d = new Date(baslangicStr);
  const aylar: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    aylar.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`);
  }
  return aylar; // en yakın → en eski
}

// Ay etiket: "2025-03" → "Mart 2025"
const AYLAR_TR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
function ayEtiket(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${AYLAR_TR[parseInt(m) - 1]} ${y}`;
}

// Bir YYYY-MM'nin asgari ücretini bul (o ayın 1'ine göre)
function getAsgariUcretForAy(yyyymm: string): number {
  const d = new Date(yyyymm + "-01");
  return getAsgariUcret(d);
}

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const RAPORT_LABELS: Record<RaporTuru, string> = {
  hastalik: "Hastalık",
  iskazasi: "İş Kazası",
  meslekhastligi: "Meslek Hastalığı",
  analik: "Analık",
};

const TEDAVI_LABELS: Record<TedaviTuru, string> = {
  ayakta: "Ayakta Tedavi",
  yatarak: "Yatarak Tedavi",
  karma: "Karma (Ayakta + Yatarak)",
};

export default function HesaplamaFormu() {
  const bugun = new Date().toISOString().slice(0, 10);

  const [raporTuru, setRaporTuru] = useState<RaporTuru>("hastalik");
  const [tedaviTuru, setTedaviTuru] = useState<TedaviTuru>("ayakta");
  const [raporBaslangic, setRaporBaslangic] = useState(bugun);
  const [raporBitis, setRaporBitis] = useState(bugun);
  const [yatarakGun, setYatarakGun] = useState(0);

  // 12 ay kazanç listesi
  const ayListesi = getOnceki12Ay(raporBaslangic);
  const [ayKazanclar, setAyKazanclar] = useState<AyKazanc[]>(() =>
    ayListesi.map((ay) => ({ ay, kazanc: 0, primGunu: 30 }))
  );

  const [sonuc, setSonuc] = useState<HesaplaResult | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  // Rapor başlangıcı değişince ayları güncelle, mevcut verileri koru
  const handleBaslangicChange = (val: string) => {
    setRaporBaslangic(val);
    setSonuc(null);
    const yeniAylar = getOnceki12Ay(val);
    setAyKazanclar((prev) =>
      yeniAylar.map((ay) => {
        const eski = prev.find((p) => p.ay === ay);
        return eski ?? { ay, kazanc: 0, primGunu: 30 };
      })
    );
  };

  // Asgari ücrete göre doldur
  const doldurAsgariUcret = useCallback(() => {
    setAyKazanclar((prev) =>
      prev.map((a) => ({
        ...a,
        kazanc: getAsgariUcretForAy(a.ay),
      }))
    );
    setSonuc(null);
  }, []);

  // Tek ay güncelle
  const updateAy = (idx: number, field: keyof AyKazanc, val: string) => {
    setAyKazanclar((prev) => {
      const kopi = [...prev];
      if (field === "kazanc") kopi[idx] = { ...kopi[idx], kazanc: parseFloat(val) || 0 };
      if (field === "primGunu") kopi[idx] = { ...kopi[idx], primGunu: parseInt(val) || 0 };
      return kopi;
    });
    setSonuc(null);
  };

  // Hesapla
  const handleHesapla = () => {
    setHata(null);
    setSonuc(null);

    if (!raporBaslangic || !raporBitis) {
      setHata("Lütfen rapor tarihlerini giriniz.");
      return;
    }
    if (new Date(raporBitis) < new Date(raporBaslangic)) {
      setHata("Rapor bitiş tarihi başlangıçtan önce olamaz.");
      return;
    }

    // 12 ayın son 3 ayında en az bir kayıt var mı?
    const kullanilanAylar =
      raporTuru === "iskazasi" || raporTuru === "meslekhastligi"
        ? ayKazanclar.slice(0, 3)
        : ayKazanclar.slice(0, 12);

    const toplamPrimGun = kullanilanAylar.reduce((s, a) => s + a.primGunu, 0);
    if (toplamPrimGun === 0) {
      setHata("Baz dönemindeki toplam prim günü sıfır olamaz.");
      return;
    }

    try {
      const r = hesapla({
        raporTuru,
        tedaviTuru,
        raporBaslangic,
        raporBitis,
        yatarakGun: tedaviTuru === "karma" ? yatarakGun : undefined,
        ayKazanclar,
      });
      setSonuc(r);
      // Sonuç alanına scroll
      setTimeout(() => {
        document.getElementById("sonuc")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (e) {
      setHata("Hesaplama hatası: " + (e as Error).message);
    }
  };

  const handleTemizle = () => {
    setSonuc(null);
    setHata(null);
    setAyKazanclar(ayListesi.map((ay) => ({ ay, kazanc: 0, primGunu: 30 })));
    setYatarakGun(0);
  };

  const toplamRaporGun = raporBaslangic && raporBitis
    ? Math.max(0, Math.round((new Date(raporBitis).getTime() - new Date(raporBaslangic).getTime()) / 86400000) + 1)
    : 0;

  // Toplamlar (anlık)
  const kullanilanAylar =
    raporTuru === "iskazasi" || raporTuru === "meslekhastligi"
      ? ayKazanclar.slice(0, 3)
      : ayKazanclar.slice(0, 12);
  const toplamKazanc = kullanilanAylar.reduce((s, a) => s + a.kazanc, 0);
  const toplamPrimGun = kullanilanAylar.reduce((s, a) => s + a.primGunu, 0);
  const canliGunlukOrt = toplamPrimGun > 0 ? toplamKazanc / toplamPrimGun : 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px" }}>
      {/* Başlık */}
      <header style={{
        background: "linear-gradient(135deg, #1a4b8c 0%, #0f3060 100%)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 20,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{
          background: "rgba(255,255,255,0.15)",
          borderRadius: 10,
          width: 52, height: 52,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, flexShrink: 0,
        }}>🏥</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.3px" }}>
            SGK Geçici İş Göremezlik Ödeneği Hesaplama
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.75 }}>
            5510 Sayılı Kanun Madde 17 | 2021/13 Sayılı Genelge
          </p>
        </div>
      </header>

      {/* Form kartı */}
      <div style={card}>
        {/* Rapor Türü */}
        <Section title="1. Rapor Türü">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {(Object.keys(RAPORT_LABELS) as RaporTuru[]).map((t) => (
              <button
                key={t}
                onClick={() => { setRaporTuru(t); setSonuc(null); }}
                style={{
                  ...chipBtn,
                  background: raporTuru === t ? "#1a4b8c" : "#f0f4fa",
                  color: raporTuru === t ? "#fff" : "#1a4b8c",
                  border: raporTuru === t ? "2px solid #1a4b8c" : "2px solid #d1dce8",
                  fontWeight: raporTuru === t ? 700 : 500,
                }}
              >
                {RAPORT_LABELS[t]}
              </button>
            ))}
          </div>
          {(raporTuru === "iskazasi" || raporTuru === "meslekhastligi") && (
            <InfoBox color="#fef3c7" border="#fbbf24" icon="ℹ️">
              İş kazası / meslek hastalığında <strong>12 aydaki son 3 ayın</strong> kazancı esas alınır. İlk günden ödeme yapılır.
            </InfoBox>
          )}
          {raporTuru === "hastalik" && (
            <InfoBox color="#eff6ff" border="#93c5fd" icon="ℹ️">
              Hastalık raporlarında <strong>son 12 ayın tamamının</strong> kazancı esas alınır. İlk 2 gün ödenmez.
            </InfoBox>
          )}
          {raporTuru === "analik" && (
            <InfoBox color="#f0fdf4" border="#86efac" icon="ℹ️">
              Analık raporlarında <strong>son 12 ayın tamamının</strong> kazancı esas alınır. İlk günden ödeme yapılır.
            </InfoBox>
          )}
        </Section>

        {/* Tedavi Türü */}
        <Section title="2. Tedavi Türü">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {(Object.keys(TEDAVI_LABELS) as TedaviTuru[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTedaviTuru(t); setSonuc(null); }}
                style={{
                  ...chipBtn,
                  background: tedaviTuru === t ? "#1a7a4a" : "#f0f4fa",
                  color: tedaviTuru === t ? "#fff" : "#1a7a4a",
                  border: tedaviTuru === t ? "2px solid #1a7a4a" : "2px solid #d1dce8",
                  fontWeight: tedaviTuru === t ? 700 : 500,
                }}
              >
                {TEDAVI_LABELS[t]} {t === "ayakta" ? "(2/3)" : t === "yatarak" ? "(1/2)" : ""}
              </button>
            ))}
          </div>
        </Section>

        {/* Rapor Tarihleri */}
        <Section title="3. Rapor Tarihleri">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Rapor Başlangıç Tarihi</label>
              <input
                type="date"
                value={raporBaslangic}
                onChange={(e) => handleBaslangicChange(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Rapor Bitiş Tarihi</label>
              <input
                type="date"
                value={raporBitis}
                min={raporBaslangic}
                onChange={(e) => { setRaporBitis(e.target.value); setSonuc(null); }}
                style={inputStyle}
              />
            </div>
          </div>

          {toplamRaporGun > 0 && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
              <StatChip label="Toplam Rapor Günü" value={`${toplamRaporGun} gün`} color="#1a4b8c" />
              <StatChip label="Bitiş Tarihi Günlük Asgari" value={`${fmt(getGunlukAsgariUcret(new Date(raporBitis)))} ₺`} color="#1a7a4a" />
            </div>
          )}

          {/* Karma tedavide yatarak gün */}
          {tedaviTuru === "karma" && (
            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Yatarak Tedavi Gün Sayısı</label>
              <input
                type="number"
                min={0}
                max={toplamRaporGun}
                value={yatarakGun}
                onChange={(e) => { setYatarakGun(parseInt(e.target.value) || 0); setSonuc(null); }}
                style={{ ...inputStyle, maxWidth: 160 }}
              />
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                Ayakta: {Math.max(0, toplamRaporGun - yatarakGun)} gün
              </p>
            </div>
          )}
        </Section>

        {/* Kazanç Tablosu */}
        <Section title={`4. Son ${raporTuru === "iskazasi" || raporTuru === "meslekhastligi" ? "12 Aydaki Son 3 Ay" : "12 Ay"} Prime Esas Kazanç`}>
          <div style={{ marginBottom: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={doldurAsgariUcret} style={actionBtn("#1a4b8c")}>
              📋 Asgari Ücrete Göre Doldur
            </button>
            <button onClick={handleTemizle} style={actionBtn("#64748b")}>
              🗑️ Sıfırla
            </button>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Yeniden eskiye doğru 12 ay
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f0f4fa" }}>
                  <th style={th}>#</th>
                  <th style={th}>Ay</th>
                  <th style={th}>Aylık Asgari Ücret</th>
                  <th style={th}>Brüt Kazanç (₺)</th>
                  <th style={th}>Prim Günü</th>
                  <th style={th}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {ayKazanclar.map((a, idx) => {
                  const ayAsgari = getAsgariUcretForAy(a.ay);
                  const bazMi = raporTuru === "iskazasi" || raporTuru === "meslekhastligi" ? idx < 3 : true;
                  const altSinir = a.kazanc > 0 && a.kazanc < ayAsgari;
                  return (
                    <tr
                      key={a.ay}
                      style={{
                        background: bazMi ? (idx % 2 === 0 ? "#fff" : "#f9fbff") : "#f5f5f5",
                        opacity: bazMi ? 1 : 0.5,
                      }}
                    >
                      <td style={{ ...td, color: "#94a3b8", fontSize: 11 }}>{idx + 1}</td>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {ayEtiket(a.ay)}
                        {!bazMi && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>(baz dışı)</span>}
                      </td>
                      <td style={{ ...td, color: "#1a7a4a", fontSize: 12 }}>
                        {fmt(ayAsgari)} ₺
                      </td>
                      <td style={td}>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={a.kazanc || ""}
                          placeholder="0.00"
                          onChange={(e) => updateAy(idx, "kazanc", e.target.value)}
                          style={{
                            ...tableInput,
                            borderColor: altSinir ? "#fbbf24" : "#d1dce8",
                            background: altSinir ? "#fffbeb" : "#fff",
                          }}
                        />
                      </td>
                      <td style={td}>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={a.primGunu || ""}
                          placeholder="30"
                          onChange={(e) => updateAy(idx, "primGunu", e.target.value)}
                          style={{ ...tableInput, maxWidth: 70 }}
                        />
                      </td>
                      <td style={td}>
                        {!bazMi ? (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>—</span>
                        ) : a.primGunu === 0 ? (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>Prim yok</span>
                        ) : altSinir ? (
                          <span style={{ fontSize: 11, color: "#d97706" }}>⚠️ Asgari altı</span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#1a7a4a" }}>✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#e8f0fa", fontWeight: 700 }}>
                  <td colSpan={3} style={{ ...td, textAlign: "right", fontSize: 12, color: "#1a4b8c" }}>
                    Baz dönem toplamı:
                  </td>
                  <td style={{ ...td, color: "#1a4b8c" }}>{fmt(toplamKazanc)} ₺</td>
                  <td style={{ ...td, color: "#1a4b8c" }}>{toplamPrimGun}</td>
                  <td style={{ ...td, color: "#1a4b8c", fontSize: 12 }}>
                    Ort: {toplamPrimGun > 0 ? fmt(canliGunlukOrt) : "—"} ₺/gün
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>

        {/* Hata */}
        {hata && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5",
            borderRadius: 8, padding: "12px 16px", color: "#b91c1c",
            fontSize: 14, marginTop: 4,
          }}>
            ❌ {hata}
          </div>
        )}

        {/* Hesapla butonu */}
        <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
          <button
            onClick={handleHesapla}
            style={{
              background: "linear-gradient(135deg, #1a4b8c, #0f3060)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "13px 32px",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "-0.2px",
              flex: 1,
            }}
          >
            🧮 Hesapla
          </button>
        </div>
      </div>

      {/* Sonuç */}
      {sonuc && (
        <div id="sonuc" style={{ marginTop: 20 }}>
          {/* Özet kartları */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}>
            <SonucKart
              label="Toplam Rapor Günü"
              value={`${sonuc.toplamRaporGun} gün`}
              color="#1a4b8c"
              icon="📅"
            />
            <SonucKart
              label="Ödenecek Gün"
              value={`${sonuc.odenenGun} gün`}
              color="#1a7a4a"
              icon="✅"
            />
            <SonucKart
              label="Günlük Esas Kazanç"
              value={`${fmt(sonuc.gunlukKazancEsas)} ₺`}
              color={sonuc.asgariUcretUygulandimi ? "#d97706" : "#1a4b8c"}
              icon={sonuc.asgariUcretUygulandimi ? "⚠️" : "💰"}
              alt={sonuc.asgariUcretUygulandimi ? "Asgari ücret uygulandı" : undefined}
            />
            <SonucKart
              label="TOPLAM ÖDENEK"
              value={`${fmt(sonuc.toplamOdenek)} ₺`}
              color="#c0392b"
              icon="💵"
              big
            />
          </div>

          {/* Detay tablosu */}
          <div style={card}>
            <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "#1a4b8c", fontWeight: 700 }}>
              📊 Hesaplama Detayı
            </h3>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                <DetayRow label="Baz dönem toplam kazanç" value={`${fmt(sonuc.bazDonemleriKazanc)} ₺`} />
                <DetayRow label="Baz dönem toplam prim günü" value={`${sonuc.bazDonemleriGun} gün`} />
                <DetayRow label="Günlük ortalama kazanç" value={`${fmt(sonuc.gunlukOrtalama)} ₺`} />
                <DetayRow label="Rapor bitiş tarihi günlük asgari ücret" value={`${fmt(sonuc.raporBitisAsgariGunluk)} ₺`} />
                <DetayRow
                  label="Esas alınan günlük kazanç"
                  value={`${fmt(sonuc.gunlukKazancEsas)} ₺`}
                  highlight={sonuc.asgariUcretUygulandimi ? "warning" : "success"}
                  note={sonuc.asgariUcretUygulandimi ? "Asgari ücret uygulandı" : "Hesaplanan kazanç"}
                />
                {sonuc.ayaktaToplamOdenek > 0 && (
                  <DetayRow
                    label={`Ayakta tedavi ödeneği (${fmt(sonuc.ayaktaGunluk)} ₺ × gün)`}
                    value={`${fmt(sonuc.ayaktaToplamOdenek)} ₺`}
                  />
                )}
                {sonuc.yatarakToplamOdenek > 0 && (
                  <DetayRow
                    label={`Yatarak tedavi ödeneği (${fmt(sonuc.yatarakGunluk)} ₺ × gün)`}
                    value={`${fmt(sonuc.yatarakToplamOdenek)} ₺`}
                  />
                )}
                <DetayRow
                  label="TOPLAM ÖDENEK"
                  value={`${fmt(sonuc.toplamOdenek)} ₺`}
                  highlight="total"
                />
              </tbody>
            </table>

            {/* Adım adım açıklama */}
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b", fontWeight: 600 }}>
                Hesaplama Adımları:
              </h4>
              <ol style={{ margin: 0, padding: "0 0 0 20px" }}>
                {sonuc.adimlar.map((adim, i) => (
                  <li key={i} style={{
                    fontSize: 12,
                    color: adim.includes("TOPLAM") ? "#c0392b" : "#374151",
                    fontWeight: adim.includes("TOPLAM") ? 700 : 400,
                    marginBottom: 6,
                    lineHeight: 1.5,
                  }}>
                    {adim}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Uyarı notu */}
          <div style={{
            marginTop: 12,
            background: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12,
            color: "#92400e",
          }}>
            <strong>⚠️ Not:</strong> Bu hesaplama bilgi amaçlıdır. Resmi ödenek miktarı SGK e-Ödenek sistemi tarafından belirlenir.
            5510 Sayılı Kanun Madde 17 ve 2021/13 Sayılı SGK Genelgesi esas alınmıştır.
          </div>
        </div>
      )}

      {/* Alt bilgi */}
      <footer style={{ textAlign: "center", fontSize: 11, color: "#94a3b8", marginTop: 24, paddingBottom: 16 }}>
        5510 Sayılı Kanun § 17 · SGK Genelge 2021/13 · Asgari ücret tablosu dahil
      </footer>
    </div>
  );
}

// --- Alt bileşenler ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{
        margin: "0 0 12px",
        fontSize: 14,
        fontWeight: 700,
        color: "#1a4b8c",
        borderLeft: "3px solid #1a4b8c",
        paddingLeft: 10,
        letterSpacing: "-0.2px",
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function InfoBox({ color, border, icon, children }: { color: string; border: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: color,
      border: `1px solid ${border}`,
      borderRadius: 7,
      padding: "9px 13px",
      fontSize: 13,
      marginTop: 10,
      display: "flex",
      gap: 8,
      alignItems: "flex-start",
    }}>
      <span>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: 7,
      padding: "7px 12px",
      fontSize: 12,
    }}>
      <div style={{ color: "#64748b", marginBottom: 2 }}>{label}</div>
      <div style={{ color, fontWeight: 700, fontSize: 14 }}>{value}</div>
    </div>
  );
}

function SonucKart({ label, value, color, icon, alt, big }: {
  label: string; value: string; color: string; icon: string; alt?: string; big?: boolean;
}) {
  return (
    <div style={{
      background: "#fff",
      border: `2px solid ${color}30`,
      borderRadius: 10,
      padding: "14px 16px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 20 : 16, fontWeight: 800, color }}>{value}</div>
      {alt && <div style={{ fontSize: 11, color: "#d97706", marginTop: 3 }}>{alt}</div>}
    </div>
  );
}

function DetayRow({ label, value, highlight, note }: {
  label: string; value: string; highlight?: "warning" | "success" | "total"; note?: string;
}) {
  const bg = highlight === "total" ? "#fef2f2" : highlight === "warning" ? "#fffbeb" : highlight === "success" ? "#f0fdf4" : "transparent";
  const color = highlight === "total" ? "#c0392b" : highlight === "warning" ? "#d97706" : highlight === "success" ? "#1a7a4a" : "#374151";
  return (
    <tr style={{ background: bg }}>
      <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", color: "#64748b", fontSize: 13 }}>
        {label}
        {note && <span style={{ fontSize: 11, color, marginLeft: 6, fontWeight: 600 }}>[{note}]</span>}
      </td>
      <td style={{ padding: "7px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: highlight ? 700 : 500, color, fontSize: 13 }}>
        {value}
      </td>
    </tr>
  );
}

// --- Stil sabitleri ---
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "20px 20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
  border: "1px solid #e2e8f0",
  marginBottom: 16,
};

const chipBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  transition: "all 0.15s",
  whiteSpace: "nowrap",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid #d1dce8",
  borderRadius: 7,
  padding: "9px 11px",
  fontSize: 14,
  color: "#1e293b",
  background: "#fff",
  outline: "none",
};

const th: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#475569",
  borderBottom: "2px solid #d1dce8",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

const tableInput: React.CSSProperties = {
  width: "100%",
  minWidth: 100,
  border: "1.5px solid #d1dce8",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 13,
  color: "#1e293b",
  outline: "none",
};

function actionBtn(color: string): React.CSSProperties {
  return {
    background: color,
    color: "#fff",
    border: "none",
    borderRadius: 7,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}
