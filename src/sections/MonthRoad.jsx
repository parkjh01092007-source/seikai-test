import { useLayoutEffect, useRef } from 'react'
import { t } from '../text.js'
import { formatMoney, roadScale, roadRatio, roadFloor } from '../ledgerLogic.js'

// 月の道（群青の PC の仕訳の帯 L。見本 design-ref/gunjo-pc/E-road-c.html の「新（C案）」。docs/formulas.md 11.5。数え方：roadDays〔dailyExpenses に固定費と変動費の内訳を足したもの〕）。
// 1か月の日の列。どの日も根元にベースラインがある。変動費のある日は、数字の上に垂直な光（長さは変動費。根元は帯の青に溶け、先端が明るい。幅は列の 20% を 6〜8px に収める。
// 基準は、変動費の中央値の 3 倍〔床は円 2,000・ウォン 20,000。roadScale〕で頭打ち、最低の高さ 8px）。固定費（科目の印 fixed）のある日は、光と同じ幅の青紺（#1A1AA0）の柱（1px の縁 #D6D5FF。根元から先端へ濃くなり、先端に控えめな輝き。高さは固定費の金額で変わる：基準は固定費の中央値の 3 倍〔変動費とは別〕、上限は光の最大の 60%、最低 8px）。
// 変動費もある日は、光と柱を左右に並べる。仕訳はあるが光も柱も出ない日（移動だけ・返品など）は短い点。入力していない日・これからの日はベースラインだけ。今日は白い光（または点）と ▼。
// 変動費が一番大きい日には、金額の札（大きい帯：光の上。小さい帯：光の右横。小さい帯では、実測して、ほかの光・柱・▼・要点・月の選び・マスに重なる、または道の外に出るときは出さない）。読み上げは、日ごとに title と aria-label が同じ文。下に凡例。動きはない
// 小さい帯（Entries.jsx が main-col に data-band-low を付ける）のとき、金額の札を光の横に出してよいかを測り、道に data-tag-ok を付ける（付かなければ CSS が札を隠す）。
// 札と重ねてはいけないもの：ほかの日の光・柱・▼、帯の中の要点・月の選び・マス・上の段（書き出し・読み込みなど）。道の右端を越えてもいけない
const AVOID = '.g-hero, .g-month, .g-masu, .g-top-extra'
function useTagFit(ref) {
  useLayoutEffect(() => {
    const road = ref.current
    const col = road?.closest('.main-col')
    if (!road || !col) return undefined
    const fit = () => {
      const tag = road.querySelector('.tag')
      if (!col.hasAttribute('data-band-low') || !tag) return road.removeAttribute('data-tag-ok')
      const a = tag.getBoundingClientRect()
      const hit = (b) => !(b.right <= a.left || b.left >= a.right || b.bottom <= a.top || b.top >= a.bottom)
      const own = tag.closest('.d')
      const band = road.closest('.g-band')
      const others = [...road.querySelectorAll('.ray, .fx, u')].filter((e) => e.closest('.d') !== own)
      const fixedOk = !others.some((e) => hit(e.getBoundingClientRect()))
      const bandOk = ![...(band ?? document).querySelectorAll(AVOID)].some((e) => hit(e.getBoundingClientRect()))
      const inside = a.right <= road.getBoundingClientRect().right
      return (fixedOk && bandOk && inside) ? road.setAttribute('data-tag-ok', '') : road.removeAttribute('data-tag-ok')
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(road)
    const mo = new MutationObserver(fit)
    mo.observe(col, { attributes: true, attributeFilter: ['data-band-low'] })
    return () => { ro.disconnect(); mo.disconnect() }
  })
}

// shape：「使っていない日」の、下線の上に重ねる図形（設定。none なら下線だけ。下線は、使っていない日に、いつも出る）
export default function MonthRoad({ road, currency, shape = 'none' }) {
  const roadRef = useRef(null)
  useTagFit(roadRef)
  const m = Number(road.month.slice(5))
  const label = (d) => {
    if (d.state === 'future') return t('entries.roadFuture', { day: d.day })
    if (d.noSpend) return t('entries.roadNoSpend', { day: d.day })
    if (d.state === 'blank') return t('entries.roadBlank', { day: d.day })
    if (d.state === 'open') return t('entries.roadOpen', { day: d.day })
    if (d.fixedAmount > 0) return t('entries.roadFixed', { day: d.day, amount: formatMoney(d.amount, currency), fixed: formatMoney(d.fixedAmount, currency) })
    return t('entries.roadDay', { day: d.day, amount: formatMoney(d.amount, currency) })
  }
  const { base } = roadScale(road.days, roadFloor(currency)) // 光の長さの基準（表示側で計算せず、純関数で）
  const { base: fixedBase } = roadScale(road.days, roadFloor(currency), 'fixedAmount') // 固定費の柱の高さの基準（変動費とは別）
  const top = road.days.reduce((best, d) => (d.variableAmount > (best?.variableAmount ?? 0) ? d : best), null) // 変動費が一番大きい日（同じ額なら、早い日）
  return (
    <>
      <div className="g-road" ref={roadRef} data-nospend={shape} role="list" aria-label={t('entries.roadLabel', { m })} style={{ gridTemplateColumns: `repeat(${road.days.length}, minmax(0, 1fr))` }}>
        {road.days.map((d) => {
          const ray = d.variableAmount > 0
          const line = d.fixedAmount > 0
          const mark = d.noSpend // 使っていない日（印があり、仕訳がない。下線は CSS がいつも描き、図形は data-nospend で重ねる）
          const dot = !ray && !line && !mark && (d.count > 0 || d.state === 'open') // 仕訳はあるが光も線も出ない日（と、まだ入力のない今日）。使っていない日の今日は、点でなく図形
          const k = ray ? roadRatio(d.variableAmount, base) : 0
          const kf = line ? roadRatio(d.fixedAmount, fixedBase) : 0
          return (
            <div key={d.day} role="listitem" className={`d${dot ? ' z' : ''}${mark ? ' n' : ''}${d.isToday ? ' t' : ''}${ray && line ? ' bt' : ''}`} title={label(d)} aria-label={label(d)} style={{ '--k': k.toFixed(3), '--kf': kf.toFixed(3) }}>
              {d.isToday && <u aria-hidden="true" />}
              {ray && <i className="ray" aria-hidden="true" />}
              {line && <b className="fx" aria-hidden="true" />}
              {top && d.day === top.day && <em className="tag" aria-hidden="true">{formatMoney(d.variableAmount, currency)}</em>}
              <span aria-hidden="true">{d.day}</span>
            </div>
          )
        })}
      </div>
      <div className="g-legend" data-nospend={shape} aria-hidden="true">
        <span><i className="lg-s" />{t('entries.legendSpend')}</span>
        <span><i className="lg-x" />{t('entries.legendFixed')}</span>
        <span><i className="lg-e" />{t('entries.legendBlank')}</span>
        <span><i className="lg-t" />{t('entries.legendToday')}</span>
        <span><i className="lg-n" />{t('entries.legendNoSpend')}</span>
      </div>
    </>
  )
}
