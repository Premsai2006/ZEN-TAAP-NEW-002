import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Gift, ShieldCheck, CreditCard, Smartphone, Building2, Wallet, Calculator, FileText, Check, RefreshCw, QrCode, Repeat, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { UPILogo, CardLogo, BankLogo, WalletLogo } from "@/components/subscribe/PaymentLogos";

const METHOD_LOGOS = { upi: UPILogo, card: CardLogo, netbanking: BankLogo, wallet: WalletLogo };

const MIN_T = 10;
const MAX_T = 60;
const QR_DOMAIN = "https://zentaapqr.com";
const fmtRupee = (n) => `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return "—"; }
};

const PAYMENT_METHODS = [
  {
    key: "upi",
    label: "UPI",
    icon: Smartphone,
    note: "GPay · PhonePe · Paytm · BHIM",
    brands: [
      { sym: "G", cls: "gpay", title: "Google Pay" },
      { sym: "PP", cls: "phonepe", title: "PhonePe" },
      { sym: "P", cls: "paytm", title: "Paytm" },
      { sym: "B", cls: "bhim", title: "BHIM" },
    ],
  },
  {
    key: "card",
    label: "Credit / Debit Card",
    icon: CreditCard,
    note: "VISA · MasterCard · RuPay",
    brands: [
      { sym: "V", cls: "visa", title: "VISA" },
      { sym: "◉◉", cls: "mc", title: "Mastercard" },
      { sym: "R", cls: "rupay", title: "RuPay" },
    ],
  },
  {
    key: "netbanking",
    label: "Net Banking",
    icon: Building2,
    note: "HDFC · ICICI · SBI · Axis",
    brands: [
      { sym: "H", cls: "hdfc", title: "HDFC" },
      { sym: "I", cls: "icici", title: "ICICI" },
      { sym: "S", cls: "sbi", title: "SBI" },
      { sym: "A", cls: "axis", title: "Axis" },
    ],
  },
  {
    key: "wallet",
    label: "Wallets",
    icon: Wallet,
    note: "Paytm · MobiKwik · Amazon Pay · Freecharge",
    brands: [
      { sym: "P", cls: "pt", title: "Paytm" },
      { sym: "M", cls: "mb", title: "MobiKwik" },
      { sym: "a", cls: "amzn", title: "Amazon Pay" },
      { sym: "F", cls: "frc", title: "Freecharge" },
    ],
  },
];

export default function Subscribe() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("calc");
  const [tables, setTables] = useState(14);
  const [pricing, setPricing] = useState(null);
  const [method, setMethod] = useState("upi");
  const [paying, setPaying] = useState(false);
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    api
      .get(`/pricing?tables=${tables}`)
      .then((r) => setPricing(r.data))
      .catch(() => {});
  }, [tables]);

  // Load existing subscription once on mount; pre-fill slider with current tables.
  useEffect(() => {
    api
      .get("/subscription")
      .then((r) => {
        setExisting(r.data);
        if (r.data?.tables) setTables(r.data.tables);
        if (r.data?.payment_method) setMethod(r.data.payment_method);
      })
      .catch(() => {});
  }, []);

  const hasActive = existing && existing.tables && existing.status && existing.status !== "none" && existing.status !== "skipped";
  const isChangeRequest = hasActive && tables !== existing.tables;

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    []
  );

  const trialEnd = useMemo(() => {
    // For active/trial subs, use the backend-stored trial_end; otherwise compute new (+4d).
    if (existing?.trial_end) {
      try {
        return new Date(existing.trial_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      } catch (err) {
        // Invalid stored ISO string — fall through to computed (+4d). Log so we can spot bad data.
        // eslint-disable-next-line no-console
        console.warn("Subscribe.trialEnd: bad existing.trial_end", existing.trial_end, err);
      }
    }
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }, [existing]);

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.body.appendChild(s);
    });

  const printSubscribeQRs = () => {
    // Render all N QR codes off-screen into a hidden iframe-like print window.
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return toast.error("Browser blocked the print window");
    // Build SVG markup for each table using QRCodeSVG renderer.
    // We render N tiles into the live DOM (off-screen) and serialize them.
    const cards = Array.from({ length: tables }, (_, i) => i + 1)
      .map((n) => {
        const svg = document.querySelector(`[data-qr-svg-sub="${n}"] svg`);
        const svgMarkup = svg ? svg.outerHTML : "";
        return `
          <div class="qrcard">
            <div class="brand">ZenTaap</div>
            <div class="qrwrap">${svgMarkup}</div>
            <div class="t">Table ${n}</div>
            <div class="d">Scan to order</div>
          </div>`;
      })
      .join("");
    w.document.write(`<!doctype html><html><head><title>ZenTaap QR Codes</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 24px; background: #f4f4f4; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .qrcard { background: white; border: 2px solid #e87d2f; border-radius: 14px; padding: 18px; text-align: center; break-inside: avoid; }
        .brand { font-family: serif; font-size: 22px; color: #e87d2f; margin-bottom: 10px; }
        .qrwrap svg { width: 160px; height: 160px; }
        .t { font-size: 18px; font-weight: 700; margin-top: 10px; }
        .d { font-size: 11px; color: #666; margin-top: 4px; }
        @media print { body { background: white; } .grid { gap: 12px; } }
      </style>
    </head><body><div class="grid">${cards}</div>
    <script>setTimeout(() => window.print(), 400);</script>
    </body></html>`);
    w.document.close();
  };

  const onSubscribe = async () => {
    if (!pricing) return;
    setPaying(true);
    try {
      // 1) Persist plan choice on the backend (trial / deferred change).
      const { data: planResp } = await api.post("/subscription", { tables, payment_method: method });

      // 2) If we have a deferred next-cycle change, no payment is needed now.
      if (planResp.applied === "next_cycle") {
        toast.success(`Change scheduled — ${tables} tables effective from ${fmtDate(planResp.next_cycle_start)}.`);
        navigate("/manager");
        return;
      }
      if (planResp.applied === "no_change") {
        toast.success("Payment method updated");
        navigate("/manager");
        return;
      }

      // 3) Trial started — now launch Razorpay checkout for the first paid cycle.
      //    (The trial is the 4-day free grace before the first charge.)
      const { data: order } = await api.post("/payments/create-order", { tables });
      if (!order.configured) {
        // No API keys yet → fall back to public payment-page redirect.
        toast.success("Trial started. Opening Razorpay payment page…");
        window.open(`${order.fallback_link}?amount=${(order.amount / 100).toFixed(0)}`, "_blank");
        navigate("/manager");
        return;
      }
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        toast.error("Razorpay SDK failed to load — please retry.");
        return;
      }
      const rzpOptions = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: "ZenTaap",
        description: `${tables} tables · monthly subscription · autopay enabled`,
        order_id: order.order_id,
        theme: { color: "#e87d2f" },
        prefill: { method },
        notes: { tables: String(tables), enable_autopay: "true" },
        handler: async (resp) => {
          try {
            await api.post("/payments/verify", {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              enable_autopay: true,
            });
            toast.success("Payment successful — Autopay enabled for next cycles!");
            navigate("/manager");
          } catch (err) {
            toast.error(err?.response?.data?.detail || "Payment verification failed");
          }
        },
        modal: {
          ondismiss: () => toast.info("Payment cancelled — trial continues, you can pay later."),
        },
      };
      new window.Razorpay(rzpOptions).open();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to subscribe");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="sub-shell" data-testid="subscribe-page">
      <div className="sub-topbar">
        <button
          onClick={() => navigate(-1)}
          className="sub-back-btn"
          data-testid="subscribe-back-btn"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <img src="/logo.png" alt="ZenTaap" style={{ height: 38, background: "#fff", padding: "6px 12px", borderRadius: 10 }} />
        <button
          onClick={() => navigate("/manager")}
          className="sub-skip-btn"
          data-testid="subscribe-skip-btn"
        >
          Maybe later
        </button>
      </div>

      <div className="sub-screen narrow" style={{ maxWidth: 680 }}>
        {/* Tabs */}
        <div className="pricing-tabs" data-testid="pricing-tabs">
          <button
            className={`pricing-tab ${tab === "calc" ? "active" : ""}`}
            onClick={() => setTab("calc")}
            data-testid="tab-calc"
          >
            <Calculator size={14} /> Price Calculator
          </button>
          <button
            className={`pricing-tab ${tab === "break" ? "active" : ""}`}
            onClick={() => setTab("break")}
            data-testid="tab-break"
          >
            <FileText size={14} /> Breakdown
          </button>
        </div>

        {/* 4-day trial banner — always visible */}
        <div className="trial-banner-highlight" data-testid="trial-banner" style={{ marginBottom: 22 }}>
          <div className="trial-banner-icon">
            <Gift size={26} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
              4-day FREE trial
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              You won&apos;t be charged for the 4 days. Trial ends on <b>{trialEnd}</b>.
            </div>
          </div>
        </div>

        {/* Active subscription banner: mid-cycle change applies next cycle */}
        {hasActive && (
          <div
            data-testid="sub-change-notice"
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              background: "rgba(232,125,47,0.08)",
              border: "1px solid rgba(232,125,47,0.3)",
              padding: "12px 16px",
              borderRadius: 12,
              marginBottom: 22,
              color: "var(--text)",
            }}
          >
            <RefreshCw size={18} color="var(--gold)" style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 13, lineHeight: 1.55, flex: 1 }}>
              You currently have <b>{existing.tables} tables</b> ({fmtRupee(existing.total)}/mo).{" "}
              {isChangeRequest ? (
                <>
                  Updating to <b>{tables} tables</b> will be billed from <b>{fmtDate(existing.next_cycle_start)}</b> (next cycle).
                  Your current cycle continues unchanged.
                </>
              ) : (
                <>Adjust the slider to change your plan. Mid-cycle changes take effect on the next cycle.</>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }} data-testid="sub-cycle-dates">
                <div className="cycle-pill cycle-pill-start">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                  <div>
                    <div className="cycle-pill-label">Started</div>
                    <div className="cycle-pill-value">{fmtDate(existing.cycle_start || existing.trial_start)}</div>
                  </div>
                </div>
                <div className="cycle-pill cycle-pill-end">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--gold)" }} />
                  <div>
                    <div className="cycle-pill-label">{existing.status === "trial" ? "Trial ends" : "Ends on"}</div>
                    <div className="cycle-pill-value">
                      {existing.status === "trial" ? fmtDate(existing.trial_end) : fmtDate(existing.cycle_end || existing.next_cycle_start)}
                    </div>
                  </div>
                </div>
              </div>
              {existing.pending_tables && existing.pending_tables !== existing.tables && (
                <div style={{ marginTop: 6, color: "var(--gold)" }}>
                  Pending change: <b>{existing.pending_tables} tables</b> ({fmtRupee(existing.pending_total)}/mo).
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "calc" && pricing && (
          <>
            {/* Calculator hero */}
            <div className="calc-hero" data-testid="calc-hero">
              <div className="calc-label">ZENTAAP PRICING</div>
              <div className="calc-title">Pay for exactly what you use</div>

              <div className="slider-wrap">
                <div className="slider-top">
                  <div className="slider-q">How many tables does your restaurant have?</div>
                  <div className="table-num" data-testid="tables-num">{tables}</div>
                </div>
                <input
                  type="range"
                  min={MIN_T}
                  max={MAX_T}
                  value={tables}
                  onChange={(e) => setTables(parseInt(e.target.value, 10))}
                  className="table-slider"
                  data-testid="tables-slider"
                />
                <div className="slider-marks">
                  <span>10</span>
                  <span>20</span>
                  <span>30</span>
                  <span>40</span>
                  <span>50</span>
                  <span>60</span>
                </div>
              </div>

              <div className="result-grid">
                <div className="rcard">
                  <div className="rval" data-testid="r-price">{fmtRupee(pricing.total_with_tax)}</div>
                  <div className="rlbl">Monthly price <span className="tag-incl">incl. GST</span></div>
                </div>
                <div className="rcard">
                  <div className="rval" data-testid="r-per">{fmtRupee(pricing.per_table_with_tax)}</div>
                  <div className="rlbl">Per table / month</div>
                </div>
                <div className="rcard">
                  <div className="rval" data-testid="r-qr">{tables} QRs</div>
                  <div className="rlbl">QR codes you get</div>
                </div>
              </div>
            </div>

            {/* QR codes preview — one QR per table */}
            <div className="qr-preview-card" data-testid="qr-preview-card">
              <div className="qr-preview-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <QrCode size={18} color="var(--gold)" />
                  <div>
                    <div className="font-serif" style={{ fontSize: 18 }}>Your {tables} QR codes</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      One QR per table. Print, laminate &amp; place on each table.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={printSubscribeQRs}
                  className="mini-btn"
                  data-testid="subscribe-print-qr-btn"
                  style={{ background: "var(--gold)", color: "white", borderColor: "var(--gold)" }}
                >
                  <Printer size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                  Print QRs
                </button>
              </div>
              <div className="qr-grid" data-testid="qr-grid">
                {Array.from({ length: Math.min(tables, 12) }, (_, i) => i + 1).map((n) => (
                  <div key={n} className="qr-tile" data-testid={`qr-tile-${n}`}>
                    <QRCodeSVG
                      value={`${QR_DOMAIN}/customer?table=${n}`}
                      size={84}
                      bgColor="#ffffff"
                      fgColor="#161310"
                      level="M"
                      includeMargin={false}
                    />
                    <div className="qr-tile-label">Table {n}</div>
                  </div>
                ))}
                {tables > 12 && (
                  <div className="qr-tile qr-tile-more" data-testid="qr-tile-more">
                    <div className="qr-more-num">+{tables - 12}</div>
                    <div className="qr-tile-label">more</div>
                  </div>
                )}
              </div>
              {/* Hidden full-set so the Print button can read every QR even when only 12 are shown. */}
              <div aria-hidden="true" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
                {Array.from({ length: tables }, (_, i) => i + 1).map((n) => (
                  <div key={`hide-${n}`} data-qr-svg-sub={n}>
                    <QRCodeSVG
                      value={`${QR_DOMAIN}/customer?table=${n}`}
                      size={160}
                      bgColor="#ffffff"
                      fgColor="#161310"
                      level="M"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Autopay status pill */}
            {hasActive && (
              <div className="autopay-card" data-testid="autopay-card">
                <Repeat size={18} color={existing.autopay_enabled ? "var(--green)" : "var(--muted)"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    Autopay {existing.autopay_enabled ? "is ON" : "is OFF"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {existing.autopay_enabled
                      ? `Your next charge of ${fmtRupee(existing.total)} is automatic on ${fmtDate(existing.next_cycle_start)}. You can cancel anytime.`
                      : "Complete your first payment to enable autopay. After that, future cycles are auto-charged on your saved method."}
                  </div>
                </div>
                <span className={`autopay-state ${existing.autopay_enabled ? "on" : "off"}`} data-testid="autopay-state">
                  {existing.autopay_enabled ? "ON" : "OFF"}
                </span>
              </div>
            )}


            {/* Formula */}
            <div className="formula-box" data-testid="formula-box">
              <div className="formula-title">HOW THE PRICE IS CALCULATED</div>
              <div className="formula-row">
                <div className="f-box">₹{pricing.base_fee}</div>
                <div className="f-op">+</div>
                <div className="f-box highlight">₹{pricing.per_table} × {tables} tables</div>
                <div className="f-op">+</div>
                <div className="f-box" style={{ background: "rgba(110,164,255,0.15)" }}>GST 18%</div>
                <div className="f-op">=</div>
                <div className="f-box result">{fmtRupee(pricing.total_with_tax)}/mo</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.7 }}>
                <strong style={{ color: "var(--text)" }}>Base fee ₹{pricing.base_fee}</strong> — covers platform access, kitchen dashboard, manager dashboard, menu<br />
                <strong style={{ color: "var(--text)" }}>₹{pricing.per_table} per table</strong> — one QR code per table, order flow, real-time updates
              </div>
            </div>
          </>
        )}

        {tab === "break" && pricing && (
          <div className="breakdown" data-testid="breakdown-box">
            <div className="bk-header">
              <span>MONTHLY INVOICE — ZENTAAP</span>
              <span>{monthLabel}</span>
            </div>
            <div className="bk-row">
              <span className="bk-muted">Platform base fee</span>
              <span className="bk-amt">₹{pricing.base_fee}</span>
            </div>
            <div className="bk-row">
              <span className="bk-muted">{tables} tables × ₹{pricing.per_table}/table</span>
              <span className="bk-amt">₹{pricing.tables_subtotal}</span>
            </div>
            <div className="bk-row">
              <span className="bk-muted">Subtotal</span>
              <span className="bk-amt">₹{pricing.subtotal}</span>
            </div>
            <div className="bk-row">
              <span className="bk-muted">GST ({pricing.gst_rate_pct}%)</span>
              <span className="bk-amt">{fmtRupee(pricing.gst_amount)}</span>
            </div>
            <div className="bk-row total">
              <span>Total payable</span>
              <span data-testid="bk-total" style={{ color: "var(--gold)" }}>{fmtRupee(pricing.total_with_tax)}</span>
            </div>
          </div>
        )}

        {/* Payment methods (India) */}
        <div className="font-serif" style={{ fontSize: 18, marginTop: 28, marginBottom: 12 }}>
          Choose payment method
        </div>
        <div className="payment-grid" data-testid="payment-grid">
          {PAYMENT_METHODS.map((m) => {
            const Logo = METHOD_LOGOS[m.key];
            return (
              <button
                key={m.key}
                type="button"
                className={`payment-card ${method === m.key ? "selected" : ""}`}
                onClick={() => setMethod(m.key)}
                data-testid={`pay-method-${m.key}`}
              >
                {method === m.key && (
                  <div className="payment-tick">
                    <Check size={12} />
                  </div>
                )}
                <div className="payment-card-logo">
                  {Logo ? <Logo size={32} /> : null}
                </div>
                <div className="payment-card-label">{m.label}</div>
                <div className="payment-card-note">{m.note}</div>
                {m.brands && (
                  <div className="pay-brands" data-testid={`pay-brands-${m.key}`}>
                    {m.brands.map((b) => (
                      <span
                        key={b.cls}
                        className={`pay-brand pay-brand-sym ${b.cls}`}
                        title={b.title}
                        aria-label={b.title}
                      >
                        {b.sym}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          className="submit-btn"
          onClick={onSubscribe}
          disabled={paying}
          data-testid="subscribe-btn"
          style={{ width: "100%", padding: "16px", fontSize: 15, marginTop: 22 }}
        >
          {paying
            ? "Processing…"
            : hasActive
              ? (isChangeRequest
                  ? `Schedule change to ${tables} tables · effective ${fmtDate(existing.next_cycle_start)}`
                  : `Update payment method · ${fmtRupee(pricing?.total_with_tax)}/mo`)
              : `Start 4-Day Free Trial · ${fmtRupee(pricing?.total_with_tax)} /mo after`}
        </button>
        <div className="secure-note" style={{ marginTop: 10, justifyContent: "center", display: "flex" }}>
          <ShieldCheck size={12} /> Secured by 256-bit SSL · PCI DSS · UPI Autopay
        </div>
      </div>
    </div>
  );
}
