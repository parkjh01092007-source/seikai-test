import { useState } from 'react'
import { createPortal } from 'react-dom'
import './balance.css'
import './creditcard.css'
import CreditCardDetail from './CreditCardDetail.jsx'
import { cardReports, cardMonthTotal, addCard, previousMonth, formatYen, currencyUnit } from '../ledgerLogic.js'
import { toHash } from '../route.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBandHost } from './bandHost.js'
import { BandStat, signedYen } from './PageBand.jsx'
import { Icon } from './Icon.jsx'

const cardHash = (detailId) => toHash({ entry: 'ledger', tab: 'card', detailId }) // 一覧（null）／個別（カードの id）の # 。組み立ては route.js

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

// カードの追加。入力は消さない（エラーのとき）。日は前後の空白を取って渡す（検証は addCard）
function AddCardForm({ data, update }) {
  const [name, setName] = useState('')
  const [closing, setClosing] = useState('')
  const [pay, setPay] = useState('')
  const [error, setError] = useState('')
  const gunjoPc = useGunjoPc()

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

  // 群青の PC（見本 E-card）：ラベルを上に付けた欄（カード名は幅いっぱい、日は2列）と、大きい決定のボタン。説明は呼ぶ側が札の中に置く
  if (gunjoPc) {
    return (
      <form className="card-form g-form" onSubmit={submit}>
        <label className="fl g-wide"><span className="lab">{t('card.name')}</span><input placeholder={t('card.name')} aria-label={t('card.name')} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="fl"><span className="lab">{t('card.closingDayLabel')}</span><input className="day" inputMode="numeric" aria-label={t('card.closingDay')} value={closing} onChange={(e) => setClosing(e.target.value)} /></label>
        <label className="fl"><span className="lab">{t('card.payDayLabel')}</span><input className="day" inputMode="numeric" aria-label={t('card.payDay')} value={pay} onChange={(e) => setPay(e.target.value)} /></label>
        <button className="primary large g-wide"><Icon name="plus" />{t('card.add')}</button>
        {error && <span className="error g-wide">{error}</span>}
      </form>
    )
  }

  return (
    <>
    <form className="card-form" onSubmit={submit}>
      <input placeholder={t('card.name')} aria-label={t('card.name')} value={name} onChange={(e) => setName(e.target.value)} />
      <label>{t('card.closingDay')}{' '}<input className="day" inputMode="numeric" aria-label={t('card.closingDay')} value={closing} onChange={(e) => setClosing(e.target.value)} />{' '}{t('card.dayUnit')}</label>
      <label>{t('card.payDay')}{' '}<input className="day" inputMode="numeric" aria-label={t('card.payDay')} value={pay} onChange={(e) => setPay(e.target.value)} />{' '}{t('card.dayUnit')}</label>
      <button><Icon name="plus" />{t('card.add')}</button>
      {error && <span className="error">{error}</span>}
    </form>
    <p className="note">{t('card.closingDayHint')}</p>
    </>
  )
}

// detailId は # から来る（App が渡す）。null なら一覧
export default function CreditCard({ data, update, detailId = null }) {
  const gunjoPc = useGunjoPc()
  const bandHost = useBandHost()
  const now = today()
  const unit = currencyUnit(data.settings.currency)
  const reports = cardReports(data.accounts, data.entries, now)
  const selected = detailId === null ? undefined : reports.find((r) => r.account.id === detailId)

  // カードが消えたら（削除など）selected が見つからないので、一覧に戻る（# の書き換えは App がする）
  if (selected) {
    return (
      <div className={gunjoPc ? 'report g-rep' : 'report'}>
        <CreditCardDetail card={selected} backHref={cardHash(null)} unit={unit} />
      </div>
    )
  }

  const thisMonth = cardMonthTotal(data.accounts, data.entries, now.slice(0, 7))
  const lastMonth = cardMonthTotal(data.accounts, data.entries, previousMonth(now))

  if (gunjoPc) {
    return (
      <div className="report g-rep g-card-list">
        {bandHost && createPortal(<>
          <BandStat label={t('card.thisMonthHero', { month: thisMonth.month })} value={signedYen(thisMonth.amount, formatYen)} unit={unit} />
          <BandStat label={t('card.lastMonthHero', { month: lastMonth.month })} value={signedYen(lastMonth.amount, formatYen)} unit={unit} />
        </>, bandHost)}
        <section>
          <h2 className="g-h">{t('card.listTitle')}<small lang="en">{t('card.listEn')}</small></h2>
          {reports.length === 0 ? <p className="note">{t('card.empty')}</p> : (
            <ul className="cards g-cards">
              {reports.map((r) => (
                <li key={r.account.id}>
                  <a className={`card-button${r.account.active ? '' : ' inactive'}`} href={cardHash(r.account.id)}>
                    <span className="user-text">{r.account.name}{!r.account.active && t('common.inactive')}</span>
                    <span className="amount">{t('card.next')}{' '}<b className={r.next < 0 ? 'neg' : ''}>{signedYen(r.next, formatYen)}{unit}</b></span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="note">{t('card.totalNote')}</p>
        </section>
        <section className="g-card g-addcard">
          <h2 className="g-h">{t('card.add')}<small lang="en">{t('card.addEn')}</small></h2>
          <AddCardForm data={data} update={update} />
          <p className="note">{t('card.closingDayHint')} {t('card.newNote')}</p>
        </section>
      </div>
    )
  }

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
