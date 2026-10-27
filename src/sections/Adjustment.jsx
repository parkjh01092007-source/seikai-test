import { useState } from 'react'
import { createPortal } from 'react-dom'
import './adjustment.css'
import { AmountInput } from './Calculator.jsx'
import { groupByType, adjustmentRows, planAdjustment, ledgerBook, formatMoney, formatYen, currencyUnit } from '../ledgerLogic.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { useBandHost } from './bandHost.js'
import BalanceArt from './BalanceArt.jsx'

const signed = (n) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${formatYen(Math.abs(n))}`
const toneOf = (diff, gain) => (diff === 0 ? 'zero' : gain ? 'gain' : 'loss') // 調整益＝緑、調整損＝赤、差額0＝色なし。色だけに頼らず、符号と「調整益／調整損」の字も付ける

// その科目の過去の調整（見るだけ）：既存の元帳（ledgerBook）の行のうち、種類が「残高調整」のものを選ぶ。差額＝その行の残高 − 一つ前の行の残高（新しい計算ではない）。
// 益か損かは、仕訳の借方がその科目かどうか（planAdjustment が仕訳を作るときの決めと同じ）。新しい順に最大5件
function adjustmentHistory(accounts, entries, accountId) {
  const book = accountId ? ledgerBook(accounts, entries, accountId) : null
  if (!book) return []
  let before = book.carryOver ?? 0
  const list = []
  for (const r of book.rows) {
    if (r.entry.kind === 'adjustment') list.push({ id: r.entry.id, date: r.entry.date, diff: r.balance - before, after: r.balance, gain: r.entry.debitId === accountId })
    before = r.balance
  }
  return list.reverse().slice(0, 5)
}

// 金額の後ろの単位（円・원）だけを取り出す（money は「{数字}{単位}」の形）
const unitOf = (money) => money(0).replace(formatYen(0), '')

// 群青の PC の確認画面の表（科目・記録上 → 実際・差額・仕訳）。ConfirmDialog の extra に入れる
function ConfirmRows({ plan, accounts, money }) {
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  const gain = plan.entry.debitId === plan.account.id
  return (
    <dl className="g-adj-pop">
      <dt>{t('common.account')}</dt><dd>{plan.account.name}</dd>
      <dt>{t('adjustment.confirmChange')}</dt><dd className="n">{formatYen(plan.current)} → {money(plan.actual)}</dd>
      <dt>{t('adjustment.rowDiff')}</dt><dd className={`n is-${toneOf(plan.diff, gain)}`}>{t('adjustment.confirmDiff', { diff: signed(plan.diff) + unitOf(money), kind: plan.kindLabel })}</dd>
      <dt>{t('adjustment.confirmEntry')}</dt><dd>{t('adjustment.confirmEntryText', { debit: name(plan.entry.debitId), credit: name(plan.entry.creditId), amount: formatYen(plan.amount) })}</dd>
    </dl>
  )
}

// 差額の段の大きさ（群青の PC）：条件は「箱の幅」でなく「中身の長さ」。いちばん長い数字が 5 桁以上なら差額を 2 行目へ下ろし（wrap）、
// 桁が増えるほど文字を小さくする（val-s1/2＝記録上・実際、dif-s1/2＝差額）。表示だけ。計算は変えない
const digits = (n) => (n === null ? 0 : String(Math.abs(n)).length)
const shrink = (d) => (d > 11 ? 2 : d > 9 ? 1 : 0)
const diffSize = (cur, actual, diff) => {
  const v = shrink(Math.max(digits(cur), digits(actual)))
  const d = shrink(digits(diff))
  return `${Math.max(digits(cur), digits(actual), digits(diff)) >= 5 ? ' wrap' : ''}${v ? ` val-s${v}` : ''}${d ? ` dif-s${d}` : ''}`
}

export default function Adjustment({ data, update }) {
  const { accounts, entries } = data
  const currency = data.settings.currency
  const money = (n) => formatMoney(n, currency)
  const confirm = useConfirm()
  const [accountId, setAccountId] = useState('')
  const [actual, setActual] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [stamp, setStamp] = useState(0) // 群青の PC：記録した直後に「調整済」の判子を押す。回数（押すたびに、動きを最初からやり直す）。入力を変えたら 0（判子は消す）
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()
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
    // 群青の PC：確認は短い文と、4行の表（科目・記録上→実際・差額・仕訳）。ほかの形は、今までの長い1文
    const answer = gunjoPc ? await confirm({ message: t('adjustment.confirmAsk'), extra: <ConfirmRows plan={plan} accounts={accounts} money={money} /> }) : await confirm({ message: text })
    if (!answer) return
    update({ ...data, entries: plan.entries })
    if (gunjoPc) setStamp((n) => n + 1) // 入れた数字は消さない（記録上の残高が実際に追いついて、天秤がつりあう）
    else setActual('')
    setMessage(t('adjustment.done', { kind: plan.kindLabel, amount: money(plan.amount) }))
  }

  // 群青の PC（区切り16-1。見本は orenoyome-tools の plan-adjust-book）：左に幅 clamp(660px, 45vw, 720px) の箱1つ
  // （入力 → 記録上→実際＝差額 → 記録される仕訳 → 調整するボタン → 過去の調整の履歴）、右に青い面（天秤・三日月）。画面の名前は帯のマス。ほかの形は、下のまま
  if (gunjoPc) {
    // 入力中の内容から、箱と天秤に出す数字。計算は、記録するときと同じ planAdjustment（保存はしない）。残高も差額も、ここでは新しく計算しない
    const cur = accountId && balances.has(accountId) ? balances.get(accountId) : null
    const live = cur !== null && actual.trim() !== '' ? planAdjustment(accounts, entries, accountId, actual, today()) : null
    const ok = live && !live.error
    const liveActual = ok ? (live.none ? cur : live.actual) : null
    const diff = ok ? (live.none ? 0 : live.diff) : null
    const gain = ok && !live.none ? live.entry.debitId === accountId : false
    const tone = diff === null ? 'none' : toneOf(diff, gain)
    const kindWord = diff === null ? '' : diff === 0 ? t('adjustment.kindNone') : gain ? t('sheet.gain') : t('sheet.loss')
    const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
    const history = adjustmentHistory(accounts, entries, accountId)
    const unit = currencyUnit(currency)
    return (
      <div className="adjustment g-adjust">
        {bandHost && createPortal(<p className="g-lead">{t('adjustment.lead')}</p>, bandHost)}
        <section className={`g-card g-adjbox${stamp ? (stamp % 2 ? ' thud-a' : ' thud-b') : ''}`}>
          <form onSubmit={save}>
            <div className="g-adj-row g-adj-in g-form">
              <label className="fl"><span className="lab">{t('common.account')}</span>
                <select aria-label={t('common.account')} value={accountId} onChange={(e) => { setAccountId(e.target.value); setStamp(0); setMessage(''); setError('') }}>
                  <option value="">{t('common.chooseAccount')}</option>
                  {groupByType(rows.map((r) => r.account)).map((g) => (
                    <optgroup key={g.type} label={g.label}>
                      {g.accounts.map((a) => <option key={a.id} value={a.id}>{t('adjustment.optionLabel', { name: a.name, balance: money(balances.get(a.id)) })}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="fl"><span className="lab">{t('adjustment.actual')}</span>
                <span className="g-amount-row"><AmountInput bare label={t('adjustment.actual')} placeholder="" value={actual} onChange={(v) => { setActual(v); setStamp(0); setMessage('') }} /><span>{unit}</span></span>
              </label>
            </div>
            <div className={`g-adj-row g-adj-diff is-${tone}${diffSize(cur, liveActual, diff)}`}>
              <div className="cur"><span className="k">{t('adjustment.rowCurrent')}</span><span className="v">{cur === null ? '—' : formatYen(cur)}<small>{unit}</small></span></div>
              <span className="op" aria-hidden="true">→</span>
              <div className="act"><span className="k">{t('adjustment.rowActual')}</span><span className={`v${liveActual === null ? ' empty' : ''}`}>{liveActual === null ? '—' : formatYen(liveActual)}<small>{unit}</small></span></div>
              <span className="op op2" aria-hidden="true">=</span>
              <div className="dif"><span className="k">{t('adjustment.rowDiff')}</span>
                <span className={`v is-${tone}${diff === null ? ' empty' : ''}`}>{diff === null ? '—' : signed(diff)}<small>{unit}</small>{diff !== null && <span className={`tag is-${tone}`}>{kindWord}</span>}</span>
              </div>
            </div>
            <div className="g-adj-row g-adj-entry">
              <div className="hd"><h2 className="g-h">{t('adjustment.entryTitle')}<small lang="en">{t('adjustment.entryEn')}</small></h2><span className="meta">{t('adjustment.entryMeta', { date: today().replaceAll('-', '/') })}</span></div>
              {!ok ? <p className="empty">{t('adjustment.entryEmpty')}</p> : live.none ? <p className="empty">{t('adjustment.entryNone')}</p> : (
                <div className="t-acct">
                  <div className="side"><span className="h">{t('common.debit')}</span><span className="n">{name(live.entry.debitId)}</span><b>{formatYen(live.amount)}</b></div>
                  <div className="side"><span className="h">{t('common.credit')}</span><span className="n">{name(live.entry.creditId)}</span><b>{formatYen(live.amount)}</b></div>
                </div>
              )}
            </div>
            <div className="g-adj-row g-adj-act">
              <button className="primary large">{t('adjustment.submit')}</button>
              <div className="txt">
                {error && <p className="error" role="alert">{error}</p>}
                {message && <p className="done" role="status">{message}</p>}
                <p className="note">{t('adjustment.noteLocked')}</p>
              </div>
              {stamp > 0 && <span className="g-adj-stamp" key={stamp} aria-hidden="true">{t('adjustment.stamp')}</span>}
            </div>
          </form>
          <div className="g-adj-row g-adj-hist">
            <div className="hd"><h2 className="g-h">{accountId ? t('adjustment.historyTitle', { name: name(accountId) }) : t('adjustment.historyTitleNone')}<small lang="en">{t('adjustment.historyEn')}</small></h2><span className="meta">{t('adjustment.historyNote')}</span></div>
            {!accountId ? <p className="empty">{t('adjustment.historyPick')}</p> : history.length === 0 ? <p className="empty">{t('adjustment.historyEmpty')}</p> : (
              <table className="g-adj-histtab">
                <thead><tr><th>{t('common.date')}</th><th className="n">{t('adjustment.historyDiff')}</th><th className="n">{t('adjustment.historyAfter')}</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="d">{h.date.replaceAll('-', '/')}</td>
                      <td className={`n is-${toneOf(h.diff, h.gain)}`}>{signed(h.diff)}<span className="tg">{h.diff === 0 ? t('adjustment.kindNone') : h.gain ? t('sheet.gain') : t('sheet.loss')}</span></td>
                      <td className="n">{formatYen(h.after)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <BalanceArt cur={cur} actual={liveActual} />
      </div>
    )
  }

  return (
    <div className={basicPc ? 'adjustment b-page b-adjustment' : 'adjustment'}>
      {basicPc ? <div className="b-page-head"><h2>{t('adjustment.title')}</h2></div> : <h2>{t('adjustment.title')}</h2>}
      <p className="note">{t('adjustment.note')}</p>
      <form onSubmit={save}>
        {basicPc && <label className="b-field-label" htmlFor="b-adjustment-account">{t('common.account')}</label>}
        <select id={basicPc ? 'b-adjustment-account' : undefined} aria-label={t('common.account')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
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
        <button className={basicPc ? 'b-primary' : undefined}>{t('adjustment.submit')}</button>
        {error && <span className="error">{error}</span>}
        {message && <span className="note">{message}</span>}
      </form>
      <p className="note">{t('adjustment.noteLocked')}</p>
    </div>
  )
}
