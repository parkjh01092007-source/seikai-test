// 月次画面の棒。0以下の行は数字を残し、棒だけ0にする。
export function expenseBars(expense) {
  const max = Math.max(0, ...expense.map((r) => r.amount))
  const rows = expense.map((r) => ({ ...r, bar: max > 0 ? Math.max(0, r.amount) * 100 / max : 0 }))
  const top = rows.slice(0, 3)
  const rest = rows.slice(3)
  return { top, rest, restTotal: rest.reduce((n, r) => n + r.amount, 0) }
}

// 0 を含む範囲に点と目盛りを置く。
export function trendGeometry(rows, key, width, height, ceiling = 0, floor = 0) { // ceiling・floor：目盛りの上端と下端
  const values = rows.map((r) => r[key])
  const max = Math.max(0, ceiling, ...values)
  const min = Math.min(0, floor, ...values)
  const span = max - min || 1
  const left = width < 500 ? 70 : 90
  const right = width < 500 ? 72 : 100
  const top = 14
  const bottom = height - 24
  const plotWidth = Math.max(1, width - left - right)
  const y = (value) => top + (max - value) / span * (bottom - top)
  const points = rows.map((row, i) => ({ ...row, x: left + (rows.length === 1 ? plotWidth / 2 : i * plotWidth / (rows.length - 1)), y: y(row[key]) }))
  return { min, max, left, right: left + plotWidth, zeroY: y(0), y, points }
}

// きりのよい目盛り（0 から上へ。1・2・5 × 10 のべき乗の刻み。最大が 0 以下なら 0 だけ）。top は、いちばん上の目盛り
export function niceTicks(max, target = 4) {
  if (!(max > 0)) return { ticks: [0], top: 0 }
  const raw = max / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((v) => v >= raw)
  const count = Math.ceil(max / step - 1e-9)
  return { ticks: Array.from({ length: count + 1 }, (_, i) => i * step), top: count * step }
}

// 0を含む、上下ともきりのよい目盛り。マイナスがなければ下端は0。
export function niceRange(min, max) {
  const low = Math.min(0, min)
  const high = Math.max(0, max)
  const scale = niceTicks(high - low)
  if (scale.ticks.length === 1) return { ticks: [0], bottom: 0, top: 0 }
  const step = scale.ticks[1]
  const start = Math.floor(low / step)
  const end = Math.ceil(high / step)
  return { ticks: Array.from({ length: end - start + 1 }, (_, i) => (start + i) * step + 0), bottom: start * step + 0, top: end * step + 0 }
}

// 純資産の内訳の 2 本の棒。幅は、資産（マイナスの科目は 0 とする）の合計と借入の大きいほうを 100% にして、2 本の長さをそろえる。
// 上：資産（使えるお金・貯金・そのほか）。下：左が借入、右の残りが純資産（資産 − 借入）。借入が資産より大きいとき、下の借入は上より長くなり、はみ出た分が「足りない分」（shortfall）。
// どの部分も { id, amount, pct }。幅が 0 の部分は含めない。借入の amount は借入の全額（幅は、資産に覆われる分だけ）。rest は、上の棒の右の空き（％）
export function netBarParts(row) {
  const assets = [{ id: 'cash', amount: row.cashTotal }, { id: 'saving', amount: row.savingTotal }, { id: 'other', amount: row.otherAssetTotal }].map((x) => ({ ...x, amount: Math.max(0, x.amount) }))
  const assetSum = assets.reduce((n, x) => n + x.amount, 0)
  const borrow = Math.max(0, row.borrowTotal)
  const scale = Math.max(assetSum, borrow) || 1
  const pct = (n) => (n / scale) * 100
  const top = assets.filter((x) => x.amount > 0).map((x) => ({ ...x, pct: pct(x.amount) }))
  const bottom = [
    { id: 'borrow', amount: borrow, pct: pct(Math.min(assetSum, borrow)) },
    { id: 'net', amount: assetSum - borrow, pct: pct(Math.max(0, assetSum - borrow)) },
    { id: 'shortfall', amount: borrow - assetSum, pct: pct(Math.max(0, borrow - assetSum)) },
  ].filter((x) => x.pct > 0)
  return { top, bottom, restTop: 100 - pct(assetSum), restBottom: 100 - pct(Math.max(assetSum, borrow)) }
}
