import { useState } from 'react'
import { createPortal } from 'react-dom'
import './subscriptions.css'
import { AccountSelect } from './Entries.jsx'
import {
  entryAccountOptions, validateSubscriptionInput, newSubscription, editSubscription, setSubscriptionActive, formatMoney, formatYen, currencyUnit,
} from '../ledgerLogic.js'
import { today } from '../today.js'
import { subscriptionMoons, nextRecord, monthlyTotal } from '../flowArt.js'
import { monthWindow } from '../bookPicker.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { useBandHost } from './bandHost.js'
import { BandStat } from './PageBand.jsx'
import { MoonRow, Moon } from './FlowParts.jsx'
import SubscriptionRing from './SubscriptionRing.jsx'
import { Icon, IconButton } from './Icon.jsx'

// 玉の凡例（案X。常に 1 行で出す）。玉の説明は文字で言う（色・形だけに頼らない）
const LEGEND = [['done', 'subscriptions.legendDone'], ['wait', 'subscriptions.legendWait'], ['before', 'subscriptions.legendBefore'], ['skip', 'subscriptions.legendSkip']]
function MoonLegend() {
  return (
    <div className="g-legend-moons" role="note" title={t('subscriptions.legendNote')}>
      <span className="t">{t('subscriptions.legendLabel')}</span>
      {LEGEND.map(([state, key]) => (
        <span key={state} className="i">
          <span className="g-moons"><span className="m"><svg viewBox="-10 -10 20 20" aria-hidden="true"><Moon state={state} /></svg></span></span>
          {t(key)}
        </span>
      ))}
    </div>
  )
}

const EMPTY = { name: '', memo: '', amount: '', day: '', debitId: '', creditId: '' }

// 登録・編集で共用。エラーのときは入力途中の内容を消さない。
// currentIds は編集フォームだけが渡す（その定期支払いが今使っている科目を選択肢に残す）
// 群青の PC（gunjoPc）だけ、見本の形：欄ごとにラベルを上に付け、決定のボタンは大きい（g-form。subscriptions の群青の規則は gunjo-pc.css）
function SubscriptionForm({ accounts, initial, submitLabel, submitIcon = 'plus', onSubmit, onCancel, currentIds, clearOnSuccess }) {
  const options = entryAccountOptions(accounts, currentIds)
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  const field = (label, control) => (gunjoPc ? <label className="fl"><span className="lab">{label}</span>{control}</label> : control)

  const submit = (e) => {
    e.preventDefault()
    const r = validateSubscriptionInput({ ...f, amountText: f.amount, dayText: f.day }, accounts, currentIds)
    if (r.error) return setError(r.error)
    setError('')
    onSubmit(r)
    if (clearOnSuccess) setF(EMPTY)
  }

  return (
    <form onSubmit={submit} className={gunjoPc ? 'g-form' : undefined}>
      {field(t('common.name'), <input placeholder={t('common.name')} aria-label={t('common.name')} value={f.name} onChange={(e) => set('name')(e.target.value)} />)}
      {field(t('subscriptions.memoPlaceholder'), <input placeholder={t('subscriptions.memoPlaceholder')} aria-label={t('common.memo')} value={f.memo} onChange={(e) => set('memo')(e.target.value)} />)}
      {field(t('common.amount'), <input inputMode="numeric" placeholder={t('common.amount')} aria-label={t('common.amount')} value={f.amount} onChange={(e) => set('amount')(e.target.value)} />)}
      {gunjoPc
        ? <label className="fl"><span className="lab">{t('subscriptions.every')}{' '}{t('subscriptions.dayUnit')}</span><input inputMode="numeric" className="day" aria-label={t('subscriptions.dayLabel')} value={f.day} onChange={(e) => set('day')(e.target.value)} /></label>
        : <label>{t('subscriptions.every')}{' '}<input inputMode="numeric" className="day" aria-label={t('subscriptions.dayLabel')} value={f.day} onChange={(e) => set('day')(e.target.value)} />{' '}{t('subscriptions.dayUnit')}</label>}
      {field(t('common.debit'), <AccountSelect label={t('common.debit')} value={f.debitId} onChange={set('debitId')} options={options} />)}
      {field(t('common.credit'), <AccountSelect label={t('common.credit')} value={f.creditId} onChange={set('creditId')} options={options} />)}
      {/* スマホの形の編集は、仕訳の編集画面（下から出る画面）と同じ左右の順番：左「やめる」、右「保存」（spec-mobile.md 11.3）。PC は今のまま（保存 → やめる） */}
      {phone && onCancel && <button type="button" className="sub-cancel" onClick={onCancel}><Icon name="close" />{t('entries.sheetClose')}</button>}
      <button className={gunjoPc && !onCancel ? 'sub-submit large' : 'sub-submit'}><Icon name={submitIcon} />{submitLabel}</button>
      {!phone && onCancel && <button type="button" onClick={onCancel}><Icon name="close" />{t('entries.sheetClose')}</button>}
      {error && <span className="error">{error}</span>}
    </form>
  )
}

