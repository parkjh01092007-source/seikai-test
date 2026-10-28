// 「投資」ページの計算と入力の検証（画面に出す数・入力の判定はここ。保存の形は storage.js の holdings）。
// 帳簿（仕訳）は取得原価だけ：銘柄ごとの資産の科目の残高＝取得原価。時価・評価損益は、このページだけに出す（自由に使える額・月次の収支には入れない）。
// 数量 units は 1/10000 単位の整数（100 株は 1000000）。価格 price は、円は 1 円単位の整数（投資信託は 1 万口あたり）、米国株はドルのセント（150.25 ドルは 15025）。
// 米国株の為替レート rate は、1 ドルあたりの円の 1/100（152.30 円は 15230）。時価（円）＝ 数量 × ドルの価格 × 為替レート。買い・売りの円は、明細の円をそのまま入れる（見込みで出し、実際の円は明細から仕訳）。
import { t } from './text.js'
import { newAccount, validateAccountName, accountBalances, newEntry, parseOpeningAmount, defaultLiving } from './ledgerLogic.js'
import { cashAccounts, isYmd } from './loanView.js'

export const UNIT_SCALE = 10000
export const TAX_PPM = 203150 // 売って益が出たときの税の率（20.315% ＝ 100 万分の 203150）。NISA は 0。ponytail: 全員同じ率。設定で変えられるようにするのは、要望が出てから
export const HOLDING_KINDS = ['jp-stock', 'fund', 'us-stock']
export const HOLDING_NAME_MAX = 30

// 数量の入力：小数 4 桁まで（0 より大きい）。1/10000 単位の整数にする。成功: { units } / 失敗: { error }
export function parseUnits(text) {
  const s = String(text).trim()
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(s)
  if (!m) return { error: t('invest.errUnits') }
  const units = Number(m[1]) * UNIT_SCALE + Number((m[2] ?? '').padEnd(4, '0'))
  return units >= 1 ? { units } : { error: t('invest.errUnits') }
}

// 価格の入力：円の整数（1 以上）
// ドルの価格（小数 2 桁まで）→ セント。為替レート（1 ドルあたりの円。小数 2 桁まで）→ 1/100 円。どちらも 0 より大きい
const parseHundredths = (text, errorKey) => { const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(text).trim()); const n = m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : 0; return n >= 1 ? { value: n } : { error: t(errorKey) } }
// 手数料の％（小数 2 桁まで・0〜100）→ 1/100 ％。空は 0
export function parseFeePct(text) {
  const s = String(text ?? '').trim()
  if (s === '') return { pct: 0 }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s)
  const n = m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : -1
  return n >= 0 && n <= 10000 ? { pct: n } : { error: t('invest.errPct') }
}
export const parseUsd = (text) => parseHundredths(text, 'invest.errUsd')
export const parseFx = (text) => parseHundredths(text, 'invest.errFx')
export const hundredthsText = (n) => `${Math.floor(n / 100).toLocaleString('en-US')}.${String(n % 100).padStart(2, '0')}`
export const formatUsd = (cents) => t('invest.usd', { amount: hundredthsText(cents) })
export const formatFx = (rate) => t('invest.fxText', { rate: hundredthsText(rate) })
export const parsePrice = (text) => (/^\d+$/.test(String(text).trim()) && Number(text) >= 1 ? { price: Number(String(text).trim()) } : { error: t('invest.errPrice') })

// 画面に出す数量（100 株なら 100、1.5 株なら 1.5）
export const formatUnits = (units) => {
  const whole = Math.floor(units / UNIT_SCALE)
  const frac = String(units % UNIT_SCALE).padStart(4, '0').replace(/0+$/, '')
  return whole.toLocaleString('en-US') + (frac ? `.${frac}` : '')
}

const newestFirst = (a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1)
export const latestQuote = (h) => [...h.quotes].sort(newestFirst)[0] ?? null
export const unitsHeld = (h) => h.trades.reduce((n, x) => n + (x.side === 'buy' ? x.units : -x.units), 0)

