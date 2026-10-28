// データの読み書きはこのファイルだけで行う。保存先を変えるときはここだけ直す。
import { t, getLanguage } from './text.js'
import { USAGES, ENTRY_PRESET_NAME_LOAD_MAX, ENTRY_HIDDEN_KEYS, makeInitialAccounts, addKeys, addCardRoles, addPresets, addLiving, addFixed, hasFixed, applySubscriptions, emptySettings, sanitizeSettings, defaultCurrency, isCurrency, budgetKindAllows, isBudgetMonth, LOAN_KINDS, LOAN_NAME_MAX, hasLivingMonth, livingAccount, TYPES, ROLES, LIABILITY_ROLES, PRESETS, KINDS, LIVING, SPECIAL_KEYS, isDate } from './ledgerLogic.js'

const KEY = 'orenoyome'
export const SCHEMA_VERSION = 13

// 初めての起動と全体の初期化：初期科目はその時点の言語の名前で作り、通貨は言語に合わせる（韓国語ならウォン、それ以外は円）
export const emptyData = (language = getLanguage()) => ({ schemaVersion: SCHEMA_VERSION, skills: [], accounts: makeInitialAccounts(undefined, language), entries: [], subscriptions: [], settings: { ...emptySettings(), currency: defaultCurrency(language) }, budgets: [], entryPresets: [], noSpendDays: [], loans: [] })

// 保存されている版が古ければそのまま返す（移行は migrate を呼んだときだけ）
export function loadData() {
  const raw = localStorage.getItem(KEY)
  if (raw === null) return emptyData()
  return JSON.parse(raw)
}

