import { t } from './text.js'
import { livingOnAccountChange } from './ledgerLogic.js'

// 仕訳の一覧の見え方（spec-mobile.md 5.3）。React を読み込まない（node の check から読める）。
// 日付の枠の開き方：一番新しい日だけ / 全部 / 全部閉じる。スマホの幅と PC の幅で別々に覚える（ブラウザごと。保存データ・書き出し・セーブファイルには入れない）

// 借方・貸方の入れ替え（交換ボタン）：科目だけ入れ替える。日付・金額・メモは変えない。生活費の月は、収益の科目が反対側へ動くだけなら選び方を残す（livingOnAccountChange）。
// 両方空のときは null（押せない）。入力の値の入れ替えだけで、保存はしない（編集画面は「保存」を押すまで保存データを変えない）
export function swapDebitCredit(accounts, f) {
  if (!f.debitId && !f.creditId) return null
  const next = { ...f, debitId: f.creditId, creditId: f.debitId }
  return { ...next, living: livingOnAccountChange(accounts, f, next) }
}

export const OPEN_MODES = ['latest', 'all', 'none']
export const OPEN_MODE_LABELS = { latest: 'entries.openMode.latest', all: 'entries.openMode.all', none: 'entries.openMode.none' } // 選択肢の文言（辞書のキー）
export const OPEN_MODE_KEY = 'orenoyome-entry-open' // 保存データのキー（orenoyome）とは別。値は {"phone":"latest","pc":"all"}
export const defaultOpenMode = (isPhone) => (isPhone ? 'latest' : 'all')

// 並びに関係なく、日付が一番新しい日（groups は groupEntriesByDate の結果。古い順でも新しい順でもよい）。なければ null
export const latestDate = (groups) => groups.reduce((max, g) => (max === null || g.date > max ? g.date : max), null)

// 初めに開く日の Set
export function initialOpenDates(groups, mode) {
  if (mode === 'all') return new Set(groups.map((g) => g.date))
  if (mode === 'latest') return new Set(latestDate(groups) === null ? [] : [latestDate(groups)])
  return new Set()
}

// 今開いているか：ユーザーが押した分（toggled：日付 → true / false）が、初めの状態より優先
export const isOpenDate = (date, initial, toggled) => (date in toggled ? toggled[date] : initial.has(date))

// 曜日（0=日）。タイムゾーンに左右されないよう UTC で数える。date は YYYY-MM-DD
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay()

const WEEKDAY_KEYS = ['common.weekday0', 'common.weekday1', 'common.weekday2', 'common.weekday3', 'common.weekday4', 'common.weekday5', 'common.weekday6']
export const weekdayName = (date) => t(WEEKDAY_KEYS[weekdayOf(date)])

// 月日と曜日。例：「10/11（日）」
export const formatDayLabel = (date) => t('entries.dayLabel', { md: date.slice(5).replace('-', '/'), wd: weekdayName(date) })

// 日付の見出しの文字。例：「10/11（日）　3件」
export const formatDayHead = (date, count) => t('entries.dayHead', { md: date.slice(5).replace('-', '/'), wd: weekdayName(date), count })

// 編集画面で、何か変えたか。入力の文字を、そのまま比べる（前後の空白も違いとして数える）
const EDIT_FIELDS = ['date', 'amount', 'debitId', 'creditId', 'memo', 'living']
export const entryChanged = (initial, current) => EDIT_FIELDS.some((k) => initial[k] !== current[k])

// ---- 覚える・読む。storage は getItem / setItem を持つ物（ブラウザの localStorage、テストでは偽物）。使えなくても例外にしない ----
const SIDES = ['phone', 'pc']

function readAll(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(OPEN_MODE_KEY))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// side は 'phone' か 'pc'。覚えた値が正しければそれ。なければ・知らない値・壊れた値・読めないときは、その側の初めの値
export function readOpenMode(storage, side) {
  const stored = readAll(storage)[side]
  return OPEN_MODES.includes(stored) ? stored : defaultOpenMode(side === 'phone')
}

// 正しい値だけ覚える。もう片方の側の値は残す。書けなくても例外にしない
export function saveOpenMode(storage, side, mode) {
  if (!SIDES.includes(side) || !OPEN_MODES.includes(mode)) return
  try {
    const all = readAll(storage)
    storage.setItem(OPEN_MODE_KEY, JSON.stringify({ phone: all.phone, pc: all.pc, [side]: mode }))
  } catch { /* 覚えられなくてもよい */ }
}

// 旧：スマホの「＋」で最初にプリセットを選ぶ画面を出すか（localStorage orenoyome-preset-prompt）。⑮で廃止。キーは端末に残るが、もう読まない

