import { useState } from 'react'
import './balance.css'
import './creditcard.css'
import CreditCardDetail from './CreditCardDetail.jsx'
import { cardReports, cardMonthTotal, addCard, previousMonth, formatYen, currencyUnit } from '../ledgerLogic.js'
import { toHash } from '../route.js'
import { today } from '../today.js'
import { t } from '../text.js'

const cardHash = (detailId) => toHash({ entry: 'ledger', tab: 'card', detailId }) // 一覧（null）／個別（カードの id）の # 。組み立ては route.js

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

// カードの追加。入力は消さない（エラーのとき）。日は前後の空白を取って渡す（検証は addCard）
function AddCardForm({ data, update }) {
  const [name, setName] = useState('')
  const [closing, setClosing] = useState('')
  const [pay, setPay] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const r = addCard(data.accounts, { name, closingDayText: closing.trim(), payDayText: pay.trim() })
    if (r.error) return setError(r.error)
    setError('')
    update({ ...data, accounts: r.accounts })
    setName('')
    setClosing('')
    setPay('')
  }

  return (
    <>
    <form className="card-form" onSubmit={submit}>
      <input placeholder={t('card.name')} aria-label={t('card.name')} value={name} onChange={(e) => setName(e.target.value)} />
      <label>{t('card.closingDay')}{' '}<input className="day" inputMode="numeric" aria-label={t('card.closingDay')} value={closing} onChange={(e) => setClosing(e.target.value)} />{' '}{t('card.dayUnit')}</label>
      <label>{t('card.payDay')}{' '}<input className="day" inputMode="numeric" aria-label={t('card.payDay')} value={pay} onChange={(e) => setPay(e.target.value)} />{' '}{t('card.dayUnit')}</label>
      <button>{t('card.add')}</button>
      {error && <span className="error">{error}</span>}
    </form>
    <p className="note">{t('card.closingDayHint')}</p>
    </>
  )
}

// detailId は # から来る（App が渡す）。null なら一覧
export default function CreditCard({ data, update, detailId = null }) {
  const now = today()
  const unit = currencyUnit(data.settings.currency)
  const reports = cardReports(data.accounts, data.entries, now)
  const selected = detailId === null ? undefined : reports.find((r) => r.account.id === detailId)

  // カードが消えたら（削除など）selected が見つからないので、一覧に戻る（# の書き換えは App がする）
  if (selected) {
    return (
      <div className="report">
        <CreditCardDetail card={selected} backHref={cardHash(null)} unit={unit} />
      </div>
    )
  }

  const thisMonth = cardMonthTotal(data.accounts, data.entries, now.slice(0, 7))
  const lastMonth = cardMonthTotal(data.accounts, data.entries, previousMonth(now))

  return (
    <div className="report">
      <h2>{t('card.title')}</h2>
      <h3>{t('card.totalTitle')}</h3>
      <div className="table-box"><table>
        <tbody>
          <tr><td>{t('card.thisMonthRow', { month: thisMonth.month })}</td><td><Num n={thisMonth.amount} />{unit}</td></tr>
          <tr><td>{t('card.lastMonthRow', { month: lastMonth.month })}</td><td><Num n={lastMonth.amount} />{unit}</td></tr>
        </tbody>
      </table></div>
      <p className="note">{t('card.totalNote')}</p>
      <h3>{t('card.listTitle')}</h3>
      {reports.length === 0 ? <p className="note">{t('card.empty')}</p> : (
        <ul className="cards">
          {reports.map((r) => (
            <li key={r.account.id}>
              <a className={`card-button${r.account.active ? '' : ' inactive'}`} href={cardHash(r.account.id)}>
                <span>{r.account.name}{!r.account.active && t('common.inactive')}</span>
                <span className="amount">{t('card.next')}{' '}<Num n={r.next} />{unit}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <h3>{t('card.add')}</h3>
      <AddCardForm data={data} update={update} />
      <p className="note">{t('card.newNote')}</p>
    </div>
  )
}
