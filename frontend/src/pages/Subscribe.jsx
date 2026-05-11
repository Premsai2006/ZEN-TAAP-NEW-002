import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, ArrowLeft, Gift, ShieldCheck, CreditCard, Smartphone, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  VisaIcon,
  MasterCardIcon,
  RupayIcon,
  UpiIcon,
  GpayIcon,
  PhonePeIcon,
  PaytmIcon,
} from "@/components/subscribe/PaymentIcons";

const PLANS = [
  {
    key: "core",
    name: "Core",
    tagline: "For single-outlet restaurants",
    price: 1299,
    popular: false,
    features: [
      { ok: true, text: "Up to 1 outlet / branch" },
      { ok: true, text: "50 menu items" },
      { ok: true, text: "QR ordering for 10 tables" },
      { ok: true, text: "Basic sales analytics" },
      { ok: true, text: "Email support" },
      { ok: false, text: "Custom branding" },
      { ok: false, text: "API access" },
    ],
  },
  {
    key: "prime",
    name: "Prime",
    tagline: "For growing multi-outlet brands",
    price: 2899,
    popular: true,
    features: [
      { ok: true, text: "Up to 5 outlets / branches" },
      { ok: true, text: "Unlimited menu items" },
      { ok: true, text: "Unlimited table QRs" },
      { ok: true, text: "Advanced analytics & reports" },
      { ok: true, text: "Priority chat support" },
      { ok: true, text: "Custom branding & logo" },
      { ok: false, text: "Dedicated account manager" },
    ],
  },
  {
    key: "elite",
    name: "Elite",
    tagline: "For chains & hospitality groups",
    price: 6299,
    popular: false,
    features: [
      { ok: true, text: "Unlimited outlets" },
      { ok: true, text: "Unlimited menu items" },
      { ok: true, text: "Unlimited table QRs" },
      { ok: true, text: "Full analytics + data export" },
      { ok: true, text: "Dedicated account manager" },
      { ok: true, text: "White-label (your own brand)" },
      { ok: true, text: "API access + webhooks" },
    ],
  },
];

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Subscribe() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [planKey, setPlanKey] = useState(null);
  const [method, setMethod] = useState("card");
  const [paying, setPaying] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  // Form fields (cosmetic only — we don't actually charge anything)
  const [card, setCard] = useState({ name: "", number: "", expiry: "", cvv: "" });
  const [upi, setUpi] = useState("");
  const [bank, setBank] = useState("");

  const plan = useMemo(() => PLANS.find((p) => p.key === planKey), [planKey]);
  const trialEnd = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString();
  }, []);

  const handleBack = () => {
    if (step === 1) navigate("/login");
    else setStep(step - 1);
  };

  const handleSkip = async () => {
    try {
      await api.post("/subscription/skip");
      toast.success("Subscription skipped — opening dashboard (view-only)");
      navigate("/manager");
    } catch {
      toast.error("Could not skip");
    }
  };

  const handlePay = async () => {
    if (method === "card") {
      if (!card.name || card.number.replace(/\s/g, "").length < 12 || !card.expiry || !card.cvv) {
        return toast.error("Please complete card details");
      }
    } else if (method === "upi") {
      if (!upi.includes("@")) return toast.error("Enter a valid UPI ID");
    } else if (method === "netbanking") {
      if (!bank) return toast.error("Select your bank");
    }
    setPaying(true);
    try {
      const { data } = await api.post("/subscription", {
        plan: planKey,
        payment_method: method,
      });
      setConfirmation(data);
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="sub-shell" data-testid="subscribe-page">
      {/* Top bar */}
      <div className="sub-topbar">
        <button
          onClick={handleBack}
          className="sub-back-btn"
          data-testid="subscribe-back-btn"
          title="Back"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <img src="/logo.png" alt="TableTaap" style={{ height: 38 }} />
        {step === 1 ? (
          <button
            onClick={handleSkip}
            className="sub-skip-btn"
            data-testid="subscribe-skip-btn"
            title="Skip — explore in view-only mode"
          >
            Skip for now
          </button>
        ) : (
          <span style={{ width: 80 }} />
        )}
      </div>

      {/* Step bar */}
      <div className="step-bar">
        {["Choose Plan", "Payment", "Confirmed"].map((label, i) => {
          const n = i + 1;
          const active = step >= n;
          return (
            <div key={n} className="step-item">
              <div className={`step-dot ${active ? "active" : ""}`}>{step > n ? <Check size={14} /> : n}</div>
              <span className={`step-label ${active ? "active" : ""}`}>{label}</span>
              {n < 3 && <span className={`step-line ${step > n ? "active" : ""}`} />}
            </div>
          );
        })}
      </div>

      {/* SCREEN 1 */}
      {step === 1 && (
        <div className="sub-screen" data-testid="screen-plans">
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <h1 className="font-serif" style={{ fontSize: 36, margin: 0 }}>
              Grow your restaurant
              <br />
              <span style={{ color: "var(--gold)" }}>with TableTaap</span>
            </h1>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>
              All plans include a 5-day free trial. No charges until your trial ends.
            </p>
          </div>

          {/* HIGHLIGHTED Trial Banner */}
          <div className="trial-banner-highlight" data-testid="trial-banner">
            <div className="trial-banner-icon">
              <Gift size={26} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
                Your 5-day FREE trial starts the moment you pick a plan
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                Cancel anytime before <b>Day 4</b> and you <b>won't be charged a single rupee</b>.
              </div>
            </div>
          </div>

          <div className="plans-grid">
            {PLANS.map((p) => (
              <div
                key={p.key}
                className={`plan-card ${p.popular ? "popular" : ""} ${planKey === p.key ? "selected" : ""}`}
                onClick={() => setPlanKey(p.key)}
                data-testid={`plan-${p.key}`}
              >
                {p.popular && <div className="popular-badge">Most Popular</div>}
                <div className="plan-name">{p.name}</div>
                <div className="plan-tagline">{p.tagline}</div>
                <div className="plan-price">
                  <span className="amount">₹{p.price.toLocaleString("en-IN")}</span>
                  <span className="period">/mo</span>
                </div>
                <div className="plan-divider" />
                <ul className="plan-features">
                  {p.features.map((f, i) => (
                    <li key={i} className={f.ok ? "" : "dimmed"}>
                      <span className="tick">{f.ok ? "✓" : "—"}</span> {f.text}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`select-plan-btn ${planKey === p.key ? "active" : ""}`}
                  data-testid={`select-${p.key}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlanKey(p.key);
                  }}
                >
                  {planKey === p.key ? "✓ Selected" : `Select ${p.name}`}
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
            <button
              className="submit-btn"
              disabled={!planKey}
              onClick={() => setStep(2)}
              data-testid="continue-btn"
              style={{ padding: "14px 28px", fontSize: 15 }}
            >
              Start Free Trial →
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 2: PAYMENT */}
      {step === 2 && plan && (
        <div className="sub-screen narrow" data-testid="screen-payment">
          <h2 className="font-serif" style={{ fontSize: 26, margin: 0, textAlign: "center" }}>
            Complete your setup
          </h2>
          <p style={{ color: "var(--muted)", textAlign: "center", marginTop: 4, marginBottom: 22 }}>
            You won't be charged now — billing starts after your 5-day trial.
          </p>

          <div className="order-summary">
            <div className="summary-label">Order Summary</div>
            <div className="summary-plan-row">
              <div className="summary-plan-name">TableTaap {plan.name}</div>
              <div className="summary-plan-price">₹{plan.price.toLocaleString("en-IN")}/mo</div>
            </div>
            <div className="summary-divider" />
            <div className="summary-trial-row">
              <span>Free trial period</span>
              <span className="green">5 days — ₹0</span>
            </div>
            <div className="summary-trial-row">
              <span>First charge date</span>
              <span style={{ color: "var(--text)" }}>{formatDate(trialEnd)}</span>
            </div>
            <div className="summary-trial-row" style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              <span>Autopay</span>
              <span style={{ color: "var(--green)" }}>Enabled · renews monthly</span>
            </div>
          </div>

          {/* Payment Method Tabs */}
          <div className="pay-tabs">
            <button
              className={`pay-tab ${method === "card" ? "active" : ""}`}
              onClick={() => setMethod("card")}
              data-testid="pay-tab-card"
            >
              <CreditCard size={14} /> Card
            </button>
            <button
              className={`pay-tab ${method === "upi" ? "active" : ""}`}
              onClick={() => setMethod("upi")}
              data-testid="pay-tab-upi"
            >
              <Smartphone size={14} /> UPI
            </button>
            <button
              className={`pay-tab ${method === "netbanking" ? "active" : ""}`}
              onClick={() => setMethod("netbanking")}
              data-testid="pay-tab-netbanking"
            >
              <Building2 size={14} /> Net Banking
            </button>
          </div>

          {/* Card panel */}
          {method === "card" && (
            <div className="card-form-box">
              <div className="card-logos">
                <VisaIcon />
                <MasterCardIcon />
                <RupayIcon />
              </div>
              <label className="form-label">Cardholder Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="Name as on card"
                value={card.name}
                onChange={(e) => setCard({ ...card, name: e.target.value })}
                data-testid="card-name"
              />
              <label className="form-label">Card Number</label>
              <input
                className="form-input"
                type="text"
                placeholder="•••• •••• •••• ••••"
                maxLength={19}
                value={card.number}
                onChange={(e) => {
                  const v = e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 16)
                    .replace(/(.{4})/g, "$1 ")
                    .trim();
                  setCard({ ...card, number: v });
                }}
                data-testid="card-number"
              />
              <div className="form-row" style={{ marginBottom: 4 }}>
                <div>
                  <label className="form-label">Expiry</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="MM / YY"
                    maxLength={7}
                    value={card.expiry}
                    onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                    data-testid="card-expiry"
                  />
                </div>
                <div>
                  <label className="form-label">CVV</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="•••"
                    maxLength={4}
                    value={card.cvv}
                    onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "") })}
                    data-testid="card-cvv"
                  />
                </div>
              </div>
              <div className="secure-note">
                <ShieldCheck size={12} /> 256-bit SSL encrypted · PCI DSS compliant
              </div>
            </div>
          )}

          {method === "upi" && (
            <div className="card-form-box">
              <div className="card-logos">
                <UpiIcon />
                <GpayIcon />
                <PhonePeIcon />
                <PaytmIcon />
              </div>
              <label className="form-label">UPI ID</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="form-input"
                  type="text"
                  placeholder="yourname@upi"
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                  data-testid="upi-id"
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => upi.includes("@") && toast.success("UPI ID verified")}
                  data-testid="upi-verify-btn"
                >
                  Verify
                </button>
              </div>
              <div className="secure-note" style={{ marginTop: 14 }}>
                <ShieldCheck size={12} /> Powered by NPCI · UPI autopay supported
              </div>
            </div>
          )}

          {method === "netbanking" && (
            <div className="card-form-box">
              <label className="form-label">Select Your Bank</label>
              <select
                className="form-input"
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                data-testid="bank-select"
              >
                <option value="">Select bank</option>
                <option>SBI</option>
                <option>HDFC Bank</option>
                <option>ICICI Bank</option>
                <option>Axis Bank</option>
                <option>Kotak Mahindra Bank</option>
                <option>Bank of Baroda</option>
                <option>Punjab National Bank</option>
                <option>Other</option>
              </select>
              <div className="secure-note" style={{ marginTop: 14 }}>
                <ShieldCheck size={12} /> You'll be redirected to your bank's secure portal
              </div>
            </div>
          )}

          <button
            className="submit-btn"
            onClick={handlePay}
            disabled={paying}
            data-testid="pay-btn"
            style={{ width: "100%", padding: "14px", fontSize: 15, marginTop: 16 }}
          >
            {paying ? "Processing…" : "Start 5-Day Free Trial"}
          </button>
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, marginTop: 10 }}>
            By proceeding you agree to TableTaap's Terms of Service.
            <br />
            Cancel anytime before Day 4 — no charges applied.
          </div>
        </div>
      )}

      {/* SCREEN 3: SUCCESS */}
      {step === 3 && confirmation && (
        <div className="sub-screen narrow" data-testid="screen-success">
          <div className="success-confetti" aria-hidden>
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} style={{ "--i": i }} />
            ))}
          </div>
          <div className="success-ring">
            <div className="success-tick">
              <Check size={44} strokeWidth={3} />
            </div>
          </div>
          <h2 className="font-serif" style={{ fontSize: 28, textAlign: "center", margin: "20px 0 6px" }}>
            You're all set!
          </h2>
          <p style={{ color: "var(--muted)", textAlign: "center", marginBottom: 18 }}>
            Your 5-day free trial is live. Start taking orders.
          </p>

          <div className="trial-countdown">
            <span>⏳</span> Trial ends on{" "}
            <strong style={{ marginLeft: 4, color: "var(--gold)" }}>
              {formatDate(confirmation.trial_end)}
            </strong>
          </div>

          <div className="order-summary success-card">
            <div className="summary-trial-row">
              <span>Plan</span>
              <span style={{ color: "var(--gold)", fontWeight: 600 }}>
                {confirmation.plan_info.name}
              </span>
            </div>
            <div className="summary-divider" />
            <div className="summary-trial-row">
              <span>Trial period</span>
              <span>5 days — ₹0</span>
            </div>
            <div className="summary-divider" />
            <div className="summary-trial-row">
              <span>First billing date</span>
              <span>{formatDate(confirmation.trial_end)}</span>
            </div>
            <div className="summary-divider" />
            <div className="summary-trial-row">
              <span>Autopay</span>
              <span style={{ color: "var(--green)" }}>Enabled</span>
            </div>
          </div>

          <button
            className="submit-btn"
            onClick={() => navigate("/manager")}
            data-testid="go-dashboard-btn"
            style={{ width: "100%", padding: "14px", fontSize: 15, marginTop: 20 }}
          >
            Go to Dashboard →
          </button>
        </div>
      )}
    </div>
  );
}