export function saveData(data) {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export const needsMigration = (data) => data.schemaVersion < SCHEMA_VERSION

// 保存されているデータが、このアプリより新しい版のもの（新しい版のアプリが書いた）か。そのときは、画面に「新しい版のデータです」とだけ出し、
// 定期支払いの記入・保存・オートセーブのどれも書かない（古い版の決まりで書き換えて壊さないため。spec-pwa.md 6章）
export const isNewerData = (data) => Number.isInteger(data?.schemaVersion) && data.schemaVersion > SCHEMA_VERSION

// v1（スキルのみ）・v2〜v12 → v13。スキルはそのまま引き継ぐ。成功: { data, warnings } / 失敗: { error }（渡したデータは変えない）
// v1：初期科目（language の名前）・仕訳なし。v2：key を付ける（欠けたら error）。v3：そのまま。v4：定期支払いもそのまま。v5：設定（お気に入り）もそのまま。v6：予算もそのまま。
// 負債に role を付ける（v7。key が credit-card → card・締め日31・引き落とし日27、ほか → other）。
// 科目に preset を付ける（v7 以前だけ。名前と区分が、ja・ko どちらかの初期名と同じ科目。key を持つ科目・同じ preset の2つ目には付けない）。
// settings.currency：v8 はそのまま（正しい通貨でなければ error）、v7 以前は足す（language が韓国語ならウォン、それ以外は円）。
// 生活費の月を付ける（v9。収益の科目（調整益を除く）と、それを使う通常の仕訳に same）。
// 固定費の印を付ける（v10。費用の科目（調整損を除く）に fixed。preset が通信費なら true、ほかは false）。
// 仕訳プリセット（entryPresets）と「使っていない日」（noSpendDays）を空で足す（v11。v11 以上のデータは、検証してそのまま引き継ぐ）。
// 借りているお金（loans）を空で足す（v12。v12 以上のデータは検証してそのまま引き継ぐ）。
// 分割払い・リボ（v13）：仕訳の pay とクレカの科目の revolving は任意の項目なので、v12 以前からの移行では何も足さない。v12 以前のデータに pay・revolving があれば error（新しい版の項目なので）。
// subscriptions（v4 より前は空）、settings（v5 より前は空の初期値）、budgets（v6 より前は空）を足す。
// v7 以前のデータに preset、v8 以前のデータに livingMonth・living、v9 以前のデータに fixed があれば error（新しい版の項目なので）。組み立てた結果は、返す前に v11 の検証にかける。保存は、呼ぶ側が成功のときだけ行う。
// warnings：v5〜v8 の設定で、その項目だけ無視したときの警告の文（なければ空）
export function migrate(data, language = getLanguage()) {
  let accounts = []
  let entries = []
  let subscriptions = []
  if (data.schemaVersion === 1) {
    accounts = makeInitialAccounts(undefined, language)
  } else {
    if (data.schemaVersion === 2) {
      const r = addKeys(Array.isArray(data.accounts) ? data.accounts : [])
      if (r.error) return r
      accounts = r.accounts
    } else {
      accounts = data.accounts
    }
    entries = data.entries
    if (data.schemaVersion >= 4) subscriptions = data.subscriptions
  }
  if (Array.isArray(accounts)) accounts = addCardRoles(accounts)
  const budgets = data.schemaVersion >= 6 ? data.budgets : []
  const v = data.schemaVersion
  const error = checkLedger(accounts, entries, { requireKeys: true, v7: true, v8: v === 1 || v >= 8, v9: v === 1 || v >= 9, v10: v === 1 || v >= 10, v13: v >= 13 }) ?? checkSubscriptions(subscriptions, accounts) ?? checkBudgets(budgets, accounts)
  if (error) return { error }
  if (v < 8) accounts = addPresets(accounts) // v8 の科目には付け足さない
  ;({ accounts, entries } = addLiving(accounts, entries))
  accounts = addFixed(accounts)
  const addedError = checkLedger(accounts, entries, { requireKeys: true, v7: true, v8: true, v9: true, v10: true, v13: v >= 13 }) // 付けた結果の検証
  if (addedError) return { error: addedError }
  if (v >= 8 && !isCurrency(data.settings?.currency)) return { error: t('import.currencyInvalid') }
  let settings = emptySettings()
  let warnings = []
  if (data.schemaVersion >= 5) {
    const r = sanitizeSettings(data.settings, accounts)
    if (r.error) return { error: r.error }
    settings = r.settings
    warnings = r.warnings
  }
  const currency = v >= 8 ? data.settings.currency : defaultCurrency(language)
  if (v >= 11) {
    const e = checkEntryPresets(data.entryPresets, accounts) ?? checkNoSpendDays(data.noSpendDays)
    if (e) return { error: e }
  }
  if (v >= 12) {
    const e = checkLoans(data.loans, accounts)
    if (e) return { error: e }
  }
  const entryPresets = v >= 11 ? data.entryPresets : []
  const noSpendDays = v >= 11 ? data.noSpendDays : []
  const loans = v >= 12 ? data.loans : []
  return { data: { schemaVersion: SCHEMA_VERSION, skills: data.skills, accounts, entries, subscriptions, settings: { ...settings, currency }, budgets, entryPresets, noSpendDays, loans }, warnings }
}

// 定期支払いの自動記入（v4 以降のデータに対して）。今日と now は呼ぶ側から渡す。記入しないときは、同じ data を返す
export function autoRecord(data, today, now) {
  const r = applySubscriptions(data.subscriptions, data.entries, data.accounts, today, now)
  if (r.added === 0) return { data, added: 0 }
  return { data: { ...data, subscriptions: r.subscriptions, entries: r.entries }, added: r.added }
}

// ---- 自由に使える額の初めの表示（作業18、仕様 5.13）：残高の画面で、自由に使える額を最初にどちらで出すか。ブラウザごとに覚える（言語と同じ形）。
// 保存データ（orenoyome）・書き出し・セーブファイルには入れない。schemaVersion は変えない。storage は getItem / setItem を持つ物（ブラウザの localStorage、テストでは偽物）
export const BALANCE_VIEW_KEY = 'orenoyome-balance-view'
export const BALANCE_VIEWS = ['actual', 'budget'] // 実際の額、予算を反映した額

// 覚えた値が正しければそれ。なければ・不正な値・読めないとき（storage がない、例外）は 'actual'。例外にしない
export function readBalanceView(storage) {
  try {
    const stored = storage.getItem(BALANCE_VIEW_KEY)
    if (BALANCE_VIEWS.includes(stored)) return stored
  } catch { /* 読めなければ 'actual' */ }
  return 'actual'
}

// 正しい値だけ覚える。書けなくても例外にしない（覚えられなくても、今の画面は変わる）
export function saveBalanceView(storage, view) {
  if (!BALANCE_VIEWS.includes(view)) return
  try {
    storage.setItem(BALANCE_VIEW_KEY, view)
  } catch { /* 覚えられなくてもよい */ }
}

// 画面から使う入口：ブラウザの localStorage を使う。localStorage の取り出しで例外が出ても（使えない設定など）、読むときは 'actual'、書くときは何もしない
const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
export const loadBalanceView = () => readBalanceView(browserStorage())
export const rememberBalanceView = (view) => saveBalanceView(browserStorage(), view)
export const BALANCE_VIEW_LABELS = { actual: 'balance.viewActual', budget: 'balance.viewBudget' } // ボタン・選択肢の文言（辞書のキー）

// 書き出し：schemaVersion を一番上に、書き出し日時を付ける。残りのデータ（skills, accounts, entries, subscriptions, settings, budgets, entryPresets, noSpendDays, loans）はそのまま入れる
export function exportJson() {
  const { schemaVersion, ...rest } = loadData()
  return JSON.stringify({ schemaVersion, exportedAt: new Date().toISOString(), ...rest }, null, 2)
}

const isStr = (v) => typeof v === 'string'
const isInt = (v) => Number.isInteger(v)
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

function validSkill(s) {
  return (
    isObj(s) && isStr(s.id) && isStr(s.name) && isInt(s.level) && s.level >= 0 && s.level <= 500 &&
    isStr(s.createdAt) && isStr(s.updatedAt) &&
    isObj(s.descriptions) &&
    Object.entries(s.descriptions).every(([k, v]) => /^\d+$/.test(k) && Number(k) <= 50 && isStr(v)) &&
    Array.isArray(s.levelHistory) &&
    s.levelHistory.every((h) => isObj(h) && isStr(h.changedAt) && isInt(h.from) && isInt(h.to))
  )
}

const validDay = (d) => isInt(d) && d >= 1 && d <= 31

// 資産は ROLES のどれか。負債は v7 から card・other のどちらか（v6 以前は role なし）。ほかは role なし
function validRole(a, v7) {
  if (a.type === 'asset') return ROLES.includes(a.role)
  if (a.type === 'liability' && v7) return LIABILITY_ROLES.includes(a.role)
  return a.role === undefined
}

// 締め日・引き落とし日：v7 の card の科目だけが持つ（1〜31の整数）。それ以外が持っていたらエラー
function validCardDays(a, v7) {
  if (v7 && a.role === 'card') return validDay(a.closingDay) && validDay(a.payDay)
  return a.closingDay === undefined && a.payDay === undefined
}

// preset：v8 から。表（PRESETS）にあるもの。key を持つ科目は持たない。v7 以前は持たない
function validPreset(a, v8) {
  if (a.preset === undefined) return true
  return v8 && PRESETS.includes(a.preset) && a.key === undefined
}

// livingMonth：v9 から。収益の科目（調整益を除く）は same・next のどちらかを必ず持つ。ほかの科目と v8 以前は持たない
// usage：v13 から。収益の科目（調整益を除く）だけが持てる任意の項目（持たなければ生活費。画面は、生活費を項目なしで保存する）
const validUsage = (a, v13) => a.usage === undefined || (v13 && hasLivingMonth(a) && USAGES.includes(a.usage))
const validLivingMonth = (a, v9) => (v9 && hasLivingMonth(a) ? LIVING.includes(a.livingMonth) : a.livingMonth === undefined)

// fixed：v10 から。費用の科目（調整損を除く）は真偽値を必ず持つ。ほかの科目と v9 以前は持たない
const validFixed = (a, v10) => (v10 && hasFixed(a) ? typeof a.fixed === 'boolean' : a.fixed === undefined)

// revolving：v13 から。クレカ（role が card）の科目だけが持てる任意の項目（リボの毎月の支払い額と年率。rate は 1/100 %）。持たなくてもよい
const validRevolving = (a, v13) =>
  a.revolving === undefined ||
  (v13 && a.type === 'liability' && a.role === 'card' && isObj(a.revolving) && Object.keys(a.revolving).every((k) => k === 'monthly' || k === 'rate') &&
    isInt(a.revolving.monthly) && a.revolving.monthly >= 1 && isInt(a.revolving.rate) && a.revolving.rate >= 0 && a.revolving.rate <= 10000)

function validAccount(a, v7, v8, v9, v10, v13) {
  return (
    isObj(a) && isStr(a.id) && isStr(a.name) && a.name.trim() !== '' &&
    TYPES.includes(a.type) &&
    (a.key === undefined || SPECIAL_KEYS.includes(a.key)) &&
    validRole(a, v7) && validCardDays(a, v7) &&
    (!v7 || a.key !== 'credit-card' || a.role === 'card') && validPreset(a, v8) && validLivingMonth(a, v9) && validUsage(a, v13) && validFixed(a, v10) && validRevolving(a, v13) &&
    typeof a.active === 'boolean' && isStr(a.createdAt) && isStr(a.updatedAt)
  )
}

const unique = (list) => new Set(list).size === list.length

// living：v9 から。収益の科目（調整益を除く）を使う通常の仕訳は same・next のどちらかを必ず持つ。
// ほかの仕訳（開始残高・残高調整・収益を使わない仕訳・調整益だけの仕訳）と v8 以前は持たない
// pay：v13 から。通常の仕訳で、貸方がクレカのものだけが持てる任意の項目（なければ一括）。
// 分割：{ mode: 'installment', count: 2〜60 の整数, rate?: 0〜10000（年率の 1/100 %。見込み用） }、リボ：{ mode: 'revolving' }。
// クレカにリボの設定（revolving）がなくても、リボの仕訳は読める（計算では一括として扱う）
const PAY_KEYS = { installment: ['mode', 'count', 'rate'], revolving: ['mode'] }
const validPay = (e, cardIds, v13) =>
  e.pay === undefined ||
  (v13 && e.kind === 'normal' && cardIds.has(e.creditId) && isObj(e.pay) && Object.keys(PAY_KEYS[e.pay.mode] ?? []).length > 0 &&
    Object.keys(e.pay).every((k) => PAY_KEYS[e.pay.mode].includes(k)) &&
    (e.pay.mode === 'revolving' ||
      (isInt(e.pay.count) && e.pay.count >= 2 && e.pay.count <= 60 && (e.pay.rate === undefined || (isInt(e.pay.rate) && e.pay.rate >= 0 && e.pay.rate <= 10000)))))

function validEntry(e, accounts, accountIds, v9, v13, cardIds) {
  return (
    isObj(e) && isStr(e.id) && isDate(e.date) &&
    accountIds.has(e.debitId) && accountIds.has(e.creditId) && e.debitId !== e.creditId &&
    isInt(e.amount) && e.amount >= 1 && isStr(e.memo) && KINDS.includes(e.kind) &&
    (v9 && e.kind === 'normal' && livingAccount(accounts, e.debitId, e.creditId) ? LIVING.includes(e.living) : e.living === undefined) &&
    validPay(e, cardIds, v13) &&
    isStr(e.createdAt) && isStr(e.updatedAt)
  )
}

// accounts / entries の検証。エラー文を返す（問題なければ null）。requireKeys: 4つの特別科目の key が揃っていること（v3）。v7: 負債の role・締め日・引き落とし日の検証（v7）。v8: preset の検証（v8。同じ preset の重複もエラー）。
// v9: 生活費の月（科目の livingMonth・仕訳の living）の検証。v10: 固定費の印（科目の fixed）の検証。v13: 分割払い・リボ（クレカの revolving・仕訳の pay）の検証
function checkLedger(accounts, entries, { requireKeys = false, v7 = false, v8 = false, v9 = false, v10 = false, v13 = false } = {}) {
  if (!Array.isArray(accounts) || !accounts.every((a) => validAccount(a, v7, v8, v9, v10, v13))) return t('import.accountsShape')
  if (!unique(accounts.map((a) => a.id))) return t('import.accountIdDup')
  if (!unique(accounts.map((a) => a.name.trim()))) return t('import.accountNameDup')
  if (!unique(accounts.filter((a) => a.preset !== undefined).map((a) => a.preset))) return t('import.accountPresetDup')
  const keys = accounts.filter((a) => a.key !== undefined).map((a) => a.key)
  if (!unique(keys)) return t('import.accountKeyDup')
  if (requireKeys && !SPECIAL_KEYS.every((k) => keys.includes(k))) return t('import.specialMissing')
  if (!Array.isArray(entries)) return t('import.entriesShape')
  const ids = new Set(accounts.map((a) => a.id))
  const cardIds = new Set(accounts.filter((a) => a.type === 'liability' && a.role === 'card').map((a) => a.id))
  if (!entries.every((e) => validEntry(e, accounts, ids, v9, v13, cardIds))) return t('import.entriesInvalid')
  if (!unique(entries.map((e) => e.id))) return t('import.entryIdDup')
  return null
}

function validSubscription(s, accountIds) {
  return (
    isObj(s) && isStr(s.id) && isStr(s.name) && s.name.trim() !== '' && isStr(s.memo) &&
    isInt(s.amount) && s.amount >= 1 && isInt(s.day) && s.day >= 1 && s.day <= 31 &&
    accountIds.has(s.debitId) && accountIds.has(s.creditId) && s.debitId !== s.creditId &&
    typeof s.active === 'boolean' && isStr(s.lastMonth) && /^\d{4}-(0[1-9]|1[0-2])$/.test(s.lastMonth) &&
    isStr(s.createdAt) && isStr(s.updatedAt)
  )
}

// subscriptions の検証。エラー文を返す（問題なければ null）。accounts は検証済みの科目の配列
function checkSubscriptions(subscriptions, accounts) {
  if (!Array.isArray(subscriptions)) return t('import.subsShape')
  const ids = new Set(accounts.map((a) => a.id))
  if (!subscriptions.every((s) => validSubscription(s, ids))) return t('import.subsInvalid')
  if (!unique(subscriptions.map((s) => s.id))) return t('import.subIdDup')
  return null
}

function validBudget(b, accountsById) {
  const account = isObj(b) ? accountsById.get(b.accountId) : undefined
  return (
    isObj(b) && isStr(b.id) && account !== undefined && budgetKindAllows(b.kind, account) &&
    isInt(b.amount) && b.amount >= 1 && isBudgetMonth(b.startMonth) && isStr(b.createdAt) && isStr(b.updatedAt)
  )
}

// budgets の検証。エラー文を返す（問題なければ null）。accounts は検証済みの科目の配列
// 種類と科目の組み合わせ（上限＝調整損以外の費用、目標＝取り分け）・金額・適用開始月・同じ科目と適用開始月の重複は、すべてエラー
function checkBudgets(budgets, accounts) {
  if (!Array.isArray(budgets)) return t('import.budgetsShape')
  const byId = new Map(accounts.map((a) => [a.id, a]))
  if (!budgets.every((b) => validBudget(b, byId))) return t('import.budgetsInvalid')
  if (!unique(budgets.map((b) => b.id))) return t('import.budgetIdDup')
  if (!unique(budgets.map((b) => `${b.accountId} ${b.startMonth}`))) return t('import.budgetPairDup')
  return null
}

function validEntryPreset(p, accountsById) {
  const debit = isObj(p) ? accountsById.get(p.debitId) : undefined
  const credit = isObj(p) ? accountsById.get(p.creditId) : undefined
  return (
    isObj(p) && isStr(p.id) && isStr(p.name) && p.name.length <= ENTRY_PRESET_NAME_LOAD_MAX && (p.icon === undefined || isStr(p.icon)) &&
    debit !== undefined && credit !== undefined && debit.id !== credit.id &&
    !ENTRY_HIDDEN_KEYS.includes(debit.key) && !ENTRY_HIDDEN_KEYS.includes(credit.key) &&
    (p.amount === null || (isInt(p.amount) && p.amount >= 1)) && isStr(p.memo) && isStr(p.createdAt) && isStr(p.updatedAt)
  )
}

// entryPresets の検証（v11）。エラー文を返す（問題なければ null）。名前は空でもよい（30 字まで）。icon は、なくてもよい（なければ初めの記号）。知らない id でもよい（表示で、初めの記号にする）。借方・貸方は、存在する別々の科目（3つの特別科目を除く）。金額は null か 1 以上の整数
function checkEntryPresets(entryPresets, accounts) {
  if (!Array.isArray(entryPresets)) return t('import.presetsShape')
  const byId = new Map(accounts.map((a) => [a.id, a]))
  if (!entryPresets.every((p) => validEntryPreset(p, byId))) return t('import.presetsInvalid')
  if (!unique(entryPresets.map((p) => p.id))) return t('import.presetIdDup')
  return null
}

// noSpendDays の検証（v11）：実在する日付（YYYY-MM-DD）の配列。同じ日が 2 回あればエラー
function checkNoSpendDays(days) {
  if (!Array.isArray(days) || !days.every(isDate)) return t('import.noSpendInvalid')
  if (!unique(days)) return t('import.noSpendDup')
  return null
}

const validLoanTerm = (x) => isObj(x) && isBudgetMonth(x.from) && isInt(x.rate) && x.rate >= 0 && x.rate <= 10000 && isInt(x.payment) && x.payment >= 0

function validLoan(l, accountsById) {
  const account = isObj(l) ? accountsById.get(l.accountId) : undefined
  const sch = isObj(l) && l.kind === 'scholarship'
  const rc = l?.receiving
  return (
    isObj(l) && isStr(l.id) && LOAN_KINDS.includes(l.kind) && isStr(l.name) && l.name.trim() !== '' && l.name.length <= LOAN_NAME_MAX &&
    account?.type === 'liability' && isInt(l.rate) && l.rate >= 0 && l.rate <= 10000 && isInt(l.payment) && l.payment >= 0 &&
    isInt(l.payDay) && l.payDay >= 1 && l.payDay <= 31 &&
    Array.isArray(l.rateHistory) && l.rateHistory.every(validLoanTerm) && unique(l.rateHistory.map((x) => x.from)) &&
    (rc === undefined || (sch && isObj(rc) && isInt(rc.monthly) && rc.monthly >= 1 && isBudgetMonth(rc.from) && isBudgetMonth(rc.to) && rc.from <= rc.to)) &&
    (l.repayFrom === undefined || (sch && isBudgetMonth(l.repayFrom))) && isStr(l.createdAt)
  )
}

// loans の検証（v12）。エラー文を返す（問題なければ null）。借入ごとに、別々の負債の科目を 1 つ持つ。利率は 0〜10000（0〜100%）、返済額は 0 以上、受け取り中と返し始めは奨学金だけ
function checkLoans(loans, accounts) {
  if (!Array.isArray(loans)) return t('import.loansShape')
  const byId = new Map(accounts.map((a) => [a.id, a]))
  if (!loans.every((l) => validLoan(l, byId))) return t('import.loansInvalid')
  if (!unique(loans.map((l) => l.id))) return t('import.loanIdDup')
  if (!unique(loans.map((l) => l.accountId))) return t('import.loanAccountDup')
  return null
}

// 読み込みファイルの検証のみ。現在のデータには触れない。成功: { data, warnings } / 失敗: { error }
// warnings：設定（お気に入り）で、その項目だけ無視したときの警告の文（なければ空）
export function parseImport(text, language = getLanguage()) {
  let json
  try {
    json = JSON.parse(text)
  } catch {
    return { error: t('import.jsonBroken') }
  }
  if (!isObj(json) || !isInt(json.schemaVersion)) return { error: t('import.notOurFile') }
  if (json.schemaVersion > SCHEMA_VERSION) return { error: t('import.newerVersion') }
  if (json.schemaVersion < 1 || !Array.isArray(json.skills) || !json.skills.every(validSkill))
    return { error: t('import.dataShape') }
  if (json.schemaVersion === 1) return migrate(json, language)
  const error = checkLedger(json.accounts, json.entries, { requireKeys: json.schemaVersion >= 3, v7: json.schemaVersion >= 7, v8: json.schemaVersion >= 8, v9: json.schemaVersion >= 9, v10: json.schemaVersion >= 10, v13: json.schemaVersion >= 13 })
  if (error) return { error }
  if (json.schemaVersion >= 4) {
    const subError = checkSubscriptions(json.subscriptions, json.accounts)
    if (subError) return { error: subError }
  }
  if (json.schemaVersion < 13) return migrate(json, language) // v2〜v12 → v13（migrate が v13 の検証をする。v5〜v8 の設定の警告も返る）
  const r = sanitizeSettings(json.settings, json.accounts)
  if (r.error) return { error: r.error }
  if (!isCurrency(json.settings.currency)) return { error: t('import.currencyInvalid') }
  const budgetError = checkBudgets(json.budgets, json.accounts)
  if (budgetError) return { error: budgetError }
  const presetError = checkEntryPresets(json.entryPresets, json.accounts) ?? checkNoSpendDays(json.noSpendDays) ?? checkLoans(json.loans, json.accounts)
  if (presetError) return { error: presetError }
  return {
    data: { schemaVersion: SCHEMA_VERSION, skills: json.skills, accounts: json.accounts, entries: json.entries, subscriptions: json.subscriptions, settings: { ...r.settings, currency: json.settings.currency }, budgets: json.budgets, entryPresets: json.entryPresets, noSpendDays: json.noSpendDays, loans: json.loans },
    warnings: r.warnings,
  }
}
