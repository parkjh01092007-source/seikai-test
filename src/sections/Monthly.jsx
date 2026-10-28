import { useState } from 'react'
import { createPortal } from 'react-dom'
import './balance.css'
import '../print.css'
import { monthReport, livingBalance, balanceSheet, balanceTrend, netChangeReasons, USAGE_LABELS, balanceSheetColumns, profitLossRows, previousMonth, nextMonth, issuedLabel, formatYen, formatMoney, currencyUnit, roadDays, expenseBreakdown } from '../ledgerLogic.js'
import { expenseBars, netBarParts } from '../monthlyView.js'
import TrendLine from './TrendLine.jsx'
import Tabs from './Tabs.jsx'
import { panelDomId, tabDomId } from '../tabs.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { useBasicPhone } from '../basicPhone.js'
import { useBandHost, useBandTop, useBandRoad } from './bandHost.js'
import { signedYen } from './PageBand.jsx'
import { loadNoSpendShape } from '../entryView.js'
import MonthRoad from './MonthRoad.jsx'
import { Icon, IconButton } from './Icon.jsx'

const cls = (n) => (n < 0 ? 'neg' : '')

// 月の集計の行（科目名と金額。通貨の文字つき）
const Line = ({ name, amount, currency }) => (
  <tr>
    <td>{name}</td>
    <td className={cls(amount)}>{formatMoney(amount, currency)}</td>
  </tr>
)

// 通常の表示：見出しを押すと開く（初期は閉じる）。印刷用表示：すべて開いた表示（開閉の三角を出さない）
function Section({ printView, title, extra, children }) {
  if (printView) return <section className="print-section"><h2>{title}</h2>{extra}{children}</section>
  return <details><summary><span className="chev"><Icon name="chevRight" /></span><h2>{title}</h2>{extra}</summary>{children}</details>
}

