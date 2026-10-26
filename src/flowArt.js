// 定期支払い・クレカ・貯蓄の「機能の意味を絵にする」ための、表示だけの計算（区切り17。群青 PC の見本が使う）。保存しない・ledgerLogic.js の計算は変えない。
// 日付の決まり（その月にない日は月末日）は ledgerLogic.js の subscriptionDate・nextMonth・initialLastMonth に任せる。
import { subscriptionDate, nextMonth, daysInMonth, initialLastMonth, payDateOf, lastClosingDate } from './ledgerLogic.js'
import { addMonths } from './bookPicker.js'

// ---- 定期支払い：月の玉（案A） ----
// 月ごとの状態。保存してある lastMonth と、登録した日（createdAt）からの推定で、仕訳を探して確かめるのではない
//   before：登録より前（さかのぼらない月）／done：記入の対象になった月／wait：今月で、指定日がまだ来ていない／skip：使わない間で、記入しなかった月
// months は 'YYYY-MM' の並び（古い順。今月が右端）。today は 'YYYY-MM-DD'
// 登録した日（createdAt は ISO 文字列）の、ローカルの日付。先頭 10 文字（UTC の日付）だと、日本時間の朝は前日になり、今日（ローカル）で決まる lastMonth とずれる
const localDate = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function subscriptionMoons(sub, today, months) {
  const created = (typeof sub.createdAt === 'string' && localDate(sub.createdAt)) || today
  const first = initialLastMonth(sub.day, created) // この月までは、登録のときに「記入済み」の扱い（実際には記入していない）
  const now = today.slice(0, 7)
  return months.map((month) => {
    if (month <= first) return { month, state: 'before' }
    if (month <= sub.lastMonth) return { month, state: 'done' }
    if (sub.active && month === now && subscriptionDate(month, sub.day) > today) return { month, state: 'wait' }
    return { month, state: 'skip' }
  })
}

// 12 か月の輪：月ごとの { month, done（記入の対象になった件数）, total（その月に記入されるはずの件数＝登録後で、使っている分）}。
// 使わない間の分（skip）と登録前の分（before）は total に入れない（入れると、使わない 1 件のせいで輪が永遠に満ちない）。total が 0 の月は、輪を点線で出す
export function ringFractions(subs, today, months) {
  const rows = months.map((month) => ({ month, done: 0, total: 0 }))
  for (const sub of subs) {
    subscriptionMoons(sub, today, months).forEach((m, i) => {
      if (m.state === 'done') { rows[i].done++; rows[i].total++ } else if (m.state === 'wait') rows[i].total++
    })
  }
  return rows
}

// 輪の時計の配置：暦の月（1〜12）で位置が決まる。12 月が真上、1 月が右上、3 月が真右、6 月が真下、9 月が真左（時計回り）。中心 (cx, cy)・半径 r の点を返す
export function clockPoint(month, r, cx = 0, cy = 0) {
  const a = ((-90 + (month % 12) * 30) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

// 次に記入される日：使っている定期支払いについて、lastMonth の次の月の指定日（月末日の決まりつき）。使わないものは null
export const nextRecordDate = (sub) => (sub.active ? subscriptionDate(nextMonth(sub.lastMonth), sub.day) : null)

// 全部の中で一番近い「次の記入」。{ sub, date, daysLeft }（今日を 0 日として数える）。なければ null。daysLeft が負なら、もう来ている（アプリを開くと記入される）
export function nextRecord(subs, today) {
  let best = null
  for (const sub of subs) {
    const date = nextRecordDate(sub)
    if (date && (best === null || date < best.date)) best = { sub, date }
  }
  return best && { ...best, daysLeft: dayDiff(today, best.date) }
}

// 毎月の合計：使っている定期支払いの金額の合計
export const monthlyTotal = (subs) => subs.filter((s) => s.active).reduce((n, s) => n + s.amount, 0)

// ---- 定期支払い：今月の暦（案B） ----
// 'YYYY-MM-DD' の差（日数。b − a）。UTC で数える（夏時間に左右されない）
export function dayDiff(a, b) {
  const t = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return Math.round((t(b) - t(a)) / 86400000)
}

// 曜日（0＝日曜）
const weekday = (date) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))).getUTCDay()

