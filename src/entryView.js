import { t } from './text.js'

// 仕訳の一覧の見え方（spec-mobile.md 5.3）。React を読み込まない（node の check から読める）。
// 日付の枠の開き方：一番新しい日だけ / 全部 / 全部閉じる。スマホの幅と PC の幅で別々に覚える（ブラウザごと。保存データ・書き出し・セーブファイルには入れない）

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