// 時価（円・円未満切り捨て）＝ 数量 × 価格。株は 1 株あたり、投資信託は 1 万口あたり。大きい数でも合うよう BigInt で
export const marketValue = (kind, units, price, rate) => (kind === 'us-stock' ? Number((BigInt(units) * BigInt(price) * BigInt(rate)) / BigInt(UNIT_SCALE * 10000)) : Number((BigInt(units) * BigInt(price)) / BigInt(kind === 'fund' ? UNIT_SCALE * 10000 : UNIT_SCALE)))
export const quoteValue = (h, units, q) => marketValue(h.kind, units, q.price, q.rate)

// 銘柄 1 つの数字。cost＝取得原価（科目の残高）、quote＝いちばん新しい価格（なければ null）、value・gain（評価損益）は価格がなければ null。
// afterSale：今売ったら手元に残る見込み { value, fee, tax, net }。時価 − 売る時の手数料の見込み − 税（益があるときだけ。NISA は 0）。持っていない・価格なしは null。警告ではなく、見込みの数字だけ
// 売る時の手数料の見込み（円）。％（sellFeePct＝1/100 ％。0.55％は 55）があれば「売る金額 × ％」（切り捨て）。なければ、古い形の円（sellFee）をそのまま
export const feeEstimate = (h, gross) => (h.sellFeePct ? Math.floor((gross * h.sellFeePct) / 10000) : h.sellFee ?? 0)

export function holdingSummary(data, h) {
  const cost = accountBalances(data.accounts, data.entries).rows.find((r) => r.account.id === h.accountId)?.balance ?? 0
  const units = unitsHeld(h)
  const quote = latestQuote(h)
  const value = quote && units > 0 ? quoteValue(h, units, quote) : null
  const fee = value === null ? 0 : feeEstimate(h, value)
  const tax = value === null || h.nisa ? 0 : Math.floor((Math.max(0, value - fee - cost) * TAX_PPM) / 1000000)
  return { holding: h, cost, units, quote, value, gain: value === null ? null : value - cost, afterSale: value === null ? null : { value, fee, tax, net: value - fee - tax } }
}

// ページ全体：銘柄ごと＋合計。合計の時価・評価損益は、価格のある銘柄だけ（priced）。持っているのに価格がない銘柄の数は missing（全部売った銘柄は数えない）
export function investOverview(data) {
  const items = (data.holdings ?? []).map((h) => holdingSummary(data, h))
  const priced = items.filter((i) => i.value !== null)
  return {
    items,
    totals: { cost: items.reduce((n, i) => n + i.cost, 0), pricedCost: priced.reduce((n, i) => n + i.cost, 0), value: priced.reduce((n, i) => n + i.value, 0), gain: priced.reduce((n, i) => n + i.gain, 0), missing: items.filter((i) => i.value === null && i.units > 0).length },
  }
}

// 仕訳の画面でロックする：銘柄の科目を使う通常の仕訳の銘柄（なければ undefined）
export const holdingOfEntry = (holdings, entry) => (entry.kind === 'normal' ? holdings.find((h) => h.accountId === entry.debitId || h.accountId === entry.creditId) : undefined)

// 銘柄を作る：資産の科目 1 つ（その他の資産）＋ holding。input：{ kind, name, nisa, sellFeePctText }（空なら 0％）。成功: { account, holding } / 失敗: { error }
export function newHolding(input, accounts, now = new Date().toISOString()) {
  if (!HOLDING_KINDS.includes(input.kind)) return { error: t('invest.errKind') }
  const n = validateAccountName(String(input.name), accounts)
  if (n.error) return { error: n.error }
  if (n.name.length > HOLDING_NAME_MAX) return { error: t('invest.errName', { max: HOLDING_NAME_MAX }) }
  const fee = parseFeePct(input.sellFeePctText)
  if (fee.error) return { error: fee.error }
  const account = newAccount(n.name, 'asset', 'other', now)
  return { account, holding: { id: crypto.randomUUID(), name: n.name, kind: input.kind, nisa: !!input.nisa, currency: input.kind === 'us-stock' ? 'USD' : 'JPY', accountId: account.id, trades: [], quotes: [], ...(fee.pct > 0 && { sellFeePct: fee.pct }), createdAt: now } }
}

