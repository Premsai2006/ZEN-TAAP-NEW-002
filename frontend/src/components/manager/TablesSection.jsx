import { useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";

const QR_DOMAIN = "https://zentaapqr.com";

export default function TablesSection({ orders, subscription }) {
  const tableCount = useMemo(() => {
    // Total tables come from the active subscription; fall back to 15 for unsubscribed/explore mode.
    const t = subscription?.tables;
    if (Number.isFinite(t) && t > 0) return t;
    return 15;
  }, [subscription]);

  const tableMap = {};
  for (const o of orders || []) {
    if (["new", "cooking", "done"].includes(o.status)) {
      tableMap[o.table] = (tableMap[o.table] || 0) + o.amount;
    }
  }

  const [showQRs, setShowQRs] = useState(false);
  const qrPrintRef = useRef(null);

  const downloadOneQR = (n) => {
    const el = document.querySelector(`[data-qr-svg="${n}"] svg`);
    if (!el) return toast.error("QR not ready");
    const svg = new XMLSerializer().serializeToString(el);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zentaap-table-${n}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded QR for Table ${n}`);
  };

  const printAllQRs = () => {
    const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!w) return toast.error("Browser blocked the print window");
    const cards = Array.from({ length: tableCount }, (_, i) => i + 1)
      .map(
        (n) => `
        <div class="qrcard">
          <div class="brand">ZenTaap</div>
          <div class="qrwrap">${
            (document.querySelector(`[data-qr-svg="${n}"] svg`)?.outerHTML) || ""
          }</div>
          <div class="t">Table ${n}</div>
          <div class="d">Scan to order · zentaapqr.com</div>
        </div>`
      )
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

  return (
    <div className="section active" data-testid="tables-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }} data-testid="tables-summary">
          {tableCount} tables {subscription?.tables ? `· from your subscription` : "· default (no active subscription)"}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
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
        {Array.from({ length: tableCount }, (_, i) => i + 1).map((n) => {
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
            Table QR Codes — print, laminate &amp; place on each table
          </div>
          <div className="tables-qr-grid">
            {Array.from({ length: tableCount }, (_, i) => i + 1).map((n) => (
              <div key={n} className="table-qr-card" data-testid={`table-qr-${n}`}>
                <div data-qr-svg={n} style={{ background: "white", padding: 8, borderRadius: 8 }}>
                  <QRCodeSVG
                    value={`${QR_DOMAIN}/customer?table=${n}`}
                    size={120}
                    bgColor="#ffffff"
                    fgColor="#161310"
                    level="M"
                  />
                </div>
                <div style={{ marginTop: 8, fontWeight: 700 }}>Table {n}</div>
                <button
                  type="button"
                  onClick={() => downloadOneQR(n)}
                  className="mini-btn"
                  data-testid={`download-qr-${n}`}
                  style={{ marginTop: 8, fontSize: 11 }}
                >
                  <Download size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
