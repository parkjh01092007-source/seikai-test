// 群青の PC の元帳の選択（区切り16-2b）の、表示だけの計算。仕訳の数え方・月の並べ方だけで、残高などは ledgerLogic.js の ledgerBook に任せる。保存しない

export const MONTHS = 12

// 'YYYY-MM' に n か月を足す（引くときは負）
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

// 12か月の帯。today の月を右端にして、back 回ぶん（12か月ずつ）昔へ送る。古い順
export function monthWindow(today, back = 0) {
  const end = addMonths(today.slice(0, 7), -MONTHS * back)
  return Array.from({ length: MONTHS }, (_, i) => {
    const ym = addMonths(end, i - (MONTHS - 1))
    return { ym, year: Number(ym.slice(0, 4)), month: Number(ym.slice(5)) }
  })
}

// 月の満ち欠け：古いほど欠け、右端が満月（1）。セーブ・ロード画面の「月の暦」と同じ約束（近いほど明るい）
export const moonLit = (i, n = MONTHS) => (i + 1) / n

// 科目ごとの仕訳の件数（借方か貸方にある件数。ledgerBook の total と同じ）
export function countByAccount(entries) {
  const counts = new Map()
  for (const e of entries) {
    counts.set(e.debitId, (counts.get(e.debitId) ?? 0) + 1)
    if (e.creditId !== e.debitId) counts.set(e.creditId, (counts.get(e.creditId) ?? 0) + 1)
  }
  return counts
}

// 1つの科目の、月ごとの仕訳の件数 { 'YYYY-MM': 件数 }
export function monthCounts(entries, accountId) {
  const counts = {}
  for (const e of entries) {
    if (e.debitId !== accountId && e.creditId !== accountId) continue
    const ym = e.date.slice(0, 7)
    counts[ym] = (counts[ym] ?? 0) + 1
  }
  return counts
}

// 棒の高さ（px）。最大の月が maxPx。0 件は 0
export const barHeight = (count, max, maxPx) => (max > 0 ? Math.round((maxPx * count) / max) : 0)

// 帯の年の表示：同じ年なら 1 つ、またぐなら「2025–2026」
export const yearSpan = (win) => (win[0].year === win[win.length - 1].year ? String(win[0].year) : `${win[0].year}–${win[win.length - 1].year}`)