// NISA の印・売る時の手数料の見込みを直す。成功: { holding } / 失敗: { error }
// ％を入れると sellFeePct にして、古い円（sellFee）は外す。空は、％があれば外して 0％に。古い円だけの銘柄は、空のままなら円を残す（0 と入れたら外す）
export function editHoldingMeta(h, { nisa, sellFeePctText }) {
  const fee = parseFeePct(sellFeePctText)
  if (fee.error) return { error: fee.error }
  const keepYen = String(sellFeePctText ?? '').trim() === '' && !h.sellFeePct
  const { sellFee, sellFeePct: _old, ...rest } = h
  return { holding: { ...rest, nisa: !!nisa, ...(keepYen && sellFee > 0 && { sellFee }), ...(fee.pct > 0 && { sellFeePct: fee.pct }) } }
}

// 買う：仕訳（借方＝銘柄の科目、貸方＝払う口座。金額は手数料込みの取得原価）と、数量の記録（trade）。成功: { entries, holdings } / 失敗: { error }。渡したデータは変えない
export function recordBuy(data, h, { date, unitsText, amountText, fromId }, now = new Date().toISOString()) {
  if (!isYmd(date)) return { error: t('error.dateInvalid') }
  const u = parseUnits(unitsText)
  if (u.error) return u
  const a = parseOpeningAmount(String(amountText).trim())
  if (a.error) return a
  if (a.amount < 1) return { error: t('invest.errAmount') }
  if (!cashAccounts(data.accounts).some((x) => x.id === fromId)) return { error: t('loans.errAccount') }
  const entry = newEntry({ date, debitId: h.accountId, creditId: fromId, amount: a.amount }, t('invest.memoBuy', { name: h.name }), now)
  const trade = { id: crypto.randomUUID(), date, side: 'buy', units: u.units, entryIds: [entry.id] }
  return { entries: [...data.entries, entry], holdings: data.holdings.map((x) => (x.id === h.id ? { ...x, trades: [...x.trades, trade] } : x)) }
}

// 買いの直し（日付・数量・金額）。仕訳と trade を一緒に直す。成功: { entries, holdings } / 失敗: { error }
export function editBuy(data, h, tradeId, { date, unitsText, amountText }, now = new Date().toISOString()) {
  const trade = h.trades.find((x) => x.id === tradeId && x.side === 'buy')
  if (!trade) return { error: t('invest.errTrade') }
  if (!isYmd(date)) return { error: t('error.dateInvalid') }
  const u = parseUnits(unitsText)
  if (u.error) return u
  const a = parseOpeningAmount(String(amountText).trim())
  if (a.error) return a
  if (a.amount < 1) return { error: t('invest.errAmount') }
  const trades = h.trades.map((y) => (y.id === tradeId ? { ...y, date, units: u.units } : y))
  if (!unitsNeverNegative(trades)) return { error: t('invest.errOversell') }
  return {
    entries: data.entries.map((e) => (trade.entryIds.includes(e.id) ? { ...e, date, amount: a.amount, updatedAt: now } : e)),
    holdings: data.holdings.map((x) => (x.id === h.id ? { ...x, trades } : x)),
  }
}

// 買い・売りを消す：仕訳と trade を一緒に消す。そのあと持っている数量が負になる（買いを消すと、先の売りが多すぎになる）ときは、エラー
export const deleteTrade = (data, h, tradeId) => {
  const trade = h.trades.find((x) => x.id === tradeId)
  const trades = h.trades.filter((y) => y.id !== tradeId)
  if (!unitsNeverNegative(trades)) return { error: t('invest.errOversell') }
  return { entries: data.entries.filter((e) => !trade?.entryIds.includes(e.id)), holdings: data.holdings.map((x) => (x.id === h.id ? { ...x, trades } : x)) }
}
export const deleteBuy = deleteTrade

