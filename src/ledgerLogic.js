// 仕訳帳の純関数。お金の計算もここに置く（画面側では計算しない）。
// 画面に出す文字（エラー文・行の名前など）は、辞書（lang/ja.js）から t() で取る。ラベルの表は、読むたびに t() を呼ぶ（読み込み時に固めない）。
import { t, translate, dictionaries, getLanguage, LANGUAGES } from './text.js'
import { PRESET_ICON_PICKER, PRESET_ICON_DEFAULT } from './icons.js'

export const TYPES = ['asset', 'liability', 'revenue', 'expense', 'equity']
export const TYPE_LABELS = {
  get asset() { return t('type.asset') },
  get liability() { return t('type.liability') },
  get revenue() { return t('type.revenue') },
  get expense() { return t('type.expense') },
  get equity() { return t('type.equity') },
}
export const ROLES = ['cash', 'earmark', 'other']
export const LIABILITY_ROLES = ['card', 'other'] // 負債の role。card＝クレカ（締め日・引き落とし日を持つ）
export const ROLES_BY_TYPE = { asset: ROLES, liability: LIABILITY_ROLES }
export const ROLE_LABELS = {
  get cash() { return t('role.cash') },
  get earmark() { return t('role.earmark') },
  get card() { return t('role.card') },
  get other() { return t('role.other') },
}
export const KINDS = ['normal', 'opening', 'adjustment']
// 生活費の月（仕様 3.9・5.14）。same＝受け取った月の生活費、next＝翌月の生活費
export const LIVING = ['same', 'next']
// 生活費の月の決まり（livingMonth）を持つ科目：収益のうち、調整益を除いたもの
export const hasLivingMonth = (account) => account?.type === 'revenue' && account.key !== 'adjust-gain'
// 固定費の印（fixed。v10。docs/formulas.md）を持つ科目：費用のうち、調整損を除いたもの（調整損は日ごとの費用に入らない）
export const hasFixed = (account) => account?.type === 'expense' && account.key !== 'adjust-loss'
// 最初から固定費の初期科目（preset）と、移行で古い科目に付ける値。名前の一致では決めない（本人が作った「家賃」などは OFF から始まり、本人が ON にする）
export const FIXED_PRESETS = ['phone']

// 初期科目（仕様 6.5。どの国にもある科目だけ）。[名前の辞書のキー, type, role, preset, key, card（role が card のときだけ { closingDay, payDay }）]
// 名前は言語ごとの辞書（accountName.*）から取る。preset は内部の印で、計算には使わない（計算は key で探す）。key を持つ4つは preset を持たない
const INITIAL = [
  ['accountName.cash', 'asset', 'cash', 'cash'],
  ['accountName.bank', 'asset', 'cash', 'bank'],
  ['accountName.reserve', 'asset', 'earmark', 'reserve'],
  ['accountName.deposit', 'asset', 'other', 'deposit'],
  ['accountName.invest', 'asset', 'other', 'invest'],
  ['accountName.creditCard', 'liability', 'card', undefined, 'credit-card', { closingDay: 31, payDay: 27 }],
  ['accountName.payable', 'liability', 'other', 'payable'],
  ['accountName.salary', 'revenue', undefined, 'salary'],
  ['accountName.otherIncome', 'revenue', undefined, 'other-income'],
  ['accountName.adjustGain', 'revenue', undefined, undefined, 'adjust-gain'],
  ['accountName.food', 'expense', undefined, 'food'],
  ['accountName.transport', 'expense', undefined, 'transport'],
  ['accountName.daily', 'expense', undefined, 'daily'],
  ['accountName.phone', 'expense', undefined, 'phone'],
  ['accountName.utilities', 'expense', undefined, 'utilities'],
  ['accountName.medical', 'expense', undefined, 'medical'],
  ['accountName.ceremony', 'expense', undefined, 'ceremony'],
  ['accountName.leisure', 'expense', undefined, 'leisure'],
  ['accountName.otherExpense', 'expense', undefined, 'other-expense'],
  ['accountName.adjustLoss', 'expense', undefined, undefined, 'adjust-loss'],
  ['accountName.opening', 'equity', undefined, undefined, 'opening'],
]
// 通貨の一覧（仕様 6.4）。保存する値は 'JPY'・'KRW'。足すときは、ここと辞書（currency.XXX）に足す。unit は金額の後ろに付ける文字（読むたびに t()。言語で変わる）
export const CURRENCIES = {
  JPY: { get unit() { return t('currency.JPY') } },
  KRW: { get unit() { return t('currency.KRW') } },
}
export const defaultCurrency = (language) => (language === 'ko' ? 'KRW' : 'JPY') // 移行・初めての起動・全体の初期化のときの通貨（仕様 6.6）
export const isCurrency = (v) => typeof v === 'string' && Object.hasOwn(CURRENCIES, v)
// 設定の通貨を変える（純関数）。知らない通貨なら、同じ settings を返す。ほかの項目は変えない
export const setCurrency = (settings, currency) => (isCurrency(currency) ? { ...settings, currency } : settings)

export const PRESETS = INITIAL.filter((row) => row[3] !== undefined).map((row) => row[3])

// その科目の、言語ごとの初期名（key か preset で決まる）。どちらも持たない科目は null。language を省くと今の言語
export function initialName(account, language = getLanguage()) {
  const row = INITIAL.find(([, , , preset, key]) => (key !== undefined && account.key === key) || (preset !== undefined && account.preset === preset))
  return row ? translate(dictionaries, language, row[0]) : null
}

// 名前がどれかの言語の初期名と同じで、区分（type）も初期科目と同じ科目に preset を付ける（移行用）。key か preset を持つ科目は変えない。
// 名前が同じでも区分が違う科目には付けない。同じ preset に当たる科目が2つあれば、並びが先のほうだけに付ける。元の配列は変えない
export function addPresets(accounts) {
  const taken = new Set(accounts.map((a) => a?.preset).filter((p) => p !== undefined))
  return accounts.map((a) => {
    if (typeof a !== 'object' || a === null || a.key !== undefined || a.preset !== undefined) return a
    const row = INITIAL.find(([nameKey, type, , preset]) => preset !== undefined && type === a.type && !taken.has(preset) && LANGUAGES.some((l) => translate(dictionaries, l, nameKey) === a.name))
    if (!row) return a
    taken.add(row[3])
    return { ...a, preset: row[3] }
  })
}

// ---- 言語を変えるときの、科目の名前の置き換え（仕様 6.3）----
// 置き換える候補：key か preset を持つ科目（特別科目と初期科目）のうち、名前が新しい言語の初期名と違うもの。自分で作った科目は出ない。
// blocked：置き換えると、ほかの科目と同じ名前になる（その行は選べない）。新しい名前は言語の中で重複しないので、blocked でない行を全部置き換えても、同じ名前はできない
const renameCandidates = (accounts, to) =>
  accounts.flatMap((account) => {
    const name = initialName(account, to)
    if (name === null || account.name === name) return []
    return [{ account, name, blocked: accounts.some((other) => other.id !== account.id && other.name === name) }]
  })

// 確認画面の一覧：{ account, name（新しい名前）, checked（最初からチェック）, blocked }。
// checked：名前が今の言語（from）の初期名のまま（自分で名前を変えた科目は、最初はチェックなし。blocked の行もチェックなし）。元の配列は変えない
export const renameRows = (accounts, from, to) =>
  renameCandidates(accounts, to).map((r) => ({ ...r, checked: !r.blocked && r.account.name === initialName(r.account, from) }))

// ids（チェックされた科目の id）のうち、blocked でないものの名前を、新しい言語（to）の初期名にする。updatedAt も更新。元の配列は変えない
export function applyRenames(accounts, ids, to, now = new Date().toISOString()) {
  const names = new Map(renameCandidates(accounts, to).filter((r) => !r.blocked && ids.includes(r.account.id)).map((r) => [r.account.id, r.name]))
  return accounts.map((a) => (names.has(a.id) ? { ...a, name: names.get(a.id), updatedAt: now } : a))
}

// 計算で探す特別科目は、名前ではなく key で探す（改名しても壊れない）。削除・使わない設定・type変更は不可。
export const SPECIAL_KEYS = ['opening', 'adjust-gain', 'adjust-loss', 'credit-card']
export const ENTRY_PRESET_NAME_MAX = 20 // 仕訳プリセットの名前の長さの上限（文字数。新しく作る・直すときの入力の決まり。名前は空でもよい）
export const ENTRY_PRESET_NAME_LOAD_MAX = 30 // 読み込みは、今までの v11 で保存された 30 字までの名前も受ける
export const ENTRY_PRESET_MAX = 20 // 仕訳プリセットの件数の上限（追加を止める。読み込みは、これより多くても受ける）
export const ENTRY_HIDDEN_KEYS = ['opening', 'adjust-gain', 'adjust-loss'] // 入力の選択肢から除く。クレカ未払いは除かない
export const LEGACY_KEY_BY_NAME = { 開始残高: 'opening', 調整益: 'adjust-gain', 調整損: 'adjust-loss', クレカ未払い: 'credit-card' } // v2からの移行専用

// 負債の role は、'card' を渡したときだけ card（締め日・引き落とし日つき）。それ以外は other（科目管理で追加した負債）
export const newAccount = (name, type, role, now = new Date().toISOString(), key, card, preset) => {
  const isCardRole = type === 'liability' && role === 'card'
  return {
    id: crypto.randomUUID(),
    name,
    type,
    ...(type === 'asset' && { role }),
    ...(type === 'liability' && { role: isCardRole ? 'card' : 'other' }),
    ...(isCardRole && { closingDay: card.closingDay, payDay: card.payDay }),
    ...(hasLivingMonth({ type, key }) && { livingMonth: 'same' }), // 新しい収益の科目は「受け取った月の生活費」
    ...(hasFixed({ type, key }) && { fixed: FIXED_PRESETS.includes(preset) }), // 新しい費用の科目は固定費でない（初期科目の通信費だけ固定費）
    ...(key && { key }),
    ...(preset && { preset }),
    active: true,
    createdAt: now,
    updatedAt: now,
  }
}

// language を省くと今の言語の名前で作る。初めての起動と全体の初期化で使う
export const makeInitialAccounts = (now = new Date().toISOString(), language = getLanguage()) =>
  INITIAL.map(([nameKey, type, role, preset, key, card]) => newAccount(translate(dictionaries, language, nameKey), type, role, now, key, card, preset))

export const isProtected = (account) => Boolean(account.key)

const hasEntries = (account, entries) => entries.some((e) => e.debitId === account.id || e.creditId === account.id)

const usedBySubscription = (account, subscriptions) => subscriptions.some((s) => s.debitId === account.id || s.creditId === account.id)

export const hasBudget = (account, budgets) => budgets.some((b) => b.accountId === account.id)

export const canDeleteAccount = (account, entries, subscriptions = [], budgets = []) =>
  !isProtected(account) && !hasEntries(account, entries) && !usedBySubscription(account, subscriptions) && !hasBudget(account, budgets)
// 条件は canDeleteAccount と同じ（特別科目でなく、仕訳が1件もなく、定期支払いと予算で使っていない）。ただしクレカ（role が card）は区分を変えられない
export const canChangeType = (account, entries, subscriptions = [], budgets = []) =>
  account.role !== 'card' && canDeleteAccount(account, entries, subscriptions, budgets)
export const canChangeRole = (account, budgets = []) => account.type !== 'liability' && !hasBudget(account, budgets) // 負債の role は変えられない。ほかは予算があるときだけ不可

// v2 → v3：名前が一致する4科目に key を付ける。4つ揃わないときは error。元の配列は変えない
export function addKeys(accounts) {
  const keyed = accounts.map((a) => (LEGACY_KEY_BY_NAME[a.name] ? { ...a, key: LEGACY_KEY_BY_NAME[a.name] } : a))
  if (!SPECIAL_KEYS.every((k) => keyed.some((a) => a.key === k))) return { error: t('error.specialMissing') }
  return { accounts: keyed }
}

// v6 → v7：role のない負債に role を付ける。key が credit-card → card（締め日31・引き落とし日27）、ほかの負債 → other。元の配列は変えない
export const addCardRoles = (accounts) =>
  accounts.map((a) => {
    if (a?.type !== 'liability' || a.role !== undefined) return a
    return a.key === 'credit-card' ? { ...a, role: 'card', closingDay: 31, payDay: 27 } : { ...a, role: 'other' }
  })

export function validateAccountName(name, accounts, selfId) {
  const n = name.trim()
  if (!n) return { error: t('error.accountNameEmpty') }
  if (accounts.some((a) => a.id !== selfId && a.name === n)) return { error: t('error.accountNameDuplicate') }
  return { name: n }
}

// type を変えたら role を整える（asset は role 必須、liability は other、ほかは role なし）。締め日・引き落とし日は消える。
// 収益にしたら生活費の月の決まりは same、収益から変えたら消える（区分を変えられるのは仕訳のない科目だけなので、仕訳には影響しない）
export function changeType(account, type, role, now = new Date().toISOString()) {
  const { role: _old, closingDay: _closing, payDay: _pay, livingMonth: _living, fixed: _fixed, ...rest } = account
  return {
    ...rest, type,
    ...(type === 'asset' && { role: role ?? 'other' }), ...(type === 'liability' && { role: 'other' }),
    ...(hasLivingMonth({ type, key: account.key }) && { livingMonth: 'same' }),
    ...(hasFixed({ type, key: account.key }) && { fixed: false }), // 費用にしたら固定費でない、費用から変えたら消える
    updatedAt: now,
  }
}

// ---- 生活費の月（仕様 5.14） ----

// 仕訳の生活費の月を決める科目：貸方を先に見る（両側が収益なら貸方の決まり）。なければ借方。どちらもなければ undefined
export function livingAccount(accounts, debitId, creditId) {
  const find = (id) => accounts.find((a) => a.id === id && hasLivingMonth(a))
  return find(creditId) ?? find(debitId)
}

// 新しい仕訳の living の初期値：その科目の決まり。収益の科目を使わない仕訳は null
export const defaultLiving = (accounts, debitId, creditId) => livingAccount(accounts, debitId, creditId)?.livingMonth ?? null