// 1 か月の暦の升。週は日曜から。各升：{ day（月の外は null）, items（この日に記入される定期支払い。使っているものだけ）, today, past }
// 指定日が月の日数より大きい（31 日など）ものは、その月の月末日の升に入り、end が true になる
export function calendarCells(month, subs, today) {
  const dim = daysInMonth(month)
  const lead = weekday(`${month}-01`)
  const cells = []
  for (let i = 0; i < lead; i++) cells.push({ day: null, items: [] })
  for (let day = 1; day <= dim; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`
    const items = subs.filter((s) => s.active && subscriptionDate(month, s.day) === date).map((s) => ({ sub: s, end: s.day > dim }))
    cells.push({ day, date, items, today: date === today, past: date < today })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, items: [] })
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

// ---- クレカ：請求の時間軸（案A）と請求期間の山（案B） ----
// card は ledgerLogic.js の cardReport の結果（account・closingDay・payDay・lastClosing・periods）。today は 'YYYY-MM-DD'。
// レーン：請求期間 1 つにつき 1 本。{ closingDate, start（期間の最初の日＝前の締め日の翌日）, amount, payDate, open（まだ締まっていない）, paid（引き落とし済み）, left（引き落としまでの日数）}
// 古い順。count 本（今の期間と、そのひとつ前から数える）。利用のない期間は、cardReport の periods に出ないので、レーンにもならない
export function cardLanes(card, today, count = 3) {
  const { closingDay, payDay, lastClosing } = card
  const openClosing = subscriptionDate(nextMonth(lastClosing.slice(0, 7)), closingDay) // 今の期間の締め日（まだ先）
  const byClosing = new Map(card.periods.map((p) => [p.closingDate, p.amount]))
  const lanes = []
  for (let closing = openClosing, i = 0; i < count; i++) {
    const prev = subscriptionDate(addMonths(closing.slice(0, 7), -1), closingDay)
    const payDate = payDateOf(closing, payDay)
    lanes.unshift({ closingDate: closing, start: nextDay(prev), amount: byClosing.get(closing) ?? 0, payDate, open: closing > lastClosing, paid: payDate <= today, left: dayDiff(today, payDate) })
    closing = prev
  }
  return lanes
}

const shiftDays = (date, n) => {
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + n))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
const nextDay = (date) => shiftDays(date, 1)

// 時間軸の横の位置（0〜1）。lanes の最初の start の少し前から、最後の payDate の少し後まで。today も入る
export function timelineScale(lanes, today, pad = 3) {
  const from = shiftDays(lanes[0].start, -pad)
  const to = shiftDays(lanes[lanes.length - 1].payDate, pad)
  const span = dayDiff(from, to)
  return { from, to, span, at: (date) => dayDiff(from, date) / span }
}

// 請求期間の山：直近 count 期間の利用額。棒の高さは、一番大きい期間を 1 とした割合。利用のない期間は 0。今の期間（open）は点線
// periods は cardReport の periods（新しい順）。締め日は lastClosing から月ごとにさかのぼる
export function periodBars(card, count = 12) {
  const { closingDay, lastClosing } = card
  const byClosing = new Map(card.periods.map((p) => [p.closingDate, p.amount]))
  const bars = []
  let closing = subscriptionDate(nextMonth(lastClosing.slice(0, 7)), closingDay)
  for (let i = 0; i < count; i++) {
    bars.unshift({ closingDate: closing, amount: byClosing.get(closing) ?? 0, open: closing > lastClosing })
    closing = subscriptionDate(addMonths(closing.slice(0, 7), -1), closingDay)
  }
  const max = Math.max(...bars.map((b) => b.amount), 0)
  return bars.map((b) => ({ ...b, ratio: max > 0 ? b.amount / max : 0 }))
}

// クレカ残高調整ページの右の面の棒：確定分・今期の「記録上（点線）→ 実際（白）」。rows は [{ target, current, actual }]（actual は、直さない行では current）。
// 長さは、全部の数字のうち一番大きいものを 100 とした割合（0〜100）。down は実際が記録上より小さい（棒を薄くする）。表示だけ
export function fixBars(rows) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.current, r.actual]))
  const pct = (n) => Math.max(0, n) / max * 100
  return rows.map((r) => ({ ...r, recorded: pct(r.current), after: pct(r.actual), down: r.actual < r.current }))
}

// レーンの状態：open（まだ締まっていない）／paid（引き落とし予定日が今日以前。日付だけの目安）／closed（締まっていて、まだ引き落とし前）
export const periodStatus = (lane) => (lane.open ? 'open' : lane.paid ? 'paid' : 'closed')

// 「月/日」の字。today と年が違うときだけ「年/月/日」（一覧・時間軸の字。個別の表の字は periodRows が決める）
export function shortDate(date, today) {
  const [y, m, d] = date.split('-').map(Number)
  return `${today && String(y) !== today.slice(0, 4) ? `${y}/` : ''}${m}/${d}`
}

// カウントダウンの相手：全カードのレーン（cardLanes）のうち、引き落とし前（paid でない）で、引き落とし日がいちばん近いもの。
// 利用のない（金額 0 の）レーンは、ほかにあるときは選ばない。同じ日なら、カードの並びが先。見つからなければ null。cards は cardReports の結果
export function nextPayLane(cards, today) {
  const all = cards.flatMap((card) => cardLanes(card, today, 3).filter((l) => !l.paid).map((lane) => ({ card, lane })))
  const used = all.filter((x) => x.lane.amount > 0)
  const pool = used.length ? used : all
  return pool.reduce((best, x) => (!best || x.lane.payDate < best.lane.payDate ? x : best), null)
}

// そのレーン（締め日 closingDate → 引き落とし日 payDate）の中の、今日の位置（0〜1）。締め日より前は 0、引き落とし日より後は 1
export const lanePos = (lane, today) => clamp01(dayDiff(lane.closingDate, today) / Math.max(1, dayDiff(lane.closingDate, lane.payDate)))

// カードを追加するときの線：入れかけの締め日・引き落とし日（文字）から。半角の 1〜31 だけ。空・範囲外・全角は null。
// 成功：{ closingDate（最後の締め日）, payDate, left, pos }。保存しない
export function previewLine(closingText, payText, today) {
  const ok = (x) => typeof x === 'string' && /^([1-9]|[12][0-9]|3[01])$/.test(x.trim())
  if (!ok(closingText) || !ok(payText)) return null
  const closingDay = Number(closingText.trim())
  const payDay = Number(payText.trim())
  const lastClosing = lastClosingDate(closingDay, today)
  const payDate = payDateOf(lastClosing, payDay)
  return { closingDate: lastClosing, payDate, ...payCountdown({ lastClosing, payDate }, today) }
}

// 次の引き落とし日までの日数と、いまの位置（今日が最後の締め日と、次の引き落とし日のあいだのどこか：0〜1）
export const payCountdown = (card, today) => ({ left: dayDiff(today, card.payDate), pos: clamp01(dayDiff(card.lastClosing, today) / Math.max(1, dayDiff(card.lastClosing, card.payDate))) })
const clamp01 = (x) => Math.min(1, Math.max(0, x))

// ---- 貯蓄：月ごとの動き ----
// 科目の月ごとの動き：months（'YYYY-MM' の並び）ごとに、借方に入った額（取り分け）と貸方に入った額（取り崩し）。通常の仕訳（normal）だけ。開始残高・残高調整は入れない
export function monthlyFlows(entries, accountId, months) {
  const map = new Map(months.map((m) => [m, { month: m, up: 0, down: 0 }]))
  for (const e of entries) {
    if (e.kind !== 'normal') continue
    const row = map.get(e.date.slice(0, 7))
    if (!row) continue
    if (e.debitId === accountId) row.up += e.amount
    if (e.creditId === accountId) row.down += e.amount
  }
  return [...map.values()].map((r) => ({ ...r, net: r.up - r.down }))
}

// ---- 鶏頭図：扇の幅・半径の下限・表示期間・棒グラフの縦目盛り（区切り20）----
export const ROSE_SPAN = 30 // 扇の幅（度）。12 か月で一周。全月で同じ（取り崩し反映でも細くしない）
// i 番目（0＝一番古い月）の扇の角度。12 時から時計回り。隣とくっつく（i 番目の終わり＝ i+1 番目の始まり）
export const roseSpan = (i) => [-90 + i * ROSE_SPAN, -90 + (i + 1) * ROSE_SPAN]
// 扇の外側の半径の下限（穴の半径 h から floor だけ外）。残りがごく小さくても、見分けがつく長さにする。穴の中には入らない
export const ROSE_FLOOR = 8
export const roseFloor = (r, h, floor = ROSE_FLOOR) => Math.max(r, h + floor)
// 表示期間：終わりの月 end（'YYYY-MM'）を末尾にした n か月（古い順）。年をまたぐ
export const periodMonths = (end, n = 12) => Array.from({ length: n }, (_, i) => addMonths(end, i - (n - 1)))
// 終わりの月に選べるか：今月まで（未来は選べない）。first（記録の最初の月）より前は、選べない
export const canSelectEnd = (m, today, first = '0000-00') => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= today.slice(0, 7) && m >= first
// 選んだ月を今月までに収める（未来なら今月）
export const clampEnd = (m, today) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= today.slice(0, 7) ? m : today.slice(0, 7))
// 棒グラフの縦目盛り：表示中の期間の、全部の月の（取り分け・取り崩し・目標）の最大値。月ごとには変えない。何もなければ 0
export const barAxisMax = (rows) => rows.reduce((m, r) => Math.max(m, r.up, r.down, r.goalSum ?? 0), 0)

// ---- 鶏頭図の基準を「表示中の 12 か月で一番大きい月」にする（区切り21。区切り19 の月ごとの基準〔目標・実績〕を置き換える）----
export const ROSE_CAP = 2 // 上限の倍率：基準 P ＝ min(最大, 2 番目に大きい値 × 倍率)
// values：各月の値 v（取り分けの合計。取り崩し反映のときは残りの絶対値）。最大が極端に大きいときは、2 番目 × 倍率で止める（2 番目が 0 のときは最大）。全部 0 なら 0
export function roseBase(values, factor = ROSE_CAP) {
  const v = values.map((x) => Math.abs(x)).sort((a, b) => b - a)
  const max = v[0] ?? 0
  if (!(max > 0)) return 0
  const second = v[1] ?? 0
  return second > 0 ? Math.min(max, second * factor) : max
}
// 半径：r(v) ＝ √(H² ＋ (RB² − H²) × min(v, P) ÷ P)。P を超える月は円（RB）いっぱいで止める。P が 0 なら穴の半径（割り算しない）
export const roseRadiusP = (v, P, h, rb) => (P > 0 ? Math.sqrt(h * h + ((rb * rb - h * h) * Math.min(Math.max(0, v), P)) / P) : h)
