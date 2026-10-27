import { useWidth } from './useWidth.js'
import { chartPoints } from '../loanView.js'
import { formatMoney } from '../ledgerLogic.js'
import { t } from '../text.js'

const monthIndex = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1

// 残りの見込みの折れ線（compact：基本のスマホ用の小さい形）。series は loanProjection の series（今月から終わりまで）。点は年に 1 つ（今月と同じ月）。左に最大と 0、今の点に今の残り、下に年
export default function LoanChart({ series, name, currency, compact = false }) {
  const [ref, width] = useWidth()
  const height = compact ? 150 : 220
  const points = chartPoints(series)
  const first = monthIndex(points[0].month)
  const span = Math.max(1, monthIndex(points.at(-1).month) - first)
  const max = Math.max(1, ...points.map((p) => p.balance))
  const left = compact ? 92 : 110, right = compact ? 16 : 24, top = 18, bottom = 28
  const x = (month) => left + ((monthIndex(month) - first) / span) * Math.max(1, width - left - right)
  const y = (v) => top + (1 - v / max) * (height - top - bottom)
  const now = points[0]
  let lastLabel = -Infinity
  let lastYear = ''
  return <div className="b-loan-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={t('loans.chartAria', { name, amount: formatMoney(now.balance, currency) })}>
      <line className="b-loan-grid" x1={left} x2={width - right} y1={y(max)} y2={y(max)} />
      <line className="b-loan-zero" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
      <text x="0" y={y(max) + 4}>{formatMoney(max, currency)}</text>
      <text x="0" y={y(0) + 4}>{formatMoney(0, currency)}</text>
      <polyline className="b-loan-line" points={points.map((p) => `${x(p.month)},${y(p.balance)}`).join(' ')} />
      <circle className="b-loan-dot" cx={x(now.month)} cy={y(now.balance)} r="4.5" />
      {now.balance < max && <text className="b-loan-now" x={x(now.month) + 8} y={Math.min(y(now.balance) + 20, height - bottom - 4)}>{formatMoney(now.balance, currency)}</text>}
      {points.map((p, i) => {
        const px = x(p.month)
        const year = p.month.slice(0, 4)
        if (year === lastYear || (i > 0 && px - lastLabel < 48)) return null
        lastLabel = px
        lastYear = year
        return <text key={p.month} x={px} y={height - 6} textAnchor="middle">{year}</text>
      })}
    </svg>}
  </div>
}