// 日付の順に並べて、持っている数量がずっと 0 以上か（同じ日は買いを先に）
export function unitsNeverNegative(trades) {
  let n = 0
  for (const x of [...trades].sort((a, b) => (a.date === b.date ? (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1) : a.date < b.date ? -1 : 1))) {
    n += x.side === 'buy' ? x.units : -x.units
    if (n < 0) return false
  }
  return true
}

// 価格を入れる（日付つき）。同じ日があれば置き換える。成功: { holding } / 失敗: { error }
export function addQuote(h, { date, priceText, rateText }) {
  if (!isYmd(date)) return { error: t('error.dateInvalid') }
  let q
  if (h.currency === 'USD') { // 米国株：ドルの価格と、手で入れる為替レート
    const p = parseUsd(priceText), r = parseFx(rateText)
    if (p.error) return p
    if (r.error) return r
    q = { date, price: p.value, rate: r.value }
  } else {
    const p = parsePrice(priceText)
    if (p.error) return p
    q = { date, price: p.price }
  }
  return { holding: { ...h, quotes: [...h.quotes.filter((x) => x.date !== date), q].sort((a, b) => (a.date < b.date ? -1 : 1)) } }
}
export const removeQuote = (h, date) => ({ ...h, quotes: h.quotes.filter((x) => x.date !== date) })

// その銘柄の買いの一覧（新しい順）。amount は仕訳の金額（仕訳がなければ null）
export const holdingBuys = (data, h) =>
  h.trades.filter((x) => x.side === 'buy').sort(newestFirst).map((trade) => ({ trade, amount: data.entries.find((e) => trade.entryIds.includes(e.id))?.amount ?? null }))

// 銘柄を一覧から外す（科目と仕訳は残る）
export const removeHolding = (holdings, id) => holdings.filter((x) => x.id !== id)

// ---- 推移のグラフ（取得原価の線＝買い・売りのたびに階段状／時価の線＝入れた価格 × その日の数量。点は価格を入れた日）----
export const RANGES = ['1m', '3m', '6m', '1y', 'all'] // 1 日・5 日は、毎日の価格が入る API のときに足す
const RANGE_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }
const addMonths = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10) }
const byDateAsc = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

// holdings の合計（1 つなら、その銘柄）。成功: { start, end, cost: [{ date, v }]（階段の折れ目）, value: [{ date, v }]（価格を入れた日）, max } / 描くものがなければ null。
// 取得原価＝銘柄の科目の仕訳（借方 ＋、貸方 −）の日ごとの合計。時価の点＝その日までの価格（銘柄ごとに、その日以前でいちばん新しい価格）× その日までの数量。数量が 0 の日は点にしない。持っているのにまだ価格がない銘柄は、取得原価のまま足す
export function investSeries(data, holdings, range, today) {
  const events = holdings.flatMap((h) => data.entries.filter((e) => e.debitId === h.accountId || e.creditId === h.accountId).map((e) => ({ date: e.date, holdingId: h.id, delta: (e.debitId === h.accountId ? 1 : -1) * e.amount })))
  const quoteDates = [...new Set(holdings.flatMap((h) => h.quotes.map((q) => q.date)))].filter((d) => d <= today)
  const first = [...events.map((e) => e.date), ...holdings.flatMap((h) => h.trades.map((x) => x.date)), ...quoteDates].filter((d) => d <= today).sort()[0]
  if (first === undefined) return null
  const windowStart = range === 'all' ? first : addMonths(today, -RANGE_MONTHS[range])
  const start = windowStart > first ? windowStart : first
  const costAt = (date) => events.reduce((n, e) => (e.date <= date ? n + e.delta : n), 0)
  const cost = [{ date: start, v: costAt(start) }]
  for (const d of [...new Set(events.map((e) => e.date))].sort()) if (d > start && d <= today) cost.push({ date: d, v: costAt(d) })
  if (cost.at(-1).date < today) cost.push({ date: today, v: cost.at(-1).v })
  const value = []
  for (const date of quoteDates.sort()) {
    if (date < start) continue
    let sum = 0, any = false
    for (const h of holdings) {
      const q = [...h.quotes].filter((x) => x.date <= date).sort(byDateAsc).at(-1)
      const units = h.trades.reduce((n, x) => (x.date <= date ? n + (x.side === 'buy' ? x.units : -x.units) : n), 0)
      if (units <= 0) continue
      // まだ価格を入れていない銘柄は、取得原価のまま数える（線が途中で落ちて、偽の損に見えないように）
      sum += q ? quoteValue(h, units, q) : events.filter((e) => e.holdingId === h.id && e.date <= date).reduce((n, e) => n + e.delta, 0)
      any = true
    }
    if (any) value.push({ date, v: sum })
  }
  return { start, end: today, cost, value, max: Math.max(1, ...cost.map((p) => p.v), ...value.map((p) => p.v)) }
}

