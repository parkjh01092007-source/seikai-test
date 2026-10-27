import { useState } from 'react'
import { formatMoney, nextMonth } from '../ledgerLogic.js'
import { loanOverview, newLoan, addLoanTerm, removeLoan, receivingProgress, formatRate } from '../loanView.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import LoanChart from './LoanChart.jsx'
import { Icon } from './Icon.jsx'
import { useBasicPhone } from '../basicPhone.js'

const KIND_LABELS = { scholarship: 'loans.kind.scholarship', loan: 'loans.kind.loan', other: 'loans.kind.other' } // 種類の文言のキー（check が使っているキーを見つけられるよう、1 つずつ書く）
const PLAN_SHOWN = 12 // 返す予定の表に出す回の数

const monthLabel = (month) => t('loans.monthLabel', { year: month.slice(0, 4), month: Number(month.slice(5)) })
const dateShort = (month, day) => t('loans.dateShort', { month: Number(month.slice(5)), day })

const emptyForm = (month) => ({ kind: 'loan', name: '', balanceText: '', rateText: '', paymentText: '', payDayText: '25', monthlyText: '', recvFrom: month, recvTo: month, repayFrom: '' })

const Field = ({ label, children }) => <label className="b-field"><span>{label}</span>{children}</label>

// 借りているお金の追加。借入ごとに負債の科目を 1 つ作り、今の残りは開始残高の仕訳で入れる（loanView.newLoan）
function AddForm({ data, update, month, onDone }) {
  const [form, setForm] = useState(() => emptyForm(month))
  const [error, setError] = useState('')
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const scholarship = form.kind === 'scholarship'
  const submit = (e) => {
    e.preventDefault()
    const r = newLoan(form, data.accounts, data.entries, today())
    if (r.error) { setError(r.error); return }
    update({ ...data, accounts: [...data.accounts, r.account], entries: r.entry ? [...data.entries, r.entry] : data.entries, loans: [...(data.loans ?? []), r.loan] })
    onDone(r.loan.id)
  }
  return <form className="b-loan-form" onSubmit={submit}>
    <div className="b-loan-fields">
      <Field label={t('loans.kind')}><select value={form.kind} onChange={set('kind')}>
        {Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
      </select></Field>
      <Field label={t('loans.name')}><input value={form.name} onChange={set('name')} /></Field>
      <Field label={t(scholarship ? 'loans.balanceReceiving' : 'loans.balance')}><input inputMode="numeric" value={form.balanceText} onChange={set('balanceText')} /></Field>
      <Field label={t('loans.rate')}><input inputMode="decimal" value={form.rateText} onChange={set('rateText')} /></Field>
      <Field label={t('loans.payment')}><input inputMode="numeric" value={form.paymentText} onChange={set('paymentText')} /></Field>
      <Field label={t('loans.payDay')}><input inputMode="numeric" value={form.payDayText} onChange={set('payDayText')} /></Field>
      {scholarship && <>
        <Field label={t('loans.monthly')}><input inputMode="numeric" value={form.monthlyText} onChange={set('monthlyText')} /></Field>
        <Field label={t('loans.recvFrom')}><input type="month" value={form.recvFrom} onChange={set('recvFrom')} /></Field>
        <Field label={t('loans.recvTo')}><input type="month" value={form.recvTo} onChange={set('recvTo')} /></Field>
        <Field label={t('loans.repayFrom')}><input type="month" value={form.repayFrom} onChange={set('repayFrom')} /></Field>
      </>}
    </div>
    <p className="note">{t('loans.addNote')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="b-loan-actions">
      <button className="b-primary">{t('loans.apply')}</button>
      <button type="button" onClick={() => onDone(null)}>{t('loans.cancel')}</button>
    </div>
  </form>
}

// 一覧の 1 行
function LoanRow({ item, month, current, currency, onSelect }) {
  const { loan, balance, borrowed, projection } = item
  const progress = receivingProgress(loan, month)
  const receiving = progress !== null && loan.receiving.to >= month
  const sub = loan.kind === 'scholarship' ? t(receiving ? 'loans.sub.receiving' : 'loans.sub.repaying') : t(KIND_LABELS[loan.kind])
  const paidPct = borrowed > 0 ? Math.min(100, Math.max(0, Math.round(((borrowed - balance) / borrowed) * 100))) : 0
  const pct = receiving ? Math.round((progress.done / progress.total) * 100) : paidPct
  const showNext = !receiving && balance > 0 && projection.plan.length > 0
  return <button type="button" className="b-loan-row" aria-current={current ? 'true' : undefined} onClick={onSelect}>
    <span className="b-loan-name">{loan.name}<small>{sub}</small></span>
    <span className="b-loan-rem">{formatMoney(balance, currency)}<small>{t(receiving ? 'loans.receivedLabel' : 'loans.remainLabel')}</small></span>
    <span className="b-loan-meter">
      <span className="b-loan-track"><span style={{ width: `${pct}%` }} /></span>
      <span className="b-loan-cap">
        <span>{t(receiving ? 'loans.receivingPct' : 'loans.paidPct', { pct })}</span>
        <span>{receiving ? t('loans.repayStart', { month: monthLabel(projection.startMonth) }) : showNext ? t('loans.nextShort', { date: dateShort(projection.startMonth, loan.payDay), amount: formatMoney(projection.plan[0].payment, currency) }) : ''}</span>
      </span>
    </span>
  </button>
}

// 選んだ借入の数値の札（PC は 4 つ、スマホは 3 つ：受け取り中の奨学金は「毎月受け取る」を外す）。{ label, value, small }
function loanFacts(item, month, currency) {
  const { loan, balance, borrowed, term, projection } = item
  const progress = receivingProgress(loan, month)
  const receiving = progress !== null && loan.receiving.to >= month
  const { plan, endMonth, endless, startMonth } = projection
  const fact = (label, value, small) => ({ label, value, small })
  return receiving
    ? [
      fact(t('loans.receiveMonthly'), formatMoney(loan.receiving.monthly, currency), t('loans.receiveUntil', { month: monthLabel(loan.receiving.to) })),
      fact(t('loans.repayFact'), monthLabel(startMonth), plan.length > 0 ? t('loans.perMonthEst', { amount: formatMoney(plan[0].payment, currency) }) : ''),
      fact(t('loans.rateFact'), `${formatRate(term.rate)}%`, t('loans.rateNow')),
      fact(t('loans.endFact'), endless ? t('loans.endNone') : monthLabel(endMonth), endless ? '' : t('loans.endLeft', { count: plan.length })),
    ]
    : [
      fact(t('loans.nextPay'), plan.length > 0 ? dateShort(startMonth, loan.payDay) : '—', plan.length > 0 ? formatMoney(plan[0].payment, currency) : ''),
      fact(t('loans.rateFact'), `${formatRate(term.rate)}%`, term.rate === 0 ? t('loans.noInterest') : t('loans.rateNow')),
      fact(t('loans.endFact'), balance <= 0 ? '—' : endless ? t('loans.endNone') : monthLabel(endMonth), balance <= 0 || endless ? '' : t('loans.endLeft', { count: plan.length })),
      fact(t('loans.borrowed'), formatMoney(borrowed, currency)),
    ]
}

const KIND_ICONS = { scholarship: 'cap', loan: 'home', other: 'wallet' } // 種類の絵（icons.js）
const PHONE_LIST_MAX = 3 // スマホの一覧に出す件数。それより多いときは「ほか○件」

// 基本のスマホ：PC を簡単にしたもの。上に「残り」「今月の返済」、下に借入 3 件と合計（4 件以上は「ほか○件」で一覧）。選ぶと中身（数値の札 3 つ・グラフ）。入力と返す予定の表は PC だけ
function LoansPhone({ items, totals, month, currency }) {
  const [selectedId, setSelectedId] = useState(null)
  const [all, setAll] = useState(false)
  const selected = items.find((i) => i.loan.id === selectedId)
  if (selected) {
    const { loan, balance } = selected
    const receiving = receivingProgress(loan, month) !== null && loan.receiving.to >= month
    const sub = loan.kind === 'scholarship' ? t(receiving ? 'loans.sub.receiving' : 'loans.sub.repaying') : t(KIND_LABELS[loan.kind])
    return <div className="report b-phone-p5 b-phone-loans">
      <button type="button" className="b-pl-back" onClick={() => setSelectedId(null)}><Icon name="back" />{t('loans.back')}</button>
      <div className="b-pl-head">
        <span className="b-pl-ic"><Icon name={KIND_ICONS[loan.kind]} /></span>
        <h3>{loan.name}<small>{sub}</small></h3>
        <p><small>{t(receiving ? 'loans.receivedLabel' : 'loans.remainLabel')}</small><strong>{formatMoney(balance, currency)}</strong></p>
      </div>
      <div className="b-pl-facts">{(receiving ? loanFacts(selected, month, currency).slice(1) : loanFacts(selected, month, currency).slice(0, 3)).map((f) => <div key={f.label} className="b-pl-fact"><span className="k">{f.label}</span><span className="v">{f.value}{f.small && <small>{f.small}</small>}</span></div>)}</div>
      <LoanChart series={selected.projection.series} name={loan.name} currency={currency} compact />
    </div>
  }
  const shown = all ? items : items.slice(0, PHONE_LIST_MAX)
  return <div className="report b-phone-p5 b-phone-loans">
    <div className="b-pl-tiles">
      <div className="b-pl-tile"><span className="lbl">{t('loans.sumRemain')}</span><strong>{formatMoney(totals.remain, currency)}</strong></div>
      <div className="b-pl-tile"><span className="lbl">{t('loans.sumDue')}</span><strong>{formatMoney(totals.scheduled, currency)}</strong></div>
    </div>
    {items.length === 0 && <p className="note">{t('loans.phoneEmpty')}</p>}
    <div className="b-pl-list">
      {shown.map(({ loan, balance, borrowed }) => {
        const pct = borrowed > 0 ? Math.min(100, Math.max(0, Math.round(((borrowed - balance) / borrowed) * 100))) : 0
        return <button type="button" key={loan.id} className="b-pl-row" onClick={() => setSelectedId(loan.id)}>
          <span className="b-pl-ic"><Icon name={KIND_ICONS[loan.kind]} /></span>
          <span className="b-pl-name">{loan.name}</span>
          <span className="b-pl-rem">{formatMoney(balance, currency)}</span>
          <span className="b-pl-track"><span style={{ width: `${pct}%` }} /></span>
        </button>
      })}
      {items.length > PHONE_LIST_MAX && <button type="button" className="b-pl-more" aria-expanded={all} onClick={() => setAll(!all)}>{all ? t('loans.less') : t('loans.more', { count: items.length - PHONE_LIST_MAX })}</button>}
    </div>
    {items.length > 0 && <p className="b-pl-total"><span>{t('loans.total')}</span><span>{t('loans.totalCount', { count: items.length })}</span><strong>{formatMoney(totals.remain, currency)}</strong></p>}
  </div>
}

// 右：選んだ借入の中身
function Detail({ item, data, update, month, currency }) {
  const confirm = useConfirm()
  const { loan, balance, term, paidPrincipal, projection } = item
  const progress = receivingProgress(loan, month)
  const receiving = progress !== null && loan.receiving.to >= month
  const { plan, endMonth, endless } = projection
  const [changing, setChanging] = useState(false)
  const [from, setFrom] = useState(() => nextMonth(month))
  const [rateText, setRateText] = useState(() => formatRate(term.rate))
  const [paymentText, setPaymentText] = useState(() => String(term.payment))
  const [error, setError] = useState('')
  const sub = loan.kind === 'scholarship' ? t(receiving ? 'loans.sub.receiving' : 'loans.sub.repaying') : t(KIND_LABELS[loan.kind])
  const save = (loans) => update({ ...data, loans })
  const apply = (e) => {
    e.preventDefault()
    const r = addLoanTerm(loan, { from, rateText, paymentText })
    if (r.error) { setError(r.error); return }
    save(data.loans.map((l) => (l.id === loan.id ? r.loan : l)))
    setChanging(false)
    setError('')
  }
  const remove = async () => {
    if (await confirm({ message: t('loans.removeConfirm', { name: loan.name }) })) save(removeLoan(data.loans, loan.id))
  }
  return <section className="b-loan-detail">
    <div className="b-loan-dhead">
      <h3>{loan.name}<small>{sub}</small></h3>
      <p><span>{t(receiving ? 'loans.receivedLabel' : 'loans.remainLabel')}</span><strong>{formatMoney(balance, currency)}</strong></p>
    </div>
    <div className="b-loan-facts">{loanFacts(item, month, currency).map((f) => <div key={f.label} className="b-loan-fact"><span className="k">{f.label}</span><span className="v">{f.value}{f.small && <small>{f.small}</small>}</span></div>)}</div>
    {paidPrincipal > 0 && <p className="b-loan-paid">{t('loans.paidThisMonth')}<strong>{formatMoney(paidPrincipal, currency)}</strong></p>}
    <LoanChart series={projection.series} name={loan.name} currency={currency} />
    <div className="b-loan-actions">
      {!changing && <button type="button" onClick={() => setChanging(true)}>{t('loans.change')}</button>}
      <button type="button" className="b-danger" onClick={remove}>{t('loans.remove')}</button>
    </div>
    {changing && <form className="b-loan-form" onSubmit={apply}>
      <p className="note">{t('loans.changeNote')}</p>
      <div className="b-loan-fields">
        <Field label={t('loans.changeMonth')}><input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('loans.newRate')}><input inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)} /></Field>
        <Field label={t('loans.newPayment')}><input inputMode="numeric" value={paymentText} onChange={(e) => setPaymentText(e.target.value)} /></Field>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="b-loan-actions">
        <button className="b-primary">{t('loans.apply')}</button>
        <button type="button" onClick={() => { setChanging(false); setError('') }}>{t('loans.cancel')}</button>
      </div>
    </form>}
    {loan.rateHistory.length > 0 && <div className="b-loan-history">
      <h4>{t('loans.history')}</h4>
      <ul>{loan.rateHistory.map((x) => <li key={x.from}>{t('loans.historyRow', { month: monthLabel(x.from), rate: formatRate(x.rate), amount: formatMoney(x.payment, currency) })}</li>)}</ul>
    </div>}
    {plan.length > 0 && <div className="b-loan-plan">
      <div className="b-section-head"><h3>{t('loans.planTitle')}</h3></div>
      <table>
        <thead><tr><th>{t('loans.colNo')}</th><th>{t('common.month')}</th><th>{t('loans.colPay')}</th><th>{t('loans.colPrincipal')}</th><th>{t('loans.colInterest')}</th><th>{t('loans.colLeft')}</th></tr></thead>
        <tbody>{plan.slice(0, PLAN_SHOWN).map((r, i) => <tr key={r.month}>
          <td>{i + 1}</td><td>{monthLabel(r.month)}</td><td>{formatMoney(r.payment, currency)}</td><td>{formatMoney(r.principal, currency)}</td><td>{formatMoney(r.interest, currency)}</td><td>{formatMoney(r.balance, currency)}</td>
        </tr>)}</tbody>
      </table>
      {!endless && <p className="note">{t('loans.planNote', { shown: Math.min(PLAN_SHOWN, plan.length), count: plan.length, month: monthLabel(endMonth) })}</p>}
    </div>}
  </section>
}

