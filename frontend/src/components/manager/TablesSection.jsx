import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Download, QrCode, Link2, Lock } from "lucide-react";
import { ZENTAAP_LOGO_SRC } from "@/lib/qrDownload";
import { toast } from "sonner";
import { restaurantOrderUrl } from "@/lib/qr";
import {
  buildLabeledQrPng,
  downloadAllQrsZip,
  qrFileName,
  triggerBlobDownload,
} from "@/lib/qrDownload";

export default function TablesSection({
  orders,
  subscription,
  slug: slugProp,
  restaurantName,
  locked = false,
  onOpenSubscribe,
}) {
  const navigate = useNavigate();
  const slug = (slugProp || localStorage.getItem("mgr_slug") || "").trim().toLowerCase();
  const tableCount = useMemo(() => {
    // Total tables come from the active subscription; fall back to 15 for unsubscribed/explore mode.
    const t = subscription?.tables;
    if (Number.isFinite(t) && t > 0) return t;
    return 15;
  }, [subscription]);

  const qrLocked = Boolean(locked);
  const isExpired = subscription?.status === "expired";

  const tableMap = {};
  for (const o of orders || []) {
    if (["new", "cooking", "done"].includes(o.status) && o.table > 0) {
      tableMap[o.table] = (tableMap[o.table] || 0) + o.amount;
    }
  }

  const [showQRs, setShowQRs] = useState(false);
  const [zipping, setZipping] = useState(false);
  const qrPrintRef = useRef(null);

  // When locked/expired, open the gallery so the paywall is visible.
  useEffect(() => {
    if (qrLocked) setShowQRs(true);
  }, [qrLocked]);

  const tableNums = useMemo(
    () => Array.from({ length: tableCount }, (_, i) => i + 1),
    [tableCount]
  );

  const getQrSvg = (n) => document.querySelector(`[data-qr-svg="${n}"] svg`);

  const requireUnlock = () => {
    toast.message(isExpired ? "Pay to unlock your QR codes" : "Subscribe to unlock QR codes", {
      description: isExpired
        ? "Renew your subscription first, then download clear table QRs."
        : "Subscribe to download table QRs.",
      id: "qr-locked",
    });
    if (onOpenSubscribe) onOpenSubscribe();
    else navigate("/manager", { state: { tab: "subscribe" } });
  };

  const downloadOneQR = async (n) => {
    if (qrLocked) return requireUnlock();
    const el = getQrSvg(n);
    if (!el) return toast.error("QR code isn't ready yet. Please try again.");
    try {
      const png = await buildLabeledQrPng(el, n, { restaurantName });
      triggerBlobDownload(png, qrFileName(n));
      toast.success(`Downloaded Table ${n} QR`);
    } catch {
      toast.error("Couldn't download this QR. Please try again.");
    }
  };

  const downloadAllQRs = async () => {
    if (qrLocked) return requireUnlock();
    if (!slug) {
      return toast.error("Set your restaurant URL in Profile first — QR codes need it to link tables.");
    }
    const items = tableNums
      .map((n) => ({ tableNum: n, svgEl: getQrSvg(n) }))
      .filter((x) => x.svgEl);
    if (items.length === 0) {
      return toast.error("QR codes aren't ready yet. Tap Show QR codes, then try again.");
    }
    setZipping(true);
    try {
      await downloadAllQrsZip(items, { slug, restaurantName });
      toast.success(`Downloaded ZIP with ${items.length} table QRs`);
    } catch {
      toast.error("Couldn't create the ZIP. Please try again.");
    } finally {
      setZipping(false);
    }
  };

  const copyLink = async (n) => {
    if (qrLocked) return requireUnlock();
    const url = restaurantOrderUrl(slug, n);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Table ${n} link copied`);
    } catch {
      toast.message(url);
    }
  };

  return (
    <div className="section active" data-testid="tables-section">
      {/* Off-screen but fully sized so QR SVGs paint for download */}
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
          height: 300 * tableCount,
          overflow: "hidden",
        }}
      >
        {tableNums.map((n) => (
          <div key={`hidden-qr-${n}`} data-qr-svg={n}>
            <QRCodeSVG
              value={restaurantOrderUrl(slug, n)}
              size={280}
              bgColor="#ffffff"
              fgColor="#161310"
              level="H"
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }} data-testid="tables-summary">
          {tableCount} tables {subscription?.tables ? `· from your subscription` : "· default (no active subscription)"}
          {slug ? (
            <span style={{ marginLeft: 8 }} data-testid="tables-slug-hint">
              · QR → <code style={{ color: "var(--gold)" }}>/r/{slug}?table=N</code>
            </span>
          ) : (
            <span style={{ marginLeft: 8, color: "var(--red)" }} data-testid="tables-slug-missing">
              · Set restaurant URL in Profile to enable table QRs
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowQRs((v) => !v)}
            className="mini-btn"
            data-testid="toggle-qr-btn"
            style={{ borderColor: showQRs ? "var(--gold)" : "var(--line)", color: showQRs ? "var(--gold)" : "var(--text)" }}
          >
            <QrCode size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            {showQRs ? "Hide QR codes" : "Show QR codes"}
          </button>
          <button
            type="button"
            onClick={downloadAllQRs}
            className="mini-btn"
            data-testid="download-all-qr-btn"
            disabled={zipping || (!slug && !qrLocked)}
            style={{ borderColor: "var(--gold)", color: "var(--gold)" }}
          >
            <Download size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            {zipping ? "Preparing ZIP…" : qrLocked ? "Pay to unlock" : "Download all QRs"}
          </button>
        </div>
      </div>

      <div className="tables-grid">
        {tableNums.map((n) => {
          const occupied = !!tableMap[n];
          return (
            <div
              key={n}
              className={`table-box ${occupied ? "occupied" : "empty"}`}
              data-testid={`table-${n}`}
            >
              <div className="table-num">{n}</div>
              <div className="table-status-text">{occupied ? "Occupied" : "Empty"}</div>
              {occupied && <div className="table-amount">₹{tableMap[n]}</div>}
            </div>
          );
        })}
      </div>

      {showQRs && (
        <div ref={qrPrintRef} style={{ marginTop: 24 }} data-testid="tables-qr-grid">
          <div className="font-serif" style={{ fontSize: 18, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <QrCode size={16} color="var(--gold)" />
            Table QR Codes — each QR opens the menu locked to that table
          </div>
          {!slug && (
            <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 14 }} data-testid="qr-slug-warning">
              Restaurant URL is missing. Go to Profile and set it, then come back to generate linked QRs.
            </div>
          )}
          <div className={`qr-locked-wrap${qrLocked ? " is-locked" : ""}`} data-testid="tables-qr-locked-wrap">
            <div className={qrLocked ? "qr-locked-blur" : undefined}>
              <div className="tables-qr-grid">
                {tableNums.map((n) => {
                  const url = restaurantOrderUrl(slug, n);
                  return (
                    <div key={n} className="table-qr-card qr-poster-card" data-testid={`table-qr-${n}`}>
                      <div className="qr-poster-accent" aria-hidden="true" />
                      <div className="qr-poster-logo-wrap">
                        <img src={ZENTAAP_LOGO_SRC} alt="ZenTaap" className="qr-poster-logo" />
                      </div>
                      <div className="qr-poster-cta">
                        SCAN TO <span>ORDER NOW</span>
                      </div>
                      <div className="qr-poster-table">Table {n}</div>
                      {restaurantName ? (
                        <div className="qr-poster-rest">{restaurantName}</div>
                      ) : null}
                      <div className="qr-poster-qr">
                        <QRCodeSVG
                          value={url}
                          size={132}
                          bgColor="#ffffff"
                          fgColor="#161310"
                          level="H"
                        />
                        <img src={ZENTAAP_LOGO_SRC} alt="" className="qr-poster-qr-badge" />
                      </div>
                      <div className="qr-poster-steps">
                        <div className="qr-poster-step">
                          <span className="qr-poster-step-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#161310" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="7" y="3" width="10" height="18" rx="2" />
                              <path d="M9 7h6M9 7v3M15 7v3M8 14h8" />
                            </svg>
                          </span>
                          <span className="qr-poster-step-copy"><i>1</i><b>SCAN</b> the QR</span>
                        </div>
                        <div className="qr-poster-step">
                          <span className="qr-poster-step-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#161310" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="5" y="4" width="14" height="16" rx="2" />
                              <path d="M8 9h8M8 13h8M8 17h5" />
                            </svg>
                          </span>
                          <span className="qr-poster-step-copy"><i>2</i><b>CHOOSE</b> items</span>
                        </div>
                        <div className="qr-poster-step">
                          <span className="qr-poster-step-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#161310" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 14a6 6 0 0 1 12 0" />
                              <path d="M4 14h16" />
                              <circle cx="12" cy="7" r="1.2" fill="#161310" stroke="none" />
                            </svg>
                          </span>
                          <span className="qr-poster-step-copy"><i>3</i><b>ENJOY</b> meal</span>
                        </div>
                      </div>
                      <div className="qr-poster-foot">
                        <em>Good Food</em>
                        <strong>Great Experience!</strong>
                      </div>
                      <div className="qr-poster-actions">
                        <button
                          type="button"
                          onClick={() => downloadOneQR(n)}
                          className="mini-btn"
                          data-testid={`download-qr-${n}`}
                          style={{ fontSize: 11 }}
                          disabled={!slug && !qrLocked}
                        >
                          <Download size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => copyLink(n)}
                          className="mini-btn"
                          data-testid={`copy-qr-link-${n}`}
                          style={{ fontSize: 11 }}
                          disabled={!slug && !qrLocked}
                        >
                          <Link2 size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                          Copy link
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {qrLocked && (
              <div className="qr-paywall-overlay" data-testid="tables-qr-paywall">
                <Lock size={28} className="qr-paywall-icon" color="#000" />
                <div className="qr-paywall-title">
                  {isExpired ? "Pay to unlock" : "Subscribe to unlock"}
                </div>
                <div className="qr-paywall-sub">
                  {isExpired
                    ? "Renew your subscription first, then download clear table QRs."
                    : "Subscribe to download clear table QRs."}
                </div>
                <button
                  type="button"
                  className="qr-paywall-cta"
                  onClick={() => (onOpenSubscribe ? onOpenSubscribe() : navigate("/manager", { state: { tab: "subscribe" } }))}
                  data-testid="tables-qr-unlock-btn"
                >
                  {isExpired ? "Pay & Resume" : "Unlock QRs"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
