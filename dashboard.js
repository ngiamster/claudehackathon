// Pure, testable logic for the portfolio dashboard.
// No DOM or Chart.js dependencies — safe to import in tests.

const RANGE_MAP = { '1Y': 12, '3Y': 36, '5Y': 60, 'ALL': 120 };

const ALLOCATION = { bonds: 60, equities: 40 };

const HOLDINGS = [
  { name: 'US Aggregate Bond (AGG)',      type: 'Bond',   weight: 25 },
  { name: 'Treasury 10-20Y (TLH)',        type: 'Bond',   weight: 15 },
  { name: 'Investment Grade Corp (LQD)',  type: 'Bond',   weight: 12 },
  { name: 'TIPS (TIP)',                   type: 'Bond',   weight:  8 },
  { name: 'MSCI ACWI (ACWI)',            type: 'Equity', weight: 40 },
];

const INCOME_MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
const INCOME_DATA   = [3420, 3510, 3480, 3650, 3580, 3620];

/**
 * Generate simulated performance data for the portfolio and benchmark.
 * @param {number} months - Number of months of history to generate.
 * @returns {{ labels: string[], portfolio: number[], benchmark: number[] }}
 */
function generatePerfData(months) {
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError('months must be a positive integer');
  }
  const labels    = [];
  const portfolio = [];
  const benchmark = [];
  let pVal = 100, bVal = 100;
  const now = new Date(2026, 2, 9);

  for (let i = months; i >= 0; i--) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - i);
    labels.push(d.toLocaleDateString('en-US', {
      month: 'short',
      year: (i % 12 === 0 || i === months) ? '2-digit' : undefined
    }));
    pVal *= 1 + (0.005 + Math.sin(i * 0.3)  * 0.008 + (Math.random() - 0.45) * 0.012);
    bVal *= 1 + (0.004 + Math.sin(i * 0.25) * 0.007 + (Math.random() - 0.45) * 0.011);
    portfolio.push(+pVal.toFixed(2));
    benchmark.push(+bVal.toFixed(2));
  }
  return { labels, portfolio, benchmark };
}

/**
 * Resolve a range key to a month count.
 * @param {string} range - One of '1Y', '3Y', '5Y', 'ALL'.
 * @returns {number|undefined}
 */
function getRangeMonths(range) {
  return RANGE_MAP[range];
}

/**
 * Return the total allocation percentage (should always equal 100).
 * @returns {number}
 */
function totalAllocation() {
  return ALLOCATION.bonds + ALLOCATION.equities;
}

/**
 * Return the total weight across all holdings (should always equal 100).
 * @returns {number}
 */
function totalHoldingsWeight() {
  return HOLDINGS.reduce((sum, h) => sum + h.weight, 0);
}
