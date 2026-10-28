// セーブ・ロードの純関数（フォルダの読み書きは saveStore.js）。new Date は使わない。今の時刻・セーブした日時は、呼ぶ側から引数で渡す。
// 日時（savedAt）は、ローカルの時差つきの ISO 形式（例 2026-10-10T08:30:12.345+09:00）。先頭10文字がローカルの日付になる。
import { freeAmount, cardLaterTotal, accountBalances, formatMoney, currencyUnit, isCurrency } from './ledgerLogic.js'
import { t } from './text.js'
import { parseImport, SCHEMA_VERSION } from './storage.js'

export const SAVE_FORMAT = 'orenoyome-save'
export const SAVE_FORMAT_VERSION = 1
export const MEMO_MAX = 100
export const DASH = '—'

// スロット：オートセーブ1つ（autosave.json）と、手動20個（save01.json〜save20.json）。この名前のファイルだけを、読み・書き・消す
// label は読むたびに t() を呼ぶ（getter。読み込み時に固めない）
export const SLOTS = [
  { file: 'autosave.json', kind: 'auto', get label() { return t('save.slotAuto') } },
  ...Array.from({ length: 20 }, (_, i) => ({ file: `save${String(i + 1).padStart(2, '0')}.json`, kind: 'manual', get label() { return t('save.slotFile', { number: i + 1 }) } })),
]
export const isSlotFile = (name) => SLOTS.some((s) => s.file === name)

// ドライブでのスロットの名前（spec-drive.md 13.3）。同期のデータ（orenoyome-data.json）・控え（orenoyome-backup-…）と見分けがつく
export const DRIVE_SLOT_PREFIX = 'orenoyome-'
export const driveSlotName = (file) => `${DRIVE_SLOT_PREFIX}${file}`
// ドライブのファイル名から、スロットのファイル名（save01.json など）。スロットの名前でなければ null
export const slotFileOfDriveName = (name) => (typeof name === 'string' && name.startsWith(DRIVE_SLOT_PREFIX) && isSlotFile(name.slice(DRIVE_SLOT_PREFIX.length)) ? name.slice(DRIVE_SLOT_PREFIX.length) : null)

// 「最後のセーブ」に使う日時の一覧（ドライブ。13.3）。スロットのファイルだけ。セーブした日時（appProperties.savedAt）があればそれ、ないものだけ更新日時
export const driveSavedAts = (files) => files
  .filter((f) => slotFileOfDriveName(f?.name) !== null)
  .map((f) => (typeof f.appProperties?.savedAt === 'string' && !Number.isNaN(Date.parse(f.appProperties.savedAt)) ? f.appProperties.savedAt : f.modifiedTime))
  .filter((v) => typeof v === 'string')

export const SAVE_ERRORS = {
  get unreadable() { return t('save.errUnreadable') },
  get newer() { return t('save.errNewer') },
  get memo() { return t('save.errMemo', { max: MEMO_MAX }) },
}

// ---- スロットに出す情報（項目の並びと名前はここ1か所。足すときは、SUMMARY_ITEMS と SUMMARY_CALCS に1つずつ足す）----
// place：main＝大きく、small＝枠の中に小さく1行。format(値, 全部の値) は値が入っているときだけ呼ばれる
export const SUMMARY_ITEMS = [
  { key: 'free', get label() { return t('save.itemFree') }, place: 'main', format: (v, values) => formatMoney(v, isCurrency(values.currency) ? values.currency : 'JPY') }, // セーブの通貨で出す。通貨のない古いセーブ・知らない通貨は円
  { key: 'days', get label() { return t('save.itemDays') }, place: 'main', format: (v) => t('save.daysValue', { count: v }) },
  { key: 'lastDate', get label() { return t('save.itemLastDate') }, place: 'main', format: (v) => v },
  { key: 'count', get label() { return t('save.itemCount') }, place: 'main', format: (v) => t('save.countValue', { count: v }) },
  { key: 'savedAt', get label() { return t('save.itemSavedAt') }, place: 'main', format: (v) => `${v.slice(0, 10)} ${v.slice(11, 16)}` },
  { key: 'memo', get label() { return t('save.itemMemo') }, place: 'main', format: (v) => v },
  { key: 'version', get label() { return t('save.itemVersion') }, place: 'small', format: (v) => `v${v}` },
  { key: 'kind', get label() { return t('save.itemKind') }, place: 'small', format: (v) => ({ manual: t('save.kindManual'), auto: t('save.kindAuto') })[v] },
  { key: 'balanced', get label() { return t('save.itemBalanced') }, place: 'small', format: (v) => (v ? t('save.checkOk') : t('save.checkNg')) },
  { key: 'currency', get label() { return t('save.itemCurrency') }, place: 'small', format: (v) => (isCurrency(v) ? currencyUnit(v) : DASH) }, // 通貨のない古いセーブは「—」
]

const dayNumber = (date) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

