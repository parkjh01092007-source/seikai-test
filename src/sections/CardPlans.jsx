import { cardPayPlans, laterPeriods, periodRows, formatYen, payMarkText } from '../ledgerLogic.js'
import { t } from '../text.js'
import { useBasicPc } from '../basicPc.js'
import { Icon } from './Icon.jsx'

const monthLabel = (closingDate) => t('loans.monthLabel', { year: closingDate.slice(0, 4), month: Number(closingDate.slice(5, 7)) })
const LATER_ROWS = 4 // 先の請求の予定に出す行数

// クレカの個別ページ（基本の PC・スマホ）：まだ払っていない分。分割の仕訳ごと・リボの山・先の請求の予定。
// 分割・リボがなければ、何も出さない（今までと同じ画面）。card は cardReport の結果。計算は ledgerLogic.js
export default function CardPlans({ card, entries, unit }) {
  const basicPc = useBasicPc()
  const { installments, revolving } = cardPayPlans(card, entries)
  const later = laterPeriods(card.laterLines)
  if (installments.length === 0 && !revolving && card.later === 0) return null
  const money = (n) => `${formatYen(n)}${unit}`
  const rows = periodRows(later, card.lastClosing, card.payDay).slice(0, LATER_ROWS)
  const laterList = (
    <ul className="plan-later">
      {rows.map((p) => <li key={p.closingDate}><span>{p.label}</span><span>{p.payLabel}</span><b>{money(p.amount)}</b></li>)}
      {later.length > LATER_ROWS && <li className="plan-more">{t('card.periodsMore', { n: later.length - LATER_ROWS })}</li>}
    </ul>
  )
  const heading = basicPc ? <div className="b-section-head"><h3>{t('card.plansTitle')}</h3></div> : <h3>{t('card.plansTitle')}</h3>
  const fee = (amount, rate) => amount !== null && <span className="plan-fee">{t('card.planFee', { amount: money(amount), rate: t('loans.ratePerYear', { rate: String(rate / 100) }) })}</span>
  return (
    <section className="card-plans">
      {heading}
      <ul className="plan-list">
        {installments.map((p) => (
          <li key={p.entry.id} className="plan-row">
            <span className="plan-name"><span className="user-text">{p.entry.memo}</span><span className="pay-mark">{payMarkText(p.entry.pay)}</span></span>
            <span className="plan-left">{t('card.planLine', { left: p.left, monthly: money(p.monthly), month: monthLabel(p.endClosing) })}</span>
            <b className="plan-remain">{t('card.planRemain', { amount: money(p.remaining) })}</b>
            {fee(p.fee, p.rate ?? 0)}
          </li>
        ))}
        {revolving && (
          <li className="plan-row">
            <span className="plan-name"><span className="pay-mark">{t('entries.payMarkRevolving')}</span></span>
            <span className="plan-left">{t('card.planLine', { left: revolving.left, monthly: money(revolving.monthly), month: monthLabel(revolving.endClosing) })}</span>
            <b className="plan-remain">{t('card.planRemain', { amount: money(revolving.remaining) })}</b>
            {fee(revolving.fee, revolving.rate)}
          </li>
        )}
      </ul>
      {rows.length > 0 && (basicPc ? (
        <>
          <p className="plan-later-title">{t('card.laterTitle')}<b>{money(card.later)}</b></p>
          {laterList}
        </>
      ) : (
        // スマホ：初めは畳む（見出しの右に、開閉の印）
        <details className="plan-later-fold">
          <summary><span>{t('card.laterTitle')}</span><b>{money(card.later)}</b><Icon name="down" /></summary>
          {laterList}
        </details>
      ))}
      <p className="note">{t('card.laterNote')}</p>
    </section>
  )
}
