import { useState } from "react";
import { Printer, X, MessageCircle } from "lucide-react";

export default function BillModal({ order, settings, onClose }) {
  const [waPhone, setWaPhone] = useState("");
  const [showWa, setShowWa] = useState(false);
  if (!order) return null;
  const s = settings || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = Number(order.amount ?? items.reduce((sum, it) => sum + (it.qty || 0) * (it.price || 0), 0)) || 0;
  const gstRate = (s.gst_rate ?? 0) / 100;
  const cgst = +(subtotal * gstRate / 2).toFixed(2);
  const sgst = +(subtotal * gstRate / 2).toFixed(2);
  const total = +(subtotal + cgst + sgst).toFixed(2);
  const billNo = `B-${order.order_number ?? "?"}`;
  const tableText = order.table === 0 || order.table == null ? "Walk-in" : `Table ${order.table}`;
  const dateStr = order.created_at
    ? new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const handlePrint = () => {
    window.print();
  };

  const buildWhatsAppMessage = () => {
    const lines = [];
    lines.push(`*${s.restaurant_name || "ZenTaap Restaurant"}*`);
    if (s.address) lines.push(s.address);
    if (s.phone) lines.push(`Ph: ${s.phone}`);
    if (s.gst_number) lines.push(`GSTIN: ${s.gst_number}`);
    lines.push(`-------------------------`);
    lines.push(`Bill #${billNo}  |  ${tableText}`);
    lines.push(dateStr);
    lines.push(`-------------------------`);
    for (const it of items) {
      lines.push(`${it.name} x${it.qty}  ₹${((it.qty || 0) * (it.price || 0)).toFixed(2)}`);
    }
    lines.push(`-------------------------`);
    lines.push(`Subtotal: ₹${subtotal.toFixed(2)}`);
    if (gstRate > 0) {
      lines.push(`CGST (${(s.gst_rate / 2).toFixed(1)}%): ₹${cgst.toFixed(2)}`);
      lines.push(`SGST (${(s.gst_rate / 2).toFixed(1)}%): ₹${sgst.toFixed(2)}`);
    }
    lines.push(`*TOTAL: ₹${total.toFixed(2)}*`);
    lines.push(``);
    lines.push(`Thank you for dining with us! 🙏`);
    return lines.join("\n");
  };

  const sendWhatsApp = () => {
    const digits = waPhone.replace(/[^0-9]/g, "");
    if (digits.length < 7) {
      setShowWa(true);
      return;
    }
    const msg = encodeURIComponent(buildWhatsAppMessage());
    // For Indian numbers default to 91 prefix if missing country code
    const num = digits.length === 10 ? `91${digits}` : digits;
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
  };

  return (
    <div
      className="bill-modal-overlay"
      onClick={onClose}
      data-testid="bill-modal"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="bill-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: 18,
          maxWidth: 420,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          className="no-print"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}
        >
          <div className="font-serif" style={{ fontSize: 18, color: "var(--gold)" }}>
            Bill Preview
          </div>
          <button
            onClick={onClose}
            className="mini-btn"
            data-testid="bill-close-btn"
            style={{ padding: 6 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Printable area — must NOT sit under a .no-print ancestor or print is blank */}
        <div
          className="bill-print"
          style={{
            background: "white",
            color: "#111",
            padding: 16,
            borderRadius: 8,
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
          }}
          data-testid="bill-print-area"
        >
          {s.logo_url && (
            <div className="b-center" style={{ textAlign: "center", marginBottom: 6 }}>
              <img
                src={s.logo_url}
                alt="logo"
                style={{ maxWidth: 80, maxHeight: 80, objectFit: "contain" }}
              />
            </div>
          )}
          <div className="b-center" style={{ textAlign: "center", fontWeight: 700, fontSize: 16 }}>
            {s.restaurant_name || "ZenTaap Restaurant"}
          </div>
          {s.address && (
            <div className="b-center" style={{ textAlign: "center", fontSize: 11 }}>
              {s.address}
            </div>
          )}
          {s.phone && (
            <div className="b-center" style={{ textAlign: "center", fontSize: 11 }}>
              Ph: {s.phone}
            </div>
          )}
          {s.gst_number && (
            <div className="b-center" style={{ textAlign: "center", fontSize: 11 }}>
              GSTIN: {s.gst_number}
            </div>
          )}
          <div className="b-line" style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span>Bill #{billNo}</span>
            <span>{tableText}</span>
          </div>
          <div style={{ fontSize: 11, marginBottom: 4 }}>{dateStr}</div>
          <div className="b-line" style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "2px 0", fontSize: 12, color: "#000", border: "none" }}>Item</th>
                <th style={{ textAlign: "right", padding: "2px 0", fontSize: 12, color: "#000", border: "none" }}>Qty</th>
                <th style={{ textAlign: "right", padding: "2px 0", fontSize: 12, color: "#000", border: "none" }}>Amt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={`${it.name}-${i}`}>
                  <td style={{ padding: "2px 0", fontSize: 12, color: "#000", border: "none" }}>{it.name}</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontSize: 12, color: "#000", border: "none" }}>{it.qty}</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontSize: 12, color: "#000", border: "none" }}>
                    ₹{((it.qty || 0) * (it.price || 0)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="b-line" style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span>Subtotal</span>
            <span>₹{subtotal.toFixed(2)}</span>
          </div>
          {gstRate > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>CGST ({(s.gst_rate / 2).toFixed(1)}%)</span>
                <span>₹{cgst.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span>SGST ({(s.gst_rate / 2).toFixed(1)}%)</span>
                <span>₹{sgst.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="b-line" style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
            <span>TOTAL</span>
            <span>₹{total.toFixed(2)}</span>
          </div>
          <div className="b-line" style={{ borderTop: "1px dashed #000", margin: "8px 0" }} />
          <div className="b-center" style={{ textAlign: "center", fontSize: 11, marginTop: 6 }}>
            Thank you for dining with us!
          </div>
        </div>

        <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            onClick={handlePrint}
            className="submit-btn"
            data-testid="bill-print-btn"
            style={{ flex: 1, minWidth: 140 }}
          >
            <Printer size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            Print Bill
          </button>
          <button
            onClick={() => setShowWa((v) => !v)}
            className="submit-btn"
            data-testid="bill-whatsapp-btn"
            style={{ flex: 1, minWidth: 140, background: "#25D366", color: "white" }}
          >
            <MessageCircle size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            Send via WhatsApp
          </button>
          <button onClick={onClose} className="submit-btn ghost" data-testid="bill-cancel-btn">
            Close
          </button>
        </div>
        {showWa && (
          <div
            className="no-print"
            data-testid="whatsapp-input-row"
            style={{
              marginTop: 12,
              padding: 12,
              background: "var(--bg)",
              border: "1px solid var(--line)",
              borderRadius: 10,
            }}
          >
            <label className="form-label" style={{ marginBottom: 6, display: "block" }}>
              Customer&apos;s WhatsApp number
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="tel"
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="e.g. 9876543210"
                data-testid="whatsapp-phone-input"
                style={{
                  flex: 1,
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  color: "var(--text)",
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <button
                type="button"
                className="submit-btn"
                onClick={sendWhatsApp}
                data-testid="whatsapp-send-btn"
                style={{ background: "#25D366", color: "white" }}
              >
                Send
              </button>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 6 }}>
              Opens WhatsApp with the bill pre-filled. India: 10 digits or with country code.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
