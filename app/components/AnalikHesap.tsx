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
  gecAsimGun: number;
  oncesiSatirlar: DonemSatir[];
  sonrasiSatirlar: DonemSatir[];
}

interface Props {
  onChange: (sonuc: AnalikSonuc | null) => void;
}

/* ── Bileşen ─────────────────────────────────────────── */
export default function AnalikHesap({ onChange }: Props) {
  // Doğum öncesi raporu var mı?
  const [oncesiRaporVar, setOncesiRaporVar] = useState(true); // varsayılan: var

  // Doğum öncesi girdiler
  const [raporTarihi, setRaporTarihi] = useState("");
  const [kacincuHafta, setKacincuHafta] = useState<number | null>(null);
  const [calisir, setCalisir] = useState<boolean | null>(null);

  // Doğum tarihi
  const [dogumTarihi, setDogumTarihi] = useState("");

  // Hesaplanan dönem sınırları
  const [oncesiBaslangic, setOncesiBaslangic] = useState("");
  const [oncesiBitis, setOncesiBitis] = useState("");
  const [sonrasiBaslangic, setSonrasiBaslangic] = useState("");
  const [sonrasiBitis, setSonrasiBitis] = useState("");
  const [aktarilanGun, setAktarilanGun] = useState(0);
  const [erkenGun, setErkenGun] = useState(0);
  const [gecAsimGun, setGecAsimGun] = useState(0);

  // Alt dönem satırları
  const [oncesiSatirlar, setOncesiSatirlar] = useState<DonemSatir[]>([]);
  const [sonrasiSatirlar, setSonrasiSatirlar] = useState<DonemSatir[]>([]);

  // ── Hesapla ───────────────────────────────────────────
  useEffect(() => {
    // Doğum öncesi raporu yok → sadece 112 gün doğum sonrası
    if (!oncesiRaporVar) {
      setOncesiBaslangic(""); setOncesiBitis("");
      setAktarilanGun(0); setErkenGun(0); setGecAsimGun(0);
      if (dogumTarihi) {
        const sBas = dogumTarihi;
        const sBit = addDays(dogumTarihi, 112); // 112 gün sonrası
        setSonrasiBaslangic(sBas);
        setSonrasiBitis(sBit);
        setSonrasiSatirlar([yeniDonemSatir(sBas, sBit, "ayakta")]);
      } else {
        setSonrasiBaslangic(""); setSonrasiBitis("");
        setSonrasiSatirlar([]);
      }
      setOncesiSatirlar([]);
      return;
    }

    if (!raporTarihi || kacincuHafta === null || calisir === null) {
      setOncesiBaslangic(""); setOncesiBitis(""); setSonrasiBaslangic(""); setSonrasiBitis("");
      onChange(null); return;
    }

    // Rapor 32. haftadan önce olamaz — zorunlu 32. hafta
    // Eğer 32+ hafta geldi ise, kaybedilen hafta var
    const kayipHafta = Math.max(0, kacincuHafta - 32);
    const doğumOncesiMaxPotansiyel = 56 - (kayipHafta * 7); // 32. hafta = 56, 33. = 49, 34. = 42 vb

    // Tahmini doğum tarihi (40. hafta)
    const tahmini40 = addWeeks(raporTarihi, 40 - kacincuHafta);

    let istirahStart: string;
    let aktGun = 0;

    if (!calisir) {
      istirahStart = raporTarihi;
    } else {
      const haftaFark = 38 - kacincuHafta;
      istirahStart = haftaFark <= 0 ? raporTarihi : addWeeks(raporTarihi, haftaFark);
    }

    const oBas = istirahStart;
    // Çalışamaz: doğum öncesi max = 56 gün (kayıp haftaya göre az olabilir)
    // Çalışır: doğum öncesi = rapor → istirahat başlangıcı (veya doğuma kadar)
    let oBit = "";
    if (!calisir) {
      // Çalışamaz: doğum öncesi max 56 gün (veya kayıp haftaya göre az)
      oBit = addDays(oBas, doğumOncesiMaxPotansiyel - 1); // -1 çünkü inclusive
    } else if (dogumTarihi) {
      // Çalışır: doğum öncesi = rapor → doğumdan önceki gün
      oBit = addDays(dogumTarihi, -1);
    }

    if (calisir && istirahStart > raporTarihi && dogumTarihi) {
      if (dogumTarihi <= istirahStart) {
        // Doğum istirahat başlamadan olmuş (erken doğum)
        // Aktarılan = rapor tarihi → doğum tarihi arası (çalışılan süre)
        aktGun = gunFarki(raporTarihi, dogumTarihi) - 1;
      } else {
        // Normal: istirahat başlamadan doğuma kadar aktarılır
        aktGun = gunFarki(raporTarihi, istirahStart) - 1;
      }
    } else {
      aktGun = 0;
    }

    // Erken doğum günleri
    // Çalışır: aktarılan zaten rapor→doğum içeriyor, erken ayrı eklenmez (çift sayım olur)
    // Çalışamaz: doğum öncesi 56 kullanıldı, erken kısım doğum sonrasına eklenir
    let erken = 0;
    if (dogumTarihi && dogumTarihi < tahmini40 && !calisir) {
      erken = gunFarki(dogumTarihi, addDays(tahmini40, -1));
    }

    // Geç doğum aşımı - ilk 2 gün ödenmez, kalanı aşım
    let gecAsim = 0;
    if (dogumTarihi && dogumTarihi > tahmini40) {
      const gecGun = gunFarki(addDays(tahmini40, 1), dogumTarihi);
      gecAsim = Math.max(0, gecGun - 2); // ilk 2 gün ödenmez
    }

    setAktarilanGun(aktGun);
    setErkenGun(erken);
    setGecAsimGun(gecAsim);
    setOncesiBaslangic(oBas);
    setOncesiBitis(oBit);

    // Doğum sonrası: 16 hafta (112 gün) + aktarılan + erken (168 sınırında)
    // Geç doğum aşımı ayrı sayılır (168 dışında ödenir, tarih hesabında dahil değil)
    if (dogumTarihi) {
      const sBas = dogumTarihi;
      // 112 + aktarılan + erken gün (168 sınırına dahil) — gecAsim dahil ETMİ
      const sonrasiToplamGun = 112 + aktGun + erken;
      // gunFarki inclusive olduğu için -1 ekle
      const sBit = addDays(dogumTarihi, sonrasiToplamGun - 1);
      setSonrasiBaslangic(sBas);
      setSonrasiBitis(sBit);
      setOncesiSatirlar([yeniDonemSatir(oBas, oBit || oBas, "ayakta")]);
      setSonrasiSatirlar([yeniDonemSatir(sBas, sBit, "ayakta")]);
    } else {
      setSonrasiBaslangic(""); setSonrasiBitis("");
      setOncesiSatirlar(oBas ? [yeniDonemSatir(oBas, oBas, "ayakta")] : []);
      setSonrasiSatirlar([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raporTarihi, kacincuHafta, calisir, dogumTarihi, oncesiRaporVar]);

  // Dışarıya bildir
  useEffect(() => {
    if (!oncesiRaporVar) {
      if (!dogumTarihi) { onChange(null); return; }
      onChange({
        oncesiBaslangic: "", oncesiBitis: "", oncesiGun: 0,
        sonrasiBaslangic, sonrasiBitis,
        sonrasiGun: sonrasiBitis ? Math.min(gunFarki(sonrasiBaslangic, sonrasiBitis), 112) : 0,
        toplamGun: 0, aktarilanGun: 0, erkenDogumEkGun: 0, gecAsimGun: 0,
        oncesiSatirlar: [], sonrasiSatirlar,
      });
      return;
    }
    if (!oncesiBaslangic || !dogumTarihi) { onChange(null); return; }
    const oBit = oncesiBitis || addDays(dogumTarihi, -1);
    onChange({
      oncesiBaslangic, oncesiBitis: oBit,
      oncesiGun: Math.min(gunFarki(oncesiBaslangic, oBit), 56),
      sonrasiBaslangic, sonrasiBitis,
      sonrasiGun: sonrasiBitis ? Math.min(gunFarki(sonrasiBaslangic, sonrasiBitis), Math.min(112 + aktarilanGun + erkenGun, 168)) : 0,
      toplamGun: 0,
      aktarilanGun, erkenDogumEkGun: erkenGun, gecAsimGun,
      oncesiSatirlar, sonrasiSatirlar,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oncesiRaporVar, oncesiBaslangic, oncesiBitis, sonrasiBaslangic, sonrasiBitis, oncesiSatirlar, sonrasiSatirlar, aktarilanGun, erkenGun, dogumTarihi]);

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
  // Doğum istirahat başlangıcından önce olabilir (erken/acil doğum)
  // Bu durumda öncesi = 0 gün, sonrası normal hesaplanır
  const oncesiGun = oncesiBaslangic && oncesiBitis && oncesiBitis >= oncesiBaslangic
    ? gunFarki(oncesiBaslangic, oncesiBitis) : 0;
  const sonrasiGun = sonrasiBaslangic && sonrasiBitis ? gunFarki(sonrasiBaslangic, sonrasiBitis) : 0;
  // Sonrası max: 112 + aktarılan + erken (168 dahil)
  // Geç aşım 168 DIŞINDA sayılır, tarih ve max hesabına dahil değil
  const sonrasiMax = Math.min(112 + aktarilanGun + erkenGun, 168);
  const oncesiAsim = oncesiGun > 56;
  const sonrasiAsim = false;
  const toplamAsim = (oncesiGun + sonrasiGun) > 168;
  const dogumOncesiErken = oncesiRaporVar && dogumTarihi && oncesiBaslangic && dogumTarihi <= oncesiBaslangic;
  const gecAsimVar = gecAsimGun > 0;
  const tahminiDogum = raporTarihi && kacincuHafta ? addWeeks(raporTarihi, 40 - kacincuHafta) : "";
  const kayipHafta = kacincuHafta ? Math.max(0, kacincuHafta - 32) : 0;
  const doğumOncesiMaxPotansiyel = 56 - (kayipHafta * 7);

  // ── Render ────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Doğum Öncesi Raporu Kartı ── */}
      <DonemKart renk="#7c3aed" baslik="🤰 Doğum Öncesi Raporu">
        {/* Radio: Rapor var/yok */}
        <div style={{ display: "flex", gap: 8, marginBottom: 2 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, fontWeight: oncesiRaporVar ? 700 : 500 }}>
            <input type="radio" name="oncesiDurum" checked={oncesiRaporVar}
              onChange={() => setOncesiRaporVar(true)} />
            Doğum Öncesi Raporu Var
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, fontWeight: !oncesiRaporVar ? 700 : 500, color: !oncesiRaporVar ? "#b91c1c" : "inherit" }}>
            <input type="radio" name="oncesiDurum" checked={!oncesiRaporVar}
              onChange={() => setOncesiRaporVar(false)} />
            Doğum Öncesi Raporu Yok
          </label>
        </div>

        {/* Rapor detayları — sadece var ise göster */}
        {oncesiRaporVar && (
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
              {calisir === null && raporTarihi && kacincuHafta && (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#92400e", marginBottom: 5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
                  ⚠️ Lütfen çalışma durumunu seçiniz
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setCalisir(false)} style={togStyle(calisir === false, "#7c3aed")}>Çalışamaz (Aktarma Yok)</button>
                <button onClick={() => setCalisir(true)} style={togStyle(calisir === true, "#059669")}>Çalışır (Aktarma Var)</button>
              </div>
            </div>

            {tahminiDogum && (
              <InfoSatir renk="#7c3aed">
                Tahmini doğum tarihi (40. hafta): <b>{fmt_tarih(tahminiDogum)}</b>
              </InfoSatir>
            )}
            {oncesiBaslangic && (
              <InfoSatir>
                {calisir ? (
                  <>
                    İstirahat başlangıcı: <b>{fmt_tarih(oncesiBaslangic)}</b>
                    {aktarilanGun > 0 && (
                      <span style={{ color: "#059669", marginLeft: 8 }}>
                        (Süresinde doğum olursa +{aktarilanGun} gün doğum sonrasına aktarılacak ve ödenecek)
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    Doğum öncesi rapor süresi: <b>32→40 hafta = 56 gün</b>
                    <br/>
                    {kayipHafta > 0 && (
                      <>
                        32. haftadan sonra rapor alındı için doğum öncesi max = {doğumOncesiMaxPotansiyel} gün
                      </>
                    )}
                  </>
                )}
              </InfoSatir>
            )}
          </div>
        )}
      </DonemKart>

      {/* ── Doğum Tarihi ── */}
      <DonemKart renk="#b45309" baslik="👶 Doğum Tarihi">
        <div>
          <label style={lb}>Doğum Tarihi</label>
          <input type="date" value={dogumTarihi}
            onChange={e => setDogumTarihi(e.target.value)} style={{ ...inp, maxWidth: 200 }} />
        </div>
        {!oncesiRaporVar && dogumTarihi && (
          <InfoSatir renk="#b45309">
            Doğum öncesi raporu yok → Doğum sonrası yalnızca <b>112 gün</b> ödenir.
          </InfoSatir>
        )}
        {gecAsimVar && (
          <InfoSatir renk="#d97706">
            ⏰ Geç doğum: {gecAsimGun + 2} gün. İlk <b>2 gün ödenmez</b>, <b>{gecAsimGun} gün ödenir</b> (168 dışında).
          </InfoSatir>
        )}
      </DonemKart>

      {/* ── Dönem özeti ve satırlar ── */}
      {oncesiRaporVar && oncesiBaslangic && (
        <DonemKart renk="#7c3aed" baslik={`📋 Doğum Öncesi Dönem — ${fmt_tarih(oncesiBaslangic)} → ${dogumOncesiErken ? fmt_tarih(dogumTarihi) : fmt_tarih(oncesiBitis)} (${oncesiGun} gün)`}>
          {dogumOncesiErken && (
            <InfoSatir renk="#b45309">
              ℹ️ Doğum ({fmt_tarih(dogumTarihi)}), istirahat başlangıcından ({fmt_tarih(oncesiBaslangic)}) önce gerçekleşmiş.
              Doğum öncesi rapor süresi <b>0 gün</b> — tüm aktarılan günler doğum sonrasına eklenmiştir.
            </InfoSatir>
          )}
          {oncesiAsim && !dogumOncesiErken && (
            <UyariKutu>⚠️ Doğum öncesi max <b>56 gün</b> olabilir. Hesaplama 56 gün üzerinden yapılır.</UyariKutu>
          )}
          {!dogumOncesiErken && (
            <SatirListesi
              satirlar={oncesiSatirlar}
              donemBas={oncesiBaslangic}
              donemBit={oncesiBitis}
              onUpdate={updateOncesiSatir}
              onAdd={addOncesiSatir}
              onRemove={removeOncesiSatir}
            />
          )}
        </DonemKart>
      )}

      {sonrasiBaslangic && sonrasiBitis && (
        <DonemKart renk="#b45309" baslik={`📋 Doğum Sonrası Dönem — ${fmt_tarih(sonrasiBaslangic)} → ${fmt_tarih(sonrasiBitis)} (${Math.min(sonrasiGun, sonrasiMax)} gün)`}>
          {!oncesiRaporVar && (
            <InfoSatir renk="#b45309" style={{ marginBottom: 6, fontWeight: 600 }}>
              ℹ️ Doğum öncesi raporu yok → Doğum sonrası <b>112 gün</b> ödenecek
            </InfoSatir>
          )}
          {sonrasiGun > sonrasiMax && (
            <InfoSatir renk="#b45309" style={{ marginBottom: 4 }}>
              ℹ️ Hesaplanan süre ({sonrasiGun} gün) max sınırı ({sonrasiMax} gün) aşıyor. Hesaplama <b>{sonrasiMax} gün</b> üzerinden yapılacaktır.
            </InfoSatir>
          )}
          {(aktarilanGun > 0 || erkenGun > 0 || gecAsimVar || !calisir) && (
            <InfoSatir renk="#b45309" style={{ marginBottom: 6 }}>
              {calisir ? (
                <>
                  16 hafta (112 gün)
                  {aktarilanGun > 0 && <> + <b>{aktarilanGun} aktarılan gün</b> (ödenecek)</>}
                  {erkenGun > 0 && <> + <b>{erkenGun} erken doğum günü</b> (ödenecek)</>}
                  {" "}= <b>{Math.min(sonrasiGun, Math.min(112 + aktarilanGun + erkenGun, 168))} gün</b> (168 içinde ödenir)
                  {gecAsimVar && <><br/>+ <b>{gecAsimGun + 2} geç doğum günü</b> (ilk 2 ödenmez, <b>{gecAsimGun} gün</b> 168 DIŞINDA ödenir)</>}
                </>
              ) : (
                <>
                  <b>112 gün</b> (temel doğum sonrası)
                  {doğumOncesiMaxPotansiyel > 0 && (
                    <>
                      <br/>Doğum öncesi <b>{doğumOncesiMaxPotansiyel} gün</b> kullanıldı (rapor süresi)
                      <br/>Doğum sonrasına aktarılan: <b>0 gün</b> (aktarma yok)
                      <br/>Toplam 168 içinde: <b>{doğumOncesiMaxPotansiyel + 112} gün</b>
                    </>
                  )}
                  {gecAsimVar && (
                    <>
                      <br/>+ <b>{gecAsimGun + 2} geç doğum günü</b> (ilk 2 ödenmez, <b>{gecAsimGun} gün</b> 168 dışında ödenir)
                    </>
                  )}
                </>
              )}
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

      {toplamAsim && !oncesiAsim && !dogumOncesiErken && (
        <InfoSatir renk="#b45309">ℹ️ Toplam analık süresi 168 günü aşıyor. Hesaplama 168 gün üzerinden yapılacaktır.</InfoSatir>
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
