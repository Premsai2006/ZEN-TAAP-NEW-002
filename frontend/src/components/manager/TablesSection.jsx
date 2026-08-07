import { useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Printer, QrCode, Link2 } from "lucide-react";
import { toast } from "sonner";
import { restaurantOrderUrl } from "@/lib/qr";
import {
  buildLabeledQrPng,
  downloadAllQrsZip,
  qrFileName,
  triggerBlobDownload,
} from "@/lib/qrDownload";

export default function TablesSection({ orders, subscription, slug: slugProp, restaurantName }) {
  const slug = (slugProp || localStorage.getItem("mgr_slug") || "").trim().toLowerCase();
  const tableCount = useMemo(() => {
    // Total tables come from the active subscription; fall back to 15 for unsubscribed/explore mode.
    const t = subscription?.tables;
    if (Number.isFinite(t) && t > 0) return t;
    return 15;
  }, [subscription]);

  const tableMap = {};
  for (const o of orders || []) {
    if (["new", "cooking", "done"].includes(o.status) && o.table > 0) {
      tableMap[o.table] = (tableMap[o.table] || 0) + o.amount;
    }
  }

  const [showQRs, setShowQRs] = useState(false);
  const [zipping, setZipping] = useState(false);
  const qrPrintRef = useRef(null);

  const tableNums = useMemo(
    () => Array.from({ length: tableCount }, (_, i) => i + 1),
    [tableCount]
  );

  const getQrSvg = (n) => document.querySelector(`[data-qr-svg="${n}"] svg`);

  const downloadOneQR = async (n) => {
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
    const url = restaurantOrderUrl(slug, n);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Table ${n} link copied`);
    } catch {
      toast.message(url);
    }
  };

  const printAllQRs = () => {
    if (!slug) {
      return toast.error("Set your restaurant URL in Profile first — QR codes need it to link tables.");
    }
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return toast.error("Please allow pop-ups to print your QR codes.");
    const cards = tableNums
      .map(
        (n) => `
        <div class="qrcard">
          <div class="brand">ZenTaap</div>
          ${restaurantName ? `<div class="rest">${restaurantName}</div>` : ""}
          <div class="qrwrap">${
            (document.querySelector(`[data-qr-svg="${n}"] svg`)?.outerHTML) || ""
          }</div>
          <div class="t">TABLE ${n}</div>
          <div class="d">Scan to order · Table ${n}</div>
          <div class="u">${restaurantOrderUrl(slug, n)}</div>
        </div>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>ZenTaap QR Codes</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 24px; background: #f4f4f4; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .qrcard { background: white; border: 2px solid #e87d2f; border-radius: 14px; padding: 18px; text-align: center; break-inside: avoid; }
        .brand { font-family: serif; font-size: 22px; color: #e87d2f; margin-bottom: 4px; }
        .rest { font-size: 12px; color: #666; margin-bottom: 8px; }
        .qrwrap svg { width: 160px; height: 160px; }
        .t { font-size: 22px; font-weight: 800; margin-top: 10px; letter-spacing: 0.5px; }
        .d { font-size: 11px; color: #666; margin-top: 4px; }
        .u { font-size: 9px; color: #999; margin-top: 6px; word-break: break-all; }
        @media print { body { background: white; } .grid { gap: 12px; } }
      </style>
    </head><body><div class="grid">${cards}</div>
    <script>setTimeout(() => window.print(), 400);</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <div className="section active" data-testid="tables-section">
      {/* Always render QRs off-screen so Print / Download-all work without Show first */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: -9999, top: 0, width: 1, height: 1, overflow: "hidden" }}
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
            disabled={zipping || !slug}
            style={{ borderColor: "var(--gold)", color: "var(--gold)" }}
          >
            <Download size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            {zipping ? "Preparing ZIP…" : "Download all QRs"}
          </button>
          <button
            type="button"
            onClick={printAllQRs}
            className="mini-btn"
            data-testid="print-qr-btn"
            style={{ background: "var(--gold)", color: "white", borderColor: "var(--gold)" }}
          >
            <Printer size={13} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            Print all QRs
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
                      disabled={!slug}
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
                      disabled={!slug}
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
      )}
    </div>
  );
}
