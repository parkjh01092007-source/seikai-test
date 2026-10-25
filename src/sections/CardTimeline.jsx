import { useWidth } from './useWidth.js'
import { cardLanes, timelineScale, periodStatus, shortDate } from '../flowArt.js'
import { formatYen } from '../ledgerLogic.js'
import { StateTag } from './FlowParts.jsx'
import { addMonths } from '../bookPicker.js'
import { t } from '../text.js'

const LANE = 100 // レーン 1 本の高さ。見出し・帯と旗・◇・引き落とし日の字の 4 段
const WRAP = 24 // 見出しと札が横に並ばないとき、札を見出しの下の段に落とす分
const TOP = 70 // 月の目盛りと「今日」の札の分
const est = (s) => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 13 : 7), 0) // 字の幅の見積り（13px の字。日本語・韓国語は全角、数字・記号は半角）

// 右の青い面の時間軸（案A「請求の時間軸」）：請求期間 1 本につき 1 レーン（古い順）。帯＝その期間の利用（旗が締め日）、◇＝引き落とし日。
// 未確定の期間（まだ締まっていない）は、帯・旗・引き落としの線が点線で、見出しに「（未確定）」。確定は白い札、引き落とし済みは無色の判子（札は表と同じ字・同じ形）。
// 幅は入れ物に合わせて測り、字は実寸（12〜13px）で描く。面が狭くて隠れている間（幅 0）は何も描かない。枠（.g-side-panel）は gunjo-pc.css
export default function CardTimeline({ card, today, unit }) {
  const [ref, W] = useWidth()
  const lanes = cardLanes(card, today, 3)
  const scale = timelineScale(lanes, today)
  const X = (date) => scale.at(date) * (W - 14) + 4
  const heads = lanes.map((l) => `${t('ledger.closingLabel', { date: shortDate(l.closingDate, today) })}　${formatYen(l.amount)}${unit}${l.open ? t('card.unconfirmed') : ''}`)
  const tagW = (l) => (l.open ? 0 : (periodStatus(l) === 'paid' ? t('card.statusPaid').length * 12 + 34 : t('card.statusClosed').length * 12 + 24))
  const wraps = lanes.map((l, i) => tagW(l) > 0 && est(heads[i]) + tagW(l) + 10 > W)
  const ys = []
  let y = TOP
  lanes.forEach((_, i) => { ys.push(y); y += LANE + (wraps[i] ? WRAP : 0) })
  const H = y
  const months = Array.from({ length: 6 }, (_, k) => `${addMonths(scale.from.slice(0, 7), k)}-01`).filter((m) => m > scale.from && m <= scale.to) // 月の初めの目盛り
  const todayText = t('card.today', { date: shortDate(today, today) })
  const chipW = est(todayText) + 14
  const tx = W > 0 ? X(today) : 0
  const cx = Math.max(0, Math.min(W - chipW, tx - chipW / 2))
  return (
    <div className="g-side-panel" role="img" aria-label={t('card.timelineAria', { n: lanes.length })}>
      <div className="g-side-stick">
        <div className="g-side-art" aria-hidden="true" />
        <div className="g-side-pin" aria-hidden="true">
          <div className="g-side-cap">{t('card.timelineTitle')}<small lang="en">{t('card.timelineEn')}</small></div>
          <div ref={ref} className="g-tl" style={{ height: W > 0 ? H : undefined }}>
            {W > 0 && (
              <>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
                  {months.map((m) => (
                    <g key={m}>
                      <line className="grid" x1={X(m)} x2={X(m)} y1="46" y2={H} />
                      <text className="tick" x={X(m) + 4} y="58">{t('card.tickMonth', { m: Number(m.slice(5, 7)) })}</text>
                    </g>
                  ))}
                  {lanes.map((l, i) => {
                    const st = periodStatus(l)
                    const open = st === 'open'
                    const paid = st === 'paid'
                    const y0 = ys[i]
                    const dy = wraps[i] ? WRAP : 0
                    const a = X(l.start)
                    const b = X(l.closingDate)
                    const p = X(l.payDate)
                    const label = `${t('ledger.payLabel', { date: shortDate(l.payDate, today) })}${paid ? '' : `　${t('card.payLeft', { n: l.left })}`}`
                    const lw = est(label)
                    const flip = p + 8 - lw < 0
                    return (
                      <g key={l.closingDate} className={`lane ${st}`}>
                        <text className="head" x="0" y={y0 + 14}>{heads[i]}</text>
                        <rect className="band" x={a} y={y0 + 28 + dy} width={Math.max(0, b - a)} height="18" />
                        <line className="flagpole" x1={b} x2={b} y1={y0 + 22 + dy} y2={y0 + 52 + dy} />
                        <path className="flag" d={`M${b},${y0 + 22 + dy}h9l-3,4 3,4h-9z`} />
                        <path className="elbow" d={`M${b},${y0 + 46 + dy}V${y0 + 66 + dy}H${p - 8}`} />
                        <path className="pay" d={`M${p - 8},${y0 + 66 + dy}l8,-8 8,8 -8,8z`} />
                        <text className="paylabel" x={flip ? 0 : p + 8} y={y0 + 90 + dy} textAnchor={flip ? 'start' : 'end'}>{label}</text>
                      </g>
                    )
                  })}
                  <line className="today" x1={tx} x2={tx} y1="34" y2={H} />
                  <rect className="chip" x={cx} y="12" width={chipW} height="22" />
                  <text className="chip-text" x={cx + chipW / 2} y="28" textAnchor="middle">{todayText}</text>
                </svg>
                {lanes.map((l, i) => {
                  const st = periodStatus(l)
                  if (st === 'open') return null
                  return (
                    <span key={l.closingDate} className="g-lane-tag" style={{ top: ys[i] + (wraps[i] ? 18 : 3) }}>
                      {st === 'paid'
                        ? <StateTag tone="stamp" title={t('card.statusPaidHint')}>{t('card.statusPaid')}</StateTag>
                        : <StateTag tone="solid-light">{t('card.statusClosed')}</StateTag>}
                    </span>
                  )
                })}
              </>
            )}
          </div>
          <div className="g-side-sub g-tl-legend">{t('card.timelineLegend')}</div>
        </div>
      </div>
    </div>
  )
}
