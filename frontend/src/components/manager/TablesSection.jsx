const TOTAL_TABLES = 15;

export default function TablesSection({ orders }) {
  const tableMap = {};
  for (const o of orders) {
    if (["new", "cooking", "done"].includes(o.status)) {
      tableMap[o.table] = (tableMap[o.table] || 0) + o.amount;
    }
  }

  return (
    <div className="section active" data-testid="tables-section">
      <div className="tables-grid">
        {Array.from({ length: TOTAL_TABLES }, (_, i) => i + 1).map((n) => {
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
    </div>
  );
}
