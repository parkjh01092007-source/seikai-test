import { useWidth } from './useWidth.js'
import { trendGeometry } from '../monthlyView.js'
import { formatMoney } from '../ledgerLogic.js'
import { t } from '../text.js'

// 月末の推移。rows は古い月から新しい月。
export default function TrendLine({ rows, metric, label, currency, phone }) {
  const [ref, width] = useWidth()
  const height = phone ? 110 : 180
  const graph = trendGeometry(rows, metric, width, height)
  const latest = graph.points.at(-1)
  const values = rows.map((row) => row[metric])
  const maximum = Math.max(...values)
  const minimum = Math.min(...values)
  const description = t('monthly.trendAria', { label, month: Number(latest.month.slice(5)), amount: formatMoney(latest[metric], currency) })
  return <div className="b-trend-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={description}>
      <line className="b-trend-zero" x1={graph.left} x2={graph.right} y1={graph.zeroY} y2={graph.zeroY} />
      <text x="0" y="14">{formatMoney(maximum, currency)}</text>
      {minimum !== maximum && <text x="0" y={height - 25}>{formatMoney(minimum, currency)}</text>}
      {graph.zeroY > 28 && graph.zeroY < height - 35 && <text x="0" y={graph.zeroY + 4}>{formatMoney(0, currency)}</text>}
      {graph.points.length > 1 && <polyline className="b-trend-line" points={graph.points.map((p) => `${p.x},${p.y}`).join(' ')} />}
      {graph.points.map((p) => <g key={p.month}>
        <circle className="b-trend-dot" cx={p.x} cy={p.y} r="3" />
        <text x={p.x} y={height - 4} textAnchor="middle">{t('monthly.trendMonth', { month: Number(p.month.slice(5)) })}</text>
      </g>)}
      <text className="b-trend-latest" x={width} y={latest.y + 4} textAnchor="end">{formatMoney(latest[metric], currency)}</text>
    </svg>}
    {rows.length === 1 && <p className="note">{t('monthly.trendOne')}</p>}
  </div>
}