function SubscriptionRow({ sub, accounts, currency, editing, moons, current, onEdit, onCancel, onSave, onToggle, onDelete }) {
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  if (editing) {
    return (
      <li>
        <SubscriptionForm
          accounts={accounts}
          initial={{ name: sub.name, memo: sub.memo, amount: String(sub.amount), day: String(sub.day), debitId: sub.debitId, creditId: sub.creditId }}
          currentIds={[sub.debitId, sub.creditId]}
          submitLabel={t('common.save')}
          submitIcon="check"
          onSubmit={onSave}
          onCancel={onCancel}
        />
      </li>
    )
  }
  const actions = (
    <div className="sub-actions">
      <IconButton icon="edit" label={t('common.edit')} withText={phone} onClick={onEdit} />
      <IconButton icon="trash" label={t('common.delete')} withText={phone} className="danger" onClick={onDelete} />
      <button onClick={onToggle}>{sub.active ? t('common.disable') : t('common.enable')}</button>
    </div>
  )
  if (gunjoPc) {
    // 群青の PC：左に毎月の日（大きく）、真ん中に名前・借方・貸方・メモ・最後に記入した月、右に金額とボタン。名前・メモ・科目名は、システムのゴシック（明朝の要素の外）
    return (
      <li className={sub.active ? '' : 'inactive'}>
        <div className="g-day">{t('subscriptions.every')}<b className="num">{sub.day}</b>{t('subscriptions.dayUnit')}</div>
        <div className="g-mid">
          <strong>{sub.name}</strong>{!sub.active && <span className="note"> {t('common.inactive')}</span>}
          <div className="note">{t('subscriptions.accounts', { debit: name(sub.debitId), credit: name(sub.creditId) })}{sub.memo && `　${sub.memo}`}</div>
          <div className="note">{t('subscriptions.lastMonth', { month: sub.lastMonth })}</div>
        </div>
        <div className="g-right">
          <div className="g-amount num">{formatMoney(sub.amount, currency)}</div>
          {actions}
        </div>
        <div className="g-moonline"><MoonRow moons={moons} current={current} label={t('subscriptions.moonsLabel')} /></div>
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
      {actions}
    </li>
  )
}

export default function Subscriptions({ data, update }) {
  const { accounts, subscriptions } = data
  const [editingId, setEditingId] = useState(null)
  const confirm = useConfirm()
  const gunjoPc = useGunjoPc()
  const bandHost = useBandHost() // 群青の PC の帯の、要点を入れる場所（ほかのときは null）
  const now = today()
  const nowMonth = now.slice(0, 7)
  const months = monthWindow(now).map((m) => m.ym)
  const setSubscriptions = (next) => update({ ...data, subscriptions: next })

  const [formOpen, setFormOpen] = useState(false) // 群青の PC の登録の札（<details>）。0 件のときだけ、いつも開く。登録できたら閉じる
  const add = (input) => {
    setSubscriptions([...subscriptions, newSubscription(input, today())])
    setFormOpen(false)
  }
  const save = (sub) => (input) => {
    setSubscriptions(subscriptions.map((s) => (s.id === sub.id ? editSubscription(s, input) : s)))
    setEditingId(null)
  }
  const toggle = (sub) => setSubscriptions(subscriptions.map((s) => (s.id === sub.id ? setSubscriptionActive(s, !s.active, today()) : s)))
  const remove = async (sub) => {
    if (!(await confirm({ message: t('subscriptions.deleteConfirm', { name: sub.name }) }))) return
    setSubscriptions(subscriptions.filter((s) => s.id !== sub.id))
  }

  const notes = <p className="note">{t('subscriptions.noteAuto')} {t('subscriptions.noteScope')}</p>
  const form = <SubscriptionForm accounts={accounts} initial={EMPTY} submitLabel={t('subscriptions.register')} onSubmit={add} clearOnSuccess />
  const list = subscriptions.length === 0 ? <p className="note">{t('subscriptions.empty')}</p> : (
    <ul>
      {subscriptions.map((s) => (
        <SubscriptionRow
          currency={data.settings.currency}
          key={s.id}
          sub={s}
          accounts={accounts}
          moons={gunjoPc ? subscriptionMoons(s, now, months) : undefined}
          current={nowMonth}
          editing={editingId === s.id}
          onEdit={() => setEditingId(s.id)}
          onCancel={() => setEditingId(null)}
          onSave={save(s)}
          onToggle={() => toggle(s)}
          onDelete={() => remove(s)}
        />
      ))}
    </ul>
  )
  if (gunjoPc) {
    // 群青の PC：帯に要点 3 つ（登録・毎月の合計・次の記入）。左の列に、登録の札（閉じた形。0 件のときだけ開く）・玉の凡例・一覧（行ごとに 12 か月の玉）。右の青い面に 12 か月の輪
    const empty = subscriptions.length === 0
    const next = nextRecord(subscriptions, now)
    const unit = currencyUnit(data.settings.currency)
    return (
      <div className="subscriptions g-subs">
        {bandHost && createPortal(
          <>
            <BandStat label={t('subscriptions.count')} value={subscriptions.length} unit={t('settings.countUnit')} />
            <BandStat label={t('subscriptions.monthlyTotal')} value={formatYen(monthlyTotal(subscriptions))} unit={unit} />
            <BandStat
              label={t('subscriptions.nextRecord', { name: next ? next.sub.name : '―' })}
              value={next ? `${Number(next.date.slice(5, 7))}/${Number(next.date.slice(8, 10))}` : t('subscriptions.nextNone')}
              unit={next ? t('subscriptions.daysLeft', { n: Math.max(0, next.daysLeft) }) : ''}
            />
          </>, bandHost)}
        <div className="g-subs-col">
          <details
            className={`g-card g-new${empty ? ' fixed' : ''}`}
            open={empty || formOpen}
            onToggle={(e) => { if (!empty) setFormOpen(e.currentTarget.open) }}
          >
            <summary onClick={empty ? (e) => e.preventDefault() : undefined}>
              <h2 className="g-h">{t('subscriptions.new')}<small lang="en">{t('subscriptions.newEn')}</small></h2>
            </summary>
            <div className="g-new-body">{notes}{form}</div>
          </details>
          <MoonLegend />
          {list}
        </div>
        <SubscriptionRing subs={subscriptions} today={now} />
      </div>
    )
  }
  return (
    <div className="subscriptions">
      {bandHost && createPortal(<BandStat label={t('subscriptions.count')} value={subscriptions.length} unit={t('settings.countUnit')} />, bandHost)}
      <h2>{t('subscriptions.title')}</h2>
      {notes}{form}
      {list}
    </div>
  )
}
