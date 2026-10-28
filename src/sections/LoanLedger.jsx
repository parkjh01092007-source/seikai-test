import { useState } from 'react'
import { formatMoney } from '../ledgerLogic.js'
import { loanEntries, plannedRepayment, plannedReceipt, repaidThisMonth, receivedThisMonth, cashAccounts, confirmNote, recordRepayment, recordReceipt, editLoanEntry } from '../loanView.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { IconButton } from './Icon.jsx'

const Field = ({ label, children }) => <label className="b-field"><span>{label}</span>{children}</label>
const textOf = (n) => (n > 0 ? String(n) : '')
const firstCash = (data) => { const list = cashAccounts(data.accounts); return (list.find((a) => a.preset === 'bank') ?? list[0])?.id ?? '' }

// 返済の記録フォーム。予定を初めの値に入れる。予定と違う・今月すでにあるときは、1 行の確認を出して、もう一度押すと記録する（警告にはしない）
function RepayForm({ data, update, loan, balance, currency }) {
  const date0 = today()
  const planned0 = plannedRepayment(loan, balance, date0.slice(0, 7))
  const [f, setF] = useState({ date: date0, principal: textOf(planned0.principal), interest: textOf(planned0.interest), fromId: firstCash(data) })
  const [ask, setAsk] = useState('')
  const [error, setError] = useState('')
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setAsk(''); setError('') }
  const submit = (e) => {
    e.preventDefault()
    const r = recordRepayment(data, loan, { date: f.date, principalText: f.principal, interestText: f.interest, fromId: f.fromId })
    if (r.error) { setError(r.error); return }
    const month = f.date.slice(0, 7)
    const note = ask === '' ? confirmNote({ planned: plannedRepayment(loan, balance, month).payment, amount: r.added.reduce((n, x) => n + x.amount, 0), again: repaidThisMonth(data, loan, month), currency }) : null
    if (note) { setAsk(note); return }
    update({ ...data, accounts: r.accounts, entries: r.entries })
  }
  return <form className="b-loan-form" onSubmit={submit}>
    <h4>{t('loans.repayTitle')}</h4>
    <div className="b-loan-fields">
      <Field label={t('loans.date')}><input type="date" value={f.date} onChange={set('date')} /></Field>
      <Field label={t('loans.principal')}><input inputMode="numeric" value={f.principal} onChange={set('principal')} /></Field>
      <Field label={t('loans.interest')}><input inputMode="numeric" value={f.interest} onChange={set('interest')} /></Field>
      <Field label={t('loans.payFrom')}><select value={f.fromId} onChange={set('fromId')}>{cashAccounts(data.accounts).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    </div>
    {ask && <p className="note" role="status">{ask}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="b-loan-actions"><button className="b-primary">{t(ask ? 'loans.recordAnyway' : 'loans.recordRepay')}</button></div>
  </form>
}

// 受け取りの記録フォーム（借り始め・奨学金の毎月の受け取り）
function ReceiptForm({ data, update, loan, currency }) {
  const date0 = today()
  const [f, setF] = useState({ date: date0, amount: textOf(plannedReceipt(loan, date0.slice(0, 7))), toId: firstCash(data) })
  const [ask, setAsk] = useState('')
  const [error, setError] = useState('')
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setAsk(''); setError('') }
  const submit = (e) => {
    e.preventDefault()
    const r = recordReceipt(data, loan, { date: f.date, amountText: f.amount, toId: f.toId })
    if (r.error) { setError(r.error); return }
    const month = f.date.slice(0, 7)
    const planned = plannedReceipt(loan, month)
    const note = ask === '' ? confirmNote({ planned, amount: r.entries.at(-1).amount, again: planned > 0 && receivedThisMonth(data, loan, month), currency, receipt: true }) : null
    if (note) { setAsk(note); return }
    update({ ...data, entries: r.entries })
  }
  return <form className="b-loan-form" onSubmit={submit}>
    <h4>{t('loans.receiveTitle')}</h4>
    <div className="b-loan-fields">
      <Field label={t('loans.date')}><input type="date" value={f.date} onChange={set('date')} /></Field>
      <Field label={t('loans.receiveAmount')}><input inputMode="numeric" value={f.amount} onChange={set('amount')} /></Field>
      <Field label={t('loans.receiveTo')}><select value={f.toId} onChange={set('toId')}>{cashAccounts(data.accounts).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    </div>
    {ask && <p className="note" role="status">{ask}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="b-loan-actions"><button className="b-primary">{t(ask ? 'loans.recordAnyway' : 'loans.recordReceive')}</button></div>
  </form>
}

const TYPE_LABELS = { repay: 'loans.rowRepay', receive: 'loans.rowReceive', interest: 'loans.rowInterest' }
const KIND_ROW = { opening: 'loans.rowOpening', adjustment: 'loans.rowAdjust' }

function Row({ row, data, update, currency, readOnly }) {
  const { entry, type } = row
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ date: entry.date, amount: String(entry.amount), memo: entry.memo })
  const [error, setError] = useState('')
  const label = entry.kind === 'normal' ? t(TYPE_LABELS[type]) : t(KIND_ROW[entry.kind])
  const save = (e) => {
    e.preventDefault()
    const r = editLoanEntry(data.entries, entry.id, { date: f.date, amountText: f.amount, memo: f.memo })
    if (r.error) { setError(r.error); return }
    update({ ...data, entries: r.entries })
    setEditing(false)
    setError('')
  }
  const del = async () => {
    if (await confirm({ message: t('entries.deleteConfirm') })) update({ ...data, entries: data.entries.filter((x) => x.id !== entry.id) })
  }
  if (editing) {
    return <li className="b-loan-erow editing">
      <form onSubmit={save}>
        <div className="b-loan-fields">
          <Field label={t('loans.date')}><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t('loans.amount')}><input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label={t('loans.memo')}><input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} /></Field>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="b-loan-actions">
          <button className="b-primary">{t('common.save')}</button>
          <button type="button" onClick={() => { setEditing(false); setError('') }}>{t('loans.cancel')}</button>
        </div>
      </form>
    </li>
  }
  return <li className="b-loan-erow">
    <span className="d">{entry.date}</span>
    <span className="k">{label}</span>
    <span className="m user-text">{entry.memo}</span>
    <span className="a">{formatMoney(entry.amount, currency)}</span>
    {!readOnly && <span className="ops">{entry.kind === 'normal' && <>
      <IconButton icon="edit" label={t('common.edit')} onClick={() => setEditing(true)} />
      <IconButton icon="trash" className="b-danger" label={t('common.delete')} onClick={del} />
    </>}</span>}
  </li>
}

// 借入ごとの専用ページの下半分：記録のフォームと、その借入の仕訳の一覧。readOnly（スマホ）は一覧だけ
export default function LoanLedger({ data, update, loan, balance, currency, readOnly = false }) {
  const rows = loanEntries(data, loan)
  return <div className="b-loan-ledger">
    {!readOnly && <div className="b-loan-records" key={data.entries.length}>
      <RepayForm data={data} update={update} loan={loan} balance={balance} currency={currency} />
      <ReceiptForm data={data} update={update} loan={loan} currency={currency} />
    </div>}
    <div className="b-section-head"><h3>{t('loans.entriesTitle')}</h3></div>
    {rows.length === 0 ? <p className="note">{t('loans.entriesEmpty')}</p> : <ul className="b-loan-elist">{rows.map((r) => <Row key={r.entry.id} row={r} data={data} update={update} currency={currency} readOnly={readOnly} />)}</ul>}
    {readOnly && <p className="note">{t('loans.phoneViewOnly')}</p>}
  </div>
}
