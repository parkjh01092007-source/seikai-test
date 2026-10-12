import { useState } from 'react'
import './balance.css'
import { TYPE_LABELS, accountBalances, freeAmount, budgetFreeAmount, typeTotals, formatYen, currencyUnit } from '../ledgerLogic.js'
import { BALANCE_VIEWS, BALANCE_VIEW_LABELS, loadBalanceView } from '../storage.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

export default function Balance({ data }) {
  const { accounts, entries } = data
  const unit = currencyUnit(data.settings.currency)
  const free = freeAmount(accounts, entries)
  // 自由に使える額の表示：最初は設定（ブラウザごとに覚えた「自由に使える額の初めの表示」）。ボタンで切り替えた状態は覚えない（画面を移ると、設定の値に戻る）
  const [view, setView] = useState(loadBalanceView)
  const budgeted = budgetFreeAmount(accounts, entries, data.budgets, today().slice(0, 7)) // 今月の予算を反映した額（仕様 5.13）
  const { rows, balanced } = accountBalances(accounts, entries)
  const phone = usePhone()
  const viewButtons = BALANCE_VIEWS.map((v) => (
    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{t(BALANCE_VIEW_LABELS[v])}</button>
  ))

  // スマホの幅（spec-mobile.md 第6章、見本 Y1-mobile の3つ目）：自由に使える額は大きな数字と、かっこなしで折り返す内訳。
  // 科目は1件を2行（1行目に科目と残高、2行目に「借方 ○○　貸方 ○○」）。合計の行は1行目だけ太字。PC は下の表のまま
  if (phone) {
    const join = (items, render) => items.map((item, i) => <span key={item.id}>{i > 0 && t('common.separator')}{render(item)}</span>)
    return (
      <div className="report">
        <div className="free-head">
          <h2 className="free-label">{t('balance.freeTitle')}</h2>
          <div className="view-toggle segmented" role="group" aria-label={t('balance.viewLabel')}>{viewButtons}</div>
        </div>
        {view === 'actual' ? (
          <>
            <p className="free"><span className="free-amount"><Num n={free.total} /></span><span className="free-unit">{unit}</span></p>
            {free.items.length > 0 && <p className="free-items">{join(free.items, (item) => <>{item.name} <Num n={item.balance} /></>)}</p>}
          </>
        ) : (
          <>
            <p className="free"><span className="free-amount"><Num n={budgeted.total} /></span><span className="free-unit">{unit}</span></p>
            <p className="free-items">
              {t('balance.freeTitle')} <Num n={budgeted.free} />{t('common.separator')}{t('balance.budgetReserved')} <Num n={budgeted.reserved === 0 ? 0 : -budgeted.reserved} />
              {budgeted.items.length > 0 && t('common.colon')}
              {join(budgeted.items, (item) => <>{item.name} <Num n={item.amount} /></>)}
            </p>
          </>
        )}
        {!balanced && <p className="error">{t('balance.unbalanced')}</p>}
        <h2>{t('balance.title')}</h2>
        {['asset', 'liability'].map((type) => {
          const total = typeTotals(rows, type)
          const sub = (r) => t('balance.rowSub', { debit: formatYen(r.debit), credit: formatYen(r.credit) })
          return (
            <section key={type}>
              <h3>{TYPE_LABELS[type]}</h3>
              <ul className="rows2">
                {rows.filter((r) => r.account.type === type && (r.account.active || r.used)).map((r) => (
                  <li key={r.account.id} className={r.account.active ? '' : 'inactive'}>
                    {r.account.active ? <span className="name">{r.account.name}</span> : <span className="name with-note"><span className="nm">{r.account.name}</span><span className="note"> {t('common.inactive')}</span></span>}
                    <span className="value"><Num n={r.balance} /></span>
                    <span className="sub">{sub(r)}</span>
                  </li>
                ))}
                <li className="total">
                  <span className="name">{t('common.total')}</span>
                  <span className="value"><Num n={total.balance} /></span>
                  <span className="sub">{sub(total)}</span>
                </li>
              </ul>
            </section>
          )
        })}
        <p className="note">{t('balance.note')}</p>
      </div>
    )
  }

  return (
    <div className="report">
      <h2>{t('balance.freeTitle')}</h2>
      <div className="view-toggle" role="group" aria-label={t('balance.viewLabel')}>{viewButtons}</div>
      {view === 'actual' ? (
        <p className="free">
          <Num n={free.total} />{unit}
          {free.items.length > 0 && (
            <span className="note">
              {t('balance.freeOpen')}
              {free.items.map((item, i) => (
                <span key={item.id}>{i > 0 && t('common.separator')}{item.name} <Num n={item.balance} /></span>
              ))}
              {t('balance.freeClose')}
            </span>
          )}
        </p>
      ) : (
        // 予算反映：自由に使える額 − 今月の上限の残り − 今月の目標の不足。内訳は、実際の額と、引いた額（科目ごと。0の科目は出さない）。引く額が0のときも、形はそろえる
        <p className="free">
          <Num n={budgeted.total} />{unit}
          <span className="note">
            {t('balance.freeOpen')}
            {t('balance.freeTitle')} <Num n={budgeted.free} />{t('common.separator')}{t('balance.budgetReserved')} <Num n={budgeted.reserved === 0 ? 0 : -budgeted.reserved} />
            {budgeted.items.length > 0 && t('common.colon')}
            {budgeted.items.map((item, i) => (
              <span key={item.id}>{i > 0 && t('common.separator')}{item.name} <Num n={item.amount} /></span>
            ))}
            {t('balance.freeClose')}
          </span>
        </p>
      )}
      {!balanced && <p className="error">{t('balance.unbalanced')}</p>}
      <h2>{t('balance.title')}</h2>
      {['asset', 'liability'].map((type) => {
        const total = typeTotals(rows, type)
        return (
        <section key={type}>
          <h3>{TYPE_LABELS[type]}</h3>
          <div className="table-box"><table>
            <thead>
              <tr><th>{t('common.account')}</th><th>{t('balance.debitTotal')}</th><th>{t('balance.creditTotal')}</th><th>{t('common.balance')}</th></tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.account.type === type && (r.account.active || r.used)).map((r) => (
                <tr key={r.account.id} className={r.account.active ? '' : 'inactive'}>
                  <td className="wrap">{r.account.name}{!r.account.active && <span className="note"> {t('common.inactive')}</span>}</td>
                  <td>{formatYen(r.debit)}</td>
                  <td>{formatYen(r.credit)}</td>
                  <td className={r.balance < 0 ? 'neg' : ''}>{formatYen(r.balance)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>{t('common.total')}</td>
                <td>{formatYen(total.debit)}</td>
                <td>{formatYen(total.credit)}</td>
                <td className={total.balance < 0 ? 'neg' : ''}>{formatYen(total.balance)}</td>
              </tr>
            </tbody>
          </table></div>
        </section>
        )
      })}
      <p className="note">{t('balance.note')}</p>
    </div>
  )
}