export const dayNumber = (ymd) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86400000)

// 2 本の線の間の塗り（時価が上＝益、下＝損）。investSeries の結果から、多角形の並びを作る。点は { x（日の通し番号）, v（円） }。
// 取得原価は階段（買った日から新しい額）、時価は価格を入れた日どうしを直線でつなぐ。時価の最初の点〜最後の点の間だけ塗る。線が交わるところで、益と損を分ける
export function investFill(series) {
  const val = series.value.map((p) => ({ x: dayNumber(p.date), v: p.v }))
  if (val.length < 2) return []
  const events = series.cost.map((p) => ({ x: dayNumber(p.date), v: p.v }))
  const costAt = (x) => events.reduce((c, e) => (e.x <= x ? e.v : c), events[0].v)
  const valueAt = (x) => {
    const i = Math.max(0, val.findIndex((p, k) => p.x <= x && (k === val.length - 1 || val[k + 1].x > x)))
    const a = val[i], b = val[Math.min(i + 1, val.length - 1)]
    return b.x === a.x ? a.v : a.v + ((b.v - a.v) * (x - a.x)) / (b.x - a.x)
  }
  const xs = [...new Set([...val.map((p) => p.x), ...events.map((p) => p.x).filter((x) => x > val[0].x && x < val.at(-1).x)])].sort((a, b) => a - b)
  const polygons = []
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i], xs[i + 1]]
    const c = costAt(x0), v0 = valueAt(x0), v1 = valueAt(x1)
    const [f0, f1] = [v0 - c, v1 - c]
    const sign = (f) => (f > 0 ? 'gain' : 'loss')
    if (f0 * f1 > 0 || (f0 * f1 === 0 && (f0 !== 0 || f1 !== 0))) polygons.push({ sign: sign(f0 !== 0 ? f0 : f1), pts: [{ x: x0, v: c }, { x: x0, v: v0 }, { x: x1, v: v1 }, { x: x1, v: c }] })
    else if (f0 * f1 < 0) {
      const xc = x0 + ((x1 - x0) * f0) / (f0 - f1)
      polygons.push({ sign: sign(f0), pts: [{ x: x0, v: c }, { x: x0, v: v0 }, { x: xc, v: c }] }, { sign: sign(f1), pts: [{ x: xc, v: c }, { x: x1, v: v1 }, { x: x1, v: c }] })
    }
  }
  return polygons
}

// ---- 売る：原価（移動平均）・売却益／損・手数料・税の仕訳 ----
// 売った日までの数量と取得原価（銘柄の科目の、その日までの残高）。原価 ＝ 取得原価 × 売る数量 ÷ 持っている数量（円未満切り捨て。全部売るときは残りの全部）
export function costAt(data, h, date, units) {
  const held = h.trades.reduce((n, x) => (x.date <= date ? n + (x.side === 'buy' ? x.units : -x.units) : n), 0)
  const total = data.entries.reduce((n, e) => (e.date <= date ? n + (e.debitId === h.accountId ? e.amount : 0) - (e.creditId === h.accountId ? e.amount : 0) : n), 0)
  return { held, total, cost: units >= held ? total : Number((BigInt(total) * BigInt(units)) / BigInt(held)) }
}

