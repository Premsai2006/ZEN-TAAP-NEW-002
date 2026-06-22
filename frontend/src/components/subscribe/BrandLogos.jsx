/**
 * Per-brand mini SVG marks for Indian payment sub-brands.
 * Each mark is a self-contained, brand-colored chip ~64x22 — readable on mobile.
 * No external CDNs / no trademarks copied verbatim; these are stylized brand-mark approximations.
 */
import React from "react";

const Chip = ({ children, bg, fg = "#fff", title, w = 64, h = 22, style }) => (
  <span
    className="brand-chip"
    title={title}
    aria-label={title}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: bg,
      color: fg,
      borderRadius: 6,
      padding: "0 8px",
      height: h,
      minWidth: w,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: 0.3,
      lineHeight: 1,
      boxShadow: "0 1px 3px rgba(0,0,0,0.15), inset 0 0 0 1px rgba(255,255,255,0.06)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </span>
);

// === UPI sub-brands ===
export const GPayMark = () => (
  <Chip bg="#ffffff" fg="#5f6368" title="Google Pay" style={{ border: "1px solid #dadce0" }}>
    <span style={{ display: "inline-flex", gap: 1.5, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
      <span style={{ color: "#4285f4" }}>G</span>
      <span style={{ color: "#5f6368" }}>Pay</span>
    </span>
  </Chip>
);

export const PhonePeMark = () => (
  <Chip bg="#5f259f" title="PhonePe">
    <span style={{ display: "inline-flex", gap: 2, fontFamily: "Verdana, sans-serif" }}>
      <span style={{ background: "#fff", color: "#5f259f", width: 11, height: 11, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900 }}>P</span>
      <span>PhonePe</span>
    </span>
  </Chip>
);

export const PaytmMark = ({ title = "Paytm" }) => (
  <Chip bg="#ffffff" fg="#012e5e" title={title} style={{ border: "1px solid #00baf2" }}>
    <span style={{ fontStyle: "italic", fontFamily: "Arial, sans-serif" }}>
      <span style={{ color: "#012e5e" }}>pay</span>
      <span style={{ color: "#00baf2" }}>tm</span>
    </span>
  </Chip>
);

export const BHIMMark = () => (
  <Chip bg="#0f4c81" title="BHIM">
    <span style={{ display: "inline-flex", gap: 2, alignItems: "baseline", fontFamily: "Arial Black, sans-serif" }}>
      <span style={{ color: "#f5b94a", fontSize: 11 }}>★</span>
      <span style={{ fontSize: 10 }}>BHIM</span>
    </span>
  </Chip>
);

// === Card networks ===
export const VisaMark = () => (
  <Chip bg="#1a1f71" title="VISA">
    <span style={{ fontFamily: "Arial Black, sans-serif", fontStyle: "italic", letterSpacing: 1.5, fontSize: 11 }}>
      VISA
    </span>
  </Chip>
);

export const MastercardMark = () => (
  <Chip bg="#000000" title="Mastercard">
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span style={{ position: "relative", width: 22, height: 14 }}>
        <span style={{ position: "absolute", left: 0, top: 0, width: 14, height: 14, borderRadius: "50%", background: "#eb001b" }} />
        <span style={{ position: "absolute", left: 8, top: 0, width: 14, height: 14, borderRadius: "50%", background: "#f79e1b", opacity: 0.85 }} />
      </span>
      <span style={{ fontSize: 8, color: "#fff", letterSpacing: 0.3 }}>mastercard</span>
    </span>
  </Chip>
);

export const RuPayMark = () => (
  <Chip bg="#097c4f" title="RuPay">
    <span style={{ display: "inline-flex", gap: 2, fontFamily: "Arial, sans-serif" }}>
      <span style={{ color: "#fff", fontStyle: "italic" }}>Ru</span>
      <span style={{ color: "#f59020", fontStyle: "italic" }}>Pay</span>
    </span>
  </Chip>
);

// === Banks ===
export const HDFCMark = () => (
  <Chip bg="#004c8f" title="HDFC Bank">
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      <span style={{ width: 8, height: 8, background: "#ed1c24", display: "inline-block" }} />
      <span>HDFC</span>
    </span>
  </Chip>
);

export const ICICIMark = () => (
  <Chip bg="#b02a30" title="ICICI Bank">
    <span style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 11 }}>
      ICICI
    </span>
  </Chip>
);

export const SBIMark = () => (
  <Chip bg="#22409a" title="State Bank of India">
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center", fontFamily: "Arial, sans-serif" }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#22409a", fontSize: 8, fontWeight: 900 }}>•</span>
      <span>SBI</span>
    </span>
  </Chip>
);

export const AxisMark = () => (
  <Chip bg="#97144d" title="Axis Bank">
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      <span style={{ color: "#ed1c24" }}>▲</span>
      <span>AXIS</span>
    </span>
  </Chip>
);

// === Wallets ===
export const AmazonPayMark = () => (
  <Chip bg="#232f3e" title="Amazon Pay">
    <span style={{ display: "inline-flex", gap: 2 }}>
      <span style={{ color: "#fff" }}>amazon</span>
      <span style={{ color: "#ff9900" }}>pay</span>
    </span>
  </Chip>
);

export const FreechargeMark = () => (
  <Chip bg="#fa1f5b" title="Freecharge">
    <span style={{ fontFamily: "Arial, sans-serif", fontSize: 10 }}>Freecharge</span>
  </Chip>
);

export const MobikwikMark = () => (
  <Chip bg="#ff5a5f" title="MobiKwik">
    <span style={{ fontFamily: "Arial, sans-serif", fontSize: 10 }}>MobiKwik</span>
  </Chip>
);
