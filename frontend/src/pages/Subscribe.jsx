import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Gift, ShieldCheck, Calculator, FileText, RefreshCw, QrCode, Repeat, Download, LogOut, X, CheckCircle2, XCircle, Lock } from "lucide-react";
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

export default function Subscribe({ embedded = false, onGoDashboard, onApplied } = {}) {
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
  const canStartTrial = !existing || !existing.status || ["none", "skipped"].includes(existing.status);
  const isExpired = existing?.status === "expired";
  const isChangeRequest = hasActive && tables !== existing.tables;
  const minT = pricing?.min_tables ?? 10;
  const maxT = pricing?.max_tables ?? 60;
  const sliderMarks = useMemo(() => {
    if (maxT <= minT) return [minT];
    const marks = [];
    for (let i = 0; i <= 5; i += 1) {
      marks.push(Math.round(minT + ((maxT - minT) * i) / 5));
    }
    return [...new Set(marks)];
  }, [minT, maxT]);
  const isUpgradeIntent =
    existing?.status === "active" && tables > (existing?.tables || 0);
  const isUpgradeNow = isUpgradeIntent && upgradeQuote?.applicable && upgradeQuote?.proration;
  const prorate = isUpgradeNow ? upgradeQuote.proration : null;
  const isProratedUpgrade = Boolean(prorate?.preserve_cycle);

  useEffect(() => {
    if (!pricing) return;
    const lo = pricing.min_tables ?? 10;
    const hi = pricing.max_tables ?? 60;
    setTables((t) => Math.min(hi, Math.max(lo, t)));
  }, [pricing?.min_tables, pricing?.max_tables]);

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

  const trialEnd = useMemo(() => {
    // For active/trial subs, use the backend-stored trial_end; otherwise compute new (+4d).
    if (existing?.trial_end) {
      try {
        return new Date(existing.trial_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      } catch (err) {
        // Invalid stored ISO string — fall through to computed (+4d). Log so we can spot bad data.
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

  const downloadSubscribeQRs = async () => {
    if (!hasActive) {
      toast.message(isExpired ? "Pay to unlock your QR codes" : "Subscribe to unlock QR codes", {
        description: isExpired
          ? "Renew your subscription first, then download clear table QRs."
          : "Complete payment or start a trial to download QRs.",
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
    else navigate("/manager", { replace: true });
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
      if (planResp.applied === "trial") {
        toast.success(`Free trial started — ends ${fmtDate(planResp.trial_end)}. Pay anytime before it ends.`);
      }

      const needsPay =
        planResp.needs_payment ||
        planResp.applied === "awaiting_payment" ||
        planResp.applied === "upgrade_proration";
      if (!needsPay && planResp.applied === "trial") {
        goDashboard();
        return;
      }
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
              showPayResult({
                ok: true,
                title: "Payment successful!",
                message: verified?.message
                  || "Your first payment is done. ZenTaap will auto-deduct the monthly fee every billing cycle.",
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

        {/* Trial banner — only for first-time / eligible trial (issue #5) */}
        {canStartTrial && (
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

        {/* Active subscription banner */}
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
              {isProratedUpgrade ? (
                <>
                  Adding tables now? Pay only for the <b>extra tables</b> for the days left in this cycle.
                  From <b>{fmtDate(prorate?.next_cycle_start || existing.next_cycle_start)}</b> you&apos;ll
                  be billed the full <b>{tables}-table</b> plan.
                </>
              ) : isChangeRequest && tables < existing.tables ? (
                <>
                  Reducing to <b>{tables} tables</b> takes effect from <b>{fmtEffective}</b> (next cycle).
                  Your current cycle continues unchanged until then.
                </>
              ) : isChangeRequest ? (
                <>
                  Updating to <b>{tables} tables</b> will be billed from <b>{fmtEffective}</b>
                  {effectiveFrom && effectiveFrom.getTime() <= Date.now() + 60_000 ? " (effective immediately)" : " (next cycle)"}.
                </>
              ) : (
                <>Adjust the slider to change your plan. Upgrades unlock after a small prorated payment for days left.</>
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

        {isProratedUpgrade && prorate && (
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
                  min={minT}
                  max={maxT}
                  value={tables}
                  onChange={(e) => setTables(parseInt(e.target.value, 10))}
                  className="table-slider"
                  data-testid="tables-slider"
                />
                <div className="slider-marks">
                  {sliderMarks.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
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
                          : "Pay or start a trial to unlock clear downloadable QRs."}
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
                        : "Complete payment or start a trial to download clear table QRs."}
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

        {tab === "break" && pricing && (
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

        <button
          className="submit-btn"
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
                    ? (isChangeRequest
                        ? `Schedule change to ${tables} tables · effective ${fmtEffective}`
                        : `Manage plan · ${fmtRupee(pricing?.total_with_tax)}/mo`)
                    : isExpired
                      ? `Pay ${fmtRupee(pricing?.total_with_tax)} /mo · enable autopay`
                      : `Start 4-Day Free Trial · ${fmtRupee(pricing?.total_with_tax)} /mo after`}
        </button>
        <div className="secure-note" style={{ marginTop: 10, justifyContent: "center", display: "flex" }}>
          <ShieldCheck size={12} /> Secured by Razorpay · Monthly mandate / UPI Autopay · Cancel anytime
        </div>
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
          <div className={`pay-result-card ${payResult.ok ? "ok" : "fail"}`}>
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
              {payResult.ok ? (embedded ? "Continue" : "Continue to Manager") : "OK"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
