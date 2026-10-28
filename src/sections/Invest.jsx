import { useState } from 'react'
import { formatMoney } from '../ledgerLogic.js'
import { cashAccounts } from '../loanView.js'
import { formatUsd, formatFx, investOverview, holdingBuys, holdingSells, computeSell, estimateSell, taxFromReceived, costAt, recordSell, editSell, newHolding, editHoldingMeta, recordBuy, editBuy, deleteTrade, parseUnits, addQuote, removeQuote, removeHolding, formatUnits, HOLDING_KINDS } from '../investView.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { IconButton, Icon } from './Icon.jsx'
import { useBasicPhone } from '../basicPhone.js'
import InvestChart from './InvestChart.jsx'

const KIND_LABELS = { 'jp-stock': 'invest.kind.jpStock', fund: 'invest.kind.fund', 'us-stock': 'invest.kind.usStock' }
const Field = ({ label, children }) => <label className="b-field"><span>{label}</span>{children}</label>
const signed = (n, currency) => `${n > 0 ? '+' : ''}${formatMoney(n, currency)}`
const firstCash = (accounts) => { const list = cashAccounts(accounts); return (list.find((a) => a.preset === 'bank') ?? list[0])?.id ?? '' }

// 銘柄を足す：名前・種類・NISA・売る時の手数料の見込み。銘柄ごとに資産の科目を 1 つ作る（investView.newHolding）
function AddForm({ data, update, onDone }) {
  const [f, setF] = useState({ kind: 'jp-stock', name: '', nisa: false, sellFeeText: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const submit = (e) => {
    e.preventDefault()
    const r = newHolding(f, data.accounts)
    if (r.error) { setError(r.error); return }
    update({ ...data, accounts: [...data.accounts, r.account], holdings: [...data.holdings, r.holding] })
    onDone(r.holding.id)
  }
  return <form className="b-loan-form" onSubmit={submit}>
    <div className="b-loan-fields">
      <Field label={t('invest.fKind')}><select value={f.kind} onChange={set('kind')}>{HOLDING_KINDS.map((k) => <option key={k} value={k}>{t(KIND_LABELS[k])}</option>)}</select></Field>
      <Field label={t('invest.fName')}><input value={f.name} onChange={set('name')} /></Field>
      <Field label={t('invest.fSellFee')}><input inputMode="numeric" value={f.sellFeeText} onChange={set('sellFeeText')} /></Field>
    </div>
    <label className="b-check"><input type="checkbox" checked={f.nisa} onChange={set('nisa')} />{t('invest.fNisa')}</label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="b-loan-actions"><button className="b-primary">{t('invest.create')}</button><button type="button" onClick={() => onDone(null)}>{t('loans.cancel')}</button></div>
  </form>
}

function Row({ item, currency, current, onSelect }) {
  const { holding: h, cost, value, gain } = item
  return <button type="button" className={`b-inv-row${current ? ' current' : ''}`} aria-pressed={current} onClick={onSelect}>
    <span className="nm user-text">{h.name}{h.nisa && <span className="tag">{t('invest.nisa')}</span>}</span>
    <span className="v">{value === null ? formatMoney(cost, currency) : formatMoney(value, currency)}</span>
    <span className="sub">{t(KIND_LABELS[h.kind])}</span>
    <span className={`sub g${gain < 0 ? ' neg' : ''}`}>{gain === null ? t(item.units === 0 && h.trades.length > 0 ? 'invest.soldOut' : 'invest.noPriceShort') : signed(gain, currency)}</span>
  </button>
}

// 買いの 1 行（直す・消す）
function BuyRow({ data, update, h, row, currency, readOnly }) {
  const confirm = useConfirm()
  const { trade, amount } = row
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ date: trade.date, units: formatUnits(trade.units).replaceAll(',', ''), amount: amount === null ? '' : String(amount) })
  const [error, setError] = useState('')
  const save = (e) => {
    e.preventDefault()
    const r = editBuy(data, h, trade.id, { date: f.date, unitsText: f.units, amountText: f.amount })
    if (r.error) { setError(r.error); return }
    update({ ...data, entries: r.entries, holdings: r.holdings })
    setEditing(false)
    setError('')
  }
  const del = async () => {
    if (!(await confirm({ message: t('entries.deleteConfirm') }))) return
    const r = deleteTrade(data, h, trade.id)
    if (r.error) { setError(r.error); return }
    update({ ...data, entries: r.entries, holdings: r.holdings })
  }
  if (editing) {
    return <li className="b-loan-erow editing"><form onSubmit={save}>
      <div className="b-loan-fields">
        <Field label={t('loans.date')}><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={t('invest.units')}><input inputMode="decimal" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} /></Field>
        <Field label={t('invest.buyAmount')}><input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="b-loan-actions"><button className="b-primary">{t('common.save')}</button><button type="button" onClick={() => { setEditing(false); setError('') }}>{t('loans.cancel')}</button></div>
    </form></li>
  }
  return <li className="b-loan-erow b-inv-buy">
    {error && <p className="error" role="alert">{error}</p>}
    <span className="d">{trade.date}</span>
    <span className="k">{t('invest.rowBuy')}</span>
    <span className="m">{t('invest.unitsValue', { units: formatUnits(trade.units) })}</span>
    <span className="a">{amount === null ? '—' : formatMoney(amount, currency)}</span>
    {!readOnly && <span className="ops">
      {amount !== null && <IconButton icon="edit" label={t('common.edit')} onClick={() => setEditing(true)} />}
      <IconButton icon="trash" className="b-danger" label={t('common.delete')} onClick={del} />
    </span>}
  </li>
}

