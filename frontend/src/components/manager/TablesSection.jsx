import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Download, QrCode, Link2, Lock } from "lucide-react";
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
        ? "Renew your subscription to download and print table QRs."
        : "Start a trial or subscribe to download table QRs.",
      id: "qr-locked",
    });
    navigate("/subscribe");
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
          width: 220,
          height: 220 * tableCount,
          overflow: "hidden",
        }}
      >
        {tableNums.map((n) => (
          <div key={`hidden-qr-${n}`} data-qr-svg={n}>
            <QRCodeSVG
              value={restaurantOrderUrl(slug, n)}
              size={200}
              bgColor="#ffffff"
              fgColor="#161310"
              level="M"
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
                    <div key={n} className="table-qr-card" data-testid={`table-qr-${n}`}>
                      <div style={{ background: "white", padding: 8, borderRadius: 8 }}>
                        <QRCodeSVG
                          value={url}
                          size={120}
                          bgColor="#ffffff"
                          fgColor="#161310"
                          level="M"
                        />
                      </div>
                      <div style={{ marginTop: 8, fontWeight: 700 }}>Table {n}</div>
                      <div
                        data-testid={`table-qr-url-${n}`}
                        title={url}
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: "var(--muted)",
                          wordBreak: "break-all",
                          lineHeight: 1.3,
                          maxWidth: 160,
                        }}
                      >
                        {slug ? `?table=${n}` : "no slug"}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
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
                <Lock size={28} color="var(--gold)" />
                <div className="qr-paywall-title">
                  {isExpired ? "Pay to unlock" : "Subscribe to unlock"}
                </div>
                <div className="qr-paywall-sub">
                  {isExpired
                    ? "Your subscription expired. Renew to download and print clear table QRs."
                    : "Start a trial or subscribe to download sharp QR codes for every table."}
                </div>
                <button
                  type="button"
                  className="explore-banner-cta"
                  onClick={() => navigate("/subscribe")}
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
