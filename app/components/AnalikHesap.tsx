"use client";

import { useState, useEffect } from "react";

/* ── Yardımcılar ─────────────────────────────────────── */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function addWeeks(dateStr: string, weeks: number): string {
  return addDays(dateStr, weeks * 7);
}
function gunFarki(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1);
}
function fmt_tarih(d: string): string {
  if (!d) return "";
  const [y, m, g] = d.split("-");
  return `${g}.${m}.${y}`;
}

/* ── Alt dönem satırı ────────────────────────────────── */
export interface DonemSatir {
  id: number;
  baslangic: string;
  bitis: string;
  tur: "ayakta" | "yatarak";
}

let _satId = 500;
function yeniDonemSatir(baslangic: string, bitis: string, tur: "ayakta" | "yatarak" = "ayakta"): DonemSatir {
  return { id: _satId++, baslangic, bitis, tur };
}

/* ── Analık sonuç tipi ───────────────────────────────── */
export interface AnalikSonuc {
  oncesiBaslangic: string;
  oncesiBitis: string;
  oncesiGun: number;
  sonrasiBaslangic: string;
  sonrasiBitis: string;
  sonrasiGun: number;
  toplamGun: number;
  aktarilanGun: number;
  erkenDogumEkGun: number;
  oncesiSatirlar: DonemSatir[];
  sonrasiSatirlar: DonemSatir[];
}

interface Props {
  onChange: (sonuc: AnalikSonuc | null) => void;
}

