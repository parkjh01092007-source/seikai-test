import { useState } from 'react'
import { createPortal } from 'react-dom'
import './balance.css'
import { groupByType, ledgerBook, formatYen, currencyUnit } from '../ledgerLogic.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { useBandHost } from './bandHost.js'
import { BandStat } from './PageBand.jsx'
import { KIND_LABELS } from './Entries.jsx'
import Hint from './Hint.jsx'
import LedgerPicker from './LedgerPicker.jsx'
import BookArt from './BookArt.jsx'

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

export default function LedgerBook({ data }) {
  const { accounts, entries } = data
  const [accountId, setAccountId] = useState('')
  const [month, setMonth] = useState('') // 初期は全期間
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  const book = accountId ? ledgerBook(accounts, entries, accountId, month) : null
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()
  const bandHost = useBandHost()
  const dateText = (d) => (gunjoPc ? d.replaceAll('-', '/') : d) // 群青の PC は、見本どおり 2026/10/02
  const heroValue = book ? `${book.balance < 0 ? '−' : ''}${formatYen(Math.abs(book.balance))}` : ''

  return (
    <div className={`report${gunjoPc ? ` g-book${book ? '' : ' g-book-empty'}` : basicPc ? ' b-page b-book' : ''}`}>
      {/* 群青の PC：画面の名前は帯のマス。帯に、選んだ科目の残高（マイナスは白地の上で読めるよう、赤にせず「−」を付ける） */}
      {bandHost && book && createPortal(<BandStat label={t('book.heroLabel', { name: book.account.name })} value={heroValue} unit={currencyUnit(data.settings.currency)} />, bandHost)}
      {basicPc ? <div className="b-page-head"><h2>{t('book.title')}</h2></div> : !gunjoPc && <h2>{t('book.title')}</h2>}
      {gunjoPc
        ? <LedgerPicker accounts={accounts} entries={entries} accountId={accountId} month={month} onAccount={setAccountId} onMonth={setMonth} />
        : (
        <div className="month-bar">
          {basicPc && <label className="b-field-label" htmlFor="b-book-account">{t('common.account')}</label>}
          <select id={basicPc ? 'b-book-account' : undefined} aria-label={t('common.account')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('common.chooseAccount')}</option>
            {groupByType(accounts).map((g) => (
              <optgroup key={g.type} label={g.label}>
                {g.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{!a.active && t('common.inactive')}</option>)}
              </optgroup>
            ))}
          </select>
          {basicPc && <label className="b-field-label" htmlFor="b-book-month">{t('common.month')}</label>}
          <input id={basicPc ? 'b-book-month' : undefined} type="month" aria-label={t('common.month')} value={month} onChange={(e) => setMonth(e.target.value)} />
          <button type="button" className={basicPc && !month ? 'b-primary' : undefined} onClick={() => setMonth('')}>{t('common.allPeriod')}</button>
        </div>
        )}
      {gunjoPc && !book && <><Hint /><BookArt /></>}
      <p className="note">{t('book.note')}</p>
      {basicPc && book && <div className="b-section-head"><h3>{book.account.name} · {t('basicPc.bookDetails')}</h3><span className="note">{t('basicPc.amountUnit', { unit: currencyUnit(data.settings.currency) })}</span></div>}
      {book && book.total === 0 && <p className="note">{t('book.empty')}</p>}
      {book && book.total > 0 && phone && (
        // スマホの幅（spec-mobile.md 第6章）：1件を2行。1行目に日付・相手の科目・「借方 1,200」、2行目に残高・（種類）・メモ（メモは折り返して全部出す）。
        // 前月までの繰越も同じ形（1行目に「前月までの繰越」、2行目に残高）。PC は下の表のまま
        <>
          <ul className="rows2">
            {book.carryOver !== null && (
              <li className="total">
                <span className="name">{t('book.carryOver')}</span>
                <span className="value" />
                <span className="sub"><span>{t('common.balance')} <Num n={book.carryOver} /></span></span>
              </li>
            )}
            {book.rows.map((r) => (
              <li key={r.entry.id}>
                <span className="name">{r.entry.date} {name(r.otherId)}</span>
                <span className="value">{r.debit !== null ? t('common.debit') : t('common.credit')} {formatYen(r.debit ?? r.credit)}</span>
                <span className="sub">
                  <span>{t('common.balance')} <Num n={r.balance} /></span>
                  {KIND_LABELS[r.entry.kind] && <span>{t('entries.kindNote', { kind: KIND_LABELS[r.entry.kind] })}</span>}
                  {r.entry.memo && <span>{r.entry.memo}</span>}
                </span>
              </li>
            ))}
          </ul>
          {book.rows.length === 0 && <p className="note">{t('common.noEntriesInMonth')}</p>}
        </>
      )}
      {book && book.total > 0 && !phone && (
        <>
          <div className="table-box"><table>
            <thead>
              <tr>
                <th>{t('common.date')}</th><th className="text">{t('common.otherAccount')}</th><th>{t('common.debit')}</th><th>{t('common.credit')}</th><th>{t('common.balance')}</th><th className="text">{t('common.memo')}</th><th className="text">{t('book.kind')}</th>
              </tr>
            </thead>
            <tbody>
              {book.carryOver !== null && (
                <tr className="total">
                  <td colSpan={4}>{t('book.carryOver')}</td>
                  <td className={book.carryOver < 0 ? 'neg' : ''}>{formatYen(book.carryOver)}</td>
                  <td colSpan={2} />
                </tr>
              )}
              {book.rows.map((r) => (
                <tr key={r.entry.id}>
                  <td>{dateText(r.entry.date)}</td>
                  <td className="text wrap">{gunjoPc ? <button type="button" className="lk" onClick={() => setAccountId(r.otherId)}>{name(r.otherId)}</button> : name(r.otherId)}</td>
                  <td>{r.debit !== null && formatYen(r.debit)}</td>
                  <td>{r.credit !== null && formatYen(r.credit)}</td>
                  <td><Num n={r.balance} /></td>
                  <td className="text wrap">{r.entry.memo}</td>
                  <td className="text">{KIND_LABELS[r.entry.kind]}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {book.rows.length === 0 && <p className="note">{t('common.noEntriesInMonth')}</p>}
        </>
      )}
    </div>
  )
}
