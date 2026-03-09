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

// ─── Supabase Integration ────────────────────────────────────────────────────

/**
 * Fetch all dashboard data from Supabase in parallel.
 * @param {object} client - Supabase client instance.
 * @returns {Promise<{ holdings, metrics, performance, income }>}
 */
async function loadDashboardData(client) {
  const [holdingsRes, metricsRes, perfRes, incomeRes] = await Promise.all([
    client.from('holdings').select('*').order('weight', { ascending: false }),
    client.from('metrics').select('*').limit(1).single(),
    client.from('performance').select('*').order('period'),
    client.from('income').select('*').order('period'),
  ]);
  const errors = [holdingsRes.error, metricsRes.error, perfRes.error, incomeRes.error].filter(Boolean);
  if (errors.length) console.error('Supabase fetch errors:', errors);
  return {
    holdings:    holdingsRes.data ?? [],
    metrics:     metricsRes.data  ?? null,
    performance: perfRes.data     ?? [],
    income:      incomeRes.data   ?? [],
  };
}

/**
 * Update KPI cards and risk metrics table from a metrics row.
 * @param {object} m - Row from the metrics table.
 */
function renderMetrics(m) {
  if (!m) return;
  const fmtNum = n => Number(n).toLocaleString();
  document.getElementById('kpi-value').textContent        = `$${fmtNum(m.total_value)}`;
  document.getElementById('kpi-value-change').textContent = `+$${fmtNum(m.ytd_gain)} (+${m.ytd_gain_pct}%) YTD`;
  document.getElementById('kpi-return').textContent       = `+${m.annual_return}%`;
  document.getElementById('kpi-benchmark').textContent    = `Benchmark: +${m.benchmark_return}%`;
  document.getElementById('kpi-yield').textContent        = `${m.yield_ttm}%`;
  document.getElementById('kpi-income').textContent       = `$${fmtNum(m.annual_income)} annual income`;
  document.getElementById('kpi-sharpe').textContent       = m.sharpe_ratio;
  document.getElementById('risk-volatility').textContent  = `${m.volatility}%`;
  document.getElementById('risk-drawdown').textContent    = `${m.max_drawdown}%`;
  document.getElementById('risk-beta').textContent        = m.beta;
  document.getElementById('risk-sortino').textContent     = m.sortino_ratio;
  document.getElementById('risk-duration').textContent    = `${m.bond_duration} yrs`;
}

/**
 * Re-render the holdings table from Supabase rows.
 * @param {object[]} holdings
 */
function renderHoldings(holdings) {
  if (!holdings.length) return;
  document.getElementById('holdings-tbody').innerHTML = holdings.map(h => {
    const pos = h.annual_return >= 0;
    return `<tr>
      <td>${h.name} (${h.ticker})</td>
      <td>${h.type}</td>
      <td>${h.weight}%</td>
      <td><span class="tag ${pos ? 'tag-green' : 'tag-red'}">${pos ? '+' : ''}${h.annual_return}%</span></td>
    </tr>`;
  }).join('');
}

/**
 * Render the performance line chart from Supabase rows.
 * @param {object[]} rows - Rows with period, portfolio_value, benchmark_value.
 */
function renderPerfFromDB(rows) {
  const labels    = rows.map(r => new Date(r.period + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
  const portfolio = rows.map(r => +Number(r.portfolio_value).toFixed(2));
  const benchmark = rows.map(r => +Number(r.benchmark_value).toFixed(2));
  if (window._perfChart) window._perfChart.destroy();
  window._perfChart = new Chart(document.getElementById('perfChart').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Portfolio', data: portfolio, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2.5 },
        { label: 'Benchmark', data: benchmark, borderColor: '#6b7280', borderDash: [6,4], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top', labels: { color: '#9ca3af', usePointStyle: true, pointStyle: 'line', font: { size: 12 } } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', maxTicksLimit: 12 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7280', callback: v => v.toFixed(0) } },
      },
      interaction: { intersect: false, mode: 'index' },
    },
  });
}

/**
 * Render the income bar chart from Supabase rows.
 * @param {object[]} rows - Rows with period and amount.
 */
function renderIncomeFromDB(rows) {
  if (!rows.length) return;
  const labels = rows.map(r => new Date(r.period + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }));
  const data   = rows.map(r => Number(r.amount));
  if (window._incomeChart) window._incomeChart.destroy();
  window._incomeChart = new Chart(document.getElementById('incomeChart').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: 'rgba(59,130,246,0.5)', borderRadius: 4, barPercentage: 0.6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `$${ctx.parsed.y.toLocaleString()}` } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#6b7280' } }, y: { display: false } },
    },
  });
}
