import { Printer, X } from "lucide-react";

export default function BillModal({ order, settings, onClose }) {
  if (!order) return null;
  const s = settings || {};
  const subtotal = order.amount;
  const gstRate = (s.gst_rate ?? 0) / 100;
  const cgst = +(subtotal * gstRate / 2).toFixed(2);
  const sgst = +(subtotal * gstRate / 2).toFixed(2);
  const total = +(subtotal + cgst + sgst).toFixed(2);
  const billNo = `B-${order.order_number}`;
  const dateStr = new Date(order.created_at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="no-print"
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
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

        {/* Printable area */}
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
            {s.restaurant_name || "TableTap Restaurant"}
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
            <span>Table {order.table}</span>
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
              {order.items.map((it, i) => (
                <tr key={i}>
                  <td style={{ padding: "2px 0", fontSize: 12, color: "#000", border: "none" }}>{it.name}</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontSize: 12, color: "#000", border: "none" }}>{it.qty}</td>
                  <td style={{ padding: "2px 0", textAlign: "right", fontSize: 12, color: "#000", border: "none" }}>
                    ₹{(it.qty * it.price).toFixed(2)}
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

        <div className="no-print" style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            onClick={handlePrint}
            className="submit-btn"
            data-testid="bill-print-btn"
            style={{ flex: 1 }}
          >
            <Printer size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            Print Bill
          </button>
          <button onClick={onClose} className="submit-btn ghost" data-testid="bill-cancel-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
