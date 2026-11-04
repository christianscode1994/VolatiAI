"""Tests for scripts/find_candidates.py — correlation and alignment logic."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.find_candidates import pearson, detrend, align, DAY_MS


class TestPearson(unittest.TestCase):

    def test_perfect_positive(self):
        self.assertAlmostEqual(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1.0)

    def test_perfect_negative(self):
        self.assertAlmostEqual(pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]), -1.0)

    def test_no_correlation(self):
        r = pearson([1, 2, 3, 4, 5], [3, 1, 4, 1, 5])
        self.assertLess(abs(r), 0.5)

    def test_too_short_returns_none(self):
        self.assertIsNone(pearson([1, 2], [3, 4]))

    def test_zero_variance_returns_none(self):
        self.assertIsNone(pearson([1, 1, 1, 1], [1, 2, 3, 4]))


class TestDetrend(unittest.TestCase):

    def test_flat_series_residuals_are_zero(self):
        t0 = 1000000
        pts = [(t0 + i * DAY_MS, 5.0) for i in range(10)]
        res = detrend(pts)
        self.assertIsNotNone(res)
        for r in res:
            self.assertAlmostEqual(r, 0.0, places=9)

    def test_linear_series_residuals_are_zero(self):
        t0 = 1000000
        pts = [(t0 + i * DAY_MS, 5.0 + 2.0 * i) for i in range(10)]
        res = detrend(pts)
        self.assertIsNotNone(res)
        for r in res:
            self.assertAlmostEqual(r, 0.0, places=9)

    def test_curved_series_has_residuals(self):
        t0 = 1000000
        pts = [(t0 + i * DAY_MS, i * i) for i in range(10)]
        res = detrend(pts)
        self.assertIsNotNone(res)
        # Quadratic data detrended linearly leaves non-zero residuals
        self.assertTrue(any(abs(r) > 0.1 for r in res))


class TestAlign(unittest.TestCase):

    def test_common_days(self):
        t0 = 1000000
        a_pts = [(t0 + i * DAY_MS, float(i)) for i in range(10)]
        b_pts = [(t0 + (i + 3) * DAY_MS, float(i * 2)) for i in range(10)]
        aligned = align(a_pts, b_pts)
        self.assertIsNotNone(aligned)
        # a has days 0..9, b has days 3..12, common 3..9 = 7 days
        self.assertEqual(aligned["n"], 7)
        # a_res and b_res should be present
        self.assertIsNotNone(aligned["a_res"])
        self.assertIsNotNone(aligned["b_res"])

    def test_no_overlap(self):
        t0 = 1000000
        a_pts = [(t0 + i * DAY_MS, float(i)) for i in range(5)]
        b_pts = [(t0 + (i + 100) * DAY_MS, float(i)) for i in range(5)]
        self.assertIsNone(align(a_pts, b_pts))


if __name__ == "__main__":
    unittest.main(verbosity=2)
