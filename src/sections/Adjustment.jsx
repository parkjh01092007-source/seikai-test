import { useState } from 'react'
import { createPortal } from 'react-dom'
import './adjustment.css'
import { groupByType, adjustmentRows, planAdjustment, formatMoney, currencyUnit } from '../ledgerLogic.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBandHost } from './bandHost.js'

export default function Adjustment({ data, update }) {
  const { accounts, entries } = data
  const currency = data.settings.currency
  const money = (n) => formatMoney(n, currency)
  const confirm = useConfirm()
  const [accountId, setAccountId] = useState('')
  const [actual, setActual] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const bandHost = useBandHost()
  const rows = adjustmentRows(accounts, entries)
  const balances = new Map(rows.map((r) => [r.account.id, r.balance]))

  const save = async (e) => {
    e.preventDefault()
    setMessage('')
    const plan = planAdjustment(accounts, entries, accountId, actual, today())
    if (plan.error) return setError(plan.error) // 入力途中の内容は消さない
    setError('')
    if (plan.none) return setMessage(t('adjustment.same', { name: plan.account.name }))
    const text = t('adjustment.confirm', { name: plan.account.name, current: money(plan.current), actual: money(plan.actual), diff: money(plan.diff), kind: plan.kindLabel, amount: money(plan.amount) })
    if (!(await confirm({ message: text }))) return
    update({ ...data, entries: plan.entries })
    setActual('')
    setMessage(t('adjustment.done', { kind: plan.kindLabel, amount: money(plan.amount) }))
  }

  // 群青の PC（見本 E-adjust）：帯に 1 文、左に札（科目・実際の残高・大きい決定のボタン）、右に説明。画面の名前は帯のマス。ほかの形は、下のまま
  if (gunjoPc) {
    return (
      <div className="adjustment g-adjust">
        {bandHost && createPortal(<p className="g-lead">{t('adjustment.lead')}</p>, bandHost)}
        <section className="g-card g-adj">
          <h2 className="g-h">{t('adjustment.cardTitle')}<small lang="en">{t('adjustment.cardTitleEn')}</small></h2>
          <form className="g-form" onSubmit={save}>
            <label className="fl"><span className="lab">{t('common.account')}</span>
              <select aria-label={t('common.account')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">{t('common.chooseAccount')}</option>
                {groupByType(rows.map((r) => r.account)).map((g) => (
                  <optgroup key={g.type} label={g.label}>
                    {g.accounts.map((a) => <option key={a.id} value={a.id}>{t('adjustment.optionLabel', { name: a.name, balance: money(balances.get(a.id)) })}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="fl"><span className="lab">{t('adjustment.actual')}</span>
              <span className="g-amount-row"><input inputMode="numeric" aria-label={t('adjustment.actual')} value={actual} onChange={(e) => setActual(e.target.value)} /><span>{currencyUnit(currency)}</span></span>
            </label>
            <button className="primary large">{t('adjustment.submit')}</button>
            {error && <span className="error" role="alert">{error}</span>}
            {message && <span className="note" role="status">{message}</span>}
          </form>
        </section>
        <div className="g-side">
          <p className="note">{t('adjustment.note')}</p>
          <p className="note">{t('adjustment.noteLocked')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="adjustment">
      <h2>{t('adjustment.title')}</h2>
      <p className="note">{t('adjustment.note')}</p>
      <form onSubmit={save}>
        <select aria-label={t('common.account')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">{t('common.chooseAccount')}</option>
          {groupByType(rows.map((r) => r.account)).map((g) => (
            <optgroup key={g.type} label={g.label}>
              {g.accounts.map((a) => <option key={a.id} value={a.id}>{phone ? a.name : t('adjustment.optionLabel', { name: a.name, balance: money(balances.get(a.id)) })}</option>)}
            </optgroup>
          ))}
        </select>
        {phone && (
          // スマホの幅（spec-mobile.md 第6章）：選択肢から残高を外し、科目を選んだあと、その下に今の残高を出す（読み上げでも伝わるよう、場所は先に置く）
          <p className="current note" role="status">{accountId && balances.has(accountId) ? t('adjustment.current', { balance: money(balances.get(accountId)) }) : ''}</p>
        )}
        <label>
          {t('adjustment.actual')}{' '}<input inputMode="numeric" aria-label={t('adjustment.actual')} value={actual} onChange={(e) => setActual(e.target.value)} />{currencyUnit(currency)}
        </label>
        <button>{t('adjustment.submit')}</button>
        {error && <span className="error">{error}</span>}
        {message && <span className="note">{message}</span>}
      </form>
      <p className="note">{t('adjustment.noteLocked')}</p>
    </div>
  )
}
