// セーブ画面・ロード画面の「月の暦」（群青の PC）の純関数。new Date は使わない。今の時刻は呼ぶ側から引数で渡す。
// savedAt・now は、時差つきの ISO 形式（例 2026-10-10T08:30:12.345+09:00）。「出さない」は null で返す。
// 日付がない・読めない日付・今より 1 分を超えて先の日付（時計のずれ）は、月も目盛りの印も出さない。
// 今より 1 分以内の先の日付は「今」として扱う（「最後のセーブ」の文が「1分以内」と出すのと合わせる）。

export const MOON_DAYS = 30 // 目盛りの長さ。30 日たつと新月

const DAY_MS = 86400000
const AHEAD_MS = 60000 // これ以内の先の日付は、今として扱う

// セーブしてから今までの日数（小数）。出せないときは null
const elapsedDays = (savedAt, now) => {
  if (typeof savedAt !== 'string') return null
  const saved = Date.parse(savedAt)
  const current = Date.parse(now)
  if (Number.isNaN(saved) || Number.isNaN(current)) return null
  const diff = current - saved
  if (diff < -AHEAD_MS) return null
  return Math.max(0, diff) / DAY_MS
}

// 月の明るい部分の割合（0〜1）。今は 1（満月）、30 日以上前は 0（新月）。出さないときは null
export function moonFraction(savedAt, now) {
  const days = elapsedDays(savedAt, now)
  return days === null ? null : Math.max(0, 1 - days / MOON_DAYS)
}

// 目盛り上の位置（0〜1）。右端（今日）が 1、左端（30 日前）が 0。30 日より古いものは 0 に寄せる。出さないときは null
export function scalePosition(savedAt, now) {
  return moonFraction(savedAt, now) // 目盛りは 30 日分なので、明るさの割合と同じ値になる
}

// 近いセーブの玉が重ならないよう、表示の位置だけを横にずらす（案B）。日付どおりの位置（scalePosition の値）は変えない。
// positions：目盛り上の位置（0〜1）の並び。gap：玉が重ならない最小の間隔（玉の大きさ ÷ 目盛りの長さ。画面の幅に比例）。
// 返すもの：positions と同じ並びの、表示用の位置。近いものを 1 かたまりにして、間隔 gap で並べ、元の位置の平均を中心にする。
// 目盛りの両端（0〜1）からは出さない（かたまりが 1 より長いときだけ、左端から並べて右へはみ出す）。ずらした結果、隣のかたまりと近づいたら、つなげて並べ直す
export function spreadPositions(positions, gap) {
  if (!(gap > 0)) return positions.slice()
  const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b] || a - b)
  let clusters = order.map((i) => ({ idx: [i], sum: positions[i] }))
  const span = (c) => (c.idx.length - 1) * gap
  const left = (c) => Math.max(0, Math.min(c.sum / c.idx.length - span(c) / 2, 1 - span(c)))
  for (let merged = true; merged;) {
    merged = false
    for (let k = 1; k < clusters.length; k++) {
      const a = clusters[k - 1]
      const b = clusters[k]
      if (left(b) - (left(a) + span(a)) < gap - 1e-12) {
        clusters.splice(k - 1, 2, { idx: [...a.idx, ...b.idx], sum: a.sum + b.sum })
        merged = true
        break
      }
    }
  }
  const out = new Array(positions.length)
  for (const c of clusters) c.idx.forEach((i, j) => { out[i] = left(c) + j * gap })
  return out
}

// 名前の四角が、ほかの玉の四角に重ならないか。四角は { l, r, t, b }（左・右・上・下。同じ座標）。ふれるだけ（辺が同じ位置）は、重なりに数えない。
// 目盛りで、名前を出すかどうかの条件に使う（名前どうしの間隔のほかに、隣の玉に重ならないことも見る）
export function labelClear(label, moons) {
  return moons.every((m) => !(label.l < m.r && m.l < label.r && label.t < m.b && m.t < label.b))
}
