import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AmountInput } from './Calculator.jsx'
import { cardReports, planCardAdjustment, formatYen, currencyUnit } from '../ledgerLogic.js'
import { cardLanes, fixBars, shortDate } from '../flowArt.js'
import { toHash } from '../route.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { useBandTop } from './bandHost.js'
import { useBasicPc } from '../basicPc.js'
import { useBasicPhone } from '../basicPhone.js'
import { Icon } from './Icon.jsx'
import { StateTag, EmptyCard } from './FlowParts.jsx'

// クレカ残高調整ページ（群青・基本の PC。#/ledger/card/adjust。見本 E26。手順 docs/plan-card-adjust.md）。
// カードごとの折り畳み。開くと「確定分」と「今期」の 2 行（記録上の額・実際の残高の入力欄・差額）。2 本の仕訳は 1 回の確認で、1 回の update で記録する。
// 計算は ledgerLogic.js の planCardAdjustment（保存はしない）。ここでは新しい計算をしない

const listHash = toHash({ entry: 'ledger', tab: 'card', detailId: null })
const signed = (n) => `${n < 0 ? '−' : n > 0 ? '+' : '±'}${formatYen(Math.abs(n))}`
const TARGETS = ['closed', 'open']

// 1 行の今の状態。kind：empty（空）／expr（式の途中・数字でない）／neg（マイナス）／over（確定分の上限超え）／none（差額 0）／ok（差額あり）
function rowState(data, report, target, text, now) {
  const currency = data.settings.currency
  const current = target === 'closed' ? report.next : report.unbilled
  const v = text.trim()
  if (v === '') return { kind: 'empty', current, actual: current }
  const plan = planCardAdjustment(data.accounts, data.entries, report.account.id, { [`${target}Text`]: v, currency }, now)
  if (plan.error) return { kind: /^\d+$/.test(v) ? 'over' : /^[-−]\d+$/.test(v) ? 'neg' : 'expr', error: plan.error, current, actual: current }
  if (plan.none) return { kind: 'none', current, actual: current }
  const r = plan.rows[0]
  return { kind: 'ok', current, actual: r.actual, diff: r.diff, gain: r.gain, kindLabel: r.kindLabel }
}

