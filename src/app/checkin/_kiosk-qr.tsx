"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { getFreshKioskToken } from "./actions";

const REFRESH_MS = 5 * 60 * 1000;

export function KioskQR({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, token, {
      width: 240,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((e) => console.error("QR render failed", e));
  }, [token]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const fresh = await getFreshKioskToken();
        setToken(fresh);
      } catch (e) {
        console.error("QR refresh failed", e);
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return <canvas ref={canvasRef} aria-label="Kiosk check-in QR" />;
}
