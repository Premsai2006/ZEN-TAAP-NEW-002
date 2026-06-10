import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Gift, ShieldCheck, CreditCard, Smartphone, Building2, Wallet, Calculator, FileText, Check } from "lucide-react";
import { api } from "@/lib/api";

const MIN_T = 10;
const MAX_T = 60;
const fmtRupee = (n) => `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const PAYMENT_METHODS = [
  { key: "upi", label: "UPI", icon: Smartphone, note: "GPay · PhonePe · Paytm · BHIM" },
  { key: "card", label: "Credit / Debit Card", icon: CreditCard, note: "VISA · MasterCard · RuPay" },
  { key: "netbanking", label: "Net Banking", icon: Building2, note: "All major Indian banks" },
  { key: "wallet", label: "Wallets", icon: Wallet, note: "Paytm · MobiKwik · Freecharge · Amazon Pay" },
];

export default function Subscribe() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("calc");
  const [tables, setTables] = useState(14);
  const [pricing, setPricing] = useState(null);
  const [method, setMethod] = useState("upi");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    api
      .get(`/pricing?tables=${tables}`)
      .then((r) => setPricing(r.data))
      .catch(() => {});
  }, [tables]);

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    []
  );

  const trialEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }, []);

  const onSubscribe = async () => {
    if (!pricing) return;
    setPaying(true);
    try {
      await api.post("/subscription", { tables, payment_method: method });
      toast.success("Subscription active — 4-day free trial started!");
      navigate("/manager");
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
        <img src="/logo.png" alt="TableTaap" style={{ height: 38, background: "#fff", padding: "6px 12px", borderRadius: 10 }} />
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
              4-day FREE trial — cancel anytime
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              You won't be charged until <b>{trialEnd}</b>. Pay only for the tables you actually have.
            </div>
          </div>
        </div>

        {tab === "calc" && pricing && (
          <>
            {/* Calculator hero */}
            <div className="calc-hero" data-testid="calc-hero">
              <div className="calc-label">TABLETAAP PRICING</div>
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
              <span>MONTHLY INVOICE — TABLETAAP</span>
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
            const Icon = m.icon;
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
                <Icon size={20} />
                <div className="payment-card-label">{m.label}</div>
                <div className="payment-card-note">{m.note}</div>
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
          {paying ? "Processing…" : `Start 4-Day Free Trial · ${fmtRupee(pricing?.total_with_tax)} /mo after`}
        </button>
        <div className="secure-note" style={{ marginTop: 10, justifyContent: "center", display: "flex" }}>
          <ShieldCheck size={12} /> Secured by 256-bit SSL · PCI DSS · UPI Autopay
        </div>
      </div>
    </div>
  );
}
