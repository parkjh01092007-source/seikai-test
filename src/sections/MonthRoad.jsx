import { t } from '../text.js'
import { formatMoney } from '../ledgerLogic.js'

const BAR_MAX = 52 // 棒の一番高い値（px）。費用 ÷ 6,000円 × 52px（それ以上は頭打ち）
const BAR_UNIT = 6000

// 月の道（群青の PC の帯 L の一番下。見本 E-entries。数え方：dailyExpenses）。1か月の日の列：費用のある日は棒、仕訳はあるが費用がない日（移動だけ・返品など）は細い線、
// 入力していない過去の日は点線の枠、これからの日は点線、今日は白い棒と ▼（まだ入力がない今日は白い細い線と ▼）。読み上げは、日ごとに title と aria-label が同じ文。下に凡例
export default function MonthRoad({ road, currency }) {
  const m = Number(road.month.slice(5))
  const label = (d) => {
    if (d.state === 'future') return t('entries.roadFuture', { day: d.day })
    if (d.state === 'blank') return t('entries.roadBlank', { day: d.day })
    if (d.state === 'open') return t('entries.roadOpen', { day: d.day })
    return t('entries.roadDay', { day: d.day, amount: formatMoney(d.amount, currency) })
  }
  const cls = { spend: 's', flat: 'z', blank: 'e', future: 'f', open: 'z' }
  return (
    <>
      <div className="g-road" role="list" aria-label={t('entries.roadLabel', { m })} style={{ gridTemplateColumns: `repeat(${road.days.length}, minmax(0, 1fr))` }}>
        {road.days.map((d) => (
          <div key={d.day} role="listitem" className={`d ${cls[d.state]}${d.isToday ? ' t' : ''}`} title={label(d)} aria-label={label(d)}>
            {d.isToday && <u aria-hidden="true" />}
            <i aria-hidden="true" style={d.state === 'spend' ? { height: `${Math.max(2, Math.round(Math.min(d.bar / BAR_UNIT, 1) * BAR_MAX))}px` } : undefined} />
            <span aria-hidden="true">{d.day}</span>
          </div>
        ))}
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
