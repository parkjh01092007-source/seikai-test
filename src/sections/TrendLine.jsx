import { useWidth } from './useWidth.js'
import { trendGeometry, niceTicks, niceRange } from '../monthlyView.js'
import { formatMoney } from '../ledgerLogic.js'
import { t } from '../text.js'

// 月末の推移。rows は古い月から新しい月。
// 最初の点の金額は、左の目盛りの文字と重ならないよう、点の右から書く
// flow：元帳の費用・収益の科目（その月の金額）。下は 0 円、左にきりのよい目盛りとうすい横線。6 か月以下は全部の点に金額、7 か月以上は最高・最低・今月だけ
export default function TrendLine({ rows, metric, label, currency, phone, flow, monthly }) {
  const [ref, width] = useWidth()
  const height = phone ? 110 : 180
  const values = rows.map((row) => row[metric])
  const scale = monthly ? niceRange(Math.min(...values), Math.max(...values)) : flow ? niceTicks(Math.max(...values)) : null
  const ceiling = monthly && scale.top === 0 && scale.bottom === 0 ? 1 : scale?.top
  const graph = trendGeometry(rows, metric, width, height, ceiling, monthly ? scale.bottom : 0)
  const latest = graph.points.at(-1)
  const maximum = Math.max(...values)
  const minimum = Math.min(...values)
  const description = t(flow ? 'book.trendAmountAria' : 'monthly.trendAria', { label, month: Number(latest.month.slice(5)), amount: formatMoney(latest[metric], currency) })
  const shown = new Set(rows.length <= 6 ? graph.points.map((p) => p.month) : [graph.points[values.indexOf(maximum)].month, graph.points[values.indexOf(minimum)].month, latest.month])
  return <div className="b-trend-chart" ref={ref}>
    {width > 0 && <svg width={width} height={height} role="img" aria-label={description}>
      {(flow || monthly) && scale.ticks.map((v) => <g key={v}>
        {v !== 0 && <line className="b-trend-grid" x1={graph.left} x2={graph.right} y1={graph.y(v)} y2={graph.y(v)} />}
        <text x="0" y={graph.y(v) + 4}>{formatMoney(v, currency)}</text>
      </g>)}
      <line className={`b-trend-zero${monthly && minimum < 0 ? ' b-trend-zero-negative' : ''}`} x1={graph.left} x2={graph.right} y1={graph.zeroY} y2={graph.zeroY} />
      {!flow && !monthly && <text x="0" y="14">{formatMoney(maximum, currency)}</text>}
      {!flow && !monthly && minimum !== maximum && <text x="0" y={height - 25}>{formatMoney(minimum, currency)}</text>}
      {!flow && !monthly && graph.zeroY > 28 && graph.zeroY < height - 35 && <text x="0" y={graph.zeroY + 4}>{formatMoney(0, currency)}</text>}
      {graph.points.length > 1 && <polyline className="b-trend-line" points={graph.points.map((p) => `${p.x},${p.y}`).join(' ')} />}
      {graph.points.map((p) => <g key={p.month}>
        <circle className="b-trend-dot" cx={p.x} cy={p.y} r="3" />
        {(flow || monthly) && shown.has(p.month) && <text className="b-trend-point" x={p === graph.points[0] && graph.points.length > 1 ? p.x + 4 : p.x} y={p.y - 8} textAnchor={p === graph.points[0] && graph.points.length > 1 ? 'start' : 'middle'}>{formatMoney(p[metric], currency)}</text>}
        <text x={p.x} y={height - 4} textAnchor="middle">{t('monthly.trendMonth', { month: Number(p.month.slice(5)) })}</text>
      </g>)}
      {!flow && !monthly && <text className="b-trend-latest" x={width} y={latest.y + 4} textAnchor="end">{formatMoney(latest[metric], currency)}</text>}
    </svg>}
    {!flow && rows.length === 1 && <p className="note">{t('monthly.trendOne')}</p>}
  </div>
}
