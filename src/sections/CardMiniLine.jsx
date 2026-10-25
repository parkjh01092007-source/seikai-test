import { useWidth } from './useWidth.js'
import { t } from '../text.js'

// クレカの小さな線：最後の締め日（左の旗）→ 引き落とし日（右の◇）。今日の位置に点。引き落とし日が過ぎたカード（paid）は、線を満たして◇を塗り、点と「あと N 日」は出さない。
// 一覧のカードと、追加フォームの線と、右の青い面のカウントダウンで使う（onBlue）。幅は入れ物に合わせて測り、字は実寸（12px）で描く。
// left・right は呼ぶ側が作った字（締め日・引き落とし日。辞書の ledger.closingLabel・ledger.payLabel・card.payLeft）。pos は 0〜1（flowArt.js の lanePos・payCountdown）
export default function CardMiniLine({ left, right, pos, paid = false, onBlue = false }) {
  const [ref, w] = useWidth()
  const x = 10 + (w - 20) * (paid ? 1 : pos)
  const todayX = Math.min(Math.max(x, 24), w - 24)
  return (
    <div ref={ref} className={`g-mini${onBlue ? ' on-blue' : ''}`} role="img" aria-label={`${left}　${right}`}>
      {w > 0 && (
        <svg width={w} height="54" viewBox={`0 0 ${w} 54`} aria-hidden="true">
          <line className="base" x1="10" x2={w - 10} y1="22" y2="22" />
          <line className="done" x1="10" x2={x} y1="22" y2="22" />
          <path className="flag" d="M10,14v16" />
          <path className={`pay${paid ? ' paid' : ''}`} d={`M${w - 10},15l7,7 -7,7 -7,-7z`} />
          {!paid && <circle className="now" cx={x} cy="22" r="6" />}
          {!paid && <text className="now-text" x={todayX} y="12" textAnchor="middle">{t('card.today', { date: '' }).trim()}</text>}
          <text x="10" y="46">{left}</text>
          <text x={w - 10} y="46" textAnchor="end">{right}</text>
        </svg>
      )}
    </div>
  )
}
