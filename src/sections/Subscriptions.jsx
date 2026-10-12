import { useState } from 'react'
import './subscriptions.css'
import { AccountSelect } from './Entries.jsx'
import {
  entryAccountOptions, validateSubscriptionInput, newSubscription, editSubscription, setSubscriptionActive, formatMoney,
} from '../ledgerLogic.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useConfirm } from './ConfirmDialog.jsx'

const EMPTY = { name: '', memo: '', amount: '', day: '', debitId: '', creditId: '' }

// 登録・編集で共用。エラーのときは入力途中の内容を消さない。
// currentIds は編集フォームだけが渡す（その定期支払いが今使っている科目を選択肢に残す）
function SubscriptionForm({ accounts, initial, submitLabel, onSubmit, onCancel, currentIds, clearOnSuccess }) {
  const options = entryAccountOptions(accounts, currentIds)
  const phone = usePhone()
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    const r = validateSubscriptionInput({ ...f, amountText: f.amount, dayText: f.day }, accounts, currentIds)
    if (r.error) return setError(r.error)
    setError('')
    onSubmit(r)
    if (clearOnSuccess) setF(EMPTY)
  }

  return (
    <form onSubmit={submit}>
      <input placeholder={t('common.name')} aria-label={t('common.name')} value={f.name} onChange={(e) => set('name')(e.target.value)} />
      <input placeholder={t('subscriptions.memoPlaceholder')} aria-label={t('common.memo')} value={f.memo} onChange={(e) => set('memo')(e.target.value)} />
      <input inputMode="numeric" placeholder={t('common.amount')} aria-label={t('common.amount')} value={f.amount} onChange={(e) => set('amount')(e.target.value)} />
      <label>{t('subscriptions.every')}{' '}<input inputMode="numeric" className="day" aria-label={t('subscriptions.dayLabel')} value={f.day} onChange={(e) => set('day')(e.target.value)} />{' '}{t('subscriptions.dayUnit')}</label>
      <AccountSelect label={t('common.debit')} value={f.debitId} onChange={set('debitId')} options={options} />
      <AccountSelect label={t('common.credit')} value={f.creditId} onChange={set('creditId')} options={options} />
      {/* スマホの形の編集は、仕訳の編集画面（下から出る画面）と同じ左右の順番：左「やめる」、右「保存」（spec-mobile.md 11.3）。PC は今のまま（保存 → やめる） */}
      {phone && onCancel && <button type="button" className="sub-cancel" onClick={onCancel}>{t('entries.sheetClose')}</button>}
      <button className="sub-submit">{submitLabel}</button>
      {!phone && onCancel && <button type="button" onClick={onCancel}>{t('entries.sheetClose')}</button>}
      {error && <span className="error">{error}</span>}
    </form>
  )
}

function SubscriptionRow({ sub, accounts, currency, editing, onEdit, onCancel, onSave, onToggle, onDelete }) {
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  if (editing) {
    return (
      <li>
        <SubscriptionForm
          accounts={accounts}
          initial={{ name: sub.name, memo: sub.memo, amount: String(sub.amount), day: String(sub.day), debitId: sub.debitId, creditId: sub.creditId }}
          currentIds={[sub.debitId, sub.creditId]}
          submitLabel={t('common.save')}
          onSubmit={onSave}
          onCancel={onCancel}
        />
      </li>
    )
  }
  return (
    <li className={sub.active ? '' : 'inactive'}>
      <div>
        <strong>{sub.name}</strong>{' '}{t('subscriptions.summary', { day: sub.day, amount: formatMoney(sub.amount, currency), debit: name(sub.debitId), credit: name(sub.creditId) })}
        {!sub.active && <span className="note"> {t('common.inactive')}</span>}
      </div>
      {sub.memo && <div className="note">{sub.memo}</div>}
      <div className="note">{t('subscriptions.lastMonth', { month: sub.lastMonth })}</div>
      <div className="sub-actions">
        <button onClick={onEdit}>{t('common.edit')}</button>
        <button onClick={onToggle}>{sub.active ? t('common.disable') : t('common.enable')}</button>
        <button className="danger" onClick={onDelete}>{t('common.delete')}</button>
      </div>
    </li>
  )
}

export default function Subscriptions({ data, update }) {
  const { accounts, subscriptions } = data
  const [editingId, setEditingId] = useState(null)
  const confirm = useConfirm()
  const setSubscriptions = (next) => update({ ...data, subscriptions: next })

  const add = (input) => setSubscriptions([...subscriptions, newSubscription(input, today())])
  const save = (sub) => (input) => {
    setSubscriptions(subscriptions.map((s) => (s.id === sub.id ? editSubscription(s, input) : s)))
    setEditingId(null)
  }
  const toggle = (sub) => setSubscriptions(subscriptions.map((s) => (s.id === sub.id ? setSubscriptionActive(s, !s.active, today()) : s)))
  const remove = async (sub) => {
    if (!(await confirm({ message: t('subscriptions.deleteConfirm', { name: sub.name }) }))) return
    setSubscriptions(subscriptions.filter((s) => s.id !== sub.id))
  }

  return (
    <div className="subscriptions">
      <h2>{t('subscriptions.title')}</h2>
      <p className="note">
        {t('subscriptions.noteAuto')} {t('subscriptions.noteScope')}
      </p>
      <SubscriptionForm accounts={accounts} initial={EMPTY} submitLabel={t('subscriptions.register')} onSubmit={add} clearOnSuccess />
      {subscriptions.length === 0 ? <p className="note">{t('subscriptions.empty')}</p> : (
        <ul>
          {subscriptions.map((s) => (
            <SubscriptionRow
              currency={data.settings.currency}
              key={s.id}
              sub={s}
              accounts={accounts}
              editing={editingId === s.id}
              onEdit={() => setEditingId(s.id)}
              onCancel={() => setEditingId(null)}
              onSave={save(s)}
              onToggle={() => toggle(s)}
              onDelete={() => remove(s)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
