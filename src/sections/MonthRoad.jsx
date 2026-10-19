import { t } from '../text.js'
import { formatMoney } from '../ledgerLogic.js'

const RAY_UNIT = 6000 // その月の費用の最大が 0 のときだけ使う基準（光は出ないので、実際は使われない）。光の長さの基準は、その月の日ごとの費用の最大（本人の決め。2026-10-19）

// 月の道（群青の PC の仕訳の帯 L。見本 E-entries の棒を、「光の長さが金額」の光に変えた。design-ref/gunjo-pc/E-road-options3・4.html。数え方：dailyExpenses）。
// 1か月の日の列：費用のある日は、数字の上に垂直な細い光（根元は帯の青に溶け、先端が明るい。長さと、先端の明るさ・滲み・横線は、その月の最大の日に対する割合が大きいほど強い）、
// 仕訳はあるが費用がない日（移動だけ・返品など）は短い欠片、入力していない過去の日は縁だけの欠片、これからの日は極小の欠片、今日は白い太い光（淡いグロー）と ▼。
// 一番大きい日には、金額の札。読み上げは、日ごとに title と aria-label が同じ文。下に凡例。動きはない
export default function MonthRoad({ road, currency }) {
  const m = Number(road.month.slice(5))
  const label = (d) => {
    if (d.state === 'future') return t('entries.roadFuture', { day: d.day })
    if (d.state === 'blank') return t('entries.roadBlank', { day: d.day })
    if (d.state === 'open') return t('entries.roadOpen', { day: d.day })
    return t('entries.roadDay', { day: d.day, amount: formatMoney(d.amount, currency) })
  }
  const cls = { spend: 's', flat: 'z', blank: 'e', future: 'f', open: 'z' }
  const maxBar = Math.max(0, ...road.days.map((d) => d.bar)) // その月の日ごとの費用の最大。光の長さと先端の強さの基準（表示側で計算。dailyExpenses の返す値は変えない）
  const base = maxBar > 0 ? maxBar : RAY_UNIT // 最大が 0 の月は 6,000円のまま
  const top = road.days.reduce((best, d) => (d.state === 'spend' && d.amount > (best?.amount ?? 0) ? d : best), null) // 一番大きい日（同じ額なら、早い日）
  return (
    <>
      <div className="g-road" role="list" aria-label={t('entries.roadLabel', { m })} style={{ gridTemplateColumns: `repeat(${road.days.length}, minmax(0, 1fr))` }}>
        {road.days.map((d) => {
          const k = d.state === 'spend' ? Math.min(d.bar / base, 1) : 0
          return (
            <div key={d.day} role="listitem" className={`d ${cls[d.state]}${d.isToday ? ' t' : ''}`} title={label(d)} aria-label={label(d)} style={{ '--k': k.toFixed(3) }}>
              {d.isToday && <u aria-hidden="true" />}
              {d.state === 'spend' && <i className="ray" aria-hidden="true" />}
              {top && d.day === top.day && <em className="tag" aria-hidden="true">{formatMoney(d.amount, currency)}</em>}
              <span aria-hidden="true">{d.day}</span>
            </div>
          )
        })}
      </div>
      <div className="g-legend" aria-hidden="true">
        <span><i className="lg-s" />{t('entries.legendSpend')}</span>
        <span><i className="lg-e" />{t('entries.legendBlank')}</span>
        <span><i className="lg-f" />{t('entries.legendFuture')}</span>
        <span><i className="lg-t" />{t('entries.legendToday')}</span>
      </div>
    </>
  )
}
