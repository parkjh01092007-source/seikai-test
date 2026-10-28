import { useState } from 'react'
import { changeCardRevolving, formatRate } from '../ledgerLogic.js'
import { t } from '../text.js'
import { useBasicPc } from '../basicPc.js'
import { Icon } from './Icon.jsx'

// クレカの個別ページ（基本の PC・スマホ）：リボの設定（毎月の支払い額・年率）。両方を空にして保存すると、設定をやめる。
// エラーのとき入力は消さない。検証と保存の中身は changeCardRevolving（ledgerLogic.js）
export default function CardRevolving({ account, data, update }) {
  const basicPc = useBasicPc()
  const rv = account.revolving
  const [monthly, setMonthly] = useState(rv ? String(rv.monthly) : '')
  const [rate, setRate] = useState(rv ? formatRate(rv.rate) : '')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const save = (e) => {
    e.preventDefault()
    setMessage('')
    const r = changeCardRevolving(data.accounts, account.id, { monthlyText: monthly, rateText: rate })
    if (r.error) return setError(r.error)
    setError('')
    update({ ...data, accounts: r.accounts })
    setMessage(t('common.saved'))
  }
  return (
    <section className="card-revolving">
      {basicPc ? <div className="b-section-head"><h3>{t('card.revolvingTitle')}</h3></div> : <h3>{t('card.revolvingTitle')}</h3>}
      <form onSubmit={save}>
        <label className={basicPc ? 'b-field' : 'field'}><span>{t('card.revolvingMonthly')}</span><input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></label>
        <label className={basicPc ? 'b-field' : 'field'}><span>{t('card.revolvingRate')}</span><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <button className={basicPc ? 'b-primary' : undefined}><Icon name="check" />{t('common.save')}</button>
        {error && <span className="error">{error}</span>}
        {message && <span className="note">{message}</span>}
      </form>
      <p className="note">{t('card.revolvingNote')}</p>
    </section>
  )
}