// 記録の日数：開始日（開始残高の仕訳のうち一番早い日付。なければ全部の仕訳のうち一番早い日付）から、セーブした日まで。両端の日を数える。
// 仕訳がない、または開始日がセーブした日より後なら null
export function recordDays(entries, savedDate) {
  const earliest = (list) => list.map((e) => e.date).sort()[0]
  const start = earliest(entries.filter((e) => e.kind === 'opening')) ?? earliest(entries)
  if (start === undefined || start > savedDate) return null
  return dayNumber(savedDate) - dayNumber(start) + 1
}

// データから求める項目。お金は既存の純関数を使う。savedAt・memo・kind はファイルの一番上にあるので、ここには入れない
const SUMMARY_CALCS = {
  free: (data, savedAt) => freeAmount(data.accounts, data.entries, data.loans, savedAt.slice(0, 7), cardLaterTotal(data.accounts, data.entries, savedAt.slice(0, 10))).total, // 借りているお金は、セーブした月の返済額だけ引く。クレカの分割・リボの先の分は引かない
  days: (data, savedAt) => recordDays(data.entries, savedAt.slice(0, 10)),
  lastDate: (data) => data.entries.map((e) => e.date).sort().at(-1) ?? null,
  count: (data) => data.entries.length,
  version: (data) => data.schemaVersion,
  balanced: (data) => accountBalances(data.accounts, data.entries).balanced,
  currency: (data) => data.settings?.currency,
}

export function saveSummary(data, savedAt) {
  return Object.fromEntries(Object.entries(SUMMARY_CALCS).map(([key, calc]) => [key, calc(data, savedAt)]))
}

// ---- メモ ----
export function validateMemo(text) {
  const memo = typeof text === 'string' ? text.trim() : ''
  if ([...memo].length > MEMO_MAX) return { error: SAVE_ERRORS.memo }
  return { memo }
}

// ---- セーブファイル ----
// kind：'manual' か 'auto'。data は書き出しと同じ中身（schemaVersion を含む。exportedAt は付けない）
export const buildSaveFile = (data, { kind, savedAt, memo }) => ({
  format: SAVE_FORMAT,
  formatVersion: SAVE_FORMAT_VERSION,
  kind,
  savedAt,
  memo,
  summary: saveSummary(data, savedAt),
  data,
})

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

// ロード用の検証。成功: { file, data, warnings }（data は今の読み込みと同じ検証と移行を通した今の版）/ 失敗: { error, status }（status は 'newer' か 'broken'）
export function checkSaveFile(text) {
  const broken = (detail) => ({ error: detail ? t('common.withDetail', { message: SAVE_ERRORS.unreadable, detail }) : SAVE_ERRORS.unreadable, status: 'broken' })
  let file
  try {
    file = JSON.parse(text)
  } catch {
    return broken()
  }
  if (!isObj(file) || file.format !== SAVE_FORMAT) return broken()
  if (!Number.isInteger(file.formatVersion) || file.formatVersion < 1) return broken()
  if (file.formatVersion > SAVE_FORMAT_VERSION) return { error: SAVE_ERRORS.newer, status: 'newer' }
  if (!isObj(file.data) || !Number.isInteger(file.data.schemaVersion)) return broken()
  if (file.data.schemaVersion > SCHEMA_VERSION) return { error: SAVE_ERRORS.newer, status: 'newer' }
  const r = parseImport(JSON.stringify(file.data))
  if (r.error) return broken(r.error)
  return { file, data: r.data, warnings: r.warnings ?? [] }
}

// 値がない・形が合わないときは「—」
const show = (item, value, values) => {
  if (value === undefined || value === null || value === '') return DASH
  try {
    const t = item.format(value, values)
    return typeof t === 'string' && t !== '' ? t : DASH
  } catch {
    return DASH
  }
}

// スロット1つの表示用。text は読んだファイルの文字列（ファイルがなければ null）
// 返すもの：{ status: 'empty' | 'ok' | 'newer' | 'broken', error, main, small, savedAt }
// ロードで選べるのは 'ok' だけ。error は選べない理由。main は大きく出す項目（{ key, label, text }）、small は小さい1行の文字
export function slotView(text) {
  if (text === null) return { status: 'empty', error: null, main: [], small: '', savedAt: null }
  const r = checkSaveFile(text)
  if (r.error) return { status: r.status, error: r.error, main: [], small: '', savedAt: null }
  const { file } = r
  const values = { ...(isObj(file.summary) ? file.summary : {}), savedAt: file.savedAt, memo: file.memo, kind: file.kind }
  const cells = SUMMARY_ITEMS.map((item) => ({ ...item, text: show(item, values[item.key], values) }))
  return {
    status: 'ok',
    error: null,
    main: cells.filter((c) => c.place === 'main').map(({ key, label, text: t }) => ({ key, label, text: t })),
    small: cells.filter((c) => c.place === 'small').map((c) => c.text).join(t('save.smallSeparator')),
    savedAt: typeof file.savedAt === 'string' ? file.savedAt : null,
  }
}

