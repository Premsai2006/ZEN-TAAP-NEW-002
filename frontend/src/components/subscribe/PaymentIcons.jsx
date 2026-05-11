// Inline SVG-style payment brand pills (real-feeling, no external deps)
import React from "react";

export const VisaIcon = () => (
  <div className="brand-pill brand-visa">
    <span>VISA</span>
  </div>
);

export const MasterCardIcon = () => (
  <div className="brand-pill brand-mc">
    <span className="mc-red" />
    <span className="mc-yellow" />
  </div>
);

export const RupayIcon = () => (
  <div className="brand-pill brand-rupay">
    <span>Ru</span>
    <span style={{ color: "#f99c1c" }}>Pay</span>
  </div>
);

export const UpiIcon = () => (
  <div className="brand-pill brand-upi">
    <span style={{ color: "#097939" }}>U</span>
    <span style={{ color: "#ed752e" }}>P</span>
    <span style={{ color: "#097939" }}>I</span>
  </div>
);

export const BhimIcon = () => (
  <div className="brand-pill brand-bhim">
    <span>BHIM</span>
  </div>
);

export const GpayIcon = () => (
  <div className="brand-pill brand-gpay">
    <span style={{ color: "#4285F4" }}>G</span>
    <span style={{ color: "#EA4335" }}> </span>
    <span style={{ color: "#000" }}>Pay</span>
  </div>
);

export const PhonePeIcon = () => (
  <div className="brand-pill brand-phonepe">
    <span>PhonePe</span>
  </div>
);

export const PaytmIcon = () => (
  <div className="brand-pill brand-paytm">
    <span style={{ color: "#fff" }}>pay</span>
    <span style={{ color: "#20b6f0" }}>tm</span>
  </div>
);
