from fastapi import HTTPException
from app.config import BASE_FEE, PER_TABLE, GST_RATE, MIN_TABLES, MAX_TABLES


def compute_price(tables: int) -> dict:
    if tables < MIN_TABLES or tables > MAX_TABLES:
        raise HTTPException(
            status_code=400,
            detail=f"Please choose between {MIN_TABLES} and {MAX_TABLES} tables.",
        )
    subtotal = round(BASE_FEE + PER_TABLE * tables, 2)
    gst = round(subtotal * GST_RATE, 2)
    total = round(subtotal + gst, 2)
    return {
        "tables": tables,
        "base_fee": BASE_FEE,
        "per_table": PER_TABLE,
        "tables_subtotal": round(PER_TABLE * tables, 2),
        "subtotal": subtotal,
        "gst_rate_pct": int(GST_RATE * 100),
        "gst_amount": gst,
        "total_with_tax": total,
        "per_table_with_tax": round(total / tables, 2) if tables else 0,
    }
