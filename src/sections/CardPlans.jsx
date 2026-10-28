import { cardPayPlans, formatYen } from '../ledgerLogic.js'
import { t } from '../text.js'
import { useBasicPhone } from '../basicPhone.js'
import PlanOverview from './PlanOverview.jsx'
import { planOverview } from '../planView.js'
import { today } from '../today.js'

const PHONE_BAR_MONTHS = 6 // スマホの棒の月数（PC は 12）

// クレカの個別ページ（基本の PC・スマホ）：まだ払っていない分。合計・割合・月ごとの棒・買い物ごとの進み（同じ部品 PlanOverview。スマホは縦に並べ、棒は 6 か月まで）。
// 分割・リボがなければ、何も出さない（今までと同じ画面）。card は cardReport の結果。計算は planView.js・ledgerLogic.js
export default function CardPlans({ card, entries, accounts, unit }) {
  const phone = useBasicPhone()
  const { installments, revolving } = cardPayPlans(card, entries)
  if (installments.length === 0 && !revolving && card.later === 0) return null
  const money = (n) => `${formatYen(n)}${unit}`
  const overview = planOverview([card], accounts, entries, phone ? PHONE_BAR_MONTHS : undefined, today())
  return (
    <section className="card-plans">
      {phone ? <h3>{t('card.plansTitle')}</h3> : <div className="b-section-head"><h3>{t('card.plansTitle')}</h3></div>}
      <PlanOverview overview={overview} money={money} phone={phone} />
    </section>
  )
}
