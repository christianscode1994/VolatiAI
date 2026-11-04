"""Tests for scripts/briefing.py — regression coverage for the Nov 4 ranking fixes.

These lock in:
  - _parse_days: extracts window from "vs X.Xd ago" summary strings
  - _log_rate: per-day log-rate, sign-symmetric (+100% and -50% equal)
  - quiet_headline: ranks by proximity-to-threshold, not raw magnitude

Any future change to scripts/briefing.py that breaks these functions
will be caught before it lands.
"""
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.briefing import _parse_days, _log_rate, quiet_headline


class TestParseDays(unittest.TestCase):

    def test_standard_format(self):
        self.assertEqual(
            _parse_days({"summary": "top10_score_sum 2931 (+291.8% vs 10.8d ago)"}),
            10.8,
        )

    def test_whole_number(self):
        self.assertEqual(_parse_days({"summary": "x (+114% vs 8d ago)"}), 8.0)

    def test_empty_dict(self):
        self.assertIsNone(_parse_days({}))

    def test_empty_summary(self):
        self.assertIsNone(_parse_days({"summary": ""}))

    def test_no_match(self):
        self.assertIsNone(_parse_days({"summary": "no window here"}))


class TestLogRate(unittest.TestCase):

    def test_plus_100_over_10d(self):
        r = _log_rate({"pct_change": 100, "summary": "x (vs 10d ago)"})
        self.assertAlmostEqual(r, math.log(2) / 10, places=9)

    def test_sign_symmetry(self):
        """+100% and -50% are the same log move — log(2) and -log(0.5)."""
        r1 = _log_rate({"pct_change": 100, "summary": "x (vs 10d ago)"})
        r2 = _log_rate({"pct_change": -50, "summary": "x (vs 10d ago)"})
        self.assertAlmostEqual(r1, r2, places=9)

    def test_zero(self):
        self.assertEqual(_log_rate({"pct_change": 0, "summary": "x (vs 10d ago)"}), 0.0)

    def test_missing_pct(self):
        self.assertEqual(_log_rate({}), 0.0)

    def test_missing_days_fallback(self):
        """Without a parseable summary, fall back to raw |pct|."""
        self.assertEqual(_log_rate({"pct_change": 50}), 50.0)

    def test_minus_100_guarded(self):
        """pct=-100 → ratio 0 → log(0) undefined → must guard."""
        self.assertEqual(_log_rate({"pct_change": -100, "summary": "x (vs 10d ago)"}), 0.0)

    def test_below_minus_100_guarded(self):
        self.assertEqual(_log_rate({"pct_change": -150, "summary": "x (vs 10d ago)"}), 0.0)


class TestQuietHeadline(unittest.TestCase):

    def test_empty(self):
        self.assertEqual(quiet_headline({}, {}), "no data")

    def test_fired_returns_count(self):
        self.assertEqual(quiet_headline({"a": {"pct_change": 5}}, {"a": {}}), "1 signals")

    def test_no_pct(self):
        self.assertEqual(
            quiet_headline({"a": {"pct_change": None}}, {}),
            "1 sectors monitored, all quiet",
        )

    def test_proximity_ranking(self):
        """Fix: near-threshold sector (4.9/5) wins over bigger-magnitude (50/100)."""
        sectors = {
            "a": {"pct_change": 4.9, "threshold_pct": 5},
            "b": {"pct_change": 50, "threshold_pct": 100},
        }
        h = quiet_headline(sectors, {})
        self.assertIn("a", h, f"regression: picked wrong sector — {h}")
        self.assertIn("4.90%", h)

    def test_no_threshold_falls_back(self):
        sectors = {"a": {"pct_change": 20, "summary": "x (vs 10d ago)"}}
        h = quiet_headline(sectors, {})
        self.assertIn("a", h)
        self.assertIn("20.00%", h)


if __name__ == "__main__":
    unittest.main(verbosity=2)