// 入力欄の選択肢の文字：日付が正しければ「9月の生活費」（same は日付の月、next は翌月）。正しくなければ「受け取った月の生活費」「翌月の生活費」
export function livingOptionLabel(date, living) {
  if (!isDate(date)) return living === 'next' ? t('living.next') : t('living.same')
  const month = living === 'next' ? nextMonth(date.slice(0, 7)) : date.slice(0, 7)
  return t('living.option', { month: Number(month.slice(5, 7)) })
}

// 入力欄で借方・貸方を変えたときの living。before・after は { debitId, creditId, living }。
// 生活費の月を決める科目が同じままなら今の選び方を残し、別の科目になったら新しい科目の決まり、収益の科目がなくなったら null
export function livingOnAccountChange(accounts, before, after) {
  const was = livingAccount(accounts, before.debitId, before.creditId)
  const now = livingAccount(accounts, after.debitId, after.creditId)
  if (!now) return null
  return was?.id === now.id && LIVING.includes(before.living) ? before.living : now.livingMonth
}

// 生活費のやりくり（仕様 5.14）。month の生活費になる収入（kind が normal で living を持つ仕訳）と、その月の支出を比べる。
// same は日付の月、next は翌月の生活費。収益の科目が貸方なら +、借方（取り消し）なら −（両側が収益なら差し引き0）。調整益・開始残高・残高調整は数えない
// items：{ id, date, account, amount, living }（日付順）。expenseTotal は monthReport と同じ（開始残高・残高調整は入らない）
export function livingBalance(entries, accounts, month) {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const items = []
  for (const e of [...entries].sort(byDateThenCreated)) {
    if (e.kind !== 'normal' || !LIVING.includes(e.living)) continue
    const m = e.date.slice(0, 7)
    if ((e.living === 'next' ? nextMonth(m) : m) !== month) continue
    for (const [id, sign] of [[e.creditId, 1], [e.debitId, -1]]) {
      const account = byId.get(id)
      if (hasLivingMonth(account)) items.push({ id: e.id, date: e.date, account, amount: sign * e.amount, living: e.living })
    }
  }
  const incomeTotal = sum(items, (i) => i.amount)
  const expenseTotal = monthReport(accounts, entries, month).expenseTotal
  return { items, incomeTotal, expenseTotal, result: incomeTotal - expenseTotal }
}

// v8 → v9：収益の科目（調整益を除く）に same、それを使う通常の仕訳に same を付ける。持っているものは変えない。元の配列は変えない
export function addLiving(accounts, entries) {
  const nextAccounts = accounts.map((a) => (hasLivingMonth(a) && a.livingMonth === undefined ? { ...a, livingMonth: 'same' } : a))
  const nextEntries = entries.map((e) =>
    e.kind === 'normal' && e.living === undefined && livingAccount(nextAccounts, e.debitId, e.creditId) ? { ...e, living: 'same' } : e)
  return { accounts: nextAccounts, entries: nextEntries }
}

// v9 → v10：費用の科目（調整損を除く）に fixed を付ける（preset が FIXED_PRESETS なら true、ほかは false）。持っているものは変えない。元の配列は変えない
export const addFixed = (accounts) =>
  accounts.map((a) => (hasFixed(a) && a.fixed === undefined ? { ...a, fixed: FIXED_PRESETS.includes(a.preset) } : a))

// ---- 仕訳の入力・一覧 ----

export function isDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v // 2026-02-30 のような実在しない日付も弾く
}

// 半角数字のみ・先頭0なし。カンマ・小数点・全角・1e3・負数・0・空欄はエラー。丸めない。
export function parseAmount(text) {
  if (typeof text !== 'string' || !/^[1-9]\d*$/.test(text)) return { error: t('error.amountMin1') }
  const amount = Number(text)
  if (!Number.isSafeInteger(amount)) return { error: t('error.amountTooLarge') }
  return { amount }
}

// 入力フォームの選択肢。currentIds は編集中の仕訳が今使っている科目（使わない設定でも残す）。
export const entryAccountOptions = (accounts, currentIds = []) =>
  accounts.filter((a) => (a.active && !ENTRY_HIDDEN_KEYS.includes(a.key)) || currentIds.includes(a.id))

// living：収益の科目（調整益を除く）を使う仕訳だけが持つ。渡された値が same・next でなければ、科目の決まり（defaultLiving）
// 分割払い・リボの入力（v13）。payMode：'lump'（一括。なければ一括）・'installment'（分割）・'revolving'（リボ）。payCount・payRate は文字（分割の回数・手数料の年率。年率は空でもよい）。
// 貸方がクレカのときだけ使う（クレカでなければ、分割・リボの選びは無視して一括）。リボは、そのクレカに revolving（毎月の支払い額）があるときだけ。成功: { pay } か {}（一括）/ 失敗: { error }
export const PAY_DEFAULT = { payMode: 'lump', payCount: '12', payRate: '' }
export function parsePayInput({ payMode, payCount, payRate }, creditAccount) {
  if (!creditAccount || !isCard(creditAccount) || !payMode || payMode === 'lump') return {}
  if (payMode === 'revolving') return creditAccount.revolving ? { pay: { mode: 'revolving' } } : { error: t('error.payRevolvingNone') }
  if (payMode !== 'installment') return {}
  const count = String(payCount ?? '').trim()
  if (!/^\d{1,2}$/.test(count) || Number(count) < 2 || Number(count) > 60) return { error: t('error.payCount') }
  const rateText = String(payRate ?? '').trim()
  if (rateText === '') return { pay: { mode: 'installment', count: Number(count) } }
  const rate = parseRate(rateText)
  return rate.error ? rate : { pay: { mode: 'installment', count: Number(count), rate: rate.rate } }
}
// 入力欄の初めの値（編集は、その仕訳の pay から）
export function payInitial(entry) {
  const pay = entry?.pay
  if (!pay) return { ...PAY_DEFAULT }
  if (pay.mode === 'revolving') return { ...PAY_DEFAULT, payMode: 'revolving' }
  return { payMode: 'installment', payCount: String(pay.count), payRate: pay.rate === undefined ? '' : formatRate(pay.rate) }
}

export function validateEntryInput({ date, debitId, creditId, amountText, living, payMode, payCount, payRate }, accounts) {
  if (!isDate(date)) return { error: t('error.dateInvalid') }
  const a = parseAmount(amountText)
  if (a.error) return a
  const ids = new Set(accounts.map((x) => x.id))
  if (!ids.has(debitId) || !ids.has(creditId)) return { error: t('error.chooseDebitCredit') }
  if (debitId === creditId) return { error: t('error.sameDebitCredit') }
  const fallback = defaultLiving(accounts, debitId, creditId)
  const paid = parsePayInput({ payMode, payCount, payRate }, accounts.find((x) => x.id === creditId))
  if (paid.error) return paid
  return { date, debitId, creditId, amount: a.amount, ...(fallback !== null && { living: LIVING.includes(living) ? living : fallback }), ...paid }
}

export const newEntry = (input, memo, now = new Date().toISOString()) => ({
  id: crypto.randomUUID(),
  date: input.date,
  debitId: input.debitId,
  creditId: input.creditId,
  amount: input.amount,
  memo,
  kind: 'normal',
  ...(input.living && { living: input.living }),
  ...(input.pay && { pay: input.pay }),
  createdAt: now,
  updatedAt: now,
})

// id・kind・createdAt は保つ。living は付け直す（収益の科目を使わなくなった仕訳からは消える）
export const editEntry = ({ living: _living, pay: _pay, ...entry }, input, memo, now = new Date().toISOString()) => ({
  ...entry,
  date: input.date,
  debitId: input.debitId,
  creditId: input.creditId,
  amount: input.amount,
  memo,
  ...(input.living && { living: input.living }),
  ...(input.pay && { pay: input.pay }),
  updatedAt: now,
})

// 日付 → 作成日時 → id の順。同じ入力なら毎回同じ並びになる
const byDateThenCreated = (a, b) =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

// month は 'YYYY-MM'。日付順、同じ日は作成順
export const entriesOfMonth = (entries, month) =>
  entries
    .filter((e) => e.date.startsWith(month))
    .sort(byDateThenCreated)

// 最後に作成した normal の仕訳（createdAt が一番新しいもの。同じなら、並びの後ろのほう）。なければ null。開始残高・残高調整は対象外。
// subscriptions を渡すと、定期支払いの自動記入でできた仕訳（名前＝メモ・借方・貸方・金額が、定期支払いの 1 件と同じ）は飛ばす（自分で入れた「前回」を元にするため）
export const lastNormalEntry = (entries, subscriptions = []) =>
  entries
    .filter((e) => e.kind === 'normal' && !subscriptions.some((s) => s.name === e.memo && s.debitId === e.debitId && s.creditId === e.creditId && s.amount === e.amount))
    .reduce((last, e) => (!last || e.createdAt >= last.createdAt ? e : last), null)

// 最後に作成した normal の仕訳の貸方。なければ ''（定期支払いの自動記入も数える）
export const lastCreditId = (entries) =>
  entries.filter((e) => e.kind === 'normal').reduce((last, e) => (!last || e.createdAt >= last.createdAt ? e : last), null)?.creditId ?? ''

// 「前回と同じ入力」：入力欄に入れる値（日付は入れない）。今は選べない科目（使わない設定・なくなった）の側は ''。
// 生活費の月は、元の選び方を、収益の科目がまだ使われているときだけ残す。なければ科目の決まり。金額は文字
export function copyInputFromEntry(entry, accounts) {
  const usable = new Set(entryAccountOptions(accounts).map((a) => a.id))
  const debitId = usable.has(entry.debitId) ? entry.debitId : ''
  const creditId = usable.has(entry.creditId) ? entry.creditId : ''
  const keep = entry.living && livingAccount(accounts, debitId, creditId) !== undefined
  return { debitId, creditId, amount: String(entry.amount), memo: entry.memo, living: keep ? entry.living : defaultLiving(accounts, debitId, creditId) }
}

export const formatYen = (n) => n.toLocaleString('ja-JP') // 表示専用。計算には使わない。数字の桁区切りだけ（通貨の文字は付けない）
// 金額の後ろに通貨の文字を付ける（1,000円・1,000엔・1,000원）。数字は変わらない。通貨が分からないとき（古いデータ）は円
export const currencyUnit = (currency) => CURRENCIES[isCurrency(currency) ? currency : 'JPY'].unit
export const formatMoney = (n, currency) => `${formatYen(n)}${currencyUnit(currency)}`

export const canEditEntry = (entry) => entry.kind === 'normal'

// 区分ごとに分ける（TYPES の順。空の区分は出さない。グループ内は渡された順のまま）
export const groupByType = (accounts) =>
  TYPES.map((type) => ({ type, label: TYPE_LABELS[type], accounts: accounts.filter((a) => a.type === type) })).filter((g) => g.accounts.length)

// 日付ごとにまとめる。枠は日付の古い順、枠の中は作成日時の古い順（同じなら id 順）。元の配列は変えない。
// 表示の番号は、枠の中の位置（index + 1）から画面側で振る。保存しない。
// order が 'desc' のときは、枠の並びだけを新しい順にする（枠の中の並びは変えない）
export function groupEntriesByDate(entries, order = 'asc') {
  const groups = []
  for (const e of [...entries].sort(byDateThenCreated)) {
    const last = groups[groups.length - 1]
    if (last && last.date === e.date) last.entries.push(e)
    else groups.push({ date: e.date, entries: [e] })
  }
  return order === 'desc' ? groups.reverse() : groups
}

// 日付の枠（groupEntriesByDate の古い順の結果）を、10 件ずつのグループにまとめる。月の中だけ（呼ぶ側が月の仕訳を渡す）。
// 古い順に数えて、10 件目に達したら区切る。10 件目の日の仕訳は全部同じグループに入る（10 件より多くなることがある）。
// 区切りは必ず古い順で決める：order が 'desc' のときは、グループの並びと、グループの中の枠の並びだけを逆にする（中身は同じ）。
// 見出しの材料：from・to（日付の範囲）、count（仕訳の件数）、total（費用の合計。月の道・日の見出しの計と同じ数え方）、
// max（1 件の費用の最高額。収入・振替・費用でない仕訳は含めず、費用がなければ 0）。key は最初の日（古い順の並びで変わらない）
export function groupByTens(dayGroups, accounts, order = 'asc') {
  const expenseIds = new Set(accounts.filter((a) => a.type === 'expense' && a.key !== 'adjust-loss').map((a) => a.id))
  const spent = (e) => (e.kind !== 'normal' ? 0 : (expenseIds.has(e.debitId) ? e.amount : 0) - (expenseIds.has(e.creditId) ? e.amount : 0))
  const out = []
  let cur = null
  for (const g of dayGroups) {
    if (!cur || cur.count >= 10) {
      cur = { key: g.date, from: g.date, to: g.date, count: 0, total: 0, max: 0, days: [] }
      out.push(cur)
    }
    cur.to = g.date
    cur.days.push(g)
    for (const e of g.entries) {
      cur.count += 1
      cur.total += spent(e)
      cur.max = Math.max(cur.max, spent(e))
    }
  }
  if (order === 'desc') { out.reverse(); for (const o of out) o.days = [...o.days].reverse() }
  return out
}

// ---- 開始残高 ----

// 開始残高の画面に出す科目：active の資産と負債
export const openingAccounts = (accounts) => accounts.filter((a) => a.active && (a.type === 'asset' || a.type === 'liability'))

// 空欄と0は可（仕訳を作らない）。それ以外は parseAmount と同じ（半角数字のみ・先頭0なし）
export function parseOpeningAmount(text) {
  if (text === '' || text === '0') return { amount: 0 }
  const r = parseAmount(text)
  return r.error ? { error: t('error.amountMin0') } : r
}