// 確認の札の中身：記録する仕訳の表と、1 行の要約
function ConfirmRows({ plan, report, accounts, unit, now }) {
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  const sum = (target) => {
    const r = plan.rows.find((x) => x.target === target)
    const current = target === 'closed' ? report.next : report.unbilled
    return r ? { current, actual: r.actual, d: `${signed(r.diff)} ${r.kindLabel}` } : { current, actual: current, d: '±0' }
  }
  const [c, o] = [sum('closed'), sum('open')]
  return (
    <div className="g-ca-pop">
      <p className="scope"><span className="user-text">{report.account.name}</span>　{t('cardAdjust.dialogNote', { date: now.replaceAll('-', '/'), n: plan.rows.length })}</p>
      <table>
        <thead><tr><th>{t('cardAdjust.colTarget')}</th><th>{t('cardAdjust.colDebit')}</th><th>{t('cardAdjust.colCredit')}</th><th className="n">{t('cardAdjust.colAmount')}</th><th>{t('cardAdjust.colMemo')}</th></tr></thead>
        <tbody>
          {plan.rows.map((r) => (
            <tr key={r.target}>
              <td>{t(`cardAdjust.${r.target}`)}</td>
              <td className="user-text">{name(r.entry.debitId)}</td>
              <td className="user-text">{name(r.entry.creditId)}</td>
              <td className="n">{formatYen(r.entry.amount)}{unit}</td>
              <td>{r.entry.memo || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sumln">{t('cardAdjust.summaryLine', { a: formatYen(c.current), b: formatYen(c.actual), d: c.d, c: formatYen(o.current), e: formatYen(o.actual), f: o.d, unit })}</p>
      <p className="scope">{t('cardAdjust.monthNote')}</p>
    </div>
  )
}

// 行 1 つ（確定分／今期）：見出し・記録上の額・入力・結果
function AdjRow({ target, report, state, text, onText, unit, now }) {
  const lane = cardLanes(report, now, 1)[0] // 今期（いちばん新しい期）
  const detail = target === 'closed'
    ? t('cardAdjust.closedDetail', { closing: shortDate(report.lastClosing, now), pay: shortDate(report.payDate, now) })
    : t('cardAdjust.openDetail', { from: shortDate(lane.start, now), to: shortDate(lane.closingDate, now) })
  const label = t('cardAdjust.actualFor', { kind: t(`cardAdjust.${target}`) })
  const tone = state.kind === 'ok' ? (state.gain ? 'up' : 'down') : ''
  return (
    <div className="g-ckrow">
      <div className="l1"><span className="t">{t(`cardAdjust.${target}`)}</span><span className="d">{detail}</span><span className="rec">{t('cardAdjust.recorded')}<b>{formatYen(state.current)}{unit}</b></span></div>
      <label className="l2"><span className="lab">{label}</span>
        <span className="g-amount-row"><AmountInput bare label={label} placeholder="" value={text} onChange={onText} /><span className="yen">{unit}</span></span>
      </label>
      <div className="l3" role="status">
        {state.kind === 'empty' && <span>{t('cardAdjust.hintEmpty')}</span>}
        {state.kind === 'expr' && <span>{t('cardAdjust.hintExpr')}</span>}
        {state.kind === 'neg' && <span className="err">{t('cardAdjust.errNegative')}</span>}
        {state.kind === 'over' && <span className="err">{state.error}</span>}
        {state.kind === 'none' && <><span className="ba">{formatYen(state.current)} → {formatYen(state.actual)}</span><span>{t('cardAdjust.noDiff')}</span></>}
        {state.kind === 'ok' && <><span className="ba">{formatYen(state.current)} → {formatYen(state.actual)}</span><span className={`df is-${tone}`}>{signed(state.diff)}{unit}</span><StateTag tone={tone}>{state.kindLabel}</StateTag></>}
      </div>
    </div>
  )
}

function CardBlock({ data, update, report, index, texts, setText, onToggle, now, unit }) {
  const confirm = useConfirm()
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const id = report.account.id
  const states = Object.fromEntries(TARGETS.map((x) => [x, rowState(data, report, x, texts[x], now)]))
  const blocked = TARGETS.some((x) => ['expr', 'neg', 'over'].includes(states[x].kind))
  const canConfirm = !blocked && TARGETS.some((x) => states[x].kind === 'ok')

  const submit = async (e) => {
    e.preventDefault()
    setDone('')
    setError('')
    if (!canConfirm) { // Enter で送ったとき（ボタンは押せない）：全部空ならそれを、差額 0 ならそれを知らせる
      if (TARGETS.every((x) => states[x].kind === 'empty')) setError(t('cardAdjust.errActualEmpty'))
      else if (!blocked) setDone(t('cardAdjust.noDiff'))
      return
    }
    const plan = planCardAdjustment(data.accounts, data.entries, id, { closedText: texts.closed.trim(), openText: texts.open.trim(), currency: data.settings.currency }, now)
    if (plan.error || plan.none) return
    const answer = await confirm({
      message: t('cardAdjust.dialogTitle', { n: plan.rows.length }),
      extra: <ConfirmRows plan={plan} report={report} accounts={data.accounts} unit={unit} now={now} />,
      yesLabel: t('cardAdjust.record', { n: plan.rows.length }),
      noLabel: t('cardAdjust.cancel'),
    })
    if (!answer) return
    update({ ...data, entries: plan.entries }) // 2 本あっても 1 回（片方だけが入る途中の状態を作らない）
    setText('closed', '')
    setText('open', '')
    const sum = (x) => { const s = states[x]; return { a: formatYen(s.current), b: formatYen(s.actual), d: s.kind === 'ok' ? `${signed(s.diff)} ${s.kindLabel}` : '±0' } }
    const [c, o] = [sum('closed'), sum('open')]
    setDone(t('cardAdjust.summaryLine', { a: c.a, b: c.b, d: c.d, c: o.a, e: o.b, f: o.d, unit }))
  }

  return (
    <details className="g-ck" open={index === 0 ? true : undefined} onToggle={(e) => onToggle(id, e.currentTarget.open)}>
      <summary>
        <span className="nm user-text">{report.account.name}{!report.account.active && t('common.inactive')}</span>
        <span className="sm2">{t('cardAdjust.closed')}<b>{formatYen(report.next)}{unit}</b>{t('cardAdjust.open')}<b>{formatYen(report.unbilled)}{unit}</b></span>
      </summary>
      <form className="g-ckbody" onSubmit={submit}>
        {TARGETS.map((x) => <AdjRow key={x} target={x} report={report} state={states[x]} text={texts[x]} onText={(v) => { setText(x, v); setDone(''); setError('') }} unit={unit} now={now} />)}
        <div className="g-ckacts">
          {error ? <p className="error" role="alert">{error}</p> : done ? <p className="done" role="status">{done}</p> : <p className="note">{t('cardAdjust.note')}</p>}
          <button className="primary" aria-disabled={!canConfirm}>{t('cardAdjust.confirm')}</button>
        </div>
      </form>
    </details>
  )
}

// 右の青い面：選んだカードの「記録上（点線）→ 実際（白）」の棒 2 本（見るだけ）
// report が null（折り畳みを全部閉じた）ときは、棒を空の状態にする
function FixPanel({ report, texts, data, now, unit }) {
  const rows = TARGETS.map((x) => { const s = report ? rowState(data, report, x, texts[x], now) : { current: 0, actual: 0 }; return { target: x, current: s.current, actual: s.actual } })
  const bars = fixBars(rows)
  const aria = report ? `${t('cardAdjust.barsTitle')} ${report.account.name} ${rows.map((r) => `${t(`cardAdjust.${r.target}`)} ${formatYen(r.current)} → ${formatYen(r.actual)}${unit}`).join(' ')}` : t('cardAdjust.barsTitle')
  return (
    <div className="g-side-panel" role="img" aria-label={aria}>
      <div className="g-side-stick">
        <div className="g-side-art" aria-hidden="true" />
        <div className="g-side-pin" aria-hidden="true">
          <div className="g-side-cap">{t('cardAdjust.barsTitle')}<small lang="en">{t('cardAdjust.barsEn')}</small></div>
          <div className="g-side-sub">{report ? <span className="user-text">{report.account.name}</span> : '—'}　{t('cardAdjust.barsLegend')}</div>
          {bars.map((b) => (
            <div className={`g-fixbar${report ? '' : ' empty'}`} key={b.target}>
              <div className="t"><span>{t(`cardAdjust.${b.target}`)}</span><span>{report ? `${formatYen(b.current)} → ${formatYen(b.actual)}` : '—'}</span></div>
              <div className="trk"><div className="b0" style={{ width: `${b.recorded}%` }} /><div className={`b1${b.down ? ' down' : ''}`} style={{ width: `${b.after}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CardAdjust({ data, update }) {
  const bandTop = useBandTop()
  const basicPc = useBasicPc()
  const basicPhone = useBasicPhone()
  const basic = basicPc || basicPhone // 基本は、PC もスマホも同じ構造（右の図は描かない）。見た目は basic-pc.css・basic-phone.css
  const now = today()
  const unit = currencyUnit(data.settings.currency)
  const reports = cardReports(data.accounts, data.entries, now)
  const ordered = [...reports.filter((r) => r.account.active), ...reports.filter((r) => !r.account.active)] // 使わない設定のカードは、最後
  const [texts, setTexts] = useState({}) // { [カードの id]: { closed, open } }（入力中の文字。保存しない）
  const [pickedId, setPickedId] = useState(undefined) // 青い面に出すカード：最後に開いた折り畳み。undefined＝初めの状態（一番上）、null＝全部閉じた
  const picked = pickedId === undefined ? ordered[0] : ordered.find((r) => r.account.id === pickedId) ?? null
  const onToggle = (id, open) => setPickedId((cur) => (open ? id : (cur === undefined ? ordered[0]?.account.id : cur) === id ? null : cur))
  const textsOf = (id) => ({ closed: '', open: '', ...texts[id] })

  return (
    <div className={basicPc ? 'report b-page b-card-adjust' : basicPhone ? 'report b-phone-p2 b-phone-card-adjust' : 'report g-rep g-card-list g-cardpage g-adjpage'}>
      {bandTop && createPortal(<a className="g-back" href={listHash}><Icon name="back" />{t('cardAdjust.back')}</a>, bandTop)}
      {basicPc && <><div className="back"><a href={listHash}>{t('cardAdjust.back')}</a></div><div className="b-page-head"><h2>{t('cardAdjust.linkLabel')}</h2><p>{t('cardAdjust.note')}</p></div></>}
      {basicPhone && <><div className="back"><a href={listHash}>{t('cardAdjust.back')}</a></div><h2>{t('cardAdjust.linkLabel')}</h2></>}
      <div className="g-card-col">
        <section>
          {basicPc ? <div className="b-section-head"><h3>{t('cardAdjust.heading')}</h3></div> : basicPhone ? <h3>{t('cardAdjust.heading')}</h3> : <h2 className="g-h">{t('cardAdjust.heading')}<small lang="en">{t('cardAdjust.headingEn')}</small></h2>}
          {ordered.length === 0 ? (basic ? <p className="note">{t('card.empty')}</p> : <EmptyCard title={t('card.emptyTitle')}>{t('card.emptyBody')}</EmptyCard>) : ordered.map((r, i) => (
            <CardBlock
              key={r.account.id} data={data} update={update} report={r} index={i} texts={textsOf(r.account.id)}
              setText={(x, v) => setTexts((s) => ({ ...s, [r.account.id]: { ...textsOf(r.account.id), ...s[r.account.id], [x]: v } }))}
              onToggle={onToggle} now={now} unit={unit}
            />
          ))}
        </section>
      </div>
      {!basic && ordered.length > 0 && <FixPanel report={picked} texts={picked ? textsOf(picked.account.id) : {}} data={data} now={now} unit={unit} />}
    </div>
  )
}
