import { useState } from 'react'
import './balance.css'
import '../print.css'
import { monthReport, livingBalance, balanceSheet, balanceSheetColumns, profitLossRows, previousMonth, issuedLabel, formatYen, formatMoney, currencyUnit } from '../ledgerLogic.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'

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
  return <details><summary><h2>{title}</h2>{extra}</summary>{children}</details>
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
function LivingTable({ living, currency }) {
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
    </ul>
  )
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

  return (
    <div className={`report${printView ? ' print-view' : ''}`}>
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
          <button type="button" onClick={() => window.print()}>{t('monthly.print')}</button>
          <button type="button" onClick={() => setPrintView(false)}>{t('monthly.back')}</button>
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