// 税の見込み（受け取った金額から逆算）。益が出た分だけ、NISA は 0。売った金額 P ＝ 受け取った金額 R ＋ 手数料 ＋ 税 T、税 ＝ (P − 手数料 − 原価) × 率 なので T ＝ (R − 原価) × 率 ÷ (1 − 率)
export const taxFromReceived = (received, cost, nisa) => (nisa || received <= cost ? 0 : Math.floor(((received - cost) * TAX_PPM) / (1000000 - TAX_PPM)))

// 数量を入れたときの見込み（受け取った金額・手数料・税）。価格がない・数量が持っている分より多いときは null。時価 ＝ いちばん新しい価格 × 数量
export function estimateSell(data, h, { date, unitsText, feeText }) {
  const u = parseUnits(unitsText)
  const q = latestQuote(h)
  if (u.error || !q || !isYmd(date)) return null
  const { held, cost } = costAt(data, h, date, u.units)
  if (u.units > held) return null
  const gross = quoteValue(h, u.units, q)
  const f = feeText === undefined ? { amount: feeEstimate(h, gross) } : parseOpeningAmount(String(feeText).trim())
  const fee = f.error ? 0 : f.amount
  const tax = h.nisa ? 0 : Math.floor((Math.max(0, gross - fee - cost) * TAX_PPM) / 1000000)
  return { received: Math.max(0, gross - fee - tax), fee, tax }
}

// 売りの入力を確かめて、数字にする。input：{ date, unitsText, receivedText, feeText, taxText, toId }。成功: { date, units, cost, gross, gain, fee, tax, received, toId } / 失敗: { error }
// gross（売った金額）＝ 受け取った金額 ＋ 手数料 ＋ 税。gain（売却益。損はマイナス）＝ gross − 原価
export function computeSell(data, h, { date, unitsText, receivedText, feeText, taxText, toId }) {
  if (!isYmd(date)) return { error: t('error.dateInvalid') }
  const u = parseUnits(unitsText)
  if (u.error) return u
  const [r, f, x] = [receivedText, feeText, taxText].map((s) => parseOpeningAmount(String(s ?? '').trim()))
  for (const v of [r, f, x]) if (v.error) return { error: v.error }
  const { held, cost } = costAt(data, h, date, u.units)
  if (u.units > held) return { error: t('invest.errOversell') }
  const gross = r.amount + f.amount + x.amount
  if (gross < 1) return { error: t('invest.errAmount') }
  if (!cashAccounts(data.accounts).some((a) => a.id === toId)) return { error: t('loans.errAccount') }
  return { date, units: u.units, cost, gross, gain: gross - cost, fee: f.amount, tax: x.amount, received: r.amount, toId }
}

const accountNamed = (accounts, type, name) => accounts.find((a) => a.type === type && a.name.trim() === name)
const SELL_ACCOUNTS = { gain: ['revenue', 'invest.gainName'], loss: ['expense', 'invest.lossName'], fee: ['expense', 'invest.feeName'], tax: ['expense', 'invest.taxName'] }
export const sellAccount = (accounts, key) => accountNamed(accounts, SELL_ACCOUNTS[key][0], t(SELL_ACCOUNTS[key][1]))