// 「最後のセーブ：○○前」の ○○ の部分。savedAts は手動・オートの savedAt（なければ空）、now は今の時刻（ISO）。切り捨て
export function lastSaveText(savedAts, now) {
  const times = savedAts.map((s) => Date.parse(s)).filter((t) => !Number.isNaN(t))
  if (times.length === 0) return t('save.never')
  const minutes = Math.floor((Date.parse(now) - Math.max(...times)) / 60000) // 未来（時計のずれ）は負になる
  if (minutes < 1) return t('save.within1min')
  if (minutes < 60) return t('save.minutesAgo', { count: minutes })
  if (minutes < 60 * 24) return t('save.hoursAgo', { count: Math.floor(minutes / 60) })
  return t('save.daysAgo', { count: Math.floor(minutes / (60 * 24)) })
}

// ---- config.json（セーブフォルダーの中。オートセーブの ON・OFF）。スロットのファイルではない（isSlotFile は false）----
export const CONFIG_FILE = 'config.json'
export const CONFIG_FORMAT = 'orenoyome-config'

export const buildConfig = (autosave) => ({ format: CONFIG_FORMAT, autosave })

// text は読んだ config.json の文字列（ファイルがなければ null）。返すもの：{ autosave, broken }
// ない → OFF（壊れてはいない）。読めない・形が違う → OFF で broken。ほかの項目があっても無視する
export function parseConfig(text) {
  if (text === null) return { autosave: false, broken: false }
  let json
  try {
    json = JSON.parse(text)
  } catch {
    return { autosave: false, broken: true }
  }
  if (!isObj(json) || json.format !== CONFIG_FORMAT || typeof json.autosave !== 'boolean') return { autosave: false, broken: true }
  return { autosave: json.autosave, broken: false }
}

// オートセーブを書かない理由。書けるなら null。理由：'off' | 'migrating' | 'unsupported' | 'none' | 'permission' | 'drive-idle' | 'unavailable'
// on：ON か（許可がなくて読めないときは、最後に分かった値）。folderState は slotStore の status の state。'permission'・'unavailable' のときだけ「オートセーブできません」を出す
// drive：ドライブにつないでいるか。つないでいるときは、ON・OFF に関係なく、大きな操作の直前（beforeReplace）だけ書く。ふだんの変化では書かない（'drive-idle'。spec-drive.md 13.2）。
// 電波がない・ログインが切れている（state が offline・login）ときは 'unavailable'
export function autosaveBlocker({ on, migrating, folderState, drive = false, beforeReplace = false }) {
  if (drive) {
    if (migrating) return 'migrating'
    if (!beforeReplace) return 'drive-idle'
    return folderState === 'offline' || folderState === 'login' ? 'unavailable' : null
  }
  if (!on) return 'off'
  if (migrating) return 'migrating'
  if (folderState === 'unsupported') return 'unsupported'
  if (folderState === 'none') return 'none'
  if (folderState !== 'granted') return 'permission'
  return null
}

// セーブフォルダーのセーブを、ドライブへ写す計画（spec-drive.md 13.4）。写すのは手動のファイル1〜20だけ（オートセーブは写さない）。
// folderRows：フォルダの readSlots の結果（{ file, text, error }）。driveFiles：ドライブにあるスロットのファイル名（save01.json など。中身が壊れていても「ある」）。
// 返すもの：items（フォルダにファイルがあるスロットの、番号順の一覧：{ file, label, status }。status は 'copy'・'exists'・'newer'・'broken'）、copy（写すもの：{ file, text }）。
// フォルダのスロットが空なら一覧に入れない。ドライブにあるものは、中身を問わず写さない（上書きしない）
export function planCopyToDrive(folderRows, driveFiles) {
  const items = []
  const copy = []
  for (const slot of SLOTS.filter((x) => x.kind === 'manual')) {
    const row = folderRows.find((r) => r.file === slot.file)
    if (!row || (row.text === null && !row.error)) continue
    let status
    if (driveFiles.includes(slot.file)) status = 'exists'
    else if (row.error || row.text === null) status = 'broken'
    else {
      const r = checkSaveFile(row.text)
      status = r.error ? r.status : 'copy' // 'newer' か 'broken'
      if (status === 'copy') copy.push({ file: slot.file, text: row.text })
    }
    items.push({ file: slot.file, label: slot.label, status })
  }
  return { items, copy }
}

// 書き込み・削除の失敗の文。name は例外の name、detail は例外の message
// ドライブの失敗（DriveError）は kind（login・offline・failed）、フォルダの失敗は DOMException の name
export const errName = (e) => e?.kind ?? e?.name
export function storeErrorText(name, detail = '') {
  if (name === 'offline') return t('save.errOffline')
  if (name === 'login') return t('save.errLogin')
  if (name === 'NotAllowedError' || name === 'SecurityError') return t('save.errNotAllowed')
  if (name === 'NotFoundError') return t('save.errNotFound')
  if (name === 'QuotaExceededError') return t('save.errQuota')
  return detail ? t('common.withDetail', { message: t('save.errSaveFailed'), detail }) : t('save.errSaveFailed')
}
