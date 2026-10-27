import { useState } from 'react'
import { createPortal } from 'react-dom'
import './balance.css'
import { TYPE_LABELS, accountBalances, freeAmount, budgetFreeAmount, typeTotals, assetShares, assetLiabilityGap, perDayAmount, daysLeftInMonth, roadDays, formatYen, currencyUnit } from '../ledgerLogic.js'
import { BALANCE_VIEWS, BALANCE_VIEW_LABELS, loadBalanceView } from '../storage.js'
import { loadNoSpendShape } from '../entryView.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { useBasicPhone } from '../basicPhone.js'
import { useBandHost, useBandRoad } from './bandHost.js'
import { signedYen } from './PageBand.jsx'
import MonthRoad from './MonthRoad.jsx'

const BAR_COLORS = ['#2A1BFF', '#5A4DFF', '#12086E', '#8478FF'] // 積み上げ棒の色（E-rules 8 章。地との比 3:1 以上）。5 つ目からは繰り返す
const BAR_TEXT = ['#fff', '#fff', '#fff', '#12086E']

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

export default function Balance({ data }) {
  const { accounts, entries } = data
  const unit = currencyUnit(data.settings.currency)
  const free = freeAmount(accounts, entries, data.loans, today().slice(0, 7)) // 借りているお金（loans）は、残高全体ではなく今月の返済額だけ引く
  // 自由に使える額の表示：最初は設定（ブラウザごとに覚えた「自由に使える額の初めの表示」）。ボタンで切り替えた状態は覚えない（画面を移ると、設定の値に戻る）
  const [view, setView] = useState(loadBalanceView)
  const budgeted = budgetFreeAmount(accounts, entries, data.budgets, today().slice(0, 7), data.loans) // 今月の予算を反映した額（仕様 5.13）
  const { rows, balanced } = accountBalances(accounts, entries)
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()
  const basicPhone = useBasicPhone()
  const bandHost = useBandHost()
  const bandRoad = useBandRoad()
  const viewButtons = BALANCE_VIEWS.map((v) => (
    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{t(BALANCE_VIEW_LABELS[v])}</button>
  ))

  // 群青の PC（見本 E-balance-p1。spec-design.md 8.2）：帯 L に、自由に使える額（大きな数字）・その内訳の 1 行・1日あたりの札・実際／予算反映のボタン・今月の月の道。
  // 中身は、左に資産（積み上げ棒と表）、右に負債（札）と「資産 − 負債」の札。計算は今までと同じ（freeAmount・budgetFreeAmount・perDayAmount・typeTotals）。月の選びはない（月の道は今月）
  if (gunjoPc) {
    const todayStr = today()
    const road = roadDays(accounts, entries, todayStr.slice(0, 7), todayStr, data.noSpendDays)
    const amount = view === 'actual' ? free.total : budgeted.total
    const perDay = perDayAmount(amount, todayStr)
    const sep = t('common.separator')
    const yen = (n) => signedYen(n, formatYen)
    const list = (items) => items.map(([id, name, n], i) => <span key={id}>{i > 0 && sep}<span className="user-text">{name}</span> {yen(n)}</span>)
    const breakdown = view === 'actual'
      ? (free.items.length > 0 && <>{t('balance.freeOpen')}{list(free.items.map((x) => [x.id, x.name, x.balance]))}{t('balance.freeClose')}</>)
      : <>{t('balance.freeOpen')}{t('balance.freeTitle')} {yen(budgeted.free)}{sep}{t('balance.budgetReserved')} {yen(budgeted.reserved === 0 ? 0 : -budgeted.reserved)}{budgeted.items.length > 0 && t('common.colon')}{list(budgeted.items.map((x) => [x.id, x.name, x.amount]))}{t('balance.freeClose')}</>
    const shares = assetShares(rows)
    const liabilityTotal = typeTotals(rows, 'liability')
    const gap = assetLiabilityGap(rows)
    const table = (type) => {
      const total = typeTotals(rows, type)
      return (
        <div className="table-box"><table>
          <thead><tr><th>{t('common.account')}</th><th>{t('balance.debitTotal')}</th><th>{t('balance.creditTotal')}</th><th>{t('common.balance')}</th></tr></thead>
          <tbody>
            {rows.filter((r) => r.account.type === type && (r.account.active || r.used)).map((r) => (
              <tr key={r.account.id} className={r.account.active ? '' : 'inactive'}>
                <td className="wrap"><span className="user-text">{r.account.name}</span>{!r.account.active && <span className="note"> {t('common.inactive')}</span>}</td>
                <td>{formatYen(r.debit)}</td>
                <td>{formatYen(r.credit)}</td>
                <td className={r.balance < 0 ? 'neg' : ''}>{formatYen(r.balance)}</td>
              </tr>
            ))}
            <tr className={`total${type === 'liability' ? ' navy' : ''}`}>
              <td>{t('common.total')}</td>
              <td>{formatYen(total.debit)}</td>
              <td>{formatYen(total.credit)}</td>
              <td>{formatYen(total.balance)}</td>
            </tr>
          </tbody>
        </table></div>
      )
    }
    const heading = (type, en) => <h2 className="g-h">{TYPE_LABELS[type]}<small lang="en">{t(en)}</small></h2>
    return (
      <div className="report g-rep g-bal">
        {bandHost && createPortal(<>
          <div className="g-free">
            <div className="g-stat-lab">{t('balance.freeTitle')}</div>
            <div className="g-free-num">{yen(amount)}<span className="g-free-unit">{unit}</span></div>
          </div>
          <div className="g-perday">
            <div className="g-perday-lab">{t('balance.daysLeft', { n: daysLeftInMonth(todayStr) })}{t('common.separator')}{t('balance.perDay')}</div>
            <div className={`g-perday-num${perDay < 0 ? ' neg' : ''}`}>{yen(perDay)}<span className="g-perday-unit">{unit}</span></div>
          </div>
          <div className="g-toggle" role="group" aria-label={t('balance.viewLabel')}>{viewButtons}</div>
          {breakdown && <div className="g-brk">{breakdown}</div>}
        </>, bandHost)}
        {bandRoad && createPortal(<MonthRoad road={road} currency={data.settings.currency} shape={loadNoSpendShape()} />, bandRoad)}
        {!balanced && <p className="error">{t('balance.unbalanced')}</p>}
        <div className="g-bal-body">
          <section className="g-bal-assets">
            {heading('asset', 'balance.assetsEn')}
            {shares.items.length > 0 && (
              <div className="g-stack" role="img" aria-label={t('balance.assetBar')}>
                {shares.items.map((it, i) => (
                  <div key={it.id} title={t('balance.segTitle', { name: it.name, amount: formatYen(it.balance), share: it.share })} style={{ flex: `${it.balance} 1 0`, background: BAR_COLORS[i % 4], color: BAR_TEXT[i % 4] }}>{it.share >= 10 && <span className="user-text">{it.name}</span>}</div>
                ))}
              </div>
            )}
            {(shares.items.length > 0 || shares.negatives.length > 0) && (
              <ul className="g-leg">
                {shares.items.map((it, i) => <li key={it.id}><i style={{ background: BAR_COLORS[i % 4] }} /><span className="user-text">{it.name}</span> {formatYen(it.balance)}</li>)}
                {shares.negatives.map((it) => <li key={it.id} className="neg"><span className="user-text">{it.name}</span>{t('balance.barNegative')} {yen(it.balance)}</li>)}
              </ul>
            )}
            {table('asset')}
          </section>
          <div className="g-bal-side">
            <section className="g-card">
              {heading('liability', 'balance.liabilitiesEn')}
              {liabilityTotal.balance > 0 && <div className="g-stack low" role="img" aria-label={t('balance.liabilityBar')}><div style={{ flex: 1, background: '#12086E' }} /></div>}
              {table('liability')}
            </section>
            <div className="g-gap">
              <div className="g-gap-lab">{t('balance.gap')}</div>
              <div className="g-gap-num">{yen(gap)}<span className="g-gap-unit">{unit}</span></div>
            </div>
          </div>
        </div>
        <p className="note">{t('balance.note')}</p>
      </div>
    )
  }

  if (basicPc) {
    const amount = view === 'actual' ? free.total : budgeted.total
    const gap = assetLiabilityGap(rows)
    return (
      <div className="report b-page b-balance">
        <div className="b-page-head"><h2>{t('balance.title')}</h2><p>{t('basicPc.balanceLead')}</p></div>
        {!balanced && <p className="error">{t('balance.unbalanced')}</p>}
        <div className="b-report-grid">
          <div className="b-report-main">
            {['asset', 'liability'].map((type) => {
              const total = typeTotals(rows, type)
              return (
                <section key={type}>
                  <div className="b-section-head"><h3>{TYPE_LABELS[type]}</h3><span className="note">{t('monthly.unit', { unit })}</span></div>
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
          </div>
          <div className="b-report-side">
            <section>
              <div className="b-section-head"><h3>{t('balance.freeTitle')}</h3></div>
              <div className="view-toggle" role="group" aria-label={t('balance.viewLabel')}>{viewButtons}</div>
              <dl className="b-amounts">
                <div><dt>{t('balance.freeTitle')}</dt><dd className={`b-large${amount < 0 ? ' neg' : ''}`}>{formatYen(amount)} {unit}</dd></div>
                {view === 'actual' ? (
                  free.items.map((item) => (
                    <div key={item.id}><dt>{item.name}</dt><dd><Num n={item.balance} /> {unit}</dd></div>
                  ))
                ) : (
                  <>
                    <div><dt>{t('balance.freeTitle')}</dt><dd><Num n={budgeted.free} /> {unit}</dd></div>
                    <div><dt>{t('balance.budgetReserved')}</dt><dd><Num n={budgeted.reserved === 0 ? 0 : -budgeted.reserved} /> {unit}</dd></div>
                    {budgeted.items.map((item) => (
                      <div key={item.id}><dt>{item.name}</dt><dd><Num n={item.amount} /> {unit}</dd></div>
                    ))}
                  </>
                )}
              </dl>
            </section>
            <section>
              <div className="b-section-head"><h3>{t('basicPc.assetsLiabilities')}</h3></div>
              <dl className="b-amounts">
                <div><dt>{t('balance.gap')}</dt><dd className={`b-gap${gap < 0 ? ' neg' : ''}`}>{formatYen(gap)} {unit}</dd></div>
              </dl>
            </section>
          </div>
        </div>
        <p className="note">{t('balance.note')}</p>
      </div>
    )
  }

  // スマホの幅（spec-mobile.md 第6章、見本 Y1-mobile の3つ目）：自由に使える額は大きな数字と、かっこなしで折り返す内訳。
  // 科目は1件を2行（1行目に科目と残高、2行目に「借方 ○○　貸方 ○○」）。合計の行は1行目だけ太字。PC は下の表のまま
  if (phone) {
    const join = (items, render) => items.map((item, i) => <span key={item.id}>{i > 0 && t('common.separator')}{render(item)}</span>)
    return (
      <div className={basicPhone ? 'report b-phone-p5 b-phone-balance' : 'report'}>
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