// P/L：報告書の形（収益の部、費用の部、当期収支、残高調整）。並びは profitLossRows のまま。金額は数字だけ（単位は見出しの横）
function ProfitLossTable({ report }) {
  return (
    <div className="table-box"><table className="statement">
      <tbody>
        {profitLossRows(report).map((r, i) => (
          <tr key={i} className={r.kind}>
            <td>{r.name}</td>
            <td className={cls(r.amount)}>{r.amount !== null && formatYen(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  )
}

// B/S：勘定式（左に資産の部、右に負債の部と純資産の部）。下に、資産合計と負債・純資産合計。並びは balanceSheetColumns のまま
function BalanceSheetTable({ sheet }) {
  const { left, right, leftTotal, rightTotal } = balanceSheetColumns(sheet)
  const rows = Math.max(left.length, right.length) // 左右の長さをそろえるために、空のセルを足すだけ
  const amount = (c) => (c && c.amount !== null ? formatYen(c.amount) : '')
  return (
    <div className="table-box"><table className="statement bs">
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i}>
            <td className={`name ${left[i]?.kind ?? ''}`}>{left[i]?.name}</td>
            <td className={`${left[i]?.kind ?? ''} ${cls(left[i]?.amount)}`}>{amount(left[i])}</td>
            <td className={`text name right ${right[i]?.kind ?? ''}`}>{right[i]?.name}</td>
            <td className={`${right[i]?.kind ?? ''} ${cls(right[i]?.amount)}`}>{amount(right[i])}</td>
          </tr>
        ))}
        <tr className="total">
          <td>{leftTotal.name}</td>
          <td className={cls(leftTotal.amount)}>{formatYen(leftTotal.amount)}</td>
          <td className="text right">{rightTotal.name}</td>
          <td className={cls(rightTotal.amount)}>{formatYen(rightTotal.amount)}</td>
        </tr>
      </tbody>
    </table></div>
  )
}

// スマホの幅の B/S（spec-mobile.md 第6章）：資産の部 → 負債の部・純資産の部の順に縦に並べる。それぞれの下に合計を出す（資産合計と、負債・純資産合計。PC と同じ2つ。一致が分かる）
function BalanceSheetStack({ sheet }) {
  const { left, right, leftTotal, rightTotal } = balanceSheetColumns(sheet)
  const amount = (c) => (c.amount !== null ? formatYen(c.amount) : '')
  const part = (cells, total) => (
    <div className="table-box"><table className="statement bs-part">
      <tbody>
        {cells.map((c, i) => (
          <tr key={i}>
            <td className={`name ${c.kind}`}>{c.name}</td>
            <td className={`${c.kind} ${cls(c.amount)}`}>{amount(c)}</td>
          </tr>
        ))}
        <tr className="total">
          <td>{total.name}</td>
          <td className={cls(total.amount)}>{formatYen(total.amount)}</td>
        </tr>
      </tbody>
    </table></div>
  )
  return <>{part(left, leftTotal)}{part(right, rightTotal)}</>
}

// 生活費のやりくり（仕様 5.14）：数えた収入を1件ずつ（日付・科目・金額・先月入金／今月入金）、収入合計、支出合計。通常の表示だけ（印刷用表示には出さない）
// 生活費に数えなかった収入（使い道が生活費でない科目）を、1 件ずつ灰色で（ないときは何も出さない）
const otherUsage = (i) => t(USAGE_LABELS[i.usage])

function LivingTable({ living, currency, showDifference = false }) {
  const day = (date) => date.slice(5).replace('-', '/')
  const paid = (l) => t(l === 'next' ? 'living.prevPaid' : 'living.thisPaid')
  return (
    <div className="table-box"><table>
      <tbody>
        {living.items.map((i, n) => (
          <tr key={n}>
            <td className="wrap">{day(i.date)} {i.account.name}</td>
            <td className={cls(i.amount)}>{formatMoney(i.amount, currency)}</td>
            <td className="text">{paid(i.living)}</td>
          </tr>
        ))}
        <tr className="total"><td>{t('monthly.livingIncomeTotal')}</td><td className={cls(living.incomeTotal)}>{formatMoney(living.incomeTotal, currency)}</td><td /></tr>
        <tr className="total"><td>{t('monthly.livingExpenseTotal')}</td><td>{formatMoney(living.expenseTotal, currency)}</td><td /></tr>
        {showDifference && <tr className="total"><td>{t('basicPc.difference')}</td><td className={cls(living.result)}>{formatMoney(living.result, currency)}</td><td /></tr>}
        {living.others.items.length > 0 && <tr className="other-head"><td colSpan="3">{t('monthly.livingOthersHead')}</td></tr>}
        {living.others.items.map((i, n) => <tr key={`o${n}`} className="other"><td className="wrap">{i.date.slice(5).replace('-', '/')} {i.account.name}</td><td className={cls(i.amount)}>{formatMoney(i.amount, currency)}</td><td className="text">{otherUsage(i)}</td></tr>)}
      </tbody>
    </table></div>
  )
}

// スマホの幅：1件を2行（1行目に日付と科目・金額、2行目に先月入金／今月入金）。合計は1行ずつ
function LivingList({ living, currency }) {
  const day = (date) => date.slice(5).replace('-', '/')
  const paid = (l) => t(l === 'next' ? 'living.prevPaid' : 'living.thisPaid')
  return (
    <ul className="rows2">
      {living.items.map((i, n) => (
        <li key={n}>
          <span className="name">{day(i.date)} {i.account.name}</span>
          <span className={`value ${cls(i.amount)}`}>{formatMoney(i.amount, currency)}</span>
          <span className="sub">{paid(i.living)}</span>
        </li>
      ))}
      <li className="total"><span className="name">{t('monthly.livingIncomeTotal')}</span><span className={`value ${cls(living.incomeTotal)}`}>{formatMoney(living.incomeTotal, currency)}</span></li>
      <li className="total"><span className="name">{t('monthly.livingExpenseTotal')}</span><span className="value">{formatMoney(living.expenseTotal, currency)}</span></li>
      {living.others.items.map((i, n) => (
        <li key={`o${n}`} className="other">
          <span className="name">{i.date.slice(5).replace('-', '/')} {i.account.name}</span>
          <span className={`value ${cls(i.amount)}`}>{formatMoney(i.amount, currency)}</span>
          <span className="sub">{otherUsage(i)}</span>
        </li>
      ))}
    </ul>
  )
}

// 群青の PC（見本 design-ref/gunjo-pc/E-monthly-p2.html。spec-design.md 8.2）の本文：左に費用の内訳（上位 5 科目＋その他）と収益の部、右に月の集計と生活費のやりくり、
// 下に P/L・B/S の閉じた札（押すと開く。B/S が合わないときの印は、閉じていても見える）。計算は今までと同じ（monthReport・livingBalance・balanceSheet）
function GunjoBody({ month, report, living, sheet, currency }) {
  const adj = report.adjustment
  const shares = expenseBreakdown(report.expense)
  const maxRevenue = Math.max(0, ...report.revenue.map((r) => r.amount))
  const row = (key, name, amount, bar, pct, navy) => (
    <div className="g-brow" key={key}>
      <span className="name">{name}</span>
      <div className="g-brow-bar"><i className={navy ? 'navy' : ''} style={{ width: `${bar}%` }} /></div>
      <span className="value">{formatYen(amount)}</span>
      <span className="pct">{pct}</span>
    </div>
  )
  const day = (date) => date.slice(5).replace('-', '/')
  const paid = (l) => t(l === 'next' ? 'living.prevPaid' : 'living.thisPaid')
  return (
    <div className="g-mon-body">
      <div className="g-mon-main">
        <h2 className="g-h">{t('monthly.expenseTitle')}<small lang="en">{t('monthly.expenseEn')}</small></h2>
        {shares.items.length === 0 ? <p className="note">{t('monthly.expenseNone')}</p> : shares.items.map((it) => row(it.id, it.other ? t('monthly.others') : <span className="user-text">{it.name}</span>, it.amount, it.bar, `${it.share.toFixed(1)}%`))}
        {report.revenue.length > 0 && <>
          <h2 className="g-h g-h2">{t('monthly.revenueTitle')}<small lang="en">{t('monthly.revenueEn')}</small></h2>
          {report.revenue.map((r) => row(r.account.id, <span className="user-text">{r.account.name}</span>, r.amount, maxRevenue > 0 ? Math.max(0, Math.round((r.amount / maxRevenue) * 1000) / 10) : 0, '', true))}
        </>}
      </div>
      <div className="g-mon-side">
        <section className="g-card">
          <h2 className="g-h">{t('monthly.summaryTitle', { month })}<small lang="en">{t('monthly.summaryEn')}</small></h2>
          <table><tbody>
            <Line name={t('monthly.revenueTotal')} amount={report.revenueTotal} currency={currency} />
            <Line name={t('monthly.expenseTotal')} amount={report.expenseTotal} currency={currency} />
            {(adj.gain !== 0 || adj.loss !== 0) && <Line name={t('monthly.adjustmentLine')} amount={adj.net} currency={currency} />}
            <tr className="sum"><td>{t('monthly.result')}</td><td className={cls(report.result)}>{formatMoney(report.result, currency)}</td></tr>
          </tbody></table>
          <p className="note">{t('monthly.noteSummary')}</p>
          <h2 className="g-h g-h2">{t('monthly.livingTitle')}<small lang="en">{t('monthly.livingEn')}</small></h2>
          <p className="note">{t('monthly.livingNote')}</p>
          {living.items.length === 0 && <p className="note">{t('monthly.livingNone')}</p>}
          <table><tbody>
            {living.items.map((i, n) => (
              <tr key={n}>
                <td className="wrap">{day(i.date)} <span className="user-text">{i.account.name}</span> <span className="note">{paid(i.living)}</span></td>
                <td className={cls(i.amount)}>{formatMoney(i.amount, currency)}</td>
              </tr>
            ))}
            <Line name={t('monthly.livingIncomeTotal')} amount={living.incomeTotal} currency={currency} />
            <Line name={t('monthly.livingExpenseTotal')} amount={living.expenseTotal} currency={currency} />
            <tr className="sum"><td>{t('monthly.livingTitle')}</td><td className={living.result < 0 ? 'neg' : 'accent'}>{formatMoney(living.result, currency)}</td></tr>
          </tbody></table>
        </section>
      </div>
      <div className="g-mon-more">
        <div className="g-fold">
          <Section title={t('monthly.plTitle', { month })} extra={<small lang="en">{t('monthly.plEn')}</small>}>
            <p className="note">{t('monthly.unit', { unit: currencyUnit(currency) })}</p>
            <ProfitLossTable report={report} />
          </Section>
        </div>
        <div className="g-fold">
          <Section title={t('monthly.bsTitle', { month })} extra={<><small lang="en">{t('monthly.bsEn')}</small>{!sheet.balanced && <span className="value error">{t('monthly.bsUnbalancedBadge')}</span>}</>}>
            <p className="note">{t('monthly.unit', { unit: currencyUnit(currency) })}</p>
            <BalanceSheetTable sheet={sheet} />
            {sheet.balanced ? <p className="note">{t('monthly.bsBalanced')}</p> : <p className="error">{t('monthly.bsUnbalanced')}</p>}
            <p className="note">{t('monthly.bsNote')}</p>
          </Section>
        </div>
      </div>
    </div>
  )
}

const NET_BAR_KEYS = { cash: 'monthly.barCash', saving: 'monthly.barSaving', other: 'monthly.barOther', borrow: 'monthly.barBorrow', net: 'monthly.trendNet', shortfall: 'monthly.barShortfall' }
const REASON_KEYS = { result: 'monthly.reasonResult', receive: 'monthly.reasonReceive', start: 'monthly.reasonStart', other: 'monthly.reasonOther' }

function BasicMonthly({ accounts, entries, loans, currency, month, setMonth, report, living, sheet, phone, onPrint }) {
  const [metric, setMetric] = useState('netTotal')
  const [tab, setTab] = useState('trend')
  const metrics = [
    { id: 'assetTotal', label: t('monthly.trendAsset') },
    { id: 'liabilityTotal', label: t('monthly.trendLiability') },
    { id: 'netTotal', label: t('monthly.trendNet') },
  ]
  const trendRows = month ? balanceTrend(accounts, entries, month, today(), 12, loans) : []
  const current = trendRows[0]?.month === month ? trendRows[0] : null
  const previous = current && trendRows[1]
  const change = previous && netChangeReasons(current, previous)
  const netLabel = current && t(current.scholarshipBefore !== 0 ? 'monthly.trendNetEx' : 'monthly.trendNetMonth', { month: Number(month.slice(5)) })
  const nb = current && netBarParts(current)
  // 棒（部分ごとの色）と、その真下の名前と金額。名前と金額の列は、部分の幅に合わせる（狭くて入らない部分は、右へずれて並ぶ）
  const netBar = (parts, rest) => <>
    <div className="b-net-bar">{parts.map((p) => <span key={p.id} className={`b-net-${p.id}`} style={{ width: `${p.pct}%` }} />)}</div>
    <ul className="b-net-labels" style={{ gridTemplateColumns: [...parts.map((p) => `minmax(min-content, ${p.pct * 10}fr)`), `minmax(0, ${Math.max(rest, 0) * 10}fr)`].join(' ') }}>
      {parts.map((p) => <li key={p.id}><span className="nm"><span className={`b-net-swatch b-net-${p.id}`} aria-hidden="true" />{t(NET_BAR_KEYS[p.id])}</span><strong>{money(p.amount)}</strong></li>)}
    </ul>
  </>
  const signed = (n) => (n > 0 ? '+' : '') + formatMoney(n, currency)
  const chartRows = [...trendRows].reverse().map((r) => ({ ...r, netTotal: r.netExScholarship })) // 折れ線の純資産は、奨学金を除く方
  const expenses = report ? expenseBars(report.expense) : null
  const money = (n) => formatMoney(n, currency)
  const bars = (rows, rest = false) => rows.map((r) => <div className={`b-expense-row${rest ? ' b-expense-rest' : ''}`} key={r.account.id}>
    <span className="user-text">{r.account.name}</span><span className="b-bar-track"><span className="b-bar-fill" style={{ width: `${r.bar}%` }} /></span><span className={cls(r.amount)}>{money(r.amount)}</span>
  </div>)
  const summary = report && <section className="b-month-card b-month-summary">
    {phone ? <div className="b-month-heading"><h3>{t('monthly.currentResult')}</h3><strong className={`b-result ${cls(report.result)}`}>{money(report.result)}</strong></div> : <><h3>{t('monthly.currentResult')}</h3><p className="b-result-label">{t('monthly.result')}</p><strong className={`b-result ${cls(report.result)}`}>{money(report.result)}</strong></>}
    {!phone && <div className="b-summary-bars">{bars(expenseBars([{ account: { id: 'income', name: t('monthly.income') }, amount: report.revenueTotal }, { account: { id: 'expense', name: t('monthly.expense') }, amount: report.expenseTotal }]).top)}</div>}
  </section>
  const spending = report && <section className="b-month-card b-month-spending">
    <div className="b-month-heading"><h3>{t('monthly.expense')}</h3><strong className={cls(report.expenseTotal)}>{money(report.expenseTotal)}</strong></div>
    {expenses.top.length ? bars(expenses.top) : <p className="note">{t('monthly.expenseNone')}</p>}
    {expenses.rest.length > 0 && <details className="b-expense-more"><summary><span className="chev">›</span>{t('monthly.expenseRest', { count: expenses.rest.length, amount: money(expenses.restTotal) })}</summary>{bars(expenses.rest, true)}</details>}
  </section>
  const livingPart = living && <section className="b-month-card b-month-living">
    <div className="b-month-heading"><h3>{t('monthly.livingTitle')}</h3><strong className={cls(living.result)}>{money(living.result)}</strong></div>
    <p>{t('monthly.livingFormula', { income: money(living.incomeTotal), expense: money(living.expenseTotal) })}</p>
    {living.others.items.length > 0 && <p className="b-living-others">{t('monthly.livingOthers', { total: money(living.others.total), parts: ['saving', 'repay', 'special'].filter((u) => living.others.byUsage[u] !== 0).map((u) => t('monthly.livingOthersPart', { name: t(USAGE_LABELS[u]), amount: money(living.others.byUsage[u]) })).join(t('monthly.reasonJoin')) })}</p>}
    {living.items.length === 0 ? <p className="note">{t('monthly.livingNone')}</p> : phone ? <LivingList living={living} currency={currency} /> : <LivingTable living={living} currency={currency} />}
    {phone ? <details className="b-living-difference"><summary><span className="chev" aria-hidden="true">›</span>{t('monthly.livingDifferenceTitle')}</summary><p>{t('monthly.livingDifference')}</p></details> : <p className="note">{t('monthly.livingDifference')}</p>}
  </section>
  const table = <div className="table-box b-trend-table"><table><thead><tr><th>{t('common.month')}</th><th>{t('monthly.trendAsset')}</th><th>{t('monthly.trendLiability')}</th><th>{t('monthly.trendNet')}</th>{!phone && <><th>{t('monthly.trendEarmark')}</th><th>{t('monthly.trendResult')}</th></>}{trendRows.some((r) => r.scholarshipBefore !== 0) && <th>{t('monthly.trendScholarship')}</th>}</tr></thead><tbody>{trendRows.map((r) => <tr key={r.month}><td>{r.month}</td><td className={cls(r.assetTotal)}>{money(r.assetTotal)}</td><td className={cls(r.liabilityTotal)}>{money(r.liabilityTotal)}</td><td className={cls(r.netTotal)}>{money(r.netTotal)}</td>{!phone && <><td className={cls(r.earmarkTotal)}>{money(r.earmarkTotal)}</td><td className={cls(r.result)}>{money(r.result)}</td></>}{trendRows.some((r) => r.scholarshipBefore !== 0) && <td>{money(r.scholarshipBefore)}</td>}</tr>)}</tbody></table></div>
  const trend = <section className="b-month-card b-month-trend">{!phone && <div className="b-month-heading"><h3>{t('monthly.trend')}</h3><span className="note">{t('monthly.trendNote')}</span></div>}
    {current ? <>{phone ? <p className="b-trend-net"><span>{netLabel}</span><strong className={`b-result ${cls(current.netExScholarship)}`}>{money(current.netExScholarship)}</strong></p> : <><p>{netLabel}</p><strong className={`b-result ${cls(current.netExScholarship)}`}>{money(current.netExScholarship)}</strong></>}<p className={`b-trend-change ${previous ? cls(change.change) : 'note'}`}>{!previous ? t('monthly.trendNoPrevious') : change.reasons.length ? t('monthly.trendChangeWhy', { amount: signed(change.change), reasons: change.reasons.map((r) => t(REASON_KEYS[r.id], { amount: signed(r.amount) })).join(t('monthly.reasonJoin')) }) : t('monthly.trendChange', { amount: money(change.change) })}</p>
      <div className="b-net-bars" role="group" aria-label={t('monthly.barLabel')}>
        {netBar(nb.top, nb.restTop)}
        {netBar(nb.bottom, nb.restBottom)}
      </div>
      {current.scholarshipBefore !== 0 && <><p className="b-net-scholarship">{t('monthly.scholarshipBefore', { amount: money(current.scholarshipBefore), from: t('monthly.scholarshipFrom', { year: Number(current.scholarshipFrom.slice(0, 4)), month: Number(current.scholarshipFrom.slice(5)) }) })}</p><p className="b-net-with">{t('monthly.netWithScholarship', { amount: money(current.netTotal) })}</p></>}
      <div className="b-trend-switch">{metrics.map((m) => <button type="button" key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>{m.label}</button>)}</div>
      <TrendLine rows={chartRows} metric={metric} label={metrics.find((m) => m.id === metric).label} currency={currency} phone={phone} monthly />
      {!phone && <details><summary>{t('monthly.trendTable')}</summary>{table}</details>}
    </> : <p className="note">{t('monthly.trendEmpty')}</p>}
  </section>
  return <div className={phone ? 'report b-phone-p5 b-phone-monthly b-month-redesign' : 'report b-page b-monthly b-month-redesign'}>
    <div className="b-month-header"><h2>{t('monthly.title')}</h2><div className="b-month-picker">
      <button type="button" aria-label={t('entries.monthPrev')} disabled={!month} onClick={() => setMonth(previousMonth(month))}>‹</button>
      <input type="month" aria-label={t('common.month')} value={month} onChange={(e) => setMonth(e.target.value)} />
      <button type="button" aria-label={t('entries.monthNext')} disabled={!month} onClick={() => setMonth(nextMonth(month))}>›</button>
      {!phone && <button type="button" onClick={() => setMonth(today().slice(0, 7))}>{t('common.thisMonth')}</button>}
    </div></div>
    {!month ? <p className="note">{t('common.chooseMonth')}</p> : <>
      {phone ? <><div className="b-month-combined">{summary}{spending}</div><Tabs prefix="monthly-basic" label={t('monthly.trend')} tabs={[{ id: 'trend', title: t('monthly.trend') }, { id: 'living', title: t('monthly.livingTitle') }]} current={tab} onChange={setTab} /><div role="tabpanel" id={panelDomId('monthly-basic', tab)} aria-labelledby={tabDomId('monthly-basic', tab)}>{tab === 'trend' ? trend : livingPart}</div></> : <div className="b-month-columns"><div>{summary}{livingPart}{spending}</div><div>{trend}</div></div>}
      <details className="b-month-books"><summary><span className="chev">›</span><span><b>{t('monthly.books')}</b><small>{t('monthly.booksDescription')}</small></span></summary>
        {phone && <details><summary>{t('monthly.trendTable')}</summary>{table}</details>}
        <Section title={t('monthly.plTitle', { month })}><p className="note">{t('monthly.unit', { unit: currencyUnit(currency) })}</p><ProfitLossTable report={report} /></Section>
        <Section title={t('monthly.bsTitle', { month })} extra={!sheet.balanced && <span className="value error">{t('monthly.bsUnbalancedBadge')}</span>}><p className="note">{t('monthly.unit', { unit: currencyUnit(currency) })}</p>{phone ? <BalanceSheetStack sheet={sheet} /> : <BalanceSheetTable sheet={sheet} />}{sheet.balanced ? <p className="note">{t('monthly.bsBalanced')}</p> : <p className="error">{t('monthly.bsUnbalanced')}</p>}<p className="note">{t('monthly.bsNote')}</p></Section>
        <div className="b-books-actions"><button type="button" onClick={() => setMonth(previousMonth(today()))}>{t('common.lastMonth')}</button><button type="button" onClick={onPrint}>{t('monthly.printView')}</button></div>
      </details>
    </>}
  </div>
}

export default function Monthly({ data }) {
  const { accounts, entries } = data
  const currency = data.settings.currency
  const [month, setMonth] = useState(() => previousMonth(today())) // 初期表示は前月
  const [printView, setPrintView] = useState(false)
  const phone = usePhone()
  const report = month ? monthReport(accounts, entries, month) : null
  const sheet = month ? balanceSheet(accounts, entries, month) : null
  const adj = report?.adjustment
  const living = month ? livingBalance(entries, accounts, month) : null
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()
  const basicPhone = useBasicPhone()
  const bandHost = useBandHost()
  const bandTop = useBandTop()
  const bandRoad = useBandRoad()

  // 群青の PC の通常表示（印刷用表示は、今のまま）。月が未選択のときは、月の道も札も出さず、「月を選んでください」の一行だけ
  if (gunjoPc && !printView) {
    const shift = (d) => { const [y, m] = month.split('-').map(Number); const x = new Date(y, m - 1 + d, 1); setMonth(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`) }
    const unit = currencyUnit(currency)
    const m = month ? Number(month.slice(5)) : 0
    const road = month ? roadDays(accounts, entries, month, today(), data.noSpendDays) : null
    return (
      <div className="report g-rep g-mon">
        {bandTop && createPortal(
          <div className="g-month">
            <IconButton icon="chevRight" className="g-prev" label={t('entries.monthPrev')} disabled={!month} onClick={() => shift(-1)} />
            <input type="month" aria-label={t('common.month')} value={month} onChange={(e) => setMonth(e.target.value)} />
            <IconButton icon="chevRight" label={t('entries.monthNext')} disabled={!month} onClick={() => shift(1)} />
          </div>, bandTop)}
        {bandHost && createPortal(<>
          {month && <div className="g-mnum" aria-hidden="true">{m}<span>{t('monthly.monthUnit')}</span></div>}
          {month && (
            <div className="g-res">
              <div className="g-res-lab">{t('monthly.heroResult', { m })}</div>
              <div className={`g-res-num${report.result < 0 ? ' neg' : ''}`}>{signedYen(report.result, formatYen)}<span className="g-res-unit">{unit}</span></div>
              <div className="g-res-sub"><span>{t('monthly.revenueTotal')} <b>{formatYen(report.revenueTotal)}</b></span><span>{t('monthly.expenseTotal')} <b>{formatYen(report.expenseTotal)}</b></span></div>
            </div>
          )}
          <div className="g-mact">
            <button type="button" onClick={() => setMonth(today().slice(0, 7))}>{t('common.thisMonth')}</button>
            <button type="button" onClick={() => setMonth(previousMonth(today()))}>{t('common.lastMonth')}</button>
            <button type="button" onClick={() => setPrintView(true)}>{t('monthly.printView')}</button>
          </div>
        </>, bandHost)}
        {bandRoad && road && createPortal(<MonthRoad road={road} currency={currency} shape={loadNoSpendShape()} />, bandRoad)}
        {!month ? <p className="note">{t('common.chooseMonth')}</p> : <GunjoBody month={month} report={report} living={living} sheet={sheet} currency={currency} />}
      </div>
    )
  }

  if ((basicPc || basicPhone) && !printView) {
    return <BasicMonthly accounts={accounts} entries={entries} loans={data.loans ?? []} currency={currency} month={month} setMonth={setMonth} report={report} living={living} sheet={sheet} phone={basicPhone} onPrint={() => setPrintView(true)} />
  }

  return (
    <div className={`report${basicPhone ? ' b-phone-p5 b-phone-monthly' : ''}${printView ? ' print-view' : ''}`}>
      {printView ? <h2 className="print-title">{t('monthly.printTitle')}{month && t('monthly.inMonth', { month })}</h2> : <h2>{t('monthly.title')}</h2>}
      {printView && <p className="issued">{issuedLabel(today())}</p>}
      <div className="month-bar no-print">
        <input type="month" aria-label={t('common.month')} value={month} onChange={(e) => setMonth(e.target.value)} />
        <button type="button" onClick={() => setMonth(today().slice(0, 7))}>{t('common.thisMonth')}</button>
        <button type="button" onClick={() => setMonth(previousMonth(today()))}>{t('common.lastMonth')}</button>
        {!printView && <button type="button" onClick={() => setPrintView(true)}>{t('monthly.printView')}</button>}
      </div>
      {printView && (
        <div className="month-bar no-print">
          <button type="button" onClick={() => window.print()}><Icon name="print" />{t('monthly.print')}</button>
          <button type="button" onClick={() => setPrintView(false)}><Icon name="back" />{t('monthly.back')}</button>
          <span className="note">{t('monthly.printNote')}</span>
        </div>
      )}
      {!month ? <p className="note">{t('common.chooseMonth')}</p> : (
        <>
          <Section
            printView={printView}
            title={t('monthly.summaryTitle', { month })}
            extra={<span className={`value ${cls(report.result)}`}>{t('monthly.result')} {formatMoney(report.result, currency)}</span>}
          >
            <div className="table-box"><table>
              <tbody>
                <Line name={t('monthly.revenueTotal')} amount={report.revenueTotal} currency={currency} />
                <Line name={t('monthly.expenseTotal')} amount={report.expenseTotal} currency={currency} />
                {(adj.gain !== 0 || adj.loss !== 0) && <Line name={t('monthly.adjustmentLine')} amount={adj.net} currency={currency} />}
              </tbody>
            </table></div>
            <p className="note">{t('monthly.noteSummary')}</p>
          </Section>

          {!printView && (
            <Section
              printView={printView}
              title={t('monthly.livingTitle')}
              extra={<><span className={`value ${cls(living.result)}`}>{formatMoney(living.result, currency)}</span><small className="note living-note">{t('monthly.livingNote')}</small></>}
            >
              {living.items.length === 0 && <p className="note">{t('monthly.livingNone')}</p>}
              {phone ? <LivingList living={living} currency={currency} /> : <LivingTable living={living} currency={currency} />}
            </Section>
          )}

          <Section printView={printView} title={t('monthly.plTitle', { month })}>
            <p className="note">{t('monthly.unit', { unit: currencyUnit(currency) })}</p>
            <ProfitLossTable report={report} />
          </Section>

          <Section
            printView={printView}
            title={t('monthly.bsTitle', { month })}
            extra={!sheet.balanced && <span className="value error">{t('monthly.bsUnbalancedBadge')}</span>}
          >
            <p className="note">{t('monthly.unit', { unit: currencyUnit(currency) })}</p>
            {phone && !printView ? <BalanceSheetStack sheet={sheet} /> : <BalanceSheetTable sheet={sheet} />}
            {sheet.balanced
              ? <p className="note">{t('monthly.bsBalanced')}</p>
              : <p className="error">{t('monthly.bsUnbalanced')}</p>}
            <p className="note">{t('monthly.bsNote')}</p>
          </Section>
        </>
      )}
    </div>
  )
}
