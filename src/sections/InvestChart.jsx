import { useState } from 'react'
import { useWidth } from './useWidth.js'
import { investSeries, investFill, RANGES } from '../investView.js'
import { formatMoney } from '../ledgerLogic.js'
import { today } from '../today.js'
import { t } from '../text.js'

const RANGE_LABELS = { '1m': 'invest.rangeM1', '3m': 'invest.rangeM3', '6m': 'invest.rangeM6', '1y': 'invest.rangeY1', all: 'invest.rangeAll' }
const dayIndex = (ymd) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86400000)
const dateText = (ymd) => ymd.replaceAll('-', '/')

// 推移のグラフ：横は日付、縦は円。取得原価の線（買い・売りのたびに階段状）と、時価の線（価格を入れた日が点）。期間を選べる（初めは全部）。holdings の合計（銘柄 1 つなら、その銘柄）
export default function InvestChart({ data, holdings, currency, name }) {
  const [range, setRange] = useState('all')
  const [ref, width] = useWidth()
  const series = investSeries(data, holdings, range, today())
  const height = 220
  const left = 110, right = 24, top = 18, bottom = 28
  return <div className="b-inv-chart">
    <div className="b-inv-chart-head">
      <div className="b-inv-range" role="group" aria-label={t('invest.rangeAria')}>
        {RANGES.map((r) => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{t(RANGE_LABELS[r])}</button>)}
      </div>
      <ul className="b-inv-legend"><li><span className="sw cost" aria-hidden="true" />{t('invest.legendCost')}</li><li><span className="sw val" aria-hidden="true" />{t('invest.legendValue')}</li><li><span className="sw gain" aria-hidden="true" />{t('invest.legendGain')}</li><li><span className="sw loss" aria-hidden="true" />{t('invest.legendLoss')}</li></ul>
    </div>
    <div ref={ref} className="b-inv-chart-box">
      {series === null ? <p className="note">{t('invest.chartEmpty')}</p> : width > 0 && (() => {
        const first = dayIndex(series.start)
        const span = Math.max(1, dayIndex(series.end) - first)
        const xn = (n) => left + ((n - first) / span) * Math.max(1, width - left - right)
        const x = (d) => xn(dayIndex(d))
        const y = (v) => top + (1 - v / series.max) * (height - top - bottom)
        const step = series.cost.map((p, i) => (i === 0 ? `M${x(p.date)},${y(p.v)}` : `H${x(p.date)}V${y(p.v)}`)).join('')
        return <svg width={width} height={height} role="img" aria-label={t('invest.chartAria', { name, from: dateText(series.start), to: dateText(series.end) })}>
          <line className="b-loan-grid" x1={left} x2={width - right} y1={y(series.max)} y2={y(series.max)} />
          <line className="b-loan-zero" x1={left} x2={width - right} y1={y(0)} y2={y(0)} />
          <text x="0" y={y(series.max) + 4}>{formatMoney(series.max, currency)}</text>
          <text x="0" y={y(0) + 4}>{formatMoney(0, currency)}</text>
          {investFill(series).map((poly, i) => <polygon key={i} className={`b-inv-fill ${poly.sign}`} points={poly.pts.map((p) => `${xn(p.x)},${y(p.v)}`).join(' ')} />)}
          <path className="b-inv-line-cost" d={step} fill="none" />
          {series.value.length > 1 && <polyline className="b-inv-line-val" fill="none" points={series.value.map((p) => `${x(p.date)},${y(p.v)}`).join(' ')} />}
          {series.value.map((p) => <circle key={p.date} className="b-inv-dot-val" cx={x(p.date)} cy={y(p.v)} r="4"><title>{`${dateText(p.date)}　${formatMoney(p.v, currency)}`}</title></circle>)}
          <text x={left} y={height - 6} textAnchor="start">{dateText(series.start)}</text>
          <text x={width - right} y={height - 6} textAnchor="end">{dateText(series.end)}</text>
        </svg>
      })()}
    </div>
    {series !== null && series.value.length === 0 && <p className="note">{t('invest.chartNoPrice')}</p>}
  </div>
}
