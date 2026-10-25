import './flow.css'
import { ringFractions, clockPoint } from '../flowArt.js'
import { monthWindow } from '../bookPicker.js'
import { t } from '../text.js'

const C = 200 // viewBox 400 の中心
const RING = 138 // 玉を置く円の半径
const R = 15 // 玉の半径
const LABEL = 168 // 月の数字を置く円の半径

// 輪の玉 1 つ。f：満ちた割合（0〜1）。total が 0 の月は点線の輪（記入されるはずの件数がない月）。f が 1 未満は、左から満ちる三日月（半分まで）〜凸の月（半分を超える）
function RingMoon({ f, total, pulse }) {
  if (total === 0) return <circle r={R} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 3.5" />
  const d = f >= 1
    ? `M0,${-R}A${R},${R} 0 1 1 0,${R}A${R},${R} 0 1 1 0,${-R}Z`
    : `M0,${-R}A${R},${R} 0 0 1 0,${R}A${(R * Math.abs(1 - 2 * f)).toFixed(2)},${R} 0 0 ${f < 0.5 ? 0 : 1} 0,${-R}Z`
  return (
    <g className={pulse ? 'pulse' : undefined}>
      <circle r={R} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.5" />
      {f > 0 && <path d={d} fill="#fff" />}
    </g>
  )
}

// 右の青い面の中身（案A：12 か月の輪）。時計の配置（12 月が真上・3 月が真右・6 月が真下・9 月が真左）。月ごとの「記入された件数／記入されるはずの件数」で玉が満ちる。今月は輪で囲み、中央に今月の件数。
// 面の枠（.g-side-panel）は gunjo-pc.css。文字は辞書（subscriptions.ring*）、計算は flowArt.js の ringFractions
export default function SubscriptionRing({ subs, today }) {
  const months = monthWindow(today).map((m) => m.ym)
  const rows = ringFractions(subs, today, months)
  const now = rows[rows.length - 1]
  const none = now.total === 0 // 今月は記入の対象がない（0 件・登録前・使わない間）：0／0 ではなく、文で言う
  const label = none ? t('subscriptions.ringNone') : `${t('subscriptions.ringNow')} ${now.done}${t('subscriptions.ringOf', { total: now.total })} ${t('subscriptions.ringDone')}`
  return (
    <div className="g-side-panel" role="img" aria-label={label}>
      <div className="g-side-stick">
      <div className="g-side-art" aria-hidden="true" />
      <div className="g-side-pin" aria-hidden="true">
        <div className="g-side-cap">{t('subscriptions.ringTitle')}<small lang="en">{t('subscriptions.ringTitleEn')}</small></div>
        <svg className="g-ring" viewBox="0 0 400 400">
          <circle cx={C} cy={C} r={RING} fill="none" stroke="#fff" strokeOpacity="0.18" />
          {rows.map((r, i) => {
            const m = Number(r.month.slice(5))
            const isNow = i === rows.length - 1
            const { x, y } = clockPoint(m, RING, C, C)
            const lp = clockPoint(m, LABEL, C, C)
            return (
              <g key={r.month}>
                <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
                  <RingMoon f={r.total ? r.done / r.total : 0} total={r.total} pulse={isNow && r.done < r.total} />
                </g>
                {isNow && <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r="22" fill="none" stroke="#fff" strokeWidth="1.5" />}
                <text x={lp.x.toFixed(2)} y={(lp.y + 4).toFixed(2)} textAnchor="middle" fontSize="12">{m}</text>
              </g>
            )
          })}
          {none ? <text className="big" x={C} y="206" textAnchor="middle" fontSize="20">{t('subscriptions.ringNone')}</text> : <>
            <text x={C} y="194" textAnchor="middle" fontSize="12" letterSpacing="4">{t('subscriptions.ringNow')}</text>
            <text className="big" x={C} y="246" textAnchor="middle" fontSize="58">{now.done}<tspan fontSize="24" dx="6">{t('subscriptions.ringOf', { total: now.total })}</tspan></text>
            <text x={C} y="276" textAnchor="middle" fontSize="13">{t('subscriptions.ringDone')}</text>
          </>}
        </svg>
        <div className="g-side-sub">{t('subscriptions.ringCaption')}</div>
      </div>
      </div>
    </div>
  )
}
