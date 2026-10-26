// 貯蓄の鶏頭図・単月の棒グラフ・今月の目標の札のための、表示だけの計算（群青 PC。計画書 docs/plan-gunjo-pc-savings-impl.md）。
// 保存しない・お金の計算は新しく作らない（月ごとの動きは flowArt.js の monthlyFlows、目標は ledgerLogic.js の effectiveBudget・budgetStatus に任せる）。
import { savingsHistory, effectiveBudget, budgetStatus, monthReport, goalActualMap } from './ledgerLogic.js'
import { monthlyFlows, periodMonths, roseBase, roseRadiusP, roseFloor, roseSpan, barAxisMax } from './flowArt.js'

// 科目の色と模様（決定 A）：3 つ（濃い緑・青緑＋斜線・黄緑＋点）を順に使い回し、4 つ目以降は同じ色・模様のまま濃さ（shade）だけ変える
export const accountStyle = (i) => ({ tone: i % 3, shade: Math.floor(i / 3) })

// 図に出す科目：取り分けの科目（savingsHistory の順）のうち、使う設定のもの。使わない設定の科目は、記録があっても図には出さない（本人の決め。表は別）
export const roseAccounts = (accounts, entries) => savingsHistory(accounts, entries).map((h) => h.account).filter((a) => a.active)

// 図に出す科目の、通常の仕訳（normal）の最初の月。記録がなければ null（このとき鶏頭図は出さず、空の札）。「表示する期間」の下限（canSelectEnd の first）
export function roseFirstMonth(accounts, entries) {
  const ids = new Set(roseAccounts(accounts, entries).map((a) => a.id))
  let first = null
  for (const e of entries) {
    if (e.kind !== 'normal' || !(ids.has(e.debitId) || ids.has(e.creditId))) continue
    const m = e.date.slice(0, 7)
    if (first === null || m < first) first = m
  }
  return first
}

const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0)

// 表示期間（end を末尾にした 12 か月）の、月ごとの動き。per は科目ごと（roseAccounts の順）。goal は、その月に有効な目標（kind が goal）の額。なければ 0
export function roseMonths({ accounts, entries, budgets, end }) {
  const acs = roseAccounts(accounts, entries)
  const months = periodMonths(end)
  const flows = acs.map((a) => monthlyFlows(entries, a.id, months))
  return months.map((month, i) => {
    const per = acs.map((a, j) => {
      const b = effectiveBudget(budgets, a.id, month)
      return { id: a.id, up: flows[j][i].up, down: flows[j][i].down, goal: b?.kind === 'goal' ? b.amount : 0 }
    })
    const up = sum(per, (p) => p.up)
    const down = sum(per, (p) => p.down)
    return { month, per, up, down, net: up - down, goalSum: sum(per, (p) => p.goal) }
  })
}

// 鶏頭図の形。mode：'stack'（取り分けを科目ごとに積み、取り崩しを同じ穴から重ねる）／'net'（取り分け − 取り崩しの残りを 1 つの扇で）。H は穴の半径、RB は基準の円の半径
// 基準 P は roseBase（stack は取り分けの合計、net は残りの絶対値）。半径は roseRadiusP。0 より大きい長さには、下限（roseFloor。穴の外へ H＋8）を掛ける。
// 目標の弧の半径 goalR は、その月の目標の合計を同じ式で（P を超えると RB で止まる）。目標がない月、または P が 0 のとき（全部の月が 0。物差しが無い）は null
export function roseModel(rows, mode, H, RB) {
  const net = mode === 'net'
  const P = roseBase(rows.map((r) => (net ? r.net : r.up)))
  const rad = (v) => (v > 0 ? roseFloor(roseRadiusP(v, P, H, RB), H) : H)
  const items = rows.map((r, i) => {
    const goalR = P > 0 && r.goalSum > 0 ? roseRadiusP(r.goalSum, P, H, RB) : null
    const base = { month: r.month, span: roseSpan(i), goalR }
    if (net) return { ...base, net: r.net === 0 ? null : { kind: r.net > 0 ? 'plus' : 'minus', r0: H, r1: rad(Math.abs(r.net)) } }
    let cum = 0
    const segs = []
    for (const p of r.per) {
      if (!(p.up > 0)) continue
      const r0 = rad(cum)
      cum += p.up
      segs.push({ id: p.id, r0, r1: rad(cum) })
    }
    return { ...base, segs, down: r.down > 0 ? { r0: H, r1: rad(r.down) } : null }
  })
  return { P, items }
}

// 目標額の字を置く側：上半分の月（扇の真ん中の角度が、12 時から 6 時の左回り＝上側）は上、下半分は下
export const labelSide = (i) => (Math.sin(((roseSpan(i)[0] + roseSpan(i)[1]) / 2) * Math.PI / 180) < 0 ? 'top' : 'bottom')

// 単月の棒グラフ：縦目盛りは、その月の（取り分け・取り崩し・目標）の最大値（barAxisMax）。0 のときは割り算をしない側が 0 を見る
export const roseBar = (row) => ({ month: row.month, per: row.per, up: row.up, down: row.down, goal: row.goalSum, axisMax: barAxisMax([row]) })

// 今月の目標の札（全科目の合計）：budgetStatus の goals.rows（科目ごとの内訳）から、使う設定の科目の行だけに絞り、合計を出し直す（使わない設定の科目は、図と同じく入れない。本人の決め）。
// 合計の％は、予算の画面と同じく、実績 × 100 ÷ 目標を 0 へ切り捨て。目標を決めた（使う設定の）科目がなければ total は null
export function goalCard({ accounts, entries, budgets, month }) {
  const rows = budgetStatus(budgets, accounts, monthReport(accounts, entries, month), goalActualMap(entries, accounts, budgets, month), month).goals.rows.filter((r) => r.account.active)
  if (rows.length === 0) return { month, rows, total: null }
  const budget = sum(rows, (r) => r.budget)
  const actual = sum(rows, (r) => r.actual)
  return { month, rows, total: { budget, actual, shortfall: sum(rows, (r) => r.shortfall), rate: Math.trunc((actual * 100) / budget) + 0 } }
}

// 表示中の 12 か月が、全部、取り分けも取り崩しも 0（このとき弧は出さず、「記録がありません」の一言）
export const roseIdle = (rows) => rows.every((r) => r.up === 0 && r.down === 0)

// 色：3 つ（濃い緑・青緑・黄緑）の「内側・外側」。shade が増えるごとに 15％ずつ暗く（最大 3 段）。扇・棒・凡例の見本の色が、同じ式で決まる
export const TONES = [['#0B5A2C', '#34C06E'], ['#0A5F57', '#2FC3B0'], ['#4E7410', '#A8D13A']]
export function shadeHex(hex, n) {
  const k = 1 - Math.min(3, Math.max(0, n)) * 0.15
  return '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('').toUpperCase()
}
export const toneColors = ({ tone, shade }) => TONES[tone].map((h) => shadeHex(h, shade))