const unitsText = (units) => formatUnits(units).replaceAll(',', '')
const hundredths = (n) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`
// 価格の文字：円の銘柄は円、米国株は「150.25 ドル（1 ドル = 152.30 円）」
const quoteText = (h, q, currency) => (h.currency === 'USD' ? t('invest.quoteUsd', { usd: formatUsd(q.price), fx: formatFx(q.rate) }) : formatMoney(q.price, currency))

// 売りの 1 行（直す・消す）。直しは、古い売りを消して、入れ直した数字で記録し直す（原価は売った日までの残高から出し直す）
function SellRow({ data, update, h, row, currency, readOnly }) {
  const confirm = useConfirm()
  const { trade, gain, fee, tax, received, toId } = row
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ date: trade.date, units: unitsText(trade.units), received: String(received), fee: String(fee), tax: String(tax) })
  const [error, setError] = useState('')
  const save = (e) => {
    e.preventDefault()
    const r = editSell(data, h, trade.id, { date: f.date, unitsText: f.units, receivedText: f.received, feeText: f.fee, taxText: f.tax, toId: toId || firstCash(data.accounts) })
    if (r.error) { setError(r.error); return }
    update({ ...data, accounts: r.accounts, entries: r.entries, holdings: r.holdings })
    setEditing(false)
    setError('')
  }
  const del = async () => {
    if (!(await confirm({ message: t('entries.deleteConfirm') }))) return
    const r = deleteTrade(data, h, trade.id)
    if (r.error) { setError(r.error); return }
    update({ ...data, entries: r.entries, holdings: r.holdings })
  }
  if (editing) {
    return <li className="b-loan-erow editing"><form onSubmit={save}>
      <div className="b-loan-fields">
        <Field label={t('loans.date')}><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={t('invest.units')}><input inputMode="decimal" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value })} /></Field>
        <Field label={t('invest.received')}><input inputMode="numeric" value={f.received} onChange={(e) => setF({ ...f, received: e.target.value })} /></Field>
        <Field label={t('invest.sellFee')}><input inputMode="numeric" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} /></Field>
        <Field label={t('invest.sellTax')}><input inputMode="numeric" value={f.tax} onChange={(e) => setF({ ...f, tax: e.target.value })} /></Field>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="b-loan-actions"><button className="b-primary">{t('common.save')}</button><button type="button" onClick={() => { setEditing(false); setError('') }}>{t('loans.cancel')}</button></div>
    </form></li>
  }
  return <li className="b-loan-erow b-inv-buy">
    {error && <p className="error" role="alert">{error}</p>}
    <span className="d">{trade.date}</span>
    <span className="k">{t('invest.rowSell')}</span>
    <span className="m">{t('invest.unitsValue', { units: formatUnits(trade.units) })}　<span className={gain < 0 ? 'neg' : ''}>{t(gain < 0 ? 'invest.rowLoss' : 'invest.rowGain')} {signed(gain, currency)}</span></span>
    <span className="a">{formatMoney(received, currency)}</span>
    {!readOnly && <span className="ops">
      <IconButton icon="edit" label={t('common.edit')} onClick={() => setEditing(true)} />
      <IconButton icon="trash" className="b-danger" label={t('common.delete')} onClick={del} />
    </span>}
  </li>
}

function Detail({ item, data, update, currency, readOnly, onRemoved }) {
  const confirm = useConfirm()
  const { holding: h, cost, units, quote, value, gain, afterSale } = item
  const [buy, setBuy] = useState(() => ({ date: today(), units: '', amount: '', fromId: firstCash(data.accounts) }))
  const [quoteF, setQuoteF] = useState(() => ({ date: today(), price: '', rate: h.currency === 'USD' && quote ? hundredths(quote.rate) : '' })) // 為替レートは、前に入れた値を初めに入れておく
  const [meta, setMeta] = useState(() => ({ nisa: h.nisa, sellFee: String(h.sellFee ?? '') }))
  const [sell, setSell] = useState(() => ({ date: today(), units: '', received: '', fee: String(h.sellFee ?? ''), tax: '', toId: firstCash(data.accounts) }))
  const [touched, setTouched] = useState({ received: false, tax: false }) // 手で直した欄は、見込みで上書きしない
  const sellInput = (s) => ({ date: s.date, unitsText: s.units, receivedText: s.received, feeText: s.fee, taxText: s.tax, toId: s.toId })
  const sellPreview = computeSell(data, h, sellInput(sell))
  const setSellField = (k) => (e) => {
    const next = { ...sell, [k]: e.target.value }
    const tc = { ...touched, ...(k === 'received' || k === 'tax' ? { [k]: true } : {}) }
    if (k === 'received' && !tc.tax) {
      const u = parseUnits(next.units)
      const r = Number(next.received)
      if (!u.error && Number.isInteger(r) && r >= 0) next.tax = String(taxFromReceived(r, costAt(data, h, next.date, u.units).cost, h.nisa))
    }
    if (['units', 'date', 'fee'].includes(k)) { // 数量・日付・手数料を変えたら、見込み（受け取った金額・税）を入れ直す
      const est = estimateSell(data, h, { date: next.date, unitsText: next.units, feeText: next.fee })
      if (est) { if (!tc.received) next.received = String(est.received); if (!tc.tax) next.tax = String(est.tax) }
      else if (!tc.received && k === 'units') { next.received = ''; if (!tc.tax) next.tax = '' }
    }
    setSell(next)
    setTouched(tc)
    setError('sell', '')
  }
  const submitSell = (e) => {
    e.preventDefault()
    const r = recordSell(data, h, sellInput(sell))
    if (r.error) { setError('sell', r.error); return }
    update({ ...data, accounts: r.accounts, entries: r.entries, holdings: r.holdings })
    setSell({ ...sell, units: '', received: '', tax: '' })
    setTouched({ received: false, tax: false })
    setError('sell', '')
  }
  const [errors, setErrors] = useState({})
  const setError = (k, v) => setErrors((e) => ({ ...e, [k]: v }))
  const replace = (holding) => update({ ...data, holdings: data.holdings.map((x) => (x.id === holding.id ? holding : x)) })
  const submitBuy = (e) => {
    e.preventDefault()
    const r = recordBuy(data, h, { date: buy.date, unitsText: buy.units, amountText: buy.amount, fromId: buy.fromId })
    if (r.error) { setError('buy', r.error); return }
    update({ ...data, entries: r.entries, holdings: r.holdings })
    setBuy({ ...buy, units: '', amount: '' })
    setError('buy', '')
  }
  const submitQuote = (e) => {
    e.preventDefault()
    const r = addQuote(h, { date: quoteF.date, priceText: quoteF.price, rateText: quoteF.rate })
    if (r.error) { setError('quote', r.error); return }
    replace(r.holding)
    setQuoteF({ ...quoteF, price: '' })
    setError('quote', '')
  }
  const saveMeta = (next) => {
    const r = editHoldingMeta(h, { nisa: next.nisa, sellFeeText: next.sellFee })
    if (r.error) { setError('meta', r.error); return }
    replace(r.holding)
    setError('meta', '')
  }
  const remove = async () => {
    if (await confirm({ message: t('invest.removeConfirm', { name: h.name }) })) { update({ ...data, holdings: removeHolding(data.holdings, h.id) }); onRemoved() }
  }
  const fact = (label, val, small) => <div className="b-loan-fact"><span className="k">{label}</span><span className="v">{val}{small && <small>{small}</small>}</span></div>
  return <section className="b-loan-detail b-inv-detail">
    <div className="b-loan-dhead">
      <h3><span className="user-text">{h.name}</span><small>{t(KIND_LABELS[h.kind])}{h.nisa && <span className="tag">{t('invest.nisa')}</span>}</small></h3>
      <p><span>{t('invest.costLabel')}</span><strong>{formatMoney(cost, currency)}</strong></p>
    </div>
    <div className="b-loan-facts">
      {fact(t('invest.unitsLabel'), formatUnits(units))}
      {fact(t('invest.valueLabel'), value === null ? '—' : formatMoney(value, currency), quote ? t('invest.priceDate', { date: quote.date.replaceAll('-', '/'), price: quoteText(h, quote, currency) }) : undefined)}
      {fact(t('invest.gainLabel'), gain === null ? '—' : <span className={gain < 0 ? 'neg' : ''}>{signed(gain, currency)}</span>)}
    </div>
    {!readOnly && <InvestChart data={data} holdings={[h]} currency={currency} name={h.name} />}
    {units === 0 && h.trades.length > 0 ? <p className="note">{t('invest.soldOutNote')}</p> : quote === null ? <p className="note">{t('invest.noPrice')}</p> : afterSale && <div className="b-inv-after">
      <h4>{t('invest.afterSaleTitle')}</h4>
      <p className="big">{formatMoney(afterSale.net, currency)}</p>
      <p className="calc">
        {t('invest.valueLabel')} {formatMoney(afterSale.value, currency)}　−　{t('invest.afterFee')} {formatMoney(afterSale.fee, currency)}　−　{t('invest.afterTax')} {h.nisa ? t('invest.afterNisa') : formatMoney(afterSale.tax, currency)}
      </p>
    </div>}
    {!readOnly && <>
      <form className="b-loan-form" onSubmit={submitBuy}>
        <h4>{t('invest.buyTitle')}</h4>
        <div className="b-loan-fields">
          <Field label={t('loans.date')}><input type="date" value={buy.date} onChange={(e) => setBuy({ ...buy, date: e.target.value })} /></Field>
          <Field label={t('invest.units')}><input inputMode="decimal" value={buy.units} onChange={(e) => setBuy({ ...buy, units: e.target.value })} /></Field>
          <Field label={t(h.currency === 'USD' ? 'invest.buyAmountUs' : 'invest.buyAmount')}><input inputMode="numeric" value={buy.amount} onChange={(e) => setBuy({ ...buy, amount: e.target.value })} /></Field>
          <Field label={t('loans.payFrom')}><select value={buy.fromId} onChange={(e) => setBuy({ ...buy, fromId: e.target.value })}>{cashAccounts(data.accounts).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </div>
        {errors.buy && <p className="error" role="alert">{errors.buy}</p>}
        <div className="b-loan-actions"><button className="b-primary">{t('invest.recordBuy')}</button></div>
      </form>
      <form className="b-loan-form" onSubmit={submitSell}>
        <h4>{t('invest.sellTitle')}</h4>
        <div className="b-loan-fields">
          <Field label={t('loans.date')}><input type="date" value={sell.date} onChange={setSellField('date')} /></Field>
          <Field label={t('invest.units')}><input inputMode="decimal" value={sell.units} onChange={setSellField('units')} /></Field>
          <Field label={t('invest.received')}><input inputMode="numeric" value={sell.received} onChange={setSellField('received')} /></Field>
          <Field label={t('invest.sellFee')}><input inputMode="numeric" value={sell.fee} onChange={setSellField('fee')} /></Field>
          <Field label={t('invest.sellTax')}><input inputMode="numeric" value={sell.tax} onChange={setSellField('tax')} /></Field>
          <Field label={t('loans.receiveTo')}><select value={sell.toId} onChange={setSellField('toId')}>{cashAccounts(data.accounts).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </div>
        {!sellPreview.error && <p className="calc b-inv-preview">{t('invest.pvGross', { amount: formatMoney(sellPreview.gross, currency) })}　{t('invest.pvCost', { amount: formatMoney(sellPreview.cost, currency) })}　<span className={sellPreview.gain < 0 ? 'neg' : ''}>{t(sellPreview.gain < 0 ? 'invest.pvLoss' : 'invest.pvGain', { amount: signed(sellPreview.gain, currency) })}</span></p>}
        {errors.sell && <p className="error" role="alert">{errors.sell}</p>}
        <div className="b-loan-actions"><button className="b-primary">{t('invest.recordSell')}</button></div>
      </form>
      <form className="b-loan-form" onSubmit={submitQuote}>
        <h4>{t('invest.quoteTitle')}</h4>
        <div className="b-loan-fields">
          <Field label={t('loans.date')}><input type="date" value={quoteF.date} onChange={(e) => setQuoteF({ ...quoteF, date: e.target.value })} /></Field>
          <Field label={t(h.kind === 'fund' ? 'invest.priceFund' : h.kind === 'us-stock' ? 'invest.priceUsd' : 'invest.priceStock')}><input inputMode={h.currency === 'USD' ? 'decimal' : 'numeric'} value={quoteF.price} onChange={(e) => setQuoteF({ ...quoteF, price: e.target.value })} /></Field>
          {h.currency === 'USD' && <Field label={t('invest.fxRate')}><input inputMode="decimal" value={quoteF.rate} onChange={(e) => setQuoteF({ ...quoteF, rate: e.target.value })} /></Field>}
        </div>
        {errors.quote && <p className="error" role="alert">{errors.quote}</p>}
        <div className="b-loan-actions"><button className="b-primary">{t('invest.saveQuote')}</button></div>
      </form>
    </>}
    <div className="b-section-head"><h3>{t('invest.buysTitle')}</h3></div>
    {holdingBuys(data, h).length === 0 ? <p className="note">{t('invest.buysEmpty')}</p> : <ul className="b-loan-elist">{holdingBuys(data, h).map((row) => <BuyRow key={row.trade.id} data={data} update={update} h={h} row={row} currency={currency} readOnly={readOnly} />)}</ul>}
    {holdingSells(data, h).length > 0 && <>
      <div className="b-section-head"><h3>{t('invest.sellsTitle')}</h3></div>
      <ul className="b-loan-elist">{holdingSells(data, h).map((row) => <SellRow key={row.trade.id} data={data} update={update} h={h} row={row} currency={currency} readOnly={readOnly} />)}</ul>
    </>}
    {h.quotes.length > 0 && <div className="b-inv-quotes">
      <h4>{t('invest.quotesTitle')}</h4>
      <ul>{[...h.quotes].sort((a, b) => (a.date < b.date ? 1 : -1)).map((q) => <li key={q.date}>
        <span>{q.date.replaceAll('-', '/')}</span><span>{quoteText(h, q, currency)}</span>
        {!readOnly && <IconButton icon="trash" className="b-danger" label={t('common.delete')} onClick={() => replace(removeQuote(h, q.date))} />}
      </li>)}</ul>
    </div>}
    {!readOnly && <div className="b-loan-form">
      <h4>{t('invest.metaTitle')}</h4>
      <label className="b-check"><input type="checkbox" checked={meta.nisa} onChange={(e) => { const next = { ...meta, nisa: e.target.checked }; setMeta(next); saveMeta(next) }} />{t('invest.fNisa')}</label>
      <div className="b-loan-fields">
        <Field label={t('invest.fSellFee')}><input inputMode="numeric" value={meta.sellFee} onChange={(e) => setMeta({ ...meta, sellFee: e.target.value })} onBlur={() => saveMeta(meta)} /></Field>
      </div>
      {errors.meta && <p className="error" role="alert">{errors.meta}</p>}
      <div className="b-loan-actions"><button type="button" className="b-danger" onClick={remove}>{t('invest.remove')}</button></div>
    </div>}
    {readOnly && <p className="note">{t('invest.phoneViewOnly')}</p>}
  </section>
}

// 投資のページ（基本のテーマ）。PC：左に銘柄の一覧、右に選んだ銘柄。スマホ：見るだけ。時価・評価損益はこのページだけに出す（自由に使える額・月次には入れない）
export default function Invest({ data, update, detailId = null }) {
  const phone = useBasicPhone()
  const currency = data.settings.currency
  const { items, totals } = investOverview(data)
  const [selectedId, setSelectedId] = useState(detailId)
  const [adding, setAdding] = useState(false)
  const selected = items.find((i) => i.holding.id === selectedId) ?? (phone ? undefined : items[0])
  const tiles = <div className="b-loan-tiles">
    <div className="b-loan-tile"><span className="lbl">{t('invest.sumCost')}</span><strong>{formatMoney(totals.cost, currency)}</strong><span className="sub">{t('invest.sumCount', { count: items.length })}</span></div>
    <div className="b-loan-tile"><span className="lbl">{t('invest.sumValue')}</span><strong>{items.some((i) => i.value !== null) ? formatMoney(totals.value, currency) : '—'}</strong>{totals.missing > 0 && items.length > 0 && <span className="sub">{t('invest.sumMissing', { count: totals.missing })}</span>}</div>
    <div className="b-loan-tile"><span className="lbl">{t('invest.sumGain')}</span><strong className={totals.gain < 0 ? 'neg' : ''}>{items.some((i) => i.value !== null) ? signed(totals.gain, currency) : '—'}</strong></div>
  </div>
  if (phone) {
    if (selected) return <div className="report b-phone-p5 b-phone-invest">
      <button type="button" className="b-pl-back" onClick={() => setSelectedId(null)}><Icon name="back" />{t('loans.back')}</button>
      <Detail key={selected.holding.id} item={selected} data={data} update={update} currency={currency} readOnly onRemoved={() => setSelectedId(null)} />
    </div>
    return <div className="report b-phone-p5 b-phone-invest">
      {tiles}
      {items.length === 0 && <p className="note">{t('invest.empty')}</p>}
      <div className="b-inv-list">{items.map((item) => <Row key={item.holding.id} item={item} currency={currency} current={false} onSelect={() => setSelectedId(item.holding.id)} />)}</div>
      <p className="note">{t('invest.phoneViewOnly')}</p>
    </div>
  }
  return <div className="report b-page b-loans b-invest">
    <div className="b-page-head"><h2>{t('invest.title')}</h2><p>{t('invest.lead')}</p></div>
    {tiles}
    {items.length > 0 && <section className="b-inv-total"><div className="b-section-head"><h3>{t('invest.chartAll')}</h3></div><InvestChart data={data} holdings={data.holdings} currency={currency} name={t('invest.chartAll')} /></section>}
    <div className="b-loan-body">
      <div className="b-loan-list">
        {adding
          ? <AddForm data={data} update={update} onDone={(id) => { setAdding(false); if (id) setSelectedId(id) }} />
          : <button type="button" className="b-loan-add" onClick={() => setAdding(true)}>{t('invest.add')}</button>}
        {items.length === 0 && !adding && <p className="note">{t('invest.empty')}</p>}
        <div className="b-inv-list">{items.map((item) => <Row key={item.holding.id} item={item} currency={currency} current={item === selected} onSelect={() => setSelectedId(item.holding.id)} />)}</div>
      </div>
      {selected && <Detail key={selected.holding.id} item={selected} data={data} update={update} currency={currency} readOnly={false} onRemoved={() => setSelectedId(null)} />}
    </div>
  </div>
}
