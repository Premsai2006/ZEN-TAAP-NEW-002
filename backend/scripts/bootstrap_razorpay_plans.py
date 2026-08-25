#!/usr/bin/env python3
"""Bootstrap Razorpay monthly plans for tables 10–60. Run after deploy or when pricing changes."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env.dev")
load_dotenv(ROOT / ".env", override=True)

from app.services.razorpay_plans import bootstrap_all_plans  # noqa: E402
from app.config import MIN_TABLES, MAX_TABLES  # noqa: E402


async def main() -> None:
    plans = await bootstrap_all_plans(MIN_TABLES, MAX_TABLES)
    print(f"Bootstrapped {len(plans)} Razorpay plans ({MIN_TABLES}–{MAX_TABLES} tables)")
    for tables in [10, 14, 20, 30, 60]:
        print(f"  {tables} tables -> {plans.get(str(tables))}")


if __name__ == "__main__":
    asyncio.run(main())
