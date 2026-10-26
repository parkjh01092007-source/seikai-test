import { formatYen } from '../ledgerLogic.js'
import { t } from '../text.js'
import { StateTag } from './FlowParts.jsx'

// 貯蓄（群青 PC）の「今月の目標」の札。全科目の合計 1 枚（使う設定の科目で、目標を決めたものだけ）。科目ごとの内訳は「内訳 ▾」に畳む。
// card は savingsRose.js の goalCard の結果。計算は新しく持たない（％は 0 へ切り捨て済み）。予算の画面の科目ごとの％とは別の値なので、「全科目の合計」と書く
export default function SavingsGoalCard({ card, unit }) {
  const { total, rows } = card
  if (!total) return <div className="g-sv-goal"><b className="hl">{t('savings.goalCardLabel')}</b><p className="note">{t('savings.goalNone')}</p></div>
  const bar = Math.min(1, Math.max(0, total.actual / total.budget))
  return (
    <div className="g-sv-goal">
      <div className="row">
        <b className="hl">{t('savings.goalCardLabel')}</b>
        <small>{t('savings.goalCardTitle')}</small>
        <span className="big">{formatYen(total.actual)}<small>{unit}</small></span>
        <span className="hl">/ {formatYen(total.budget)}{unit}</span>
        <StateTag tone="live" title={t('savings.goalRateNote')}>{t('savings.goalCardRate', { rate: total.rate })}</StateTag>
      </div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${(bar * 100).toFixed(1)}%` }} /></div>
      <p className="note">{total.shortfall > 0 ? t('savings.goalLeft', { amount: `${formatYen(total.shortfall)}${unit}` }) : t('savings.goalDone')}</p>
      <details className="g-sv-aux">
        <summary>{t('savings.goalDetail')} ▾</summary>
        <ul>
          {rows.map((r) => (
            <li key={r.account.id}>
              <span className="user-text">{r.account.name}</span>
              <span>{formatYen(r.actual)} / {formatYen(r.budget)}{unit}</span>
              <StateTag tone="live">{t('savings.goalCardRate', { rate: r.rate })}</StateTag>
            </li>
          ))}
        </ul>
        <p className="note">{t('savings.goalCountNote')}</p>
        <p className="note">{t('savings.goalRateNote')}</p>
      </details>
    </div>
  )
}