export default function Loans({ data, update }) {
  const basicPhone = useBasicPhone()
  const month = today().slice(0, 7)
  const currency = data.settings.currency
  const { items, totals } = loanOverview(data, month)
  const [selectedId, setSelectedId] = useState(null)
  const [adding, setAdding] = useState(false)
  const selected = items.find((i) => i.loan.id === selectedId) ?? items[0]
  const paidThisMonth = totals.due < totals.scheduled
  if (basicPhone) return <LoansPhone items={items} totals={totals} month={month} currency={currency} />
  return <div className="report b-page b-loans">
    <div className="b-page-head"><h2>{t('loans.title')}</h2><p>{t('basicPc.loansLead')}</p></div>
    <div className="b-loan-tiles">
      <div className="b-loan-tile"><span className="lbl">{t('loans.sumRemain')}</span><strong>{formatMoney(totals.remain, currency)}</strong><span className="sub">{t('loans.sumCount', { count: items.length })}</span></div>
      <div className="b-loan-tile"><span className="lbl">{t('loans.sumDue')}</span><strong>{formatMoney(totals.scheduled, currency)}</strong></div>
      <div className="b-loan-tile b-loan-free">
        <span className="lbl">{t('loans.sumFree')}</span>
        <strong>{formatMoney(totals.due, currency)}</strong>
        <span className="sub"><span className="chip on">{t('loans.freeNext', { amount: formatMoney(totals.due, currency) })}</span> <span className="chip off">{t('loans.freeWhole', { amount: formatMoney(totals.remain, currency) })}</span></span>
        <span className="sub">{t(paidThisMonth ? 'loans.freeNotePaid' : 'loans.freeNote')}</span>
      </div>
    </div>
    <div className="b-loan-body">
      <div className="b-loan-list">
        {adding
          ? <AddForm data={data} update={update} month={month} onDone={(id) => { setAdding(false); if (id) setSelectedId(id) }} />
          : <button type="button" className="b-loan-add" onClick={() => setAdding(true)}>{t('loans.add')}</button>}
        {items.length === 0 && !adding && <p className="note">{t('loans.empty')}</p>}
        {items.map((item) => <LoanRow key={item.loan.id} item={item} month={month} currency={currency} current={item === selected} onSelect={() => setSelectedId(item.loan.id)} />)}
      </div>
      {selected && <Detail key={selected.loan.id} item={selected} data={data} update={update} month={month} currency={currency} />}
    </div>
  </div>
}
