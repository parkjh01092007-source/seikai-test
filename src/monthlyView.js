// 月次画面の棒。0以下の行は数字を残し、棒だけ0にする。
export function expenseBars(expense) {
  const max = Math.max(0, ...expense.map((r) => r.amount))
  const rows = expense.map((r) => ({ ...r, bar: max > 0 ? Math.max(0, r.amount) * 100 / max : 0 }))
  const top = rows.slice(0, 3)
  const rest = rows.slice(3)
  return { top, rest, restTotal: rest.reduce((n, r) => n + r.amount, 0) }
}

// 0 を含む範囲に点と目盛りを置く。
export function trendGeometry(rows, key, width, height) {
  const values = rows.map((r) => r[key])
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const left = width < 500 ? 70 : 90
  const right = width < 500 ? 72 : 100
  const top = 14
  const bottom = height - 24
  const plotWidth = Math.max(1, width - left - right)
  const y = (value) => top + (max - value) / span * (bottom - top)
  const points = rows.map((row, i) => ({ ...row, x: left + (rows.length === 1 ? plotWidth / 2 : i * plotWidth / (rows.length - 1)), y: y(row[key]) }))
  return { min, max, left, right: left + plotWidth, zeroY: y(0), points }
}
