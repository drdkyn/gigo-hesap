"use client";

import { useState, useEffect } from "react";

export default function PwaBanner() {
  const [goster, setGoster] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "diger" | null>(null);

  useEffect(() => {
    // Daha önce kapatıldıysa gösterme
    if (sessionStorage.getItem("pwa-banner-kapali")) return;
    // Zaten standalone (yüklü) ise gösterme
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    // iOS Safari veya diğer tüm platformlar
    const p = isIos && isSafari ? "ios" : "diger";
    setPlatform(p);

    // 2.5 saniye sonra göster
    const t = setTimeout(() => setGoster(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const kapat = () => {
    setGoster(false);
    sessionStorage.setItem("pwa-banner-kapali", "1");
  };

  if (!goster || !platform) return null;

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div role="dialog" aria-label="Ana ekrana ekle" style={{
        position: "fixed", bottom: 16, left: "50%",
        transform: "translateX(-50%)", zIndex: 9999,
        width: "calc(100% - 32px)", maxWidth: 480,
        background: "#1a4b8c", color: "#fff",
        borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
        padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 12,
        animation: "slideUp 0.35s ease",
      }}>

        {/* İkon */}
        <div style={{
          width: 44, height: 44, flexShrink: 0,
          background: "rgba(255,255,255,0.15)", borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}>⚕️</div>

        {/* İçerik */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            Ana Ekrana Ekle
          </div>

          {platform === "ios" ? (
            <>
              <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6, marginBottom: 10 }}>
                Safari'nin alt çubuğundaki{" "}
                <strong style={{ background: "rgba(255,255,255,0.2)", padding: "1px 6px", borderRadius: 4 }}>
                  □↑
                </strong>{" "}
                paylaş butonuna basın, ardından{" "}
                <strong>"Ana Ekrana Ekle"</strong> seçin.
              </div>
              <button onClick={kapat} style={{
                background: "rgba(255,255,255,0.15)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8,
                padding: "7px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600,
              }}>Tamam</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.6, marginBottom: 10 }}>
                Tarayıcı menüsünden <strong>"Ana Ekrana Ekle"</strong> veya{" "}
                <strong>"Kısayol Oluştur"</strong> seçeneğiyle bu sayfayı ana ekrana ekleyebilirsiniz.
              </div>
              <button onClick={kapat} style={{
                background: "rgba(255,255,255,0.15)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8,
                padding: "7px 16px", fontSize: 13, cursor: "pointer", fontWeight: 600,
              }}>Tamam</button>
            </>
          )}
        </div>

        {/* Kapat X */}
        <button onClick={kapat} aria-label="Kapat" style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.65)",
          fontSize: 22, cursor: "pointer", lineHeight: 1, flexShrink: 0, padding: "0 2px",
        }}>×</button>

      </div>
    </>
  );
}
