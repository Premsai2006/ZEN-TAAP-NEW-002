"""Unit tests for first-payment intro bonus (4 extra days, once only)."""
from datetime import datetime, timezone, date

from app.services.subscription_access import (
    first_paid_cycle_end,
    intro_trial_eligible,
)


def test_intro_eligible_new_restaurant():
    assert intro_trial_eligible({}) is True
    assert intro_trial_eligible({"subscription_status": "none"}) is True
    assert intro_trial_eligible({"subscription_status": "skipped"}) is True


def test_intro_not_eligible_after_payment_or_legacy_trial():
    assert intro_trial_eligible({"trial_used": True}) is False
    assert intro_trial_eligible({"last_payment_at": "2026-08-01T00:00:00+00:00"}) is False
    assert intro_trial_eligible({"trial_start": "2026-08-01T00:00:00+00:00"}) is False


def test_first_cycle_aug_1_charges_sep_5():
    now = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
    end = first_paid_cycle_end(now, intro=True)
    assert end.date() == date(2026, 9, 5)


def test_second_month_has_no_bonus():
    now = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
    end = first_paid_cycle_end(now, intro=False)
    assert end.date() == date(2026, 9, 1)