// その科目の開始残高の仕訳。先頭は createdAt が古い順、同じなら id 順（planOpening と openingInitial で共通）
const openingEntriesOf = (entries, accountId) =>
  entries
    .filter((e) => e.kind === 'opening' && (e.debitId === accountId || e.creditId === accountId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

// 画面の初期値。画面に出ている科目の開始残高の仕訳だけから決める（使わない科目の仕訳は見ない）
export function openingInitial(accounts, entries, today) {
  const amounts = {}
  const dates = []
  for (const a of openingAccounts(accounts)) {
    const first = openingEntriesOf(entries, a.id)[0]
    if (!first) continue
    amounts[a.id] = String(first.amount)
    dates.push(first.date)
  }
  return { date: dates.sort()[0] ?? today, amounts }
}

// 保存の計画（保存はしない）。成功: { entries, created, updated, deleted, earlier } / 失敗: { error }
// 金額あり：仕訳がなければ作り、あれば直す。空・0：あれば消す。同じ科目に2件以上あれば、先頭だけ残す。使わない科目の仕訳は触らない。
// earlier：開始日より前の通常の仕訳（{ count, first }）。なければ null
export function planOpening(accounts, entries, date, amountTexts, now = new Date().toISOString()) {
  if (!isDate(date)) return { error: t('error.startDateInvalid') }
  const openingId = accounts.find((a) => a.key === 'opening')?.id
  if (!openingId) return { error: t('error.openingAccountMissing') }
  const shown = openingAccounts(accounts)
  const amounts = {}
  for (const a of shown) {
    const r = parseOpeningAmount(amountTexts[a.id] ?? '')
    if (r.error) return { error: t('error.accountPrefixed', { name: a.name, message: r.error }) }
    amounts[a.id] = r.amount
  }
  const remove = new Set()
  const replace = new Map()
  const add = []
  let created = 0, updated = 0, deleted = 0
  for (const a of shown) {
    const [first, ...extra] = openingEntriesOf(entries, a.id)
    for (const e of extra) { remove.add(e.id); deleted++ }
    const amount = amounts[a.id]
    if (!amount) {
      if (first) { remove.add(first.id); deleted++ }
      continue
    }
    const [debitId, creditId] = a.type === 'asset' ? [a.id, openingId] : [openingId, a.id]
    if (!first) {
      add.push({ id: crypto.randomUUID(), date, debitId, creditId, amount, memo: '', kind: 'opening', createdAt: now, updatedAt: now })
      created++
    } else if (first.date !== date || first.amount !== amount || first.debitId !== debitId || first.creditId !== creditId) {
      replace.set(first.id, { ...first, date, debitId, creditId, amount, updatedAt: now })
      updated++
    }
  }
  const before = entries.filter((e) => e.kind === 'normal' && e.date < date).map((e) => e.date).sort()
  return {
    entries: [...entries.filter((e) => !remove.has(e.id)).map((e) => replace.get(e.id) ?? e), ...add],
    created, updated, deleted,
    earlier: before.length ? { count: before.length, first: before[0] } : null,
  }
}

// ---- 残高・自由に使える額・クレカ・貯蓄 ----

const sum = (list, pick) => list.reduce((n, x) => n + pick(x), 0)

// 残高：資産・費用は「借方 − 貸方」、負債・収益・純資産は「貸方 − 借方」。
// rows は全科目（used：仕訳が1件でもある）。balanced：行の借方合計と貸方合計の一致（存在しない科目を指す仕訳があると崩れる）
export function accountBalances(accounts, entries) {
  const sums = new Map(accounts.map((a) => [a.id, { debit: 0, credit: 0 }]))
  for (const e of entries) {
    const d = sums.get(e.debitId)
    if (d) d.debit += e.amount
    const c = sums.get(e.creditId)
    if (c) c.credit += e.amount
  }
  const rows = accounts.map((account) => {
    const { debit, credit } = sums.get(account.id)
    const debitSide = account.type === 'asset' || account.type === 'expense'
    return { account, debit, credit, balance: debitSide ? debit - credit : credit - debit, used: debit > 0 || credit > 0 }
  })
  const debitTotal = sum(rows, (r) => r.debit)
  const creditTotal = sum(rows, (r) => r.credit)
  return { rows, debitTotal, creditTotal, balanced: debitTotal === creditTotal }
}

// 区分（'asset' / 'liability' など）ごとの合計の行。rows は accountBalances の rows。その区分の全科目の借方合計・貸方合計・残高を足す
// （画面に出ない科目は0なので、画面に出ている行の合計と一致する）
export function typeTotals(rows, type) {
  const own = rows.filter((r) => r.account.type === type)
  return { debit: sum(own, (r) => r.debit), credit: sum(own, (r) => r.credit), balance: sum(own, (r) => r.balance) }
}

// 資産の積み上げ棒（群青の PC の残高。spec-design.md 8.2）。rows は accountBalances の rows。画面に出る資産の科目（使っている、または使った）だけを見る
// items：残高が 0 より大きい科目（棒に出す。share は合計に対する割合で、小数第 1 位まで四捨五入。足して 100.0 にならなくてもよい）
// negatives：残高がマイナスの科目（棒に出さず、凡例にだけ出す）。残高 0 の科目はどちらにも入れない（表にだけ出る）
// 棒に出す科目の合計（total）が 0 以下のときは、items を空にする（棒を出さない。月次の割合と同じ決まり）
export function assetShares(rows) {
  const own = rows.filter((r) => r.account.type === 'asset' && (r.account.active || r.used))
  const total = sum(own.filter((r) => r.balance > 0), (r) => r.balance)
  const pick = (r) => ({ id: r.account.id, name: r.account.name, balance: r.balance })
  const items = total > 0 ? own.filter((r) => r.balance > 0).map((r) => ({ ...pick(r), share: Math.round((r.balance / total) * 1000) / 10 })) : []
  return { total, items, negatives: own.filter((r) => r.balance < 0).map(pick) }
}

// 月次（群青の PC）の費用の内訳：monthReport の expense（多い順）のうち、金額が 0 より大きい科目だけを見る。
// 上位 5 科目と、残り全部を足した「その他」（other: true。6 科目以上のときだけ）。share は、見る科目の合計に対する割合（小数第 1 位）。bar は、一番大きい行を 100 とした棒の長さ（%）
// 合計が 0 以下（費用なし・返品だけなど）のときは items を空にする
export function expenseBreakdown(expense, top = 5) {
  const own = expense.filter((r) => r.amount > 0)
  const total = sum(own, (r) => r.amount)
  if (total <= 0) return { total: 0, items: [] }
  const rows = own.slice(0, top).map((r) => ({ id: r.account.id, name: r.account.name, amount: r.amount }))
  if (own.length > top) rows.push({ id: 'other', name: null, amount: sum(own.slice(top), (r) => r.amount), other: true })
  const max = Math.max(...rows.map((r) => r.amount))
  return { total, items: rows.map((r) => ({ ...r, share: Math.round((r.amount / total) * 1000) / 10, bar: Math.round((r.amount / max) * 1000) / 10 })) }
}

// 資産 − 負債（残高の画面の札。typeTotals の資産の残高合計 − 負債の残高合計。貸借対照表の純資産ではない）
export const assetLiabilityGap = (rows) => typeTotals(rows, 'asset').balance - typeTotals(rows, 'liability').balance

// 利率（%）の入力：半角数字と小数点（小数は 2 桁まで）、0〜100。成功: { rate }（1/100 %）
export function parseRate(text) {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(text).trim())
  if (!m) return { error: t('error.rateInvalid') }
  const rate = Number(m[1]) * 100 + Number(((m[2] ?? '') + '00').slice(0, 2))
  return rate > 10000 ? { error: t('error.rateInvalid') } : { rate }
}

export const formatRate = (rate) => String(rate / 100)

// ---- 借りているお金（loans。v12）の計算 ----

// その月の利率と返済額。rateHistory のうち from が月以前で一番新しい行。なければ loan 自身の rate・payment（はじめの値）
export function loanTermAt(loan, month) {
  const hit = loan.rateHistory.filter((x) => x.from <= month).sort((a, b) => (a.from < b.from ? 1 : -1))[0]
  return hit ?? loan
}

const LOAN_MONTH_LIMIT = 600 // 50 年。これを超えても終わらないものは「終わりの月なし」

// 返す予定（今の利率での見込み。銀行の計算規則は真似しない）。balance は今の残り、fromMonth は最初に返す月（'YYYY-MM'）。
// 毎月：利息 ＝ 残り × 年利 ÷ 12（円未満は切り捨て。rate は 1/100 %）、元金 ＝ 返済額 − 利息。最後の月は、残り＋利息だけ返す。
// 返す形：{ rows: [{ month, payment, interest, principal, balance（返したあとの残り） }], endMonth（最後に返す月）, endless }
// 終わらない（endless: true・endMonth は null）：返済額が利息以下（0 を含む）で残りが減らない月が来たとき、または 600 か月を超えたとき。rows はそこまで。
// 残りがすでに 0 以下：rows は空、endMonth は null、endless は false
export function loanSchedule(loan, balance, fromMonth) {
  const rows = []
  let left = balance
  let month = fromMonth
  if (!(left > 0)) return { rows, endMonth: null, endless: false }
  while (rows.length < LOAN_MONTH_LIMIT) {
    const term = loanTermAt(loan, month)
    const interest = Math.floor((left * term.rate) / 120000)
    if (term.payment <= interest) return { rows, endMonth: null, endless: true }
    const payment = Math.min(term.payment, left + interest)
    left -= payment - interest
    rows.push({ month, payment, interest, principal: payment - interest, balance: left })
    if (left <= 0) return { rows, endMonth: month, endless: false }
    month = nextMonth(month)
  }
  return { rows, endMonth: null, endless: true }
}

// その月に返す額（自由に使える額から引く額）。月初から引く。引かない（0）のは次のとき：残りが 0 以下、奨学金で返し始める月より前、その月にこの借入の科目への返済の仕訳（借方）がすでにある（返した分は残高と現金に出ているので、二重に引かない）
// 残りが少ないときは、残り＋その月の利息まで。entries は全仕訳、balance はこの借入の科目の今の残り
export function loanDue(loan, balance, entries, month) {
  if (!(balance > 0)) return 0
  if (loan.repayFrom !== undefined && month < loan.repayFrom) return 0
  if (entries.some((e) => e.debitId === loan.accountId && e.date.slice(0, 7) === month)) return 0
  const term = loanTermAt(loan, month)
  return Math.min(term.payment, balance + Math.floor((balance * term.rate) / 120000))
}

// 自由に使える額 ＝ role が cash の資産の残高合計 − 負債の残高合計（取り分け・その他の資産は含めない。使わない科目も含める）
// loans（省略可）があるときは、借入の科目の残高全体は負債の合計から外し、代わりに month の返済額（loanDue）だけを引く。loans が空（省略）なら、今までと同じ値
// later（省略可。cardLaterTotal）：クレカの分割・リボの「先の分」。いまの請求期間より先に払う分なので、負債から引かない（0 か省略なら、今までと同じ値）
// items：画面に並べる内訳（現金類のうち残高が0でないもの。負債があるときは「負債」を負の値で、借入の返済があるときは最後に「借入の返済」を負の値で足す）
export function freeAmount(accounts, entries, loans = [], month = '', later = 0) {
  const { rows } = accountBalances(accounts, entries)
  const cash = rows.filter((r) => r.account.type === 'asset' && r.account.role === 'cash')
  const cashTotal = sum(cash, (r) => r.balance)
  const loanIds = new Set(loans.map((l) => l.accountId))
  const liabilityTotal = sum(rows.filter((r) => r.account.type === 'liability' && !loanIds.has(r.account.id)), (r) => r.balance)
  const due = sum(loans, (l) => loanDue(l, rows.find((r) => r.account.id === l.accountId)?.balance ?? 0, entries, month))
  const items = cash.filter((r) => r.balance !== 0).map((r) => ({ id: r.account.id, name: r.account.name, balance: r.balance }))
  if (liabilityTotal - later !== 0) items.push({ id: 'liability', name: TYPE_LABELS.liability, balance: -(liabilityTotal - later) })
  if (due !== 0) items.push({ id: 'loans', name: t('loans.dueItem'), balance: -due })
  return { total: cashTotal - (liabilityTotal - later) - due, cashTotal, liabilityTotal, later, loanDue: due, items }
}


// ---- クレカ（role が card の負債。カードごとに締め日・引き落とし日を持つ）----
// today・month は呼ぶ側から渡す。日付は subscriptionDate で作る（その月にない日は月末日）。使わない設定のカードも含める

export const isCard = (account) => account.type === 'liability' && account.role === 'card'
export const cardAccounts = (accounts) => accounts.filter(isCard)

// 最後の締め日：今日より前の一番近い締め日。その月の締め日が今日より前ならそれ、そうでなければ前月の締め日（締め日当日は前月のほう）
export function lastClosingDate(closingDay, today) {
  const closing = subscriptionDate(today.slice(0, 7), closingDay)
  return closing < today ? closing : subscriptionDate(previousMonth(today), closingDay)
}

// 引き落とし予定日（目安）：締め日の翌月の引き落とし日。祝日は見ない
export const payDateOf = (closingDate, payDay) => subscriptionDate(nextMonth(closingDate.slice(0, 7)), payDay)

// その日付が入る請求期間の締め日（締め日当日の利用は、その締め日の請求）
export function closingDateOfEntry(date, closingDay) {
  const closing = subscriptionDate(date.slice(0, 7), closingDay)
  return date <= closing ? closing : subscriptionDate(nextMonth(date.slice(0, 7)), closingDay)
}

// 確定分の調整の目印：残高調整（kind が adjustment）で、メモがこの字のもの（クレカ残高調整ページが付ける。調整の仕訳は編集できないので変わらない）。
// 辞書は読まず、字を固定する（辞書の言い回しが後で変わっても、保存済みのメモと食い違わないため）。字を足すときは、古い字を残す
export const CLOSED_FIX_MEMOS = ['確定分', '확정분']
export const isClosedFix = (e) => e.kind === 'adjustment' && CLOSED_FIX_MEMOS.includes(e.memo)

// ---- 分割払い・リボ（v13。仕訳の pay とクレカの revolving）。仕訳は総額で 1 件のまま、「いつ払うか」を請求の行に分ける ----
// 請求の行：{ closingDate（その行が入る請求期間の締め日）, amount, entryId（リボの山の行は null） }
// 分割 n 回：仕訳が入る請求期間から、毎月 1 行ずつ n 行。金額は総額 ÷ n の切り捨てで、端数は最初の回に足す
export function installmentLines(entry, closingDay) {
  const { count } = entry.pay
  const each = Math.floor(entry.amount / count)
  const first = closingDateOfEntry(entry.date, closingDay)
  let month = first.slice(0, 7)
  return Array.from({ length: count }, (_, i) => {
    const line = { closingDate: i === 0 ? first : subscriptionDate(month, closingDay), amount: i === 0 ? entry.amount - each * (count - 1) : each, entryId: entry.id }
    month = nextMonth(month)
    return line
  })
}

// リボ：カードごとの 1 つの山。リボの仕訳が最初に入る請求期間から、毎月「山に今期の仕訳を足し、min(毎月の支払い額, 山) を払う」を、山が 0 になるまで。
// ponytail: 600 か月で打ち切る（毎月の額が小さすぎて終わらないときは、その先の分は数えない）
export function revolvingLines(entries, closingDay, monthly) {
  const byClosing = new Map()
  for (const e of entries) {
    const closing = closingDateOfEntry(e.date, closingDay)
    byClosing.set(closing, (byClosing.get(closing) ?? 0) + e.amount)
  }
  if (byClosing.size === 0) return []
  const lastEntry = [...byClosing.keys()].sort().at(-1)
  const lines = []
  let closing = [...byClosing.keys()].sort()[0]
  let pool = 0
  for (let i = 0; i < 600; i++) {
    pool += byClosing.get(closing) ?? 0
    const pay = Math.min(monthly, pool)
    if (pay > 0) lines.push({ closingDate: closing, amount: pay, entryId: null })
    pool -= pay
    if (pool === 0 && closing >= lastEntry) break
    closing = subscriptionDate(nextMonth(closing.slice(0, 7)), closingDay)
  }
  return lines
}

// 手数料の見込み（仕訳にも自由に使える額にも入れない）。payments は元金の支払いの並び（毎月）、rate は年率の 1/100 %。
// 毎月の手数料 ＝ 支払い前の残り × 年率 ÷ 12（円未満は切り捨て。借入の利息と同じ考え）。返す形：{ total, months: [毎月の手数料] }
export function feeEstimate(payments, rate) {
  let left = payments.reduce((n, x) => n + x, 0)
  const months = payments.map((pay) => {
    const fee = Math.floor((left * rate) / 120000)
    left -= pay
    return fee
  })
  return { total: months.reduce((n, x) => n + x, 0), months }
}

// そのカードで、分割・リボの印がある仕訳が請求の行に分かれたもの（締め日の古い順）。リボの仕訳は、カードに revolving があるときだけ山にする（なければ一括として、ここには出ない）
const isPayEntry = (e, card) => e.kind === 'normal' && e.creditId === card.id && e.pay !== undefined && (e.pay.mode === 'installment' || (e.pay.mode === 'revolving' && card.revolving !== undefined))
export function payLines(card, entries) {
  const own = entries.filter((e) => isPayEntry(e, card))
  const lines = [
    ...own.filter((e) => e.pay.mode === 'installment').flatMap((e) => installmentLines(e, card.closingDay)),
    ...revolvingLines(own.filter((e) => e.pay.mode === 'revolving'), card.closingDay, card.revolving?.monthly ?? 0),
  ]
  return lines.sort((x, y) => x.closingDate.localeCompare(y.closingDate))
}

// payLines を、分割とリボに分けたもの（見やすさの棒グラフ用。並びは締め日順にしない）
export function payLinesByMode(card, entries) {
  const own = entries.filter((e) => isPayEntry(e, card))
  return {
    installment: own.filter((e) => e.pay.mode === 'installment').flatMap((e) => installmentLines(e, card.closingDay)),
    revolving: revolvingLines(own.filter((e) => e.pay.mode === 'revolving'), card.closingDay, card.revolving?.monthly ?? 0),
  }
}

// 分割の買い物の名前。メモがあればメモ、空なら「科目・買った日」（例：家具・9/15）。fallback は、代わりの名前を使ったとき true
export function payItemName(entry, accounts) {
  if (entry.memo.trim() !== '') return { name: entry.memo, fallback: false }
  const account = accounts.find((a) => a.id === entry.debitId)?.name ?? ''
  return { name: t('plan.nameFallback', { account, month: Number(entry.date.slice(5, 7)), day: Number(entry.date.slice(8, 10)) }), fallback: true }
}

// カード1枚の計算。card でない科目・存在しない id は null
// 数える仕訳（符号つき）：貸方＝カード（opening は除く。adjustment は含む）は ＋、借方＝カードの adjustment は −。借方＝カードの normal（返済・返品）は数えない
// unbilled（未請求の利用額）＝最後の締め日より後の合計。確定分の調整（isClosedFix）は、日付に関係なく最後の締め日の期に入り、unbilled には入らない。
// 分割・リボの仕訳（isPayEntry）は、請求の行に分けて数える：最後の締め日の後〜いまの請求期間の締め日（nextClosing）までの行は unbilled と periods に、
// それより先の行は later（先の分。periods には入れず、laterLines に締め日の古い順に持つ）に入る。
// next（次の引き落とし分）＝残高 − unbilled − later（分割・リボがなければ later は 0 で、今までと同じ）
// periods：請求期間ごとの利用額 [{ closingDate, amount }]（締め日の新しい順。合計が 0 でない期間だけ）
export function cardReport(accounts, entries, accountId, today) {
  const account = accounts.find((a) => a.id === accountId)
  if (!account || !isCard(account)) return null
  const { closingDay, payDay } = account
  const balance = accountBalances(accounts, entries).rows.find((r) => r.account.id === accountId).balance
  const lastClosing = lastClosingDate(closingDay, today)
  const nextClosing = subscriptionDate(nextMonth(lastClosing.slice(0, 7)), closingDay) // いまの請求期間の締め日
  const byPeriod = {}
  let unbilled = 0
  for (const e of entries) {
    if (isPayEntry(e, account)) continue // 下で、請求の行に分けて数える
    const amount = e.creditId === accountId && e.kind !== 'opening' ? e.amount : e.debitId === accountId && e.kind === 'adjustment' ? -e.amount : 0
    if (amount === 0) continue
    const fix = isClosedFix(e)
    if (!fix && e.date > lastClosing) unbilled += amount
    const closing = fix ? lastClosing : closingDateOfEntry(e.date, closingDay)
    byPeriod[closing] = (byPeriod[closing] ?? 0) + amount
  }
  const laterLines = []
  for (const line of payLines(account, entries)) {
    if (line.closingDate > nextClosing) { laterLines.push(line); continue }
    if (line.closingDate > lastClosing) unbilled += line.amount
    byPeriod[line.closingDate] = (byPeriod[line.closingDate] ?? 0) + line.amount
  }
  const later = laterLines.reduce((n, l) => n + l.amount, 0)
  const periods = Object.entries(byPeriod).filter(([, amount]) => amount !== 0).map(([closingDate, amount]) => ({ closingDate, amount })).sort((a, b) => b.closingDate.localeCompare(a.closingDate))
  return { account, closingDay, payDay, balance, lastClosing, unbilled, later, laterLines, next: balance - unbilled - later, payDate: payDateOf(lastClosing, payDay), periods }
}

// カード 1 枚の「まだ払っていない分」（分割・リボ。card は cardReport の結果）。最後の締め日（lastClosing）より後の行が、残り。
// installments：分割の仕訳ごと { entry, count, rate, left（あと何回）, monthly（毎月の額）, remaining（残りの合計）, endClosing（最後の締め日）, fee（これからの手数料の見込み。年率がなければ null） }（終わりの近い順。もう残りがないものは出さない）
// revolving：カードにリボの設定があり、山に残りがあるとき { monthly, rate, left, remaining, endClosing, fee }。なければ null
export function cardPayPlans(card, entries) {
  const { account, lastClosing } = card
  const own = entries.filter((e) => isPayEntry(e, account))
  const installments = own
    .filter((e) => e.pay.mode === 'installment')
    .map((entry) => {
      const lines = installmentLines(entry, account.closingDay)
      const left = lines.filter((l) => l.closingDate > lastClosing)
      return {
        entry, count: entry.pay.count, rate: entry.pay.rate, left: left.length, monthly: lines.at(-1).amount, remaining: sum(left, (l) => l.amount), endClosing: lines.at(-1).closingDate,
        fee: entry.pay.rate === undefined ? null : feeEstimate(left.map((l) => l.amount), entry.pay.rate).total,
      }
    })
    .filter((p) => p.left > 0)
    .sort((a, b) => a.endClosing.localeCompare(b.endClosing) || a.entry.date.localeCompare(b.entry.date))
  let revolving = null
  if (account.revolving) {
    const lines = revolvingLines(own.filter((e) => e.pay.mode === 'revolving'), account.closingDay, account.revolving.monthly)
    const left = lines.filter((l) => l.closingDate > lastClosing)
    if (left.length > 0) {
      revolving = { monthly: account.revolving.monthly, rate: account.revolving.rate, left: left.length, remaining: sum(left, (l) => l.amount), endClosing: lines.at(-1).closingDate, fee: feeEstimate(left.map((l) => l.amount), account.revolving.rate).total }
    }
  }
  return { installments, revolving }
}

// 先の分（いまの請求期間の、次の請求期間から先に入る分割・リボ）が最初に引き落とされる日（'YYYY-MM-DD'）。report は cardReport の結果。画面では「12/28 以降に払う分割・リボ」と言う
export function laterFromDate(report) {
  const nextClosing = subscriptionDate(nextMonth(report.lastClosing.slice(0, 7)), report.closingDay) // いまの請求期間の締め日
  return payDateOf(subscriptionDate(nextMonth(nextClosing.slice(0, 7)), report.closingDay), report.payDay)
}

// 「次の引き落とし」の額と日（札・表。基本のテーマ）。締めた請求が残っているとき（report.next が 0 でない）は、その額と引き落とし日（report.payDate）。
// 0 のときは、次の引き落とし日（いまの請求期間の分）と未請求の利用額（report.unbilled）。recordPending：残っていて、引き落とし日がもう過ぎている（today を渡したとき）＝「引き落としの記録がまだです」
export function nextDebit(report, today = '') {
  if (report.next !== 0) return { amount: report.next, date: report.payDate, recordPending: report.payDate < today }
  const nextClosing = subscriptionDate(nextMonth(report.lastClosing.slice(0, 7)), report.closingDay) // いまの請求期間の締め日
  return { amount: report.unbilled, date: payDateOf(nextClosing, report.payDay), recordPending: false }
}

// 日付 'YYYY-MM-DD' を「12/28」の形に
export const monthDay = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

// 先の分の請求の予定：締め日ごとの合計 [{ closingDate, amount }]（締め日の古い順）。laterLines は cardReport の結果
export function laterPeriods(laterLines) {
  const byClosing = new Map()
  for (const l of laterLines) byClosing.set(l.closingDate, (byClosing.get(l.closingDate) ?? 0) + l.amount)
  return [...byClosing].map(([closingDate, amount]) => ({ closingDate, amount })).sort((a, b) => a.closingDate.localeCompare(b.closingDate))
}

// 一覧・元帳の小さい印：「分割 12」「リボ」
export const payMarkText = (pay) => (pay.mode === 'revolving' ? t('entries.payMarkRevolving') : t('entries.payMarkInstallment', { count: pay.count }))

// クレカのリボの設定（毎月の支払い額・年率）を変える。monthlyText と rateText が両方空なら、設定をやめる（revolving を消す。リボの仕訳は一括として数える）。
// 毎月の支払い額は 1 以上の整数、年率は 0〜100（rateText が空なら 0）。成功: { accounts } / 失敗: { error }。渡した accounts は変えない
export function changeCardRevolving(accounts, accountId, { monthlyText, rateText }, now = new Date().toISOString()) {
  const account = accounts.find((a) => a.id === accountId)
  if (!account || !isCard(account)) return { error: t('error.cardNotFound') }
  const monthly = String(monthlyText).trim()
  const rateRaw = String(rateText).trim()
  if (monthly === '' && rateRaw === '') return { accounts: accounts.map((a) => (a.id === accountId ? (({ revolving: _r, ...rest }) => ({ ...rest, updatedAt: now }))(a) : a)) }
  const m = parseAmount(monthly)
  if (m.error) return m
  const rate = rateRaw === '' ? { rate: 0 } : parseRate(rateRaw)
  if (rate.error) return rate
  return { accounts: accounts.map((a) => (a.id === accountId ? { ...a, revolving: { monthly: m.amount, rate: rate.rate }, updatedAt: now } : a)) }
}

// 全カードの「先の分」の合計（自由に使える額から引かない分）
export const cardLaterTotal = (accounts, entries, today) => cardReports(accounts, entries, today).reduce((n, r) => n + r.later, 0)

// 請求期間の表示用の整形。cardReport の periods に label（「10/15締め」。期間が年をまたぐときだけ「2025/12/15締め」）と
// open（最後の締め日より後＝まだ確定していない期間）を足す。lastClosing は cardReport の結果。順序と金額は変えない
const crossesYears = (periods) => new Set(periods.map((p) => p.closingDate.slice(0, 4))).size > 1 // 一覧の締め日の表示に年が付くか

export function labelPeriods(periods, lastClosing) {
  const crossYear = crossesYears(periods)
  return periods.map((p) => {
    const [y, m, d] = p.closingDate.split('-').map(Number)
    return { ...p, label: t('ledger.closingLabel', { date: `${crossYear ? `${y}/` : ''}${m}/${d}` }), open: p.closingDate > lastClosing }
  })
}

// 個別ページの請求期間の行。labelPeriods の各行に、引き落とし予定日 payDate（payDateOf）と payLabel（「12/10引き落とし」）を足す。
// 年は、一覧の締め日の表示に年が付くとき、または引き落とし日の年が締め日の年と違うときに付ける。payDay は cardReport の結果
export function periodRows(periods, lastClosing, payDay) {
  const crossYear = crossesYears(periods)
  return labelPeriods(periods, lastClosing).map((p) => {
    const payDate = payDateOf(p.closingDate, payDay)
    const [y, m, d] = payDate.split('-').map(Number)
    const withYear = crossYear || payDate.slice(0, 4) !== p.closingDate.slice(0, 4)
    return { ...p, payDate, payLabel: t('ledger.payLabel', { date: `${withYear ? `${y}/` : ''}${m}/${d}` }) }
  })
}

export const cardReports = (accounts, entries, today) => cardAccounts(accounts).map((a) => cardReport(accounts, entries, a.id, today))

// 全カード合計：暦月（1日〜末日）の利用額を、すべてのカードで足す（opening は除く。貸方＝カードの adjustment は含み、借方＝カードの adjustment は引く）。締め日には関係しない
// 確定分の調整（isClosedFix）は、その月の利用ではないので、増減どちらも数えない
export function cardMonthTotal(accounts, entries, month) {
  const ids = new Set(cardAccounts(accounts).map((a) => a.id))
  const used = (e) => (ids.has(e.creditId) && e.kind !== 'opening' ? e.amount : ids.has(e.debitId) && e.kind === 'adjustment' ? -e.amount : 0)
  return { month, amount: sum(entries.filter((e) => e.date.startsWith(month) && !isClosedFix(e)), used) }
}

// 締め日・引き落とし日の入力：半角の 1〜31 だけ（先頭0・小数・全角・空・文字はエラー）。label は「締め日」「引き落とし日」
export function parseDay(text, label) {
  if (typeof text !== 'string' || !/^([1-9]|[12]\d|3[01])$/.test(text)) return { error: t('error.dayRange', { label }) }
  return { day: Number(text) }
}

// カードの入力の検証。名前は科目と同じ決まり（validateAccountName）。成功: { name, closingDay, payDay } / 失敗: { error }
export function validateCardInput({ name, closingDayText, payDayText }, accounts) {
  const n = validateAccountName(typeof name === 'string' ? name : '', accounts)
  if (n.error) return n
  const closing = parseDay(closingDayText, t('card.closingDay'))
  if (closing.error) return closing
  const pay = parseDay(payDayText, t('card.payDay'))
  if (pay.error) return pay
  return { name: n.name, closingDay: closing.day, payDay: pay.day }
}

// カードを追加する（key なし。仕訳は作らないので残高0から）。成功: { accounts, account } / 失敗: { error }。元の配列は変えない
export function addCard(accounts, rawInput, now = new Date().toISOString()) {
  const r = validateCardInput(rawInput, accounts)
  if (r.error) return r
  const account = newAccount(r.name, 'liability', 'card', now, undefined, { closingDay: r.closingDay, payDay: r.payDay })
  return { accounts: [...accounts, account], account }
}

// 締め日・引き落とし日を変える（role が card の科目だけ）。両方の検証が通ったときだけ、updatedAt も更新した新しい配列を返す。仕訳には触れない
export function changeCardDays(accounts, accountId, { closingDayText, payDayText }, now = new Date().toISOString()) {
  const account = accounts.find((a) => a.id === accountId)
  if (!account || !isCard(account)) return { error: t('error.cardNotFound') }
  const closing = parseDay(closingDayText, t('card.closingDay'))
  if (closing.error) return closing
  const pay = parseDay(payDayText, t('card.payDay'))
  if (pay.error) return pay
  return { accounts: accounts.map((a) => (a.id === accountId ? { ...a, closingDay: closing.day, payDay: pay.day, updatedAt: now } : a)) }
}

// 取り分け（role が earmark の資産）ごとの履歴。借方＝取り分けた（+）、貸方＝取り崩した（−）。日付順、累計つき
// 出す科目：active の科目と、仕訳がある科目
export function savingsHistory(accounts, entries) {
  const sorted = [...entries].sort(byDateThenCreated)
  return accounts
    .filter((a) => a.type === 'asset' && a.role === 'earmark')
    .map((account) => {
      let total = 0
      const rows = []
      for (const entry of sorted) {
        const delta = entry.debitId === account.id ? entry.amount : entry.creditId === account.id ? -entry.amount : 0
        if (!delta) continue
        total += delta
        rows.push({ entry, delta, total })
      }
      return { account, balance: total, rows }
    })
    .filter((h) => h.account.active || h.rows.length)
}

// ---- 月次（月の集計・P/L・B/S） ----

// 初期表示の月：今日の前月（'YYYY-MM-DD' → 'YYYY-MM'）。今日は呼ぶ側から渡す
export function previousMonth(today) {
  let year = Number(today.slice(0, 4))
  let month = Number(today.slice(5, 7)) - 1
  if (month === 0) { year -= 1; month = 12 }
  return `${year}-${String(month).padStart(2, '0')}`
}

// 月の集計とP/L。month は 'YYYY-MM'。開始残高（opening）は数えない。
// 残高調整（key: adjust-gain / adjust-loss の科目）は、通常の収益・費用に入れず、adjustment に別に出す。
// revenue / expense は、その月に仕訳がある科目だけ（expense は多い順、同じ額は科目の並び順）
export function monthReport(accounts, entries, month) {
  const { rows } = accountBalances(accounts, entries.filter((e) => e.kind !== 'opening' && e.date.startsWith(month)))
  const pick = (type, adjustKey) => rows.filter((r) => r.account.type === type && r.account.key !== adjustKey && r.used).map((r) => ({ account: r.account, amount: r.balance }))
  const revenue = pick('revenue', 'adjust-gain')
  const expense = pick('expense', 'adjust-loss').sort((a, b) => b.amount - a.amount) // sort は安定。同額は元の並び順
  const adjusted = (key) => rows.find((r) => r.account.key === key)?.balance ?? 0
  const gain = adjusted('adjust-gain')
  const loss = adjusted('adjust-loss')
  const revenueTotal = sum(revenue, (r) => r.amount)
  const expenseTotal = sum(expense, (r) => r.amount)
  return { month, revenue, expense, revenueTotal, expenseTotal, result: revenueTotal - expenseTotal, adjustment: { gain, loss, net: gain - loss } }
}

// ---- 1日あたりと、日ごとの費用（spec-ledger.md 5.17。作業34）----
// 今日（'YYYY-MM-DD'）は呼ぶ側から渡す。どれも純関数（元のデータは変えない）

// 今月の残りの日数（今日を含める）。月末の日は 1
export const daysLeftInMonth = (today) => daysInMonth(today.slice(0, 7)) - Number(today.slice(8, 10)) + 1

// 1日あたり：自由に使える額 ÷ 今月の残りの日数。端数は 0 に向かって切り捨て。マイナスはマイナスのまま（-0 は 0 にする）
export const perDayAmount = (amount, today) => Math.trunc(amount / daysLeftInMonth(today)) + 0

// 日ごとの費用（月の道・仕訳の日の見出しの「計」）。month は 'YYYY-MM'。
// amount：その日の、通常の仕訳（kind が normal）のうち、費用の科目が借方の金額 − 貸方の金額（調整損は費用に入れない。クレカも仕訳の日付の日）。マイナスの日はマイナスのまま
// bar：棒の長さの元になる値（マイナスの日は 0）。count：その日の通常の仕訳の数（開始残高・残高調整は数えない）
// state：spend＝費用のある日／flat＝仕訳はあるが費用がない日（移動だけの日・返品などでマイナスの日）／
//        blank＝入力していない過去の日／open＝まだ入力していない今日／future＝入力のない、これからの日
// total：日ごとの amount の合計。monthReport の費用合計と一致する（調整の仕訳が調整益・調整損だけを使うため）
export function dailyExpenses(accounts, entries, month, today) {
  const expenseIds = new Set(accounts.filter((a) => a.type === 'expense' && a.key !== 'adjust-loss').map((a) => a.id))
  const days = Array.from({ length: daysInMonth(month) }, (_, i) => ({ day: i + 1, date: `${month}-${String(i + 1).padStart(2, '0')}`, amount: 0, count: 0 }))
  for (const e of entries) {
    const d = e.kind === 'normal' && e.date.startsWith(month) ? days[Number(e.date.slice(8, 10)) - 1] : undefined
    if (!d) continue
    d.count += 1
    d.amount += (expenseIds.has(e.debitId) ? e.amount : 0) - (expenseIds.has(e.creditId) ? e.amount : 0)
  }
  const list = days.map((d) => ({
    ...d,
    bar: Math.max(0, d.amount),
    state: d.count > 0 ? (d.amount > 0 ? 'spend' : 'flat') : d.date > today ? 'future' : d.date === today ? 'open' : 'blank',
    isToday: d.date === today,
    isFuture: d.date > today,
  }))
  return { month, days: list, total: list.reduce((s, d) => s + d.amount, 0) }
}

// ---- 月の道の「光」と「固定費の線」（docs/formulas.md 11.5。区切り10の修正（6））----
// 月の道の基準の下限（床）。通貨ごと。足すときは CURRENCIES と同じ所に足す
export const ROAD_FLOOR = { JPY: 2000, KRW: 20000 }
export const roadFloor = (currency) => ROAD_FLOOR[isCurrency(currency) ? currency : 'JPY']

// 日ごとの費用を、固定費と変動費に分ける。判定は費用の科目の fixed だけ（前月との比較・日付の近さは見ない）。
// dailyExpenses の日ごとの値に fixedAmount（fixed が true の費用の科目の、借方 − 貸方）と variableAmount（amount − fixedAmount）を足す。
// fixedAmount + variableAmount = amount（月の合計も dailyExpenses の total と同じ）。dailyExpenses の返す値は変えない
// noSpendDays（「使っていない日」の印。仕訳とは別）を渡すと、日ごとに noSpend（印があり、その日に通常の仕訳がない）を足す。数え方（amount・fixedAmount・variableAmount・total）には入らない
export function roadDays(accounts, entries, month, today, noSpendDays = []) {
  const road = dailyExpenses(accounts, entries, month, today)
  const fixedIds = new Set(accounts.filter((a) => hasFixed(a) && a.fixed === true).map((a) => a.id))
  const fixedByDay = road.days.map(() => 0)
  for (const e of entries) {
    if (e.kind !== 'normal' || !e.date.startsWith(month)) continue
    fixedByDay[Number(e.date.slice(8, 10)) - 1] += (fixedIds.has(e.debitId) ? e.amount : 0) - (fixedIds.has(e.creditId) ? e.amount : 0)
  }
  return { ...road, days: road.days.map((d, i) => ({ ...d, fixedAmount: fixedByDay[i], variableAmount: d.amount - fixedByDay[i], noSpend: isNoSpendShown(noSpendDays, entries, d.date) })) }
}

// 光の長さの基準：max(変動費の中央値 × 3, 床)。中央値は、変動費が 0 より大きい日だけで取る（偶数個なら真ん中 2 つの平均）。
// そういう日がない月は中央値 0（基準は床）。光の高さの割合は min(その日の変動費 ÷ base, 1)。days は roadDays の days、floor は roadFloor(通貨)
// field に 'fixedAmount' を渡すと、固定費用の基準（固定費が 0 より大きい日の中央値の 3 倍と床）になる。変動費の基準とは別に作る（家賃が変動費の基準を引きずらない）
export function roadScale(days, floor, field = 'variableAmount') {
  const v = days.map((d) => d[field]).filter((x) => x > 0).sort((a, b) => a - b)
  const mid = v.length >> 1
  const median = v.length === 0 ? 0 : v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
  return { median, base: Math.max(median * 3, floor) }
}

// 光・柱の高さの割合：金額 ÷ 基準（roadScale の base）。0〜1（頭打ち。マイナスは 0）
export const roadRatio = (amount, base) => Math.min(Math.max(amount, 0) / base, 1)

// 費用の内訳の割合（月次）：金額 ÷ 費用の合計。小数第1位まで四捨五入（足して 100.0% にならなくてよい）。合計が 0 以下のときは null
export const expenseShares = (report) =>
  report.expense.map((r) => ({ account: r.account, amount: r.amount, percent: report.expenseTotal > 0 ? Math.round((r.amount / report.expenseTotal) * 1000) / 10 : null }))

// B/S：その月の最終日までの全仕訳で計算する。assets / liabilities / equity は、その時点までに仕訳がある科目
// 純資産 ＝ 純資産の科目の残高合計（開始残高など）＋ 累計の収支（全ての収益 − 全ての費用。調整益・調整損も含む）
// balanced：資産合計 ＝ 負債合計 ＋ 純資産合計（合わないとき、画面にエラーを出す）
export function balanceSheet(accounts, entries, month) {
  const { rows } = accountBalances(accounts, entries.filter((e) => e.date.slice(0, 7) <= month))
  const part = (type) => rows.filter((r) => r.account.type === type && r.used).map((r) => ({ account: r.account, balance: r.balance }))
  const total = (type) => sum(rows.filter((r) => r.account.type === type), (r) => r.balance)
  const assets = part('asset')
  const liabilities = part('liability')
  const equity = part('equity')
  const profit = total('revenue') - total('expense')
  const assetTotal = total('asset')
  const liabilityTotal = total('liability')
  const equityTotal = total('equity') + profit
  const liabilityEquityTotal = liabilityTotal + equityTotal
  return { month, assets, assetTotal, liabilities, liabilityTotal, equity, profit, equityTotal, liabilityEquityTotal, balanced: assetTotal === liabilityEquityTotal }
}

// 返し始めの前の奨学金か（kind が scholarship で repayFrom があり、月がそれより前）。返し始めの月からは普通の借入。repayFrom のない奨学金も普通の借入（loanDue と同じ向き）
export const isScholarshipBefore = (loan, month) => loan.kind === 'scholarship' && loan.repayFrom !== undefined && month < loan.repayFrom

// 月末の資産・負債と、その月の収支。記録のない月より前は出さない。
// loans（省略可）：返す前の奨学金を分けた値（netExScholarship・scholarshipBefore・scholarshipFrom・scholarships）と、純資産の内訳（cashTotal・savingTotal・otherAssetTotal・borrowTotal。借入は返す前の奨学金を除く負債）を足す
export function balanceTrend(accounts, entries, endMonth, today, count = 12, loans = []) {
  if (!entries.length || !endMonth || !today || count <= 0) return []
  const first = entries.reduce((m, e) => e.date.slice(0, 7) < m ? e.date.slice(0, 7) : m, entries[0].date.slice(0, 7))
  let month = endMonth < today.slice(0, 7) ? endMonth : today.slice(0, 7)
  const result = []
  while (month >= first && result.length < count) {
    const sheet = balanceSheet(accounts, entries, month)
    const rows = accountBalances(accounts, entries.filter((e) => e.date.slice(0, 7) <= month)).rows
    const assetOf = (role) => sum(rows.filter((r) => r.account.type === 'asset' && (role === 'other' ? r.account.role !== 'cash' && r.account.role !== 'earmark' : r.account.role === role)), (r) => r.balance)
    const earmarkTotal = assetOf('earmark')
    const scholarships = loans.filter((l) => isScholarshipBefore(l, month)).map((l) => ({ id: l.id, balance: rows.find((r) => r.account.id === l.accountId)?.balance ?? 0, repayFrom: l.repayFrom }))
    const scholarshipBefore = sum(scholarships, (x) => x.balance)
    const netTotal = sheet.assetTotal - sheet.liabilityTotal
    result.push({
      month, assetTotal: sheet.assetTotal, liabilityTotal: sheet.liabilityTotal, netTotal, earmarkTotal, result: monthReport(accounts, entries, month).result,
      cashTotal: assetOf('cash'), savingTotal: earmarkTotal, otherAssetTotal: assetOf('other'), borrowTotal: sheet.liabilityTotal - scholarshipBefore,
      scholarshipBefore, scholarshipFrom: scholarships.length ? scholarships.map((x) => x.repayFrom).sort()[0] : null, scholarships, netExScholarship: netTotal + scholarshipBefore,
    })
    month = previousMonth(month)
  }
  return result
}

// 先月からの純資産（奨学金を除く）の増減と、その理由。cur・prev は balanceTrend の行。
// 理由：収支（その月の収支）／奨学金の受け取り（返す前の奨学金の残りの増減）／奨学金の返し始め（先月は返す前だった分が、今月から借入になる）／そのほか（開始残高の追加など。差から引いた残り）。0 の理由は出さない。足すと必ず差に合う
export function netChangeReasons(cur, prev) {
  const change = cur.netExScholarship - prev.netExScholarship
  const was = new Map(prev.scholarships.map((x) => [x.id, x.balance]))
  const now = new Map(cur.scholarships.map((x) => [x.id, x.balance]))
  const receive = sum(cur.scholarships, (x) => x.balance - (was.get(x.id) ?? 0))
  const start = -sum(prev.scholarships.filter((x) => !now.has(x.id)), (x) => x.balance)
  const reasons = [{ id: 'result', amount: cur.result }, { id: 'receive', amount: receive }, { id: 'start', amount: start }]
  reasons.push({ id: 'other', amount: change - sum(reasons, (r) => r.amount) })
  return { change, reasons: reasons.filter((r) => r.amount !== 0) }
}

// B/S の勘定式の並び（左：資産の部、右：負債の部と純資産の部）。結果は balanceSheet のものを並べるだけ。
// セルは { kind: 'head' | 'item' | 'subtotal', name, amount }（head の amount は null）。下の合計は leftTotal（資産合計）と rightTotal（負債・純資産合計）
export function balanceSheetColumns(sheet) {
  const head = (name) => ({ kind: 'head', name, amount: null })
  const item = (name, amount) => ({ kind: 'item', name, amount })
  const subtotal = (name, amount) => ({ kind: 'subtotal', name, amount })
  const items = (list) => list.map((r) => item(r.account.name, r.balance))
  return {
    left: [head(t('sheet.assetsPart')), ...items(sheet.assets)],
    right: [
      head(t('sheet.liabilitiesPart')), ...items(sheet.liabilities), subtotal(t('sheet.liabilityTotal'), sheet.liabilityTotal),
      head(t('sheet.equityPart')), ...items(sheet.equity), item(t('sheet.profit'), sheet.profit), subtotal(t('sheet.equityTotal'), sheet.equityTotal),
    ],
    leftTotal: { name: t('sheet.assetTotal'), amount: sheet.assetTotal },
    rightTotal: { name: t('sheet.liabilityEquityTotal'), amount: sheet.liabilityEquityTotal },
  }
}

// P/L の報告書の形の並び（収益の部、費用の部、当期収支、その下に残高調整）。結果は monthReport のものを並べるだけ。
// 行は { kind: 'head' | 'item' | 'none' | 'subtotal' | 'total', name, amount }。残高調整は、調整益・調整損があるときだけ
export function profitLossRows(report) {
  const head = (name) => ({ kind: 'head', name, amount: null })
  const part = (title, list, totalName, total) => [
    head(title),
    ...(list.length ? list.map((r) => ({ kind: 'item', name: r.account.name, amount: r.amount })) : [{ kind: 'none', name: t('sheet.none'), amount: null }]),
    { kind: 'subtotal', name: totalName, amount: total },
  ]
  const { gain, loss, net } = report.adjustment
  return [
    ...part(t('sheet.revenuePart'), report.revenue, t('sheet.revenueTotal'), report.revenueTotal),
    ...part(t('sheet.expensePart'), report.expense, t('sheet.expenseTotal'), report.expenseTotal),
    { kind: 'total', name: t('sheet.result'), amount: report.result },
    ...(gain !== 0 || loss !== 0
      ? [head(t('sheet.adjustmentPart')), { kind: 'item', name: t('sheet.gain'), amount: gain }, { kind: 'item', name: t('sheet.loss'), amount: loss }, { kind: 'subtotal', name: t('sheet.net'), amount: net }]
      : []),
  ]
}

// 月次の印刷用表示の発行日（仕様 5.13）。today は 'YYYY-MM-DD'（呼ぶ側が渡す。new Date() は使わない）。月・日は先頭の0なし
export function issuedLabel(today) {
  const [year, month, day] = today.split('-').map(Number)
  return t('monthly.issued', { year, month, day })
}

// ---- 残高調整 ----

// 画面の選択肢：active の資産と負債（balance は今の記録上の残高）
export function adjustmentRows(accounts, entries) {
  const shown = new Set(openingAccounts(accounts).map((a) => a.id))
  return accountBalances(accounts, entries).rows.filter((r) => shown.has(r.account.id))
}

// 残高調整の計画（保存はしない）。差額 ＝ 実際の残高 − 記録上の残高。日付は today（呼ぶ側から渡す）
// 成功: { account, current, actual, diff, amount, kindLabel, entry, entries } / 差額0: { none: true, account, current } / 失敗: { error }
// 資産が実際より少ない：借方＝その科目・貸方＝調整益。多い：借方＝調整損・貸方＝その科目。負債は逆。調整益・調整損は key で探す
export function planAdjustment(accounts, entries, accountId, actualText, today, now = new Date().toISOString()) {
  if (!isDate(today)) return { error: t('error.dateWrong') }
  const row = adjustmentRows(accounts, entries).find((r) => r.account.id === accountId)
  if (!row) return { error: t('error.chooseAccount') }
  const gainId = accounts.find((a) => a.key === 'adjust-gain')?.id
  const lossId = accounts.find((a) => a.key === 'adjust-loss')?.id
  if (!gainId || !lossId) return { error: t('error.adjustAccountsMissing') }
  if (actualText === '') return { error: t('error.actualEmpty') } // 空欄を0とは読まない
  const parsed = parseOpeningAmount(actualText)
  if (parsed.error) return { error: parsed.error }
  const { account, balance: current } = row
  const actual = parsed.amount
  const diff = actual - current
  if (diff === 0) return { none: true, account, current }
  const gain = (account.type === 'asset') === (diff > 0) // 調整益：借方＝その科目。調整損：貸方＝その科目
  const entry = {
    id: crypto.randomUUID(), date: today,
    debitId: gain ? account.id : lossId, creditId: gain ? gainId : account.id,
    amount: Math.abs(diff), memo: '', kind: 'adjustment', createdAt: now, updatedAt: now,
  }
  return { account, current, actual, diff, amount: entry.amount, kindLabel: gain ? t('sheet.gain') : t('sheet.loss'), entry, entries: [...entries, entry] }
}

// クレカ残高調整の計画（保存はしない）。確定分（cardReport の next）と今期（unbilled）を、それぞれ実際の額に合わせる。日付は today
// closedText・openText：実際の額の入力（空は「変えない」）。currency：案内の金額の単位（settings.currency。省略は円）。差額 ＝ 実際 − 記録上。差額0の行は仕訳を作らない
// 成功: { account, rows: [{ target, current, actual, diff, gain, kindLabel, entry }], entries }（rows は仕訳を作る行だけ。確定分が先）/ 全部空か差額0: { none: true, account } / 失敗: { error, target? }
// 確定分の仕訳は、メモが closedMemo（isClosedFix の目印）。確定分を減らせるのは、最後の締め日の期の利用額まで
export function planCardAdjustment(accounts, entries, cardId, { closedText = '', openText = '', currency }, today, now = new Date().toISOString()) {
  if (!isDate(today)) return { error: t('error.dateWrong') }
  const report = cardReport(accounts, entries, cardId, today)
  if (!report) return { error: t('error.cardNotFound') }
  const gainId = accounts.find((a) => a.key === 'adjust-gain')?.id
  const lossId = accounts.find((a) => a.key === 'adjust-loss')?.id
  if (!gainId || !lossId) return { error: t('error.adjustAccountsMissing') }
  const closedLimit = report.periods.find((p) => p.closingDate === report.lastClosing)?.amount ?? 0
  const rows = []
  for (const [target, text, current, memo] of [['closed', closedText, report.next, t('cardAdjust.closedMemo')], ['open', openText, report.unbilled, '']]) {
    if (text === '') continue
    const parsed = parseOpeningAmount(text)
    if (parsed.error) return { error: parsed.error, target }
    const actual = parsed.amount
    const diff = actual - current
    if (diff === 0) continue
    if (target === 'closed' && -diff > closedLimit) {
      const [, m, d] = report.lastClosing.split('-').map(Number)
      return { error: t('cardAdjust.errClosedOver', { closing: `${m}/${d}`, amount: formatMoney(Math.max(0, closedLimit), currency) }), target }
    }
    const gain = diff < 0 // 負債：減る＝調整益（借方＝カード）、増える＝調整損（貸方＝カード）
    const entry = {
      id: crypto.randomUUID(), date: today,
      debitId: gain ? cardId : lossId, creditId: gain ? gainId : cardId,
      amount: Math.abs(diff), memo, kind: 'adjustment', createdAt: now, updatedAt: now,
    }
    rows.push({ target, current, actual, diff, gain, kindLabel: gain ? t('sheet.gain') : t('sheet.loss'), entry })
  }
  if (rows.length === 0) return { none: true, account: report.account }
  return { account: report.account, rows, entries: [...entries, ...rows.map((r) => r.entry)] }
}

// ---- 定期支払い（サブスク） ----
// 今日（'YYYY-MM-DD'）と now は呼ぶ側から渡す。月末日は表で求め、Date は使わない。

export function daysInMonth(month) {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  if (m === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

// その月にある日付。31日などその月にない日は、月末日として扱う
export const subscriptionDate = (month, day) => `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`

export function nextMonth(month) {
  const year = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`
}

// 登録した日・「使う」に戻した日の lastMonth（最後に記入した月）。
// 今月の指定日が今日以降なら前月（今月の分はこれから記入する）、過ぎていれば今月（さかのぼらない）
export const initialLastMonth = (day, today) => (subscriptionDate(today.slice(0, 7), day) >= today ? previousMonth(today) : today.slice(0, 7))

// 入力の検証。借方・貸方は、仕訳の入力と同じ選択肢（3つの特別科目を除く）。currentIds は編集中の定期支払いが今使っている科目
export function validateSubscriptionInput({ name, memo, amountText, dayText, debitId, creditId }, accounts, currentIds = []) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (!n) return { error: t('error.nameEmpty') }
  const a = parseAmount(amountText)
  if (a.error) return a
  if (!/^([1-9]|[12]\d|3[01])$/.test(dayText)) return { error: t('error.dayOfMonth') }
  const ids = new Set(entryAccountOptions(accounts, currentIds).map((x) => x.id))
  if (!ids.has(debitId) || !ids.has(creditId)) return { error: t('error.chooseDebitCredit') }
  if (debitId === creditId) return { error: t('error.sameDebitCredit') }
  return { name: n, memo: typeof memo === 'string' ? memo : '', amount: a.amount, day: Number(dayText), debitId, creditId }
}

export const newSubscription = (input, today, now = new Date().toISOString()) => ({
  id: crypto.randomUUID(),
  name: input.name,
  memo: input.memo,
  amount: input.amount,
  day: input.day,
  debitId: input.debitId,
  creditId: input.creditId,
  active: true,
  lastMonth: initialLastMonth(input.day, today),
  createdAt: now,
  updatedAt: now,
})

// id・createdAt・active・lastMonth は保つ（日を変えても、記入済みの月は二重にならない）
export const editSubscription = (sub, input, now = new Date().toISOString()) => ({
  ...sub,
  name: input.name,
  memo: input.memo,
  amount: input.amount,
  day: input.day,
  debitId: input.debitId,
  creditId: input.creditId,
  updatedAt: now,
})

// 使う・使わないの切り替え。「使う」に戻すときは、止めていた間の分をさかのぼらない（今日すでに記入した分も、もう一度出さない）
export function setSubscriptionActive(sub, active, today, now = new Date().toISOString()) {
  const base = initialLastMonth(sub.day, today)
  const lastMonth = active && !sub.active && base > sub.lastMonth ? base : sub.lastMonth
  return { ...sub, active, lastMonth, updatedAt: now }
}

// 自動記入：active の定期支払いについて、lastMonth の次の月から今月まで、指定日が今日以前の月の分を、その日付の通常の仕訳として足す。
// 記入した月まで lastMonth を進める（保存されるので、何回呼んでも、同じ月は二重にならない。仕訳を削除しても作り直さない）。
// 何も記入しないときは、渡した配列をそのまま返す。元の配列は変えない。
// 収益の科目を使う分は、記入するときの科目の決まりで living を付ける（accounts は今の科目）
export function applySubscriptions(subscriptions, entries, accounts, today, now = new Date().toISOString()) {
  const added = []
  const next = subscriptions.map((sub) => {
    if (!sub.active) return sub
    let lastMonth = sub.lastMonth
    for (let month = nextMonth(lastMonth); month <= today.slice(0, 7); month = nextMonth(month)) {
      const date = subscriptionDate(month, sub.day)
      if (date > today) break // 今月で、指定日がまだ来ていない
      const living = defaultLiving(accounts, sub.debitId, sub.creditId)
      added.push({ id: crypto.randomUUID(), date, debitId: sub.debitId, creditId: sub.creditId, amount: sub.amount, memo: sub.name, kind: 'normal', ...(living && { living }), createdAt: now, updatedAt: now })
      lastMonth = month
    }
    return lastMonth === sub.lastMonth ? sub : { ...sub, lastMonth, updatedAt: now }
  })
  if (added.length === 0) return { subscriptions, entries, added: 0 }
  return { subscriptions: next, entries: [...entries, ...added], added: added.length }
}

// ---- 元帳 ----

// 科目1つの元帳。month は 'YYYY-MM'（'' は全期間）。仕訳は日付の古い順（同じ日は作成日時順、同じなら id 順）。
// balance は、その行までの累計（向きは accountBalances と同じ：資産・費用は借方 − 貸方、それ以外は貸方 − 借方）。
// 月で絞り込んだときは、その月より前の仕訳だけの残高を carryOver（前月までの繰越）にして、そこから累計する。全期間のとき carryOver は null。
// total はその科目の仕訳の総数（全期間）。科目が見つからなければ null。元の配列は変えない
export function ledgerBook(accounts, entries, accountId, month = '') {
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return null
  const own = entries.filter((e) => e.debitId === accountId || e.creditId === accountId)
  const carryOver = month
    ? accountBalances(accounts, own.filter((e) => e.date.slice(0, 7) < month)).rows.find((r) => r.account.id === accountId).balance
    : null
  const debitSide = account.type === 'asset' || account.type === 'expense'
  let balance = carryOver ?? 0
  const rows = own
    .filter((e) => !month || e.date.slice(0, 7) === month)
    .sort(byDateThenCreated)
    .map((entry) => {
      const isDebit = entry.debitId === accountId
      balance += (isDebit === debitSide ? 1 : -1) * entry.amount
      return { entry, otherId: isDebit ? entry.creditId : entry.debitId, debit: isDebit ? entry.amount : null, credit: isDebit ? null : entry.amount, balance }
    })
  return { account, total: own.length, carryOver, rows, balance }
}

// 科目の月末残高と、残高を増やす・減らす取引の合計。
export function accountTrend(accounts, entries, accountId, endMonth, count = 12) {
  const account = accounts.find((a) => a.id === accountId)
  const own = entries.filter((e) => (e.debitId === accountId || e.creditId === accountId) && e.date.slice(0, 7) <= endMonth)
  if (!account || !endMonth || count <= 0 || own.length === 0) return []
  const first = own.reduce((m, e) => e.date.slice(0, 7) < m ? e.date.slice(0, 7) : m, own[0].date.slice(0, 7))
  const debitIncreases = account.type === 'asset' || account.type === 'expense'
  const result = []
  for (let month = endMonth; month >= first && result.length < count; month = previousMonth(month)) {
    const book = ledgerBook(accounts, own, accountId, month)
    let increase = 0
    let decrease = 0
    for (const row of book.rows) {
      if ((row.debit !== null) === debitIncreases) increase += row.entry.amount
      else decrease += row.entry.amount
    }
    result.push({ month, balance: book.balance, increase, decrease, amount: increase - decrease }) // amount：その月の金額（費用・収益の科目で見せる）
  }
  return result
}

// ---- お気に入りの科目（settings） ----
// 特別科目（key が opening / adjust-gain / adjust-loss）は、ENTRY_HIDDEN_KEYS で判定する（名前では探さない）。today は引数で受ける

export const FAVORITE_SIDES = ['debit', 'credit']
const SIDE_KEYS = { debit: 'common.debit', credit: 'common.credit' } // 借方・貸方の名前（辞書のキー）

export const emptySettings = () => ({ favorites: { debit: [], credit: [] }, favoriteLimits: { debit: null, credit: null } })

// 「よく使う」：今月・前月・前々月の通常の仕訳（kind が normal）だけを、借方・貸方別々に数え、回数の多い順（同じ回数は科目の並び順）に上位5件。
// 3つの特別科目と、使わない設定の科目、accounts にない科目は数えない。登録済みの印は、画面が settings と見比べて付ける
export function favoriteStats(entries, accounts, today) {
  const thisMonth = today.slice(0, 7)
  const months = [thisMonth, previousMonth(thisMonth), previousMonth(previousMonth(thisMonth))]
  const order = new Map(accounts.map((a, i) => [a.id, i]))
  const countable = new Map(accounts.filter((a) => a.active && !ENTRY_HIDDEN_KEYS.includes(a.key)).map((a) => [a.id, a]))
  const counts = { debit: new Map(), credit: new Map() }
  for (const e of entries) {
    if (e.kind !== 'normal' || !months.includes(e.date.slice(0, 7))) continue
    for (const [side, id] of [['debit', e.debitId], ['credit', e.creditId]]) {
      if (countable.has(id)) counts[side].set(id, (counts[side].get(id) ?? 0) + 1)
    }
  }
  const top = (map) =>
    [...map]
      .map(([id, count]) => ({ account: countable.get(id), count }))
      .sort((a, b) => b.count - a.count || order.get(a.account.id) - order.get(b.account.id))
      .slice(0, 5)
  return { debit: top(counts.debit), credit: top(counts.credit) }
}

const withFavorites = (settings, side, list) => ({ ...settings, favorites: { ...settings.favorites, [side]: list } })

// 登録：仕訳の入力の選択肢にある科目（active で、3つの特別科目を除く）だけ。同じ側の重複と、上限を超える登録はエラー。末尾に足す
export function addFavorite(settings, side, accountId, accounts) {
  if (!entryAccountOptions(accounts).some((a) => a.id === accountId)) return { error: t('error.favNotAllowed') }
  const list = settings.favorites[side]
  if (list.includes(accountId)) return { error: t('error.favExists') }
  const limit = settings.favoriteLimits[side]
  if (limit !== null && list.length >= limit) return { error: t('error.favLimitReached', { limit }) }
  return { settings: withFavorites(settings, side, [...list, accountId]) }
}

export const removeFavorite = (settings, side, accountId) => withFavorites(settings, side, settings.favorites[side].filter((id) => id !== accountId))

// delta は -1（上へ）か +1（下へ）。端や、登録のない科目は、何も変えない（同じ settings を返す）
export function moveFavorite(settings, side, accountId, delta) {
  const list = [...settings.favorites[side]]
  const i = list.indexOf(accountId)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return settings
  ;[list[i], list[j]] = [list[j], list[i]]
  return withFavorites(settings, side, list)
}

// 上限の入力：空＝上限なし（null）。1以上の半角数字。現在の登録数より小さい値はエラー（保存しない）
export function validateFavoriteLimit(text, currentCount) {
  if (text === '') return { limit: null }
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text))) return { error: t('error.favLimitInvalid') }
  const limit = Number(text)
  if (limit < currentCount) return { error: t('error.favLimitBelowCount', { count: currentCount }) }
  return { limit }
}

export const setFavoriteLimit = (settings, side, limit) => ({ ...settings, favoriteLimits: { ...settings.favoriteLimits, [side]: limit } })

// ---- 「使っていない日」（noSpendDays。v11。spec-ledger.md 5.18）----
// 仕訳とは別の、日付だけの印。残高・月次・元帳・件数には入らない（計算の関数は noSpendDays を受け取らない）。
export const NO_SPEND_BACK_DAYS = 7 // 押せるのは、今日と、過去この日数まで

// 日付（YYYY-MM-DD）を日数だけずらす（UTC で数える）
export function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// その日に、「使っていない」を付けられるか。{ ok: true } か { ok: false, reason }。
// reason：invalid（日付が正しくない）・future（未来）・old（過去 7 日より前）・hasEntries（その日に通常の仕訳がある）
export function canMarkNoSpend(entries, date, today) {
  if (!isDate(date)) return { ok: false, reason: 'invalid' }
  if (date > today) return { ok: false, reason: 'future' }
  if (date < shiftDate(today, -NO_SPEND_BACK_DAYS)) return { ok: false, reason: 'old' }
  if (entries.some((e) => e.kind === 'normal' && e.date === date)) return { ok: false, reason: 'hasEntries' }
  return { ok: true }
}

// 付ける・外す（昇順・重複なし。同じ配列は変えない）
export const markNoSpendDay = (days, date) => (days.includes(date) ? days : [...days, date].sort())
export const unmarkNoSpendDay = (days, date) => days.filter((d) => d !== date)

// 表示で、その日が「使っていない日」か。印があっても、その日に通常の仕訳があれば、仕訳を優先して false（印は消さない）
export const isNoSpendShown = (days, entries, date) => days.includes(date) && !entries.some((e) => e.kind === 'normal' && e.date === date)

// ---- 「使っていない日」の日の選択（スマホの「＋」メニューのポップアップ）----
// 今日と過去 NO_SPEND_BACK_DAYS 日を、新しい日が先頭で並べる。state：blocked（通常の仕訳がある。選べない）・recorded（記録済み。選ぶと取り消し）・free（未記録。選ぶと記録）
export function noSpendPickerDays(entries, noSpendDays, today) {
  return Array.from({ length: NO_SPEND_BACK_DAYS + 1 }, (_, i) => {
    const date = shiftDate(today, -i)
    return { date, state: !canMarkNoSpend(entries, date, today).ok ? 'blocked' : noSpendDays.includes(date) ? 'recorded' : 'free' }
  })
}
// 開いた時点の選択：今日が未記録なら今日だけ。今日に仕訳がある日は選べない。記録済みなら、押し間違いで取り消さないよう、選択なし
export const initialNoSpendPick = (days) => (days[0]?.state === 'free' ? [days[0].date] : [])
// 日を押す：選択のオン・オフ（複数可）。選べない日・一覧にない日は変えない
export function toggleNoSpendPick(days, selected, date) {
  const day = days.find((d) => d.date === date)
  if (!day || day.state === 'blocked') return selected
  return selected.includes(date) ? selected.filter((d) => d !== date) : [...selected, date]
}
// 「OK」で確定する結果：未記録の選択＝add（記録する日）、記録済みの選択＝remove（取り消す日）。どちらも昇順
export function resolveNoSpendPick(days, selected) {
  const of = (state) => days.filter((d) => d.state === state && selected.includes(d.date)).map((d) => d.date).sort()
  return { add: of('free'), remove: of('recorded') }
}
// OK を押せるか：{ ok: true, kind: 'add' | 'remove' | 'mixed' } か { ok: false, reason: 'todayHasEntries'（今日に仕訳があり、何も選んでいない）| 'none'（何も選んでいない） }
export function noSpendPickStatus(days, selected) {
  const { add, remove } = resolveNoSpendPick(days, selected)
  if (add.length === 0 && remove.length === 0) return { ok: false, reason: days[0]?.state === 'blocked' ? 'todayHasEntries' : 'none' }
  return { ok: true, kind: remove.length === 0 ? 'add' : add.length === 0 ? 'remove' : 'mixed' }
}
// 確定結果を、保存する日の一覧に反映する（昇順・重複なし）
export const applyNoSpendPick = (noSpendDays, { add, remove }) => remove.reduce(unmarkNoSpendDay, add.reduce(markNoSpendDay, noSpendDays))

// ---- 仕訳プリセット（entryPresets。v11。docs は spec-ledger.md 5.18）----
// 1 件：{ id, name, debitId, creditId, amount（null か 1 以上の整数）, memo, createdAt, updatedAt }。入力欄に、借方・貸方・金額・メモをまとめて入れる型

// 入力の検証。名前は空でもよい（空なら、ボタンの title・読み上げに、借方→貸方の要約を使う）。icon は、作る画面の選択肢（PRESET_ICON_PICKER）か、初めの記号。渡さなければ初めの記号。
// 借方・貸方は、仕訳の入力と同じ選択肢（3つの特別科目を除く）。currentIds は編集中のプリセットが今使っている科目。金額は空でもよい（null）
export function validateEntryPresetInput({ name, icon = PRESET_ICON_DEFAULT, debitId, creditId, amountText, memo }, accounts, currentIds = []) {
  const n = typeof name === 'string' ? name.trim() : ''
  if (n.length > ENTRY_PRESET_NAME_MAX) return { error: t('error.presetNameTooLong', { max: ENTRY_PRESET_NAME_MAX }) }
  const text = typeof amountText === 'string' ? amountText.trim() : ''
  let amount = null
  if (text !== '') {
    const a = parseAmount(text)
    if (a.error) return a
    amount = a.amount
  }
  const ids = new Set(entryAccountOptions(accounts, currentIds).map((x) => x.id))
  if (!ids.has(debitId) || !ids.has(creditId)) return { error: t('error.chooseDebitCredit') }
  if (debitId === creditId) return { error: t('error.sameDebitCredit') }
  if (!PRESET_ICON_PICKER.includes(icon) && icon !== PRESET_ICON_DEFAULT) return { error: t('error.presetIcon') }
  return { name: n, icon, debitId, creditId, amount, memo: typeof memo === 'string' ? memo : '' }
}

// 追加できるか（20 件まで）。{ ok: true } か { ok: false, error }
export const canAddEntryPreset = (list) => (list.length >= ENTRY_PRESET_MAX ? { ok: false, error: t('error.presetLimit', { max: ENTRY_PRESET_MAX }) } : { ok: true })

// ボタンの title・読み上げに使う文：名前があれば名前、なければ「借方→貸方」（金額があれば、そのあとに金額）
export function presetSummary(preset, accounts, currency) {
  if (typeof preset.name === 'string' && preset.name.trim() !== '') return preset.name
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  const debit = name(preset.debitId)
  const credit = name(preset.creditId)
  return preset.amount === null ? t('presets.summary', { debit, credit }) : t('presets.summaryAmount', { debit, credit, amount: formatMoney(preset.amount, currency) })
}

export const newEntryPreset = (input, now = new Date().toISOString()) => ({ id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now })
export const editEntryPreset = (preset, input, now = new Date().toISOString()) => ({ ...preset, ...input, updatedAt: now })

// 上下に動かす。delta は -1（上へ）か +1（下へ）。端・ないものは、同じ配列を返す
export function moveEntryPreset(list, id, delta) {
  const i = list.findIndex((p) => p.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

// 科目を削除するとき：その科目を使っているプリセット（確認画面の件数用）と、それを除いた配列
export const presetsUsingAccount = (list, accountId) => list.filter((p) => p.debitId === accountId || p.creditId === accountId)
export const removeAccountFromPresets = (list, accountId) => list.filter((p) => p.debitId !== accountId && p.creditId !== accountId)

// 入力欄に入れる値（applyValues に渡す。日付は入れない）。借方・貸方・金額・メモを、そのプリセットのものに置き換える（金額なしは空）。
// 今は選べない科目（使わない設定にした・なくなった）の側は ''。生活費の月は、科目の決まり
export function presetToFormValues(preset, accounts) {
  const usable = new Set(entryAccountOptions(accounts).map((a) => a.id))
  const debitId = usable.has(preset.debitId) ? preset.debitId : ''
  const creditId = usable.has(preset.creditId) ? preset.creditId : ''
  return { debitId, creditId, amount: preset.amount === null ? '' : String(preset.amount), memo: preset.memo, living: defaultLiving(accounts, debitId, creditId) }
}

// 科目を削除したとき、借方・貸方の両方のお気に入りから外す（並びは保つ）
export const removeAccountFromSettings = (settings, accountId) => ({
  ...settings,
  favorites: { debit: settings.favorites.debit.filter((id) => id !== accountId), credit: settings.favorites.credit.filter((id) => id !== accountId) },
})

// 区分つきの表示名（お気に入りのグループの中だけで使う）。表示の文字列を返すだけで、科目は変えない
export const accountLabelWithType = (account) => t('ledger.accountWithType', { name: account.name, type: TYPE_LABELS[account.type] })

// 仕訳の選択肢のグループ。options は entryAccountOptions の結果。先頭に「お気に入り」（登録順。withType: true）、
// そのあとに、お気に入りに入れた科目を除いた区分のグループ（withType: false）。お気に入りが0件・空の区分は出さない
export function favoriteOptionGroups(options, favoriteIds) {
  const byId = new Map(options.map((a) => [a.id, a]))
  const favorites = [...new Set(favoriteIds)].filter((id) => byId.has(id)).map((id) => byId.get(id))
  const inFavorites = new Set(favorites.map((a) => a.id))
  const groups = groupByType(options.filter((a) => !inFavorites.has(a.id))).map((g) => ({ ...g, withType: false }))
  return favorites.length > 0 ? [{ type: 'favorite', label: t('ledger.favoritesGroup'), accounts: favorites, withType: true }, ...groups] : groups
}

// 読み込み用の検証。形が壊れていれば { error }。存在しない科目 id・特別科目・同じ側の重複は、その項目だけ無視して warnings に書く。
// 借方と貸方の同じ科目、使わない設定の科目、上限より多い登録は、そのまま受け入れる。上限は、null か 1以上の整数
export function sanitizeSettings(settings, accounts) {
  const broken = { error: t('error.settingsShape') }
  const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
  if (!isObj(settings) || !isObj(settings.favorites) || !isObj(settings.favoriteLimits)) return broken
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const result = emptySettings()
  const warnings = []
  for (const side of FAVORITE_SIDES) {
    const list = settings.favorites[side]
    const limit = settings.favoriteLimits[side]
    if (!Array.isArray(list)) return broken
    if (limit !== null && !(Number.isInteger(limit) && limit >= 1)) return broken
    const kept = []
    let unknown = 0
    let special = 0
    let duplicate = 0
    for (const id of list) {
      const account = typeof id === 'string' ? byId.get(id) : undefined
      if (!account) unknown += 1
      else if (ENTRY_HIDDEN_KEYS.includes(account.key)) special += 1
      else if (kept.includes(id)) duplicate += 1
      else kept.push(id)
    }
    result.favorites[side] = kept
    result.favoriteLimits[side] = limit
    const parts = [unknown && t('warning.unknown', { count: unknown }), special && t('warning.special', { count: special }), duplicate && t('warning.duplicate', { count: duplicate })].filter(Boolean)
    if (parts.length > 0) warnings.push(t('warning.favoritesIgnored', { side: t(SIDE_KEYS[side]), parts: parts.join(t('common.separator')) }))
  }
  return { settings: result, warnings }
}

// ---- 予算（budgets） ----
// 予算の1件：{ id, kind, accountId, amount, startMonth, createdAt, updatedAt }。month・today・now は呼ぶ側から渡す

// 種類と科目の組み合わせ。組み合わせを足すときは、この表に足す
export const BUDGET_RULES = {
  // label は読むたびに t() を呼ぶ（getter）
  limit: { get label() { return t('budgetRule.limit') }, allows: (a) => a.type === 'expense' && a.key !== 'adjust-loss' }, // 費用。調整損は対象外
  goal: { get label() { return t('budgetRule.goal') }, allows: (a) => a.type === 'asset' && a.role === 'earmark' }, // 取り分け
}
export const budgetKindAllows = (kind, account) => Object.hasOwn(BUDGET_RULES, kind) && BUDGET_RULES[kind].allows(account)

// 新しい予算を登録できる科目（active で、その種類に使える科目）
export const budgetAccountOptions = (accounts, kind) => accounts.filter((a) => a.active && budgetKindAllows(kind, a))

export const isBudgetMonth = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

// 借りているお金（loans。v12）の種類と名前の文字数の上限。rate は年利の 1/100 %（1.25% は 125）
export const LOAN_KINDS = ['scholarship', 'loan', 'other']
export const LOAN_NAME_MAX = 30

// その月の予算：その科目の予算のうち、適用開始月がその月以前で一番新しいもの（レコード）。なければ null
export function effectiveBudget(budgets, accountId, month) {
  let best = null
  for (const b of budgets) {
    if (b.accountId === accountId && b.startMonth <= month && (best === null || b.startMonth > best.startMonth)) best = b
  }
  return best
}

// 目標の実績：その月の通常の仕訳（normal）で、その科目が借方にある額 − 貸方にある額（開始残高・残高調整は入れない。取り崩しは引く）
export function goalActual(entries, accounts, accountId, month) {
  if (!accounts.some((a) => a.id === accountId)) return 0
  let total = 0
  for (const e of entries) {
    if (e.kind !== 'normal' || !e.date.startsWith(month)) continue
    if (e.debitId === accountId) total += e.amount
    if (e.creditId === accountId) total -= e.amount
  }
  return total
}

// その月に目標の予算がある科目の実績 { [accountId]: 実績 }
export function goalActualMap(entries, accounts, budgets, month) {
  const map = {}
  for (const a of accounts) {
    if (effectiveBudget(budgets, a.id, month)?.kind === 'goal') map[a.id] = goalActual(entries, accounts, a.id, month)
  }
  return map
}

// 達成率：実績 × 100 ÷ 予算の整数（0に向かって切り捨て。マイナスはマイナスのまま）
const percent = (actual, budget) => {
  const x = actual * 100
  return (x - (x % budget)) / budget
}

// 予算の表。report は monthReport の結果、goalActuals は goalActualMap の結果。判定は科目の行だけ（合計の行には出さない）
// limits.rows：{ account, budget, actual, remaining, rate, over }（実績 > 予算で over。ちょうど同じは超過ではない）
// goals.rows：{ account, budget, actual, shortfall, rate, status }（status は 'achieved'｜'missed'）
// unset：その月に予算がない費用の科目で、実績が0でないもの { account, actual }（monthReport の費用の並び＝多い順）
export function budgetStatus(budgets, accounts, report, goalActuals, month) {
  const expenseOf = new Map(report.expense.map((r) => [r.account.id, r.amount]))
  const limitRows = []
  const goalRows = []
  for (const account of accounts) {
    const b = effectiveBudget(budgets, account.id, month)
    if (!b) continue
    if (b.kind === 'limit') {
      const actual = expenseOf.get(account.id) ?? 0
      limitRows.push({ account, budget: b.amount, actual, remaining: b.amount - actual, rate: percent(actual, b.amount), over: actual > b.amount })
    } else if (b.kind === 'goal') {
      const actual = goalActuals[account.id] ?? 0
      goalRows.push({ account, budget: b.amount, actual, shortfall: Math.max(0, b.amount - actual), rate: percent(actual, b.amount), status: actual >= b.amount ? 'achieved' : 'missed' })
    }
  }
  const budgetSum = (rows) => sum(rows, (r) => r.budget)
  const actualSum = (rows) => sum(rows, (r) => r.actual)
  return {
    month,
    limits: {
      rows: limitRows,
      total: limitRows.length === 0 ? null : { budget: budgetSum(limitRows), actual: actualSum(limitRows), remaining: budgetSum(limitRows) - actualSum(limitRows), rate: percent(actualSum(limitRows), budgetSum(limitRows)) },
    },
    goals: {
      rows: goalRows,
      total: goalRows.length === 0 ? null : { budget: budgetSum(goalRows), actual: actualSum(goalRows), shortfall: sum(goalRows, (r) => r.shortfall), rate: percent(actualSum(goalRows), budgetSum(goalRows)) },
    },
    unset: report.expense.filter((r) => r.amount !== 0 && !effectiveBudget(budgets, r.account.id, month)).map((r) => ({ account: r.account, actual: r.amount })),
  }
}

// 予算を反映した自由に使える額（仕様 5.13）＝ 自由に使える額 − 今月の上限の「残り」の合計 − 今月の目標の「不足」の合計。month は 'YYYY-MM'（呼ぶ側が今日から渡す）
// 残り・不足は budgetStatus（予算の表と同じ計算）。マイナス（超過）は0として扱う（実績が予算を超えた科目は、実績がもう自由に使える額から引かれているので、それ以上は引かない）。
// 予算のない科目は見ない。使わない設定の科目も、その月の予算があれば対象。月初に大きく減るのは、意図した動き
// 返す形：{ total（予算反映）, free（実際の額）, reserved（引いた額の合計）, items: [{ id, name, amount }]（上限の科目 → 目標の科目の順。引く額が0の科目は出さない） }
export function budgetFreeAmount(accounts, entries, budgets, month, loans = [], later = 0) {
  const free = freeAmount(accounts, entries, loans, month, later).total
  const status = budgetStatus(budgets, accounts, monthReport(accounts, entries, month), goalActualMap(entries, accounts, budgets, month), month)
  const items = [
    ...status.limits.rows.map((r) => ({ id: r.account.id, name: r.account.name, amount: Math.max(0, r.remaining) })),
    ...status.goals.rows.map((r) => ({ id: r.account.id, name: r.account.name, amount: r.shortfall })),
  ].filter((item) => item.amount !== 0)
  const reserved = sum(items, (item) => item.amount)
  return { total: free - reserved, free, reserved, items }
}

// 入力の検証。金額は半角数字の1以上、適用開始月は実在する YYYY-MM、同じ科目・同じ適用開始月は1件まで、使わない設定の科目は選べない
export function validateBudgetInput({ kind, accountId, amountText, startMonth }, accounts, budgets) {
  if (!Object.hasOwn(BUDGET_RULES, kind)) return { error: t('error.budgetKind') }
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return { error: t('error.chooseAccount') }
  if (!budgetKindAllows(kind, account)) return { error: t('error.budgetKindNotAllowed', { label: BUDGET_RULES[kind].label }) }
  if (!account.active) return { error: t('error.budgetInactive') }
  const a = parseAmount(amountText)
  if (a.error) return a
  if (!isBudgetMonth(startMonth)) return { error: t('error.startMonthInvalid') }
  if (budgets.some((b) => b.accountId === accountId && b.startMonth === startMonth)) return { error: t('error.budgetDuplicate') }
  return { kind, accountId, amount: a.amount, startMonth }
}

// どれも新しい配列を返す（元は変えない）。失敗は { error }
export function addBudget(budgets, accounts, rawInput, now = new Date().toISOString()) {
  const r = validateBudgetInput(rawInput, accounts, budgets)
  if (r.error) return r
  const budget = { id: crypto.randomUUID(), ...r, createdAt: now, updatedAt: now }
  return { budgets: [...budgets, budget], budget }
}

// 金額だけ変える（種類・科目・適用開始月は変えない。適用開始月を変えたいときは、削除して入れ直す）
export function changeBudgetAmount(budgets, id, amountText, now = new Date().toISOString()) {
  if (!budgets.some((b) => b.id === id)) return { error: t('error.budgetNotFound') }
  const a = parseAmount(amountText)
  if (a.error) return a
  return { budgets: budgets.map((b) => (b.id === id ? { ...b, amount: a.amount, updatedAt: now } : b)) }
}

export const removeBudget = (budgets, id) => (budgets.some((b) => b.id === id) ? budgets.filter((b) => b.id !== id) : budgets)

// 今月より前の適用開始月か（過去の月の判定が変わる変更の確認画面を出すか）。today は引数
export const isPastBudgetMonth = (startMonth, today) => startMonth < today.slice(0, 7)

// その科目の予算の履歴（適用開始月の新しい順）
export const budgetHistory = (budgets, accountId) =>
  budgets.filter((b) => b.accountId === accountId).sort((a, b) => b.startMonth.localeCompare(a.startMonth))

// ---- 仕訳の一括削除（設定 → データ） ----

// month は 'YYYY-MM'（その月）か null（全期間）。種類を問わず、その範囲の仕訳を消す計画（保存はしない）。
// 成功: { removed, kept, counts: { normal, opening, adjustment, total } } / 失敗: { error }。kept は元の並びのまま。元の配列は変えない
export function planEntryPurge(entries, month) {
  if (month !== null && !isBudgetMonth(month)) return { error: t('error.monthInvalid') }
  const inRange = (e) => month === null || e.date.startsWith(month)
  const removed = entries.filter(inRange)
  const count = (kind) => removed.filter((e) => e.kind === kind).length
  return {
    removed,
    kept: entries.filter((e) => !inRange(e)),
    counts: { normal: count('normal'), opening: count('opening'), adjustment: count('adjustment'), total: removed.length },
  }
}
