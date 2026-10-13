import { useState } from 'react'
import { cardAccounts, changeCardDays } from '../ledgerLogic.js'
import { t } from '../text.js'
import { Icon } from './Icon.jsx'

// カード1枚分：締め日・引き落とし日の入力と保存。エラーのとき入力は消さない。日は前後の空白を取って渡す（検証は changeCardDays）
function CardRow({ account, data, update }) {
  const [closing, setClosing] = useState(String(account.closingDay))
  const [pay, setPay] = useState(String(account.payDay))
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const save = (e) => {
    e.preventDefault()
    setMessage('')
    const r = changeCardDays(data.accounts, account.id, { closingDayText: closing.trim(), payDayText: pay.trim() })
    if (r.error) return setError(r.error)
    setError('')
    update({ ...data, accounts: r.accounts })
    setMessage(t('common.saved'))
  }

  return (
    <li className={account.active ? 'card-row' : 'card-row inactive'}>
      <form onSubmit={save}>
        <strong>{account.name}</strong>{!account.active && <span className="note"> {t('common.inactive')}</span>}{' '}
        <label><span className="lbl">{t('card.closingDay')}</span>{' '}<input inputMode="numeric" className="day" aria-label={t('cardSettings.closingAria', { name: account.name })} size={3} value={closing} onChange={(e) => setClosing(e.target.value)} />{' '}{t('card.dayUnit')}</label>{' '}
        <label><span className="lbl">{t('card.payDay')}</span>{' '}<input inputMode="numeric" className="day" aria-label={t('cardSettings.payAria', { name: account.name })} size={3} value={pay} onChange={(e) => setPay(e.target.value)} />{' '}{t('card.dayUnit')}</label>{' '}
        <button><Icon name="check" />{t('common.save')}</button>
        {error && <span className="error"> {error}</span>}
        {message && <span className="note"> {message}</span>}
      </form>
    </li>
  )
}

export default function CardSettings({ data, update }) {
  const cards = cardAccounts(data.accounts)
  return (
    <section>
      <p className="note">{t('cardSettings.note')}</p>
      {cards.length === 0 ? <p className="note">{t('card.empty')}</p> : (
        <ul className="card-list">
          {cards.map((a) => <CardRow key={a.id} account={a} data={data} update={update} />)}
        </ul>
      )}
    </section>
  )
}
