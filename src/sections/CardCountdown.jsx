import CardMiniLine from './CardMiniLine.jsx'
import { lanePos, shortDate } from '../flowArt.js'
import { formatYen } from '../ledgerLogic.js'
import { t } from '../text.js'

// 一覧の右の青い面：引き落としまでの日数。next は flowArt.js の nextPayLane の結果 { card, lane }（引き落とし前のレーンのうち、いちばん近いもの。
// 負の日数は出さない）。面の枠（.g-side-panel）は gunjo-pc.css。未確定の期間が相手のときは、字の最後に「（未確定）」
export default function CardCountdown({ next, today, unit }) {
  const { card, lane } = next
  const days = t('card.payLeft', { n: lane.left })
  const at = days.indexOf(String(lane.left))
  const [before, after] = [days.slice(0, at), days.slice(at + String(lane.left).length)] // 「あと｜16｜日」「｜16｜일 남음」：数字だけ大きく
  const args = { date: shortDate(lane.payDate, today), amount: `${formatYen(lane.amount)}${unit}` }
  const MARK = String.fromCharCode(1) // カード名の場所の目印
  const [pre, post] = t('card.countdownLine', { name: MARK, ...args }).split(MARK) // カード名（自分の入力）は、システムのゴシック（user-text）で出す
  const tail = lane.open ? t('card.unconfirmed') : ''
  const aria = `${t('card.countdownTitle')} ${days}　${t('card.countdownLine', { name: card.account.name, ...args })}${tail}`
  return (
    <div className="g-side-panel" role="img" aria-label={aria}>
      <div className="g-side-stick">
        <div className="g-side-art" aria-hidden="true" />
        <div className="g-side-pin" aria-hidden="true">
          <div className="g-side-cap">{t('card.countdownTitle')}<small lang="en">{t('card.countdownEn')}</small></div>
          <div className="g-count">{before}<b>{lane.left}</b>{after}</div>
          <div className="g-side-sub">{pre}<span className="user-text">{card.account.name}</span>{post}{tail}</div>
          <CardMiniLine
            onBlue
            left={t('ledger.closingLabel', { date: shortDate(lane.closingDate, today) })}
            right={t('ledger.payLabel', { date: shortDate(lane.payDate, today) })}
            pos={lanePos(lane, today)}
          />
        </div>
      </div>
    </div>
  )
}
