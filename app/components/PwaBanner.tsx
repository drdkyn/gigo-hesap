"use client";

import { useState, useEffect } from "react";

// beforeinstallprompt event tipi
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaBanner() {
  const [durum, setDurum] = useState<"gizli" | "android-pc" | "ios" | "yuklendi">("gizli");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Daha önce kapatıldıysa gösterme
    if (sessionStorage.getItem("pwa-banner-kapali")) return;
    // Zaten yüklüyse (standalone mod) gösterme
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ((window.navigator as Navigator & { standalone?: boolean }).standalone) return;

    // iOS tespiti
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      // iOS Safari: beforeinstallprompt yok, manuel talimat
      setTimeout(() => setDurum("ios"), 1500);
      return;
    }

    // Android / PC Chrome / Edge: beforeinstallprompt event bekle
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setDurum("android-pc"), 1500);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const kapat = () => {
    setDurum("gizli");
    sessionStorage.setItem("pwa-banner-kapali", "1");
  };

  const yukle = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDurum("yuklendi");
    else kapat();
    setDeferredPrompt(null);
  };

  if (durum === "gizli" || durum === "yuklendi") return null;

  /* ── Banner ortak stiller ── */
  const banner: React.CSSProperties = {
    position: "fixed",
    bottom: 16, left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    width: "calc(100% - 32px)",
    maxWidth: 480,
    background: "#1a4b8c",
    color: "#fff",
    borderRadius: 14,
    boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
    padding: "14px 16px",
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    animation: "slideUp 0.35s ease",
  };

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div style={banner} role="dialog" aria-label="Uygulamayı yükle">

        {/* İkon */}
        <div style={{
          width: 44, height: 44, flexShrink: 0,
          background: "rgba(255,255,255,0.15)",
          borderRadius: 10, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 22,
        }}>⚕️</div>

        {/* İçerik */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
            Uygulamayı Yükle
          </div>

          {durum === "android-pc" && (
            <>
              <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5, marginBottom: 10 }}>
                SGK Rapor'u cihazınıza yükleyin — internet bağlantısı olmadan da çalışır.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={yukle} style={{
                  background: "#fff", color: "#1a4b8c",
                  border: "none", borderRadius: 8,
                  padding: "8px 16px", fontSize: 13, fontWeight: 700,
                  cursor: "pointer", flexShrink: 0,
                }}>
                  📲 Yükle
                </button>
                <button onClick={kapat} style={{
                  background: "rgba(255,255,255,0.15)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8,
                  padding: "8px 14px", fontSize: 13, cursor: "pointer",
                }}>
                  Şimdi Değil
                </button>
              </div>
            </>
          )}

          {durum === "ios" && (
            <>
              <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.6, marginBottom: 10 }}>
                Ana ekrana eklemek için Safari'de
                {" "}<strong style={{ background: "rgba(255,255,255,0.2)", padding: "1px 5px", borderRadius: 4 }}>
                  □↑
                </strong>{" "}
                paylaş butonuna basın, ardından{" "}
                <strong>"Ana Ekrana Ekle"</strong>'yi seçin.
              </div>
              <button onClick={kapat} style={{
                background: "rgba(255,255,255,0.15)", color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8,
                padding: "7px 14px", fontSize: 13, cursor: "pointer",
              }}>
                Tamam, Anladım
              </button>
            </>
          )}
        </div>

        {/* Kapat X */}
        <button onClick={kapat} style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.65)",
          fontSize: 20, cursor: "pointer", lineHeight: 1, flexShrink: 0,
          padding: "0 2px",
        }} aria-label="Kapat">×</button>

      </div>
    </>
  );
}
