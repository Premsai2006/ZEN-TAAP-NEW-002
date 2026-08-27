import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Gift, ShieldCheck, Calculator, FileText, RefreshCw, QrCode, Repeat, Download, LogOut, X, CheckCircle2, XCircle, Lock, User, UtensilsCrossed, Users, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { restaurantOrderUrl } from "@/lib/qr";
import { downloadAllQrsZip } from "@/lib/qrDownload";
import LogoutDialog from "@/components/manager/LogoutDialog";

const fmtRupee = (n) => `₹${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return "—"; }
};

const SETUP_STEPS = [
  {
    key: "profile",
    title: "Restaurant profile",
    body: "Set your name, address, GSTIN, and the ordering URL guests will scan.",
  },
  {
    key: "menu",
    title: "Add the menu",
    body: "Create categories and dishes with prices so tables can place orders.",
  },
  {
    key: "tables",
    title: "Print table QRs",
    body: "Download one QR per table and place it on each table.",
  },
  {
    key: "settings",
    title: "Staff & kitchen PIN",
    body: "Give cashiers, managers, and kitchen staff their own PINs.",
  },
];
const SETUP_ICONS = { profile: User, menu: UtensilsCrossed, tables: QrCode, settings: Users };

export default function Subscribe({ embedded = false, onGoDashboard, onApplied, onGoTab } = {}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("calc");
  const [tables, setTables] = useState(14);
  const [pricing, setPricing] = useState(null);
  const [paying, setPaying] = useState(false);
  const [existing, setExisting] = useState(null);
  const [subLoaded, setSubLoaded] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [zippingQrs, setZippingQrs] = useState(false);
  const [upgradeQuote, setUpgradeQuote] = useState(null);
  const [payResult, setPayResult] = useState(null); // { ok, title, message, detail }
  const [addingTables, setAddingTables] = useState(false);

  useEffect(() => {
    api
      .get(`/pricing/me?tables=${tables}`)
      .then((r) => setPricing(r.data))
      .catch(() => {
        // Fallback to public pricing if session cookie missing
        api.get(`/pricing?tables=${tables}`).then((r) => setPricing(r.data)).catch(() => {});
      });
  }, [tables]);

  // Load existing subscription once on mount; pre-fill slider with current tables.
  useEffect(() => {
    api
      .get("/subscription")
      .then((r) => {
        setExisting(r.data);
        if (r.data?.tables) setTables(r.data.tables);
      })
      .catch(() => {})
      .finally(() => setSubLoaded(true));
  }, []);

  // Live mid-cycle upgrade proration preview
  useEffect(() => {
    if (!existing?.tables || existing.status !== "active" || tables <= existing.tables) {
      setUpgradeQuote(null);
      return;
    }
    let cancelled = false;
    api
      .get(`/pricing/upgrade-quote?tables=${tables}`)
      .then((r) => {
        if (!cancelled) setUpgradeQuote(r.data);
      })
      .catch(() => {
        if (!cancelled) setUpgradeQuote(null);
      });
    return () => { cancelled = true; };
  }, [tables, existing?.tables, existing?.status, existing?.next_cycle_start]);

  const hasActive = existing && existing.tables && ["trial", "active"].includes(existing.status);
  const introEligible = Boolean(
    existing?.intro_trial_eligible
    ?? (!existing?.status || ["none", "skipped"].includes(existing.status))
  );
  const isExpired = existing?.status === "expired";
  const isChangeRequest = hasActive && tables !== existing.tables;
  const minT = 1;
  const maxT = pricing?.max_tables ?? 500;
  const isUpgradeIntent =
    existing?.status === "active" && tables > (existing?.tables || 0);
  const isUpgradeNow = isUpgradeIntent && upgradeQuote?.applicable && upgradeQuote?.proration;
  const prorate = isUpgradeNow ? upgradeQuote.proration : null;
  const isProratedUpgrade = Boolean(prorate?.preserve_cycle);

  useEffect(() => {
    if (!pricing) return;
    const lo = 1;
    const hi = pricing.max_tables ?? 500;
    setTables((t) => Math.min(hi, Math.max(lo, t)));
  }, [pricing?.max_tables]);

  const effectiveFrom = useMemo(() => {
    const raw = existing?.effective_from || existing?.next_cycle_start;
    if (!raw) return null;
    try {
      const d = new Date(raw);
      if (d.getTime() < Date.now() - 60_000) return new Date(); // treat past as now
      return d;
    } catch {
      return null;
    }
  }, [existing]);

  const fmtEffective = effectiveFrom
    ? effectiveFrom.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    []
  );

  const introAutopayLabel = useMemo(() => {
    const raw = existing?.preview_first_autopay_at;
    if (raw) {
      try {
        return new Date(raw).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      } catch (err) {
        console.warn("Subscribe.introAutopayLabel: bad preview_first_autopay_at", raw, err);
      }
    }
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
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

  const downloadSubscribeQRs = async () => {
    if (!hasActive) {
      toast.message(isExpired ? "Pay to unlock your QR codes" : "Subscribe to unlock QR codes", {
        description: isExpired
          ? "Renew your subscription first, then download clear table QRs."
          : "Complete payment to download QRs.",
        id: "sub-qr-locked",
      });
      return;
    }
    const slug = (localStorage.getItem("mgr_slug") || "").trim().toLowerCase();
    if (!slug) {
      return toast.error("Set your restaurant URL in Profile first — QR codes need it to link tables.");
    }
    const items = Array.from({ length: tables }, (_, i) => i + 1)
      .map((n) => ({
        tableNum: n,
        svgEl: document.querySelector(`[data-qr-svg-sub="${n}"] svg`),
      }))
      .filter((x) => x.svgEl);
    if (items.length === 0) {
      return toast.error("QR codes aren't ready yet. Please wait a moment and try again.");
    }
    setZippingQrs(true);
    try {
      await downloadAllQrsZip(items, { slug });
      toast.success(`Downloaded ZIP with ${items.length} table QRs`);
    } catch {
      toast.error("Couldn't create the ZIP. Please try again.");
    } finally {
      setZippingQrs(false);
    }
  };

  const goDashboard = () => {
    if (typeof onApplied === "function") onApplied();
    if (typeof onGoDashboard === "function") onGoDashboard();
    else navigate("/manager/orders", { replace: true });
  };

  const goSetup = (key) => {
    setPayResult(null);
    if (typeof onApplied === "function") onApplied();
    if (typeof onGoTab === "function") onGoTab(key);
    else navigate(`/manager/${key}`, { replace: true });
  };

  const showPayResult = (payload) => setPayResult(payload);

  const onSubscribe = async () => {
    if (!pricing) return;
    setPaying(true);
    try {
      const { data: planResp } = await api.post("/subscription", { tables });

      if (planResp.applied === "next_cycle") {
        toast.success(`Change scheduled — ${tables} tables effective from ${fmtDate(planResp.next_cycle_start)}.`);
        goDashboard();
        return;
      }
      if (planResp.applied === "no_change") {
        toast.success("You're already on this plan");
        goDashboard();
        return;
      }
      const needsPay =
        planResp.needs_payment ||
        planResp.applied === "awaiting_payment" ||
        planResp.applied === "upgrade_proration";
      if (!needsPay && planResp.applied === "immediate") {
        toast.success(`Plan updated to ${tables} tables.`);
        goDashboard();
        return;
      }

      const isUpgrade =
        planResp.applied === "upgrade_proration" ||
        planResp.proration?.kind === "upgrade_proration" ||
        (existing?.status === "active" && tables > (existing?.tables || 0));

      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        showPayResult({
          ok: false,
          title: "Payment couldn't start",
          message: "Please refresh the page and try again.",
        });
        return;
      }

      // Renew OR mid-cycle upgrade: always one Razorpay Subscription checkout
      // Upgrade = proration addon now + new higher mandate (old mandate ends this cycle)
      const { data: checkout } = await api.post("/payments/create-subscription", { tables });
      const pr = checkout.proration || planResp.proration;
      const payAmt = (checkout.amount || 0) / 100;
      new window.Razorpay({
        key: checkout.key_id,
        subscription_id: checkout.subscription_id,
        name: "ZenTaap",
        description:
          checkout.description
          || (isUpgrade
            ? `Upgrade to ${tables} tables · pay remaining days + set monthly autopay`
            : `${tables} tables · monthly autopay mandate`),
        theme: { color: "#e87d2f" },
        notes: {
          tables: String(tables),
          kind: checkout.upgrade ? "upgrade_proration" : "monthly_mandate",
        },
        handler: async (resp) => {
          try {
            const { data: verified } = await api.post("/payments/verify-subscription", {
              razorpay_subscription_id: resp.razorpay_subscription_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            const paid = verified?.amount_paise != null
              ? fmtRupee(verified.amount_paise / 100)
              : fmtRupee(payAmt);
            if (checkout.upgrade || isUpgrade) {
              showPayResult({
                ok: true,
                title: "Upgrade complete!",
                message: `All ${verified?.tables || tables} tables are unlocked. Charged ${paid} for the days left.`,
                detail: verified?.next_cycle_start
                  ? `From ${fmtDate(verified.next_cycle_start)} autopay will deduct the full ${tables}-table plan automatically. Old mandate stopped.`
                  : "Monthly autopay is set to the new table count.",
                goManager: true,
              });
            } else {
              const introPaid = checkout.intro_trial || introEligible;
              showPayResult({
                ok: true,
                title: "Payment successful!",
                message: verified?.message
                  || (introPaid
                    ? "Your first payment is done. This billing period includes 4 extra days; later months are billed monthly."
                    : "Your first payment is done. ZenTaap will auto-deduct the monthly fee every billing cycle."),
                detail: verified?.next_cycle_start
                  ? `Next auto-debit on ${fmtDate(verified.next_cycle_start)} · ${tables} tables.`
                  : "You can turn autopay off anytime from Subscription.",
                goManager: true,
              });
            }
          } catch (err) {
            // Rare race: webhook may activate before verify returns — re-check status
            try {
              const { data: sub } = await api.get("/subscription");
              if (sub && ["trial", "active"].includes(sub.status)) {
                showPayResult({
                  ok: true,
                  title: "Payment successful!",
                  message: "Your subscription is active. Autopay is set for monthly renewals.",
                  detail: resp?.razorpay_payment_id ? `Payment ID: ${resp.razorpay_payment_id}` : null,
                  goManager: true,
                });
                return;
              }
            } catch { /* ignore */ }
            showPayResult({
              ok: false,
              title: "Payment confirmation failed",
              message: friendlyError(err, "We couldn't confirm your payment. If money was deducted, refresh this page — access often unlocks within a few seconds."),
              detail: resp?.razorpay_payment_id ? `Payment ID: ${resp.razorpay_payment_id}` : null,
            });
          }
        },
        modal: {
          ondismiss: async () => {
            try {
              await api.post("/payments/abandon-checkout");
            } catch { /* keep local messaging even if abandon fails */ }
            showPayResult({
              ok: false,
              title: "Payment cancelled",
              message: needsPay
                ? "Payment cancelled — nothing was charged. Your existing plan is unchanged."
                : "Payment cancelled — you can set up autopay later from this page.",
            });
          },
        },
      }).open();
    } catch (err) {
      showPayResult({
        ok: false,
        title: "Couldn't start subscription",
        message: friendlyError(err, "Please try again."),
      });
    } finally {
      setPaying(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.warn("logout request failed:", err?.message);
    }
    localStorage.removeItem("mgr_token");
    localStorage.removeItem("mgr_authed");
    navigate("/login");
  };

  return (
    <div className={embedded ? "section active sub-shell-embedded" : "sub-shell"} data-testid="subscribe-page">
      {!embedded && (
      <div className="sub-topbar">
        {subLoaded && !isExpired ? (
          <button
            onClick={() => navigate(-1)}
            className="sub-back-btn"
            data-testid="subscribe-back-btn"
          >
            <ArrowLeft size={16} /> Back
          </button>
        ) : (
          <div className="sub-topbar-side" aria-hidden="true" />
        )}
        <img src="/logo.png" alt="ZenTaap" style={{ height: 38, background: "#fff", padding: "6px 12px", borderRadius: 10 }} />
        {subLoaded && isExpired ? (
          <button
            type="button"
            onClick={() => setShowLogout(true)}
            className="sub-logout-btn"
            data-testid="subscribe-logout-btn"
          >
            <LogOut size={16} /> Logout
          </button>
        ) : subLoaded ? (
          <button
            onClick={() => goDashboard()}
            className="sub-skip-btn"
            data-testid="subscribe-skip-btn"
          >
            Maybe later
          </button>
        ) : (
          <div className="sub-topbar-side" aria-hidden="true" />
        )}
      </div>
      )}

      <div className="sub-screen narrow" style={{ maxWidth: 680 }}>
        {/* Billing override chip disabled — demo ₹1–₹10 checkout, not custom pricing.
        {pricing?.billing_override && (
          <div className="billing-override-chip" data-testid="billing-override-chip">
            Demo billing override — checkout is ₹{(pricing.billing_override_paise / 100).toFixed(0)} instead of standard pricing.
          </div>
        )}
        */}

        {(!hasActive || addingTables) && (
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
        )}

        {/* Intro bonus — first successful payment only */}
        {introEligible && !hasActive && (
          <div className="trial-banner-highlight" data-testid="trial-banner" style={{ marginBottom: 22 }}>
            <div className="trial-banner-icon">
              <Gift size={26} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
                4 extra days on your first month
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                Pay today to unlock. Your first billing period includes 4 extra days, so the next AutoPay is on{" "}
                <b>{introAutopayLabel}</b>. From the second month, billing is monthly — no extra trial.
              </div>
            </div>
          </div>
        )}
        {isExpired && (
          <div className="trial-banner-highlight" data-testid="expired-banner" style={{ marginBottom: 22, borderColor: "rgba(217,99,99,0.45)" }}>
            <div className="trial-banner-icon">
              <ShieldCheck size={26} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
                Subscription expired
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                Your free trial / billing cycle has ended. Choose a plan below to resume orders, billing &amp; analytics.
              </div>
            </div>
          </div>
        )}
        {existing?.status === "trial" && (
          <div className="trial-banner-highlight" data-testid="trial-active-banner" style={{ marginBottom: 22 }}>
            <div className="trial-banner-icon">
              <Gift size={26} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
                Trial active
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                Your free trial ends on <b>{fmtDate(existing.trial_end)}</b>. Complete payment to keep access after that.
              </div>
            </div>
          </div>
        )}

        {/* Active plan details */}
        {hasActive && (
          <div className="plan-details-card" data-testid="sub-change-notice">
            <div className="plan-details-head">
              <div>
                <div className="plan-details-kicker">Your subscription</div>
                <div className="plan-details-title">{existing.tables} tables · {fmtRupee(existing.total)}/mo</div>
              </div>
              <span className={`plan-status-pill ${existing.status}`}>{existing.status === "trial" ? "Trial" : "Active"}</span>
            </div>
            <div className="plan-details-grid">
              <div>
                <div className="plan-details-label">Tables</div>
                <div className="plan-details-value">{existing.tables}</div>
              </div>
              <div>
                <div className="plan-details-label">Monthly (incl. GST)</div>
                <div className="plan-details-value">{fmtRupee(existing.total)}</div>
              </div>
              <div>
                <div className="plan-details-label">Started</div>
                <div className="plan-details-value">{fmtDate(existing.cycle_start || existing.trial_start)}</div>
              </div>
              <div>
                <div className="plan-details-label">Renews on</div>
                <div className="plan-details-value">{fmtDate(existing.next_cycle_start)}</div>
              </div>
              <div>
                <div className="plan-details-label">Cycle ends</div>
                <div className="plan-details-value">{fmtDate(existing.cycle_end)}</div>
              </div>
              <div>
                <div className="plan-details-label">Autopay</div>
                <div className="plan-details-value">{existing.autopay_enabled ? "On" : "Off"}</div>
              </div>
              <div>
                <div className="plan-details-label">Last payment</div>
                <div className="plan-details-value">{fmtDate(existing.last_payment_at)}</div>
              </div>
              <div>
                <div className="plan-details-label">Payment method</div>
                <div className="plan-details-value" style={{ textTransform: "capitalize" }}>{existing.payment_method || "Razorpay"}</div>
              </div>
            </div>
            {existing.pending_tables && existing.pending_tables !== existing.tables && (
              <div className="plan-pending">
                Scheduled: <b>{existing.pending_tables} tables</b> ({fmtRupee(existing.pending_total)}/mo) from {fmtEffective}.
              </div>
            )}
            {existing.autopay_enabled && (
              <div className="renew-note">
                <Repeat size={16} />
                <span>Renewal is automatic. Next debit {fmtDate(existing.next_cycle_start)} for {fmtRupee(existing.total)}.</span>
              </div>
            )}
            {!addingTables && (
              <button
                type="button"
                className="mini-btn"
                data-testid="add-tables-toggle"
                onClick={() => {
                  setAddingTables(true);
                  setTables(existing.tables || minT);
                  setTab("calc");
                }}
                style={{ marginTop: 14 }}
              >
                <Plus size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                Add or change tables
              </button>
            )}
            {addingTables && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setAddingTables(false);
                  setTables(existing.tables);
                }}
                style={{ marginTop: 12 }}
              >
                Cancel table change
              </button>
            )}
          </div>
        )}

        {addingTables && isChangeRequest && (
          <div className="sub-change-hint" data-testid="sub-change-hint">
            <RefreshCw size={16} color="var(--gold)" />
            <div>
              {isProratedUpgrade ? (
                <>Pay only for extra tables for the days left. From <b>{fmtDate(prorate?.next_cycle_start || existing.next_cycle_start)}</b> the full {tables}-table plan is billed.</>
              ) : tables < existing.tables ? (
                <>Reducing to <b>{tables} tables</b> takes effect from <b>{fmtEffective}</b>.</>
              ) : (
                <>Updating to <b>{tables} tables</b> from <b>{fmtEffective}</b>.</>
              )}
            </div>
          </div>
        )}

        {addingTables && isProratedUpgrade && prorate && (
          <div className="prorate-card" data-testid="prorate-card">
            <div className="prorate-card-title">Pay only for days left</div>
            <div className="prorate-card-msg">{prorate.message}</div>
            <div className="prorate-grid">
              <div>
                <div className="prorate-k">Extra tables</div>
                <div className="prorate-v">+{prorate.extra_tables}</div>
              </div>
              <div>
                <div className="prorate-k">Days remaining</div>
                <div className="prorate-v">{prorate.remaining_days}</div>
              </div>
              <div>
                <div className="prorate-k">Due now</div>
                <div className="prorate-v gold">{fmtRupee(prorate.total_with_tax)}</div>
              </div>
            </div>
            <div className="prorate-foot">
              Full plan after {fmtDate(prorate.next_cycle_start)}: {fmtRupee(prorate.monthly_new)}/mo
            </div>
          </div>
        )}

        {(!hasActive || addingTables) && tab === "calc" && pricing && (
          <>
            {/* Calculator hero */}
            <div className="calc-hero" data-testid="calc-hero">
              <div className="calc-label">ZENTAAP PRICING</div>
              <div className="calc-title">Pay for exactly what you use</div>

              <div className="table-count-wrap">
                <div className="slider-q">{hasActive ? "How many tables do you need?" : "How many tables does your restaurant have?"}</div>
                <div className="table-count-row">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={minT}
                    max={maxT}
                    value={tables}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") return;
                      const n = parseInt(raw, 10);
                      if (Number.isNaN(n)) return;
                      setTables(Math.min(maxT, Math.max(minT, n)));
                    }}
                    onBlur={() => setTables((t) => Math.min(maxT, Math.max(minT, t || minT)))}
                    className="table-count-input"
                    data-testid="tables-num"
                  />
                  <span className="table-count-suffix">tables</span>
                </div>
                <div className="table-count-hint">₹{pricing.per_table} per table / month · enter any count</div>
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

            {/* QR codes preview — one QR per table (blurred until paid) */}
            <div className="qr-preview-card" data-testid="qr-preview-card">
              <div className="qr-preview-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <QrCode size={18} color="var(--gold)" />
                  <div>
                    <div className="font-serif" style={{ fontSize: 18 }}>Your {tables} QR codes</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {hasActive
                        ? "One QR per table. Download, laminate & place on each table."
                        : isExpired
                          ? "Subscription expired — pay to unlock clear downloadable QRs."
                          : "Pay to unlock clear downloadable QRs."}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={downloadSubscribeQRs}
                  className="mini-btn"
                  data-testid="subscribe-download-qr-btn"
                  disabled={zippingQrs}
                  style={{ background: "var(--gold)", color: "white", borderColor: "var(--gold)" }}
                >
                  {hasActive ? (
                    <Download size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                  ) : (
                    <Lock size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
                  )}
                  {zippingQrs
                    ? "Preparing ZIP…"
                    : hasActive
                      ? "Download QRs"
                      : isExpired
                        ? "Pay to unlock"
                        : "Unlock QRs"}
                </button>
              </div>
              <div className={`qr-locked-wrap${!hasActive ? " is-locked" : ""}`} data-testid="subscribe-qr-locked-wrap">
                <div className={!hasActive ? "qr-locked-blur" : undefined}>
                  <div className="qr-grid" data-testid="qr-grid">
                    {Array.from({ length: Math.min(tables, 12) }, (_, i) => i + 1).map((n) => (
                      <div key={n} className="qr-tile" data-testid={`qr-tile-${n}`}>
                        <QRCodeSVG
                          value={restaurantOrderUrl(localStorage.getItem("mgr_slug") || "", n)}
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
                </div>
                {!hasActive && (
                  <div className="qr-paywall-overlay" data-testid="subscribe-qr-paywall">
                    <Lock size={28} className="qr-paywall-icon" color="#000" />
                    <div className="qr-paywall-title">
                      {isExpired ? "Pay to unlock" : "Subscribe to unlock"}
                    </div>
                    <div className="qr-paywall-sub">
                      {isExpired
                        ? "Renew your subscription first, then download clear table QRs."
                        : "Complete payment to download clear table QRs."}
                    </div>
                  </div>
                )}
              </div>
              {/* Hidden full-set so Download can read every QR even when only 12 are shown. */}
              <div
                aria-hidden="true"
                style={{
                  position: "fixed",
                  left: 0,
                  top: 0,
                  opacity: 0,
                  pointerEvents: "none",
                  zIndex: -1,
                  width: 300,
                  height: 300 * tables,
                  overflow: "hidden",
                }}
              >
                {Array.from({ length: tables }, (_, i) => i + 1).map((n) => (
                  <div key={`hide-${n}`} data-qr-svg-sub={n}>
                    <QRCodeSVG
                      value={restaurantOrderUrl(localStorage.getItem("mgr_slug") || "", n)}
                      size={280}
                      bgColor="#ffffff"
                      fgColor="#161310"
                      level="H"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Autopay / mandate status */}
            {hasActive && (
              <div className="autopay-card" data-testid="autopay-card">
                <Repeat size={18} color={existing.autopay_enabled ? "var(--green)" : "var(--muted)"} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {existing.autopay_enabled ? "Monthly autopay mandate is ON" : "Monthly autopay is OFF"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    {existing.autopay_enabled
                      ? `ZenTaap auto-deducts ${fmtRupee(existing.total)} each cycle (next: ${fmtDate(existing.next_cycle_start)}). Cancel anytime.`
                      : "Pay once with Razorpay Subscription to authorize a UPI/card mandate — then every month is auto-charged."}
                  </div>
                </div>
                <span className={`autopay-state ${existing.autopay_enabled ? "on" : "off"}`} data-testid="autopay-state">
                  {existing.autopay_enabled ? "ON" : "OFF"}
                </span>
              </div>
            )}
            {isExpired && (
              <div className="autopay-card" data-testid="mandate-renew-card" style={{ marginTop: 0, marginBottom: 18 }}>
                <Repeat size={18} color="var(--gold)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Resume with monthly autopay</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                    Your payment sets up a Razorpay mandate. After the first charge, the same amount auto-deducts every month until you cancel.
                  </div>
                </div>
              </div>
            )}


            {/* Formula */}
            <div className="formula-box" data-testid="formula-box">
              <div className="formula-title">HOW THE PRICE IS CALCULATED</div>
              <div className="formula-row">
                <div className="f-box highlight">₹{pricing.per_table} × {tables} tables</div>
                <div className="f-op">+</div>
                <div className="f-box" style={{ background: "rgba(110,164,255,0.15)" }}>GST {pricing.gst_rate_pct}%</div>
                <div className="f-op">=</div>
                <div className="f-box result">{fmtRupee(pricing.total_with_tax)}/mo</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.7 }}>
                <strong style={{ color: "var(--text)" }}>₹{pricing.per_table} per table / month</strong> — includes one QR code per table, full kitchen + manager dashboards, live orders, real-time updates and analytics. No setup fees, no hidden charges.
              </div>
            </div>
          </>
        )}

        {(!hasActive || addingTables) && tab === "break" && pricing && (
          <div className="breakdown" data-testid="breakdown-box">
            <div className="bk-header">
              <span>MONTHLY INVOICE — ZENTAAP</span>
              <span>{monthLabel}</span>
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

        {(!hasActive || (addingTables && isChangeRequest)) && (
          <>
        <button
          className={`submit-btn ${isExpired ? "renew-btn" : ""}`}
          onClick={onSubscribe}
          disabled={paying || (isUpgradeIntent && !prorate)}
          data-testid="subscribe-btn"
          style={{ width: "100%", padding: "16px", fontSize: 15, marginTop: 28 }}
        >
          {paying
            ? "Processing…"
            : isUpgradeIntent && !prorate
              ? "Calculating upgrade price…"
              : isProratedUpgrade
                ? `Pay ${fmtRupee(prorate.total_with_tax)} · unlock ${tables} tables`
                : isUpgradeNow
                  ? `Pay ${fmtRupee(prorate.total_with_tax)} · unlock ${tables} tables`
                  : hasActive
                    ? `Confirm ${tables} tables · effective ${fmtEffective}`
                    : isExpired
                      ? `Renew · ${fmtRupee(pricing?.total_with_tax)} /mo`
                      : introEligible
                        ? `Pay ${fmtRupee(pricing?.total_with_tax)} /mo · includes 4 extra days`
                        : `Pay ${fmtRupee(pricing?.total_with_tax)} /mo · enable autopay`}
        </button>
        <div className="secure-note" style={{ marginTop: 10, justifyContent: "center", display: "flex" }}>
          <ShieldCheck size={12} /> Secured by Razorpay · Monthly mandate / UPI Autopay · Cancel anytime
        </div>
          </>
        )}
      </div>

      {!embedded && (
      <LogoutDialog
        open={showLogout}
        onCancel={() => setShowLogout(false)}
        onConfirm={handleLogout}
      />
      )}

      {payResult && (
        <div
          className="pay-result-overlay"
          data-testid="pay-result-modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const go = payResult.goManager;
              setPayResult(null);
              if (go) goDashboard();
            }
          }}
        >
          <div className={`pay-result-card ${payResult.ok ? "ok" : "fail"} ${payResult.ok && payResult.goManager ? "wide" : ""}`}>
            <button
              type="button"
              className="pay-result-close"
              aria-label="Close"
              onClick={() => {
                const go = payResult.goManager;
                setPayResult(null);
                if (go) goDashboard();
              }}
            >
              <X size={18} />
            </button>
            <div className="pay-result-icon">
              {payResult.ok ? <CheckCircle2 size={48} /> : <XCircle size={48} />}
            </div>
            <div className="pay-result-title">{payResult.title}</div>
            <div className="pay-result-msg">{payResult.message}</div>
            {payResult.detail && <div className="pay-result-detail">{payResult.detail}</div>}
            {payResult.ok && payResult.goManager && (
              <div className="setup-guide" data-testid="setup-guide">
                <div className="setup-guide-title">Next: set up the restaurant</div>
                <div className="setup-guide-sub">Do these in order so guests can scan and order.</div>
                <div className="setup-guide-list">
                  {SETUP_STEPS.map((s, i) => {
                    const Icon = SETUP_ICONS[s.key];
                    return (
                      <button
                        type="button"
                        key={s.key}
                        className="setup-guide-step"
                        onClick={() => goSetup(s.key)}
                        data-testid={`setup-step-${s.key}`}
                      >
                        <span className="setup-guide-num">{i + 1}</span>
                        {Icon && <Icon size={16} />}
                        <span>
                          <b>{s.title}</b>
                          <small>{s.body}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button
              type="button"
              className="submit-btn"
              style={{ width: "100%", marginTop: 18, padding: "12px 16px" }}
              data-testid="pay-result-ok"
              onClick={() => {
                const go = payResult.goManager;
                setPayResult(null);
                if (go) goDashboard();
              }}
            >
              {payResult.ok ? "Go to Live Orders" : "OK"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