// ---- 月の道の「使っていない日」の図形（群青の PC だけ。端末ごと。保存データ・書き出し・セーブには入れない）。
// 日の数字の下線は、設定に関係なく常に出る。ここで選ぶのは、その上に重ねる図形。初めの値は「出さない」（下線だけ）
export const NO_SPEND_SHAPE_KEY = 'orenoyome-nospend-shape2'
export const OLD_NO_SPEND_SHAPE_KEY = 'orenoyome-nospend-shape' // 旧：下線も図形の 1 つとして選んでいた。混ざらないよう、名前を変えた（読むときだけ読み替える）
export const NO_SPEND_SHAPES = ['none', 'ring', 'bar', 'slash', 'cross', 'star', 'star4', 'check'] // 出さない・輪・柱・斜線・×・星★・星✦・チェック
export const NO_SPEND_SHAPE_LABELS = { none: 'nospend.shape.none', ring: 'nospend.shape.ring', bar: 'nospend.shape.bar', slash: 'nospend.shape.slash', cross: 'nospend.shape.cross', star: 'nospend.shape.star', star4: 'nospend.shape.star4', check: 'nospend.shape.check' } // 選択肢の文言（辞書のキー）
export const DEFAULT_NO_SPEND_SHAPE = 'none'
// 旧の値 → 新の値（旧の下線は、いまは常に出るので「出さない」。ほかは同じ図形のまま）
const OLD_SHAPE_TO_NEW = { none: 'none', underline: 'none', ring: 'ring', bar: 'bar', slash: 'slash', cross: 'cross', star: 'star', check: 'check' }
export const readNoSpendShape = (storage) => {
  try {
    const v = storage.getItem(NO_SPEND_SHAPE_KEY)
    if (NO_SPEND_SHAPES.includes(v)) return v
    const old = storage.getItem(OLD_NO_SPEND_SHAPE_KEY)
    return Object.hasOwn(OLD_SHAPE_TO_NEW, old) ? OLD_SHAPE_TO_NEW[old] : DEFAULT_NO_SPEND_SHAPE
  } catch {
    return DEFAULT_NO_SPEND_SHAPE
  }
}
export const saveNoSpendShape = (storage, value) => {
  if (!NO_SPEND_SHAPES.includes(value)) return
  try {
    storage.setItem(NO_SPEND_SHAPE_KEY, value)
  } catch { /* 覚えられなくてもよい */ }
}

// ---- 10 件ずつのグループの開閉（⑨。端末ごと。保存データ・書き出し・セーブには入れない）。値は {"2026-10-01": true, ...}（キーは groupByTens の key＝グループの最初の日）。
// 押した分だけ覚える。覚えていないグループは、その月で一番新しいグループだけ開く。覚えるのは新しい方から TENS_OPEN_KEEP 個まで
export const TENS_OPEN_KEY = 'orenoyome-entry-tens'
export const TENS_OPEN_KEEP = 60
export function readTensOpen(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(TENS_OPEN_KEY))
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'boolean'))
  } catch {
    return {}
  }
}
export function saveTensOpen(storage, toggled) {
  try {
    const keep = Object.keys(toggled).sort().reverse().slice(0, TENS_OPEN_KEEP)
    storage.setItem(TENS_OPEN_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, toggled[k]]))))
  } catch { /* 覚えられなくてもよい */ }
}
// 今開いているか：押した分（toggled）が優先。なければ、その月で一番新しいグループ（groups は groupByTens の結果。並びは問わない）だけ開く
export const isOpenTens = (key, groups, toggled) => (key in toggled ? toggled[key] : key === groups.reduce((max, g) => (g.key > max ? g.key : max), ''))
// 10 件を超える月だけ、グループの見出しを出す（以下の月は、今までと同じ）
export const showTens = (groups) => groups.reduce((n, g) => n + g.count, 0) > 10
const md = (date) => date.slice(5).replace('-', '/')
export const formatTensRange = (g) => (g.from === g.to ? md(g.from) : t('entries.tensRange', { from: md(g.from), to: md(g.to) }))

// ---- 展開したグループの中の、日の枠の頭の記号（⑨。基本・商人・スマホの幅。群青の PC は日の大きな数字があるので出さない。端末ごと。保存データ・書き出し・セーブには入れない）。初めの値は「・」
export const TENS_BULLET_KEY = 'orenoyome-entry-bullet'
export const TENS_BULLETS = ['none', 'dot', 'disc', 'dash', 'num', 'circ', 'gt'] // なし・点・丸・線・数字・丸数字・矢印（どれも CSS で描く。書体に字がなくてよい）
export const TENS_BULLET_LABELS = { none: 'bullet.none', dot: 'bullet.dot', disc: 'bullet.disc', dash: 'bullet.dash', num: 'bullet.num', circ: 'bullet.circ', gt: 'bullet.gt' } // 選択肢の文言（辞書のキー）
export const DEFAULT_TENS_BULLET = 'dot'
export const readTensBullet = (storage) => {
  try {
    const v = storage.getItem(TENS_BULLET_KEY)
    return TENS_BULLETS.includes(v) ? v : DEFAULT_TENS_BULLET
  } catch {
    return DEFAULT_TENS_BULLET
  }
}
export const saveTensBullet = (storage, value) => {
  if (!TENS_BULLETS.includes(value)) return
  try {
    storage.setItem(TENS_BULLET_KEY, value)
  } catch { /* 覚えられなくてもよい */ }
}

// 画面から使う入口
const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
export const loadOpenMode = (side) => readOpenMode(browserStorage(), side)
export const rememberOpenMode = (side, mode) => saveOpenMode(browserStorage(), side, mode)
export const loadNoSpendShape = () => readNoSpendShape(browserStorage())
export const rememberNoSpendShape = (value) => saveNoSpendShape(browserStorage(), value)
export const loadTensOpen = () => readTensOpen(browserStorage())
export const rememberTensOpen = (toggled) => saveTensOpen(browserStorage(), toggled)
export const loadTensBullet = () => readTensBullet(browserStorage())
export const rememberTensBullet = (value) => saveTensBullet(browserStorage(), value)
