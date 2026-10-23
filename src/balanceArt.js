// 群青の PC の残高調整の「天秤の絵」の、表示だけの計算（画面の部品 BalanceArt.jsx が使う）。お金の計算ではない：残高も差額も、ここでは作らない。
// 受け取るのは、画面がすでに持っている数字（記録上の残高 cur・入力中の実際の残高 actual）。出すのは、梁の傾きの角度と、皿に積む硬貨の数・並び。
// 空（null）は「まだ決まっていない」。cur が null（科目を選ぶ前）は両方の皿が空で水平、actual が null（入力前）は左の皿だけに載っている形。

export const TILT_MAX = 18 // 梁の傾きの最大（度）。針の目盛りは 0・±9・±18
export const TILT_EMPTY = -9 // 入力前：左の皿（記録上）だけが載っているので、左へ少し傾ける
export const TILT_TICKS = [-18, -9, 0, 9, 18]
export const COIN_MAX = 6 // 1つの皿に積む硬貨は、最大 6 枚（下の段から 3・2・1）

// 傾き（度）。実際が大きい（右が重い）と正＝右が下がる。差額が 0 なら 0。差の割合が大きいほど深く、18 度まで。0 でない差は、最低 4 度
export function tiltDeg(cur, actual) {
  if (cur === null) return 0
  if (actual === null) return TILT_EMPTY
  const diff = actual - cur
  if (diff === 0) return 0
  const ratio = Math.abs(diff) / Math.max(Math.abs(cur), Math.abs(actual), 1)
  return Math.sign(diff) * Math.min(TILT_MAX, 4 + 40 * ratio)
}

// 皿に積む硬貨の数。金額が 0 以下・空は 0 枚。0 より大きければ、大きいほうの金額を 6 枚として、割合で決める（最低 1 枚）
export function coinCount(value, maxValue) {
  if (value === null || !(value > 0)) return 0
  return Math.max(1, Math.round((COIN_MAX * value) / Math.max(maxValue, 1)))
}

const ROWS = { 0: [], 1: [1], 2: [2], 3: [3], 4: [3, 1], 5: [3, 2], 6: [3, 2, 1] } // 下の段から
// 上の段から並べた、硬貨の数の列（例：6 枚なら [1, 2, 3]）
export const coinRows = (count) => [...ROWS[Math.min(Math.max(count, 0), COIN_MAX)]].reverse()