// 売りを記録：仕訳（1 原価：借方＝受け取る口座・貸方＝銘柄の科目、2 益：借方＝口座・貸方＝売却益／損：借方＝売却損・貸方＝口座、3 手数料：借方＝売買手数料・貸方＝口座、4 税：借方＝投資の税金・貸方＝口座）と、数量の記録。
// 売却益・売却損・売買手数料・投資の税金の科目は、初めて使うときに作る（売却益の使い道は「特別な出費」＝生活費に入れない）。成功: { accounts, entries, holdings } / 失敗: { error }。渡したデータは変えない
export function recordSell(data, h, input, now = new Date().toISOString()) {
  const c = computeSell(data, h, input)
  if (c.error) return c
  let accounts = data.accounts
  const need = (key) => {
    const [type, nameKey] = SELL_ACCOUNTS[key]
    const found = accountNamed(accounts, type, t(nameKey))
    if (found) return found
    if (accounts.some((a) => a.name.trim() === t(nameKey))) return null // 同じ名前で種類が違う科目がある
    const a = { ...newAccount(t(nameKey), type, undefined, now), ...(key === 'gain' && { usage: 'special' }) }
    accounts = [...accounts, a]
    return a
  }
  const specs = []
  if (c.cost > 0) specs.push([c.toId, h.accountId, c.cost, 'invest.memoSellCost'])
  if (c.gain > 0) { const a = need('gain'); if (!a) return { error: t('invest.errSellAccount', { name: t('invest.gainName') }) }; specs.push([c.toId, a.id, c.gain, 'invest.memoSellGain']) }
  if (c.gain < 0) { const a = need('loss'); if (!a) return { error: t('invest.errSellAccount', { name: t('invest.lossName') }) }; specs.push([a.id, c.toId, -c.gain, 'invest.memoSellLoss']) }
  if (c.fee > 0) { const a = need('fee'); if (!a) return { error: t('invest.errSellAccount', { name: t('invest.feeName') }) }; specs.push([a.id, c.toId, c.fee, 'invest.memoSellFee']) }
  if (c.tax > 0) { const a = need('tax'); if (!a) return { error: t('invest.errSellAccount', { name: t('invest.taxName') }) }; specs.push([a.id, c.toId, c.tax, 'invest.memoSellTax']) }
  const added = specs.map(([debitId, creditId, amount, memoKey]) => newEntry({ date: c.date, debitId, creditId, amount, living: defaultLiving(accounts, debitId, creditId) ?? undefined }, t(memoKey, { name: h.name }), now))
  const trade = { id: crypto.randomUUID(), date: c.date, side: 'sell', units: c.units, entryIds: added.map((e) => e.id) }
  const trades = [...h.trades, trade]
  if (!unitsNeverNegative(trades)) return { error: t('invest.errOversell') } // 先の売りが、足りなくなる
  return { accounts, entries: [...data.entries, ...added], holdings: data.holdings.map((x) => (x.id === h.id ? { ...x, trades } : x)) }
}

// 売りの直し：古い売りを消してから、同じ口座で、新しい入力で記録し直す（原価は、売った日までの残高から出し直す）。失敗のときは何も変えない
export function editSell(data, h, tradeId, input, now = new Date().toISOString()) {
  const gone = deleteTrade(data, h, tradeId)
  if (gone.error) return gone
  const d2 = { ...data, entries: gone.entries, holdings: gone.holdings }
  return recordSell(d2, d2.holdings.find((x) => x.id === h.id), input, now)
}

// その銘柄の売りの一覧（新しい順）。cost・gain（損はマイナス）・fee・tax・received は仕訳から数える。toId は受け取った口座
export function holdingSells(data, h) {
  const gainA = sellAccount(data.accounts, 'gain'), lossA = sellAccount(data.accounts, 'loss'), feeA = sellAccount(data.accounts, 'fee'), taxA = sellAccount(data.accounts, 'tax')
  return h.trades.filter((x) => x.side === 'sell').sort(newestFirst).map((trade) => {
    const es = data.entries.filter((e) => trade.entryIds.includes(e.id))
    const sum = (pick) => es.filter(pick).reduce((n, e) => n + e.amount, 0)
    const cost = sum((e) => e.creditId === h.accountId)
    const gain = sum((e) => gainA && e.creditId === gainA.id) - sum((e) => lossA && e.debitId === lossA.id)
    const fee = sum((e) => feeA && e.debitId === feeA.id)
    const tax = sum((e) => taxA && e.debitId === taxA.id)
    return { trade, cost, gain, fee, tax, received: cost + gain - fee - tax, toId: es.find((e) => e.creditId === h.accountId)?.debitId ?? '' }
  })
}