/* ── Bileşen ─────────────────────────────────────────── */
export default function AnalikHesap({ onChange }: Props) {
  // Doğum öncesi girdiler
  const [raporTarihi, setRaporTarihi] = useState("");
  const [kacincuHafta, setKacincuHafta] = useState<number | null>(null);
  const [calisir, setCalisir] = useState<boolean | null>(null); // true=aktarma var, false=yok

  // Doğum tarihi
  const [dogumTarihi, setDogumTarihi] = useState("");

  // Hesaplanan dönem sınırları
  const [oncesiBaslangic, setOncesiBaslangic] = useState("");
  const [oncesiBitis, setOncesiBitis] = useState("");
  const [sonrasiBaslangic, setSonrasiBaslangic] = useState("");
  const [sonrasiBitis, setSonrasiBitis] = useState("");
  const [aktarilanGun, setAktarilanGun] = useState(0);
  const [erkenGun, setErkenGun] = useState(0);

  // Alt dönem satırları
  const [oncesiSatirlar, setOncesiSatirlar] = useState<DonemSatir[]>([]);
  const [sonrasiSatirlar, setSonrasiSatirlar] = useState<DonemSatir[]>([]);

  // ── Hesapla ───────────────────────────────────────────
  useEffect(() => {
    if (!raporTarihi || kacincuHafta === null || calisir === null) {
      setOncesiBaslangic(""); setOncesiBitis(""); setSonrasiBaslangic(""); setSonrasiBitis("");
      onChange(null); return;
    }

    // İstirahat başlangıcı:
    // Aktarma yok → rapor tarihi
    // Aktarma var → 38. haftanın başı
    //   38. hafta = raporTarihi + (38 - kacincuHafta) * 7
    let istirahStart: string;
    let aktGun = 0;

    if (!calisir) {
      // Aktarma yok — rapor tarihi = istirahatin başı
      istirahStart = raporTarihi;
    } else {
      // 38. haftaya kadar çalışabilir
      const haftaFark = 38 - kacincuHafta;
      if (haftaFark <= 0) {
        // Zaten 38+ hafta, hemen başla
        istirahStart = raporTarihi;
      } else {
        istirahStart = addWeeks(raporTarihi, haftaFark);
      }
    }

    // Doğum öncesi: istirahStart → dogumTarihi - 1
    const oBas = istirahStart;
    const oBit = dogumTarihi ? addDays(dogumTarihi, -1) : "";

    // Aktarılan süre: eğer calisir=true ve istirahStart > raporTarihi
    if (calisir && istirahStart > raporTarihi && dogumTarihi) {
      // rapor tarihi → istirahStart - 1 arası aktarılan süre
      const rT = new Date(raporTarihi);
      const iT = new Date(istirahStart);
      aktGun = Math.max(0, Math.round((iT.getTime() - rT.getTime()) / 86400000));
    } else {
      aktGun = 0;
    }

    // Erken doğum: 40 haftadan önce doğum
    let erken = 0;
    if (dogumTarihi && kacincuHafta !== null) {
      // 40. hafta tahmini = raporTarihi + (40 - kacincuHafta) * 7
      const tahmini40 = addWeeks(raporTarihi, 40 - kacincuHafta);
      if (dogumTarihi < tahmini40) {
        erken = gunFarki(dogumTarihi, addDays(tahmini40, -1));
      }
    }

    setAktarilanGun(aktGun);
    setErkenGun(erken);
    setOncesiBaslangic(oBas);
    setOncesiBitis(oBit);

    // Doğum sonrası: dogumTarihi → dogumTarihi + 16 hafta - 1 + aktGun + erkenGun
    if (dogumTarihi) {
      const sBas = dogumTarihi;
      const sBit = addDays(addWeeks(dogumTarihi, 16), aktGun + erken - 1);
      setSonrasiBaslangic(sBas);
      setSonrasiBitis(sBit);

      // Varsayılan satırları oluştur (eğer henüz yoksa veya dönem değişti)
      setOncesiSatirlar([yeniDonemSatir(oBas, oBit || oBas, "ayakta")]);
      setSonrasiSatirlar([yeniDonemSatir(sBas, sBit, "ayakta")]);
    } else {
      setSonrasiBaslangic(""); setSonrasiBitis("");
      setOncesiSatirlar(oBas ? [yeniDonemSatir(oBas, oBas, "ayakta")] : []);
      setSonrasiSatirlar([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raporTarihi, kacincuHafta, calisir, dogumTarihi]);

  // Dışarıya bildir
  useEffect(() => {
    if (!oncesiBaslangic || !dogumTarihi) { onChange(null); return; }
    const oBit = oncesiBitis || addDays(dogumTarihi, -1);
    onChange({
      oncesiBaslangic, oncesiBitis: oBit,
      oncesiGun: Math.min(gunFarki(oncesiBaslangic, oBit), 56),
      sonrasiBaslangic, sonrasiBitis,
      sonrasiGun: sonrasiBitis ? Math.min(gunFarki(sonrasiBaslangic, sonrasiBitis), aktarilanGun === 0 ? 168 : 112) : 0,
      toplamGun: 0, // dışarıda hesaplanacak
      aktarilanGun, erkenDogumEkGun: erkenGun,
      oncesiSatirlar, sonrasiSatirlar,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oncesiBaslangic, oncesiBitis, sonrasiBaslangic, sonrasiBitis, oncesiSatirlar, sonrasiSatirlar, aktarilanGun, erkenGun]);

  // ── Satır işlemleri ───────────────────────────────────
  const updateOncesiSatir = (id: number, field: keyof DonemSatir, val: string) => {
    setOncesiSatirlar(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
  };
  const addOncesiSatir = () => {
    if (!oncesiSatirlar.length) return;
    const son = oncesiSatirlar[oncesiSatirlar.length - 1];
    const yeniBas = addDays(son.bitis, 1);
    if (yeniBas > oncesiBitis) return;
    // Önceki satırın bitişini otomatik bir gün geri al
    setOncesiSatirlar(prev => {
      const k = [...prev];
      k[k.length - 1] = { ...k[k.length - 1], bitis: addDays(yeniBas, -1) };
      return [...k, yeniDonemSatir(yeniBas, oncesiBitis, "ayakta")];
    });
  };
  const removeOncesiSatir = (id: number) => {
    if (oncesiSatirlar.length <= 1) return;
    setOncesiSatirlar(prev => {
      const filtered = prev.filter(s => s.id !== id);
      // Son satırın bitişini dönem sonuna uzat
      filtered[filtered.length - 1] = { ...filtered[filtered.length - 1], bitis: oncesiBitis };
      return filtered;
    });
  };

  const updateSonrasiSatir = (id: number, field: keyof DonemSatir, val: string) => {
    setSonrasiSatirlar(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s));
  };
  const addSonrasiSatir = () => {
    if (!sonrasiSatirlar.length) return;
    const son = sonrasiSatirlar[sonrasiSatirlar.length - 1];
    const yeniBas = addDays(son.bitis, 1);
    if (yeniBas > sonrasiBitis) return;
    setSonrasiSatirlar(prev => {
      const k = [...prev];
      k[k.length - 1] = { ...k[k.length - 1], bitis: addDays(yeniBas, -1) };
      return [...k, yeniDonemSatir(yeniBas, sonrasiBitis, "ayakta")];
    });
  };
  const removeSonrasiSatir = (id: number) => {
    if (sonrasiSatirlar.length <= 1) return;
    setSonrasiSatirlar(prev => {
      const filtered = prev.filter(s => s.id !== id);
      filtered[filtered.length - 1] = { ...filtered[filtered.length - 1], bitis: sonrasiBitis };
      return filtered;
    });
  };

  // ── Kontroller ────────────────────────────────────────
  const oncesiGun = oncesiBaslangic && oncesiBitis ? gunFarki(oncesiBaslangic, oncesiBitis) : 0;
  const sonrasiGun = sonrasiBaslangic && sonrasiBitis ? gunFarki(sonrasiBaslangic, sonrasiBitis) : 0;
  const sonrasiMax = aktarilanGun === 0 ? 168 : 112;
  const oncesiAsim = oncesiGun > 56;
  const sonrasiAsim = sonrasiGun > sonrasiMax;
  const toplamAsim = (oncesiGun + sonrasiGun) > 168;

  // ── Render ────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Doğum Öncesi Bilgileri ── */}
      <DonemKart renk="#7c3aed" baslik="🤰 Doğum Öncesi Raporu">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={lb}>Rapor Tarihi</label>
              <input type="date" value={raporTarihi}
                onChange={e => setRaporTarihi(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lb}>Kaçıncı Hafta</label>
              <input type="number" min={32} max={41} value={kacincuHafta ?? ""}
                placeholder="32-41"
                onChange={e => setKacincuHafta(parseInt(e.target.value) || null)}
                style={inp} />
            </div>
          </div>

          <div>
            <label style={lb}>Çalışma Durumu</label>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setCalisir(false)} style={{
                ...togStyle(calisir === false, "#7c3aed"),
              }}>Çalışamaz (Aktarma Yok)</button>
              <button onClick={() => setCalisir(true)} style={{
                ...togStyle(calisir === true, "#059669"),
              }}>Çalışır (Aktarma Var)</button>
            </div>
          </div>

          {/* Hesaplanan başlangıç */}
          {oncesiBaslangic && (
            <InfoSatir>
              İstirahat başlangıcı: <b>{fmt_tarih(oncesiBaslangic)}</b>
              {calisir && aktarilanGun > 0 && (
                <span style={{ color: "#059669", marginLeft: 8 }}>
                  (+{aktarilanGun} gün doğum sonrasına aktarılacak)
                </span>
              )}
            </InfoSatir>
          )}
        </div>
      </DonemKart>

      {/* ── Doğum Tarihi ── */}
      <DonemKart renk="#b45309" baslik="👶 Doğum Tarihi">
        <div>
          <label style={lb}>Doğum Tarihi</label>
          <input type="date" value={dogumTarihi}
            onChange={e => setDogumTarihi(e.target.value)} style={{ ...inp, maxWidth: 200 }} />
        </div>
        {erkenGun > 0 && (
          <InfoSatir renk="#b45309">
            40 haftadan önce doğum: <b>+{erkenGun} gün</b> doğum sonrasına eklendi
          </InfoSatir>
        )}
      </DonemKart>

      {/* ── Dönem özeti ve satırlar ── */}
      {oncesiBaslangic && oncesiBitis && (
        <DonemKart renk="#7c3aed" baslik={`📋 Doğum Öncesi Dönem — ${fmt_tarih(oncesiBaslangic)} → ${fmt_tarih(oncesiBitis)} (${oncesiGun} gün)`}>
          {oncesiAsim && (
            <UyariKutu>⚠️ Doğum öncesi max <b>56 gün</b> olabilir. Girilen: <b>{oncesiGun} gün</b>. Hesaplama 56 gün üzerinden yapılır.</UyariKutu>
          )}
          <SatirListesi
            satirlar={oncesiSatirlar}
            donemBas={oncesiBaslangic}
            donemBit={oncesiBitis}
            onUpdate={updateOncesiSatir}
            onAdd={addOncesiSatir}
            onRemove={removeOncesiSatir}
          />
        </DonemKart>
      )}

      {sonrasiBaslangic && sonrasiBitis && (
        <DonemKart renk="#b45309" baslik={`📋 Doğum Sonrası Dönem — ${fmt_tarih(sonrasiBaslangic)} → ${fmt_tarih(sonrasiBitis)} (${sonrasiGun} gün)`}>
          {sonrasiAsim && (
            <UyariKutu>⚠️ Doğum sonrası max <b>{sonrasiMax} gün</b> olabilir. Girilen: <b>{sonrasiGun} gün</b>. Hesaplama {sonrasiMax} gün üzerinden yapılır.</UyariKutu>
          )}
          {(aktarilanGun > 0 || erkenGun > 0) && (
            <InfoSatir renk="#b45309" style={{ marginBottom: 6 }}>
              16 hafta (112 gün){aktarilanGun > 0 ? ` + ${aktarilanGun} aktarılan gün` : ""}{erkenGun > 0 ? ` + ${erkenGun} erken doğum günü` : ""}
            </InfoSatir>
          )}
          <SatirListesi
            satirlar={sonrasiSatirlar}
            donemBas={sonrasiBaslangic}
            donemBit={sonrasiBitis}
            onUpdate={updateSonrasiSatir}
            onAdd={addSonrasiSatir}
            onRemove={removeSonrasiSatir}
          />
        </DonemKart>
      )}

      {/* Genel uyarılar */}
      {toplamAsim && !oncesiAsim && !sonrasiAsim && (
        <UyariKutu>⚠️ Toplam analık süresi <b>168 günü</b> geçemez. Hesaplama 168 gün üzerinden yapılır.</UyariKutu>
      )}

    </div>
  );
}

/* ── Alt bileşenler ─────────────────────────────────── */
function DonemKart({ renk, baslik, children }: { renk: string; baslik: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1.5px solid ${renk}40`, borderRadius: 9, overflow: "hidden" }}>
      <div style={{ background: `${renk}15`, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: renk }}>
        {baslik}
      </div>
      <div style={{ padding: "10px 10px", background: "#fff", display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function InfoSatir({ children, renk = "#1e40af", style: st }: { children: React.ReactNode; renk?: string; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 11, color: renk, background: `${renk}10`, borderRadius: 6, padding: "4px 8px", ...st }}>
      {children}
    </div>
  );
}

function UyariKutu({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "6px 10px", fontSize: 11, color: "#b91c1c", marginBottom: 4 }}>
      {children}
    </div>
  );
}

interface SatirListesiProps {
  satirlar: DonemSatir[];
  donemBas: string;
  donemBit: string;
  onUpdate: (id: number, field: keyof DonemSatir, val: string) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
}

function SatirListesi({ satirlar, donemBas, donemBit, onUpdate, onAdd, onRemove }: SatirListesiProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {satirlar.map((s, idx) => {
        const gun = s.baslangic && s.bitis ? gunFarki(s.baslangic, s.bitis) : 0;
        const disarida = s.baslangic < donemBas || s.bitis > donemBit;
        return (
          <div key={s.id} style={{
            background: s.tur === "yatarak" ? "#f0f4fa" : "#f0fdf4",
            border: `1.5px solid ${disarida ? "#fca5a5" : s.tur === "yatarak" ? "#bfdbfe" : "#86efac"}`,
            borderRadius: 7, padding: "6px 8px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#64748b", flexShrink: 0 }}>{idx + 1}.</span>
              <input type="date" value={s.baslangic} min={donemBas} max={s.bitis || donemBit}
                onChange={e => onUpdate(s.id, "baslangic", e.target.value)}
                style={{ ...inp, flex: 1, padding: "4px 5px", fontSize: 11 }} />
              <span style={{ fontSize: 9, color: "#64748b", flexShrink: 0 }}>→</span>
              <input type="date" value={s.bitis} min={s.baslangic} max={donemBit}
                onChange={e => onUpdate(s.id, "bitis", e.target.value)}
                style={{ ...inp, flex: 1, padding: "4px 5px", fontSize: 11 }} />
              {gun > 0 && <span style={{ fontSize: 9, color: "#64748b", flexShrink: 0 }}>{gun}g</span>}
              {satirlar.length > 1 && (
                <button onClick={() => onRemove(s.id)} style={{ background: "#fee2e2", color: "#b91c1c", border: "none", borderRadius: 5, padding: "2px 5px", fontSize: 10, cursor: "pointer" }}>✕</button>
              )}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => onUpdate(s.id, "tur", "ayakta")} style={togStyle(s.tur === "ayakta", "#1a7a4a")}>Ayakta</button>
              <button onClick={() => onUpdate(s.id, "tur", "yatarak")} style={togStyle(s.tur === "yatarak", "#1a4b8c")}>Yatarak</button>
            </div>
            {disarida && (
              <div style={{ fontSize: 10, color: "#b91c1c", marginTop: 4 }}>⚠️ Tarihler dönem aralığı dışında</div>
            )}
          </div>
        );
      })}
      <button onClick={onAdd} style={{ background: "#f8fafc", border: "1.5px dashed #d1dce8", borderRadius: 6, padding: "5px", fontSize: 11, color: "#1a4b8c", cursor: "pointer", fontWeight: 600 }}>
        + Dönem İçinde Yeni Satır
      </button>
    </div>
  );
}

/* ── Stiller ─────────────────────────────────────────── */
const inp: React.CSSProperties = { width: "100%", border: "1.5px solid #d1dce8", borderRadius: 6, padding: "7px 8px", fontSize: 13, color: "#1e293b", background: "#fff", outline: "none", boxSizing: "border-box" };
const lb: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4 };

function togStyle(aktif: boolean, renk: string): React.CSSProperties {
  return {
    padding: "4px 8px", fontSize: 11, fontWeight: aktif ? 700 : 500,
    borderRadius: 6, cursor: "pointer", border: `1.5px solid ${aktif ? renk : "#d1dce8"}`,
    background: aktif ? renk : "#f8fafc", color: aktif ? "#fff" : renk,
  };
}
