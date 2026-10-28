// 「借りているお金」ページの計算と入力の検証（画面に出す数・入力の判定は、ここに置く。保存の形は storage.js、返す予定と自由に使える額は ledgerLogic.js）。
// rate は年利の 1/100 %（0.9% は 90）。loan.rate・loan.payment は「はじめの値」で、変更は rateHistory（loanTermAt が月ごとに選ぶ）。
import { t } from './text.js'
import { parseRate, formatRate, cardReports, cardPayPlans, newAccount, newEntry, formatMoney, validateAccountName, parseOpeningAmount, openingInitial, isBudgetMonth, nextMonth, accountBalances, loanSchedule, loanTermAt, loanDue, LOAN_KINDS, LOAN_NAME_MAX } from './ledgerLogic.js'

const monthIndex = (m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1

export { parseRate, formatRate }

// 返す日（1〜31）
const parseDay = (text) => {
  const s = String(text).trim()
  if (!/^\d{1,2}$/.test(s) || Number(s) < 1 || Number(s) > 31) return { error: t('error.dayOfMonth') }
  return { day: Number(s) }
}

// 借入の追加の入力を検べる。input：{ kind, name, balanceText, rateText, paymentText, payDayText, monthlyText, recvFrom, recvTo, repayFrom }
// 奨学金だけ monthlyText（毎月受け取る額。空・0 は受け取っていない）・recvFrom・recvTo（受け取る期間）・repayFrom（返し始める月。空は決めない）
// 成功: { values } / 失敗: { error }
export function validateLoanInput(input, accounts) {
  if (!LOAN_KINDS.includes(input.kind)) return { error: t('error.loanKind') }
  const named = validateAccountName(input.name, accounts)
  if (named.error) return { error: named.error }
  if (named.name.length > LOAN_NAME_MAX) return { error: t('error.loanNameTooLong', { max: LOAN_NAME_MAX }) }
  const balance = parseOpeningAmount(input.balanceText.trim())
  if (balance.error) return { error: balance.error }
  const rate = parseRate(input.rateText)
  if (rate.error) return { error: rate.error }
  const payment = parseOpeningAmount(input.paymentText.trim())
  if (payment.error) return { error: payment.error }
  const day = parseDay(input.payDayText)
  if (day.error) return { error: day.error }
  const values = { kind: input.kind, name: named.name, balance: balance.amount, rate: rate.rate, payment: payment.amount, payDay: day.day }
  if (input.kind === 'scholarship') {
    const monthly = parseOpeningAmount((input.monthlyText ?? '').trim())
    if (monthly.error) return { error: monthly.error }
    if (monthly.amount > 0) {
      if (!isBudgetMonth(input.recvFrom) || !isBudgetMonth(input.recvTo) || input.recvFrom > input.recvTo) return { error: t('error.loanReceive') }
      values.receiving = { monthly: monthly.amount, from: input.recvFrom, to: input.recvTo }
    }
    if (input.repayFrom) {
      if (!isBudgetMonth(input.repayFrom)) return { error: t('error.monthInvalid') }
      values.repayFrom = input.repayFrom
    }
  }
  return { values }
}

// 借入を足す。借入ごとに、負債の科目を 1 つ作る。今の残りがあれば、開始残高の仕訳（kind: 'opening'。日付は開始残高の画面と同じ）で入れる。
// 成功: { account, entry（残り 0 なら null）, loan } / 失敗: { error }。渡したデータは変えない
export function newLoan(input, accounts, entries, today, now = new Date().toISOString()) {
  const r = validateLoanInput(input, accounts)
  if (r.error) return r
  const { values } = r
  const openingId = accounts.find((a) => a.key === 'opening')?.id
  if (!openingId) return { error: t('error.openingAccountMissing') }
  const account = newAccount(values.name, 'liability', 'other', now)
  const entry = values.balance > 0
    ? { id: crypto.randomUUID(), date: openingInitial(accounts, entries, today).date, debitId: openingId, creditId: account.id, amount: values.balance, memo: '', kind: 'opening', createdAt: now, updatedAt: now }
    : null
  const loan = {
    id: crypto.randomUUID(), kind: values.kind, name: values.name, accountId: account.id, rate: values.rate, payment: values.payment, payDay: values.payDay, rateHistory: [],
    ...(values.receiving && { receiving: values.receiving }), ...(values.repayFrom && { repayFrom: values.repayFrom }), createdAt: now,
  }
  return { account, entry, loan }
}

// 利率・返済額の変更を足す（仕訳ではない）。同じ月がすでにあれば置き換える。成功: { loan } / 失敗: { error }。渡した loan は変えない
export function addLoanTerm(loan, { from, rateText, paymentText }) {
  if (!isBudgetMonth(from)) return { error: t('error.monthInvalid') }
  const rate = parseRate(rateText)
  if (rate.error) return { error: rate.error }
  const payment = parseOpeningAmount(String(paymentText).trim())
  if (payment.error) return { error: payment.error }
  const rateHistory = [...loan.rateHistory.filter((x) => x.from !== from), { from, rate: rate.rate, payment: payment.amount }].sort((a, b) => (a.from < b.from ? -1 : 1))
  return { loan: { ...loan, rateHistory } }
}

export const removeLoan = (loans, id) => loans.filter((l) => l.id !== id)

// 受け取り中の進み（月の数）：{ total, done }。受け取りの期間がなければ null。done は month までに過ぎた月（0〜total）
export function receivingProgress(loan, month) {
  if (!loan.receiving) return null
  const total = monthIndex(loan.receiving.to) - monthIndex(loan.receiving.from) + 1
  return { total, done: Math.min(total, Math.max(0, monthIndex(month) - monthIndex(loan.receiving.from) + 1)) }
}

// 残りの見込み。month は今月、balance は今の残り、paidNow はその月の返済がすでに仕訳にあるか。
// 返す形：{ plan（loanSchedule の rows）, endMonth, endless, startMonth（最初に返す月）, series: [{ month, balance }]（今月から終わりまで。グラフ用）}
// 受け取り中の奨学金は、受け取り終わりの月まで毎月の額が増え（来月から）、返し始める月（repayFrom。なければ受け取り終わりの次の月）から返す
export function loanProjection(loan, balance, month, paidNow) {
  const series = [{ month, balance }]
  let left = balance
  let m = month
  const rc = loan.receiving
  if (rc && rc.to > month) {
    while (m < rc.to) {
      m = nextMonth(m)
      if (m >= rc.from) left += rc.monthly
      series.push({ month: m, balance: left })
    }
  }
  const natural = paidNow ? nextMonth(month) : month
  const afterReceiving = rc && rc.to >= natural ? nextMonth(rc.to) : natural
  const startMonth = loan.repayFrom && loan.repayFrom > afterReceiving ? loan.repayFrom : afterReceiving
  for (m = nextMonth(m); m < startMonth && series.length < 600; m = nextMonth(m)) series.push({ month: m, balance: left })
  const { rows, endMonth, endless } = loanSchedule(loan, left, startMonth)
  for (const r of rows) series.push({ month: r.month, balance: r.balance })
  return { plan: rows, endMonth, endless, startMonth, series }
}

// ページ全体の数。month は今月（'YYYY-MM'）。
// items：借入ごと { loan, account, balance（残り）, borrowed（借りた額＝この科目の貸方の合計）, term（今月の利率・返済額）, scheduled（今月の返済額。返す前・残りなしは 0。返したあとも変わらない）,
//   due（自由に使える額から引く額。今月の返済の仕訳があれば 0）, paidNow, paidPrincipal（今月返した元金＝借方の合計）, projection }
// totals：{ remain, scheduled, due }。loans にある借入の科目が見つからないものは出さない
export function loanOverview(data, month) {
  const { accounts, entries } = data
  const loans = data.loans ?? []
  const rows = accountBalances(accounts, entries).rows
  const items = []
  for (const loan of loans) {
    const row = rows.find((r) => r.account.id === loan.accountId)
    if (!row) continue
    const balance = row.balance
    const thisMonth = entries.filter((e) => e.debitId === loan.accountId && e.date.slice(0, 7) === month)
    const paidNow = thisMonth.length > 0
    items.push({
      loan, account: row.account, balance, borrowed: row.credit, term: loanTermAt(loan, month),
      scheduled: loanDue(loan, balance, [], month), due: loanDue(loan, balance, entries, month),
      paidNow, paidPrincipal: thisMonth.reduce((n, e) => n + e.amount, 0),
      projection: loanProjection(loan, balance, month, paidNow),
    })
  }
  const sum = (pick) => items.reduce((n, i) => n + pick(i), 0)
  return { items, totals: { remain: sum((i) => i.balance), scheduled: sum((i) => i.scheduled), due: sum((i) => i.due) } }
}

// グラフの点：年に 1 つ（今月と同じ月）＋最初と最後＋残りの動きが変わる点（増える→減る・平ら→減るの境）。series は loanProjection の series
export function chartPoints(series) {
  if (series.length === 0) return []
  const key = series[0].month.slice(5)
  const slope = (a, b) => Math.sign(b.balance - a.balance)
  return series.filter((p, i) => i === 0 || i === series.length - 1 || p.month.slice(5) === key || slope(series[i - 1], p) !== slope(p, series[i + 1]))
}

// 借入のページの別枠「まだ払っていない分（クレカ・後払い）」：残高が 0 でないカード（後払いも、カードの科目として入っている）ごとに、
// { account, report（cardReport：next・unbilled・later・balance・payDate）, plans（cardPayPlans：分割の買い物・リボ） }。totals：{ balance, later }。
// 一覧は、残高の大きい順。残高が 0 のカードは出さない。today は 'YYYY-MM-DD'
export function unpaidCards(data, today) {
  const items = cardReports(data.accounts, data.entries, today)
    .filter((r) => r.balance !== 0)
    .map((report) => ({ account: report.account, report, plans: cardPayPlans(report, data.entries) }))
    .sort((a, b) => b.report.balance - a.report.balance)
  const sum = (pick) => items.reduce((n, i) => n + pick(i.report), 0)
  return { items, totals: { balance: sum((r) => r.balance), later: sum((r) => r.later) } }
}

// ---- 借入ごとの専用ページ（返済・受け取りの記録、仕訳の一覧）。自動の仕訳は作らない。保存の形は変えない（仕訳の借方か貸方が借入の科目なら、その借入の仕訳） ----
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)

// 仕訳の画面でロックする借入の仕訳か：通常の仕訳で、借方か貸方が借入の科目。該当する借入（なければ undefined）
export const loanOfEntry = (loans, entry) => (entry.kind === 'normal' ? loans.find((l) => l.accountId === entry.debitId || l.accountId === entry.creditId) : undefined)

export const interestMemo = (loan) => t('loans.memoInterest', { name: loan.name })
// 利息の科目「支払利息」：同じ名前の科目があればそれ。なければ undefined（記録するときに作る）
export const interestAccountOf = (accounts) => accounts.find((a) => a.type === 'expense' && a.name.trim() === t('loans.interestName'))

// その借入の仕訳（新しい順）。借方か貸方が借入の科目の仕訳（開始残高・残高調整も。編集できるのは通常の仕訳だけ）＋ 利息の仕訳（借方が支払利息で、メモが利息の決まった文）
export function loanEntries(data, loan) {
  const interestId = interestAccountOf(data.accounts)?.id
  return data.entries
    .filter((e) => e.debitId === loan.accountId || e.creditId === loan.accountId || (e.kind === 'normal' && interestId !== undefined && e.debitId === interestId && e.memo === interestMemo(loan)))
    .map((e) => ({ entry: e, type: e.debitId === loan.accountId ? 'repay' : e.creditId === loan.accountId ? 'receive' : 'interest' }))
    .sort((a, b) => (a.entry.date === b.entry.date ? (a.entry.createdAt < b.entry.createdAt ? 1 : -1) : a.entry.date < b.entry.date ? 1 : -1))
}

// 今月の返済の予定（元金・利息）。返済の月でない・残りなしは 0
export function plannedRepayment(loan, balance, month) {
  const payment = loanDue(loan, balance, [], month)
  const interest = Math.min(payment, Math.floor((balance * loanTermAt(loan, month).rate) / 120000))
  return { payment, interest, principal: payment - interest }
}

// 受け取りの予定（奨学金の受け取り中の月だけ毎月の額。それ以外は 0）
export const plannedReceipt = (loan, month) => (loan.receiving && month >= loan.receiving.from && month <= loan.receiving.to ? loan.receiving.monthly : 0)

export const repaidThisMonth = (data, loan, month) => data.entries.some((e) => e.kind === 'normal' && e.debitId === loan.accountId && e.date.slice(0, 7) === month)
export const receivedThisMonth = (data, loan, month) => data.entries.some((e) => e.kind === 'normal' && e.creditId === loan.accountId && e.date.slice(0, 7) === month)

// 払う・受け取る口座の候補（使っている現金類）
export const cashAccounts = (accounts) => accounts.filter((a) => a.type === 'asset' && a.role === 'cash' && a.active)

// 1 行の確認の文（なければ null）。警告ではなく、「この額でよいか」を聞くだけ。planned は予定の合計、amount は入れた合計、again は今月すでに記録があるか
export function confirmNote({ planned, amount, again, currency, receipt = false }) {
  if (again) return t(receipt ? 'loans.noteAgainReceipt' : 'loans.noteAgain')
  if (planned > 0 && amount !== planned) return t('loans.noteDiff', { planned: formatMoney(planned, currency) })
  return null
}

// 返済の記録：元金の仕訳（借方＝借入の科目、貸方＝払う口座）と、利息があれば利息の仕訳（借方＝支払利息、貸方＝払う口座）。
// 成功: { accounts, entries, added } / 失敗: { error }。渡したデータは変えない
export function recordRepayment(data, loan, { date, principalText, interestText, fromId }, now = new Date().toISOString()) {
  if (!isYmd(date)) return { error: t('error.dateInvalid') }
  const p = parseOpeningAmount(String(principalText).trim())
  if (p.error) return { error: p.error }
  const i = parseOpeningAmount(String(interestText).trim())
  if (i.error) return { error: i.error }
  if (p.amount + i.amount < 1) return { error: t('loans.errAmount') }
  if (!cashAccounts(data.accounts).some((a) => a.id === fromId)) return { error: t('loans.errAccount') }
  let accounts = data.accounts
  const added = []
  if (p.amount > 0) added.push(newEntry({ date, debitId: loan.accountId, creditId: fromId, amount: p.amount }, t('loans.memoRepay', { name: loan.name }), now))
  if (i.amount > 0) {
    let acc = interestAccountOf(accounts)
    if (!acc) { acc = newAccount(t('loans.interestName'), 'expense', undefined, now); accounts = [...accounts, acc] }
    added.push(newEntry({ date, debitId: acc.id, creditId: fromId, amount: i.amount }, interestMemo(loan), now))
  }
  return { accounts, entries: [...data.entries, ...added], added }
}

// 受け取りの記録（借り始め・奨学金の毎月）：借方＝受け取る口座、貸方＝借入の科目。成功: { entries } / 失敗: { error }
export function recordReceipt(data, loan, { date, amountText, toId }, now = new Date().toISOString()) {
  if (!isYmd(date)) return { error: t('error.dateInvalid') }
  const a = parseOpeningAmount(String(amountText).trim())
  if (a.error) return { error: a.error }
  if (a.amount < 1) return { error: t('loans.errAmount') }
  if (!cashAccounts(data.accounts).some((x) => x.id === toId)) return { error: t('loans.errAccount') }
  return { entries: [...data.entries, newEntry({ date, debitId: toId, creditId: loan.accountId, amount: a.amount }, t('loans.memoReceive', { name: loan.name }), now)] }
}

// 専用ページでの仕訳の直し（日付・金額・メモ。科目は変えない）。成功: { entries } / 失敗: { error }
export function editLoanEntry(entries, id, { date, amountText, memo }, now = new Date().toISOString()) {
  if (!isYmd(date)) return { error: t('error.dateInvalid') }
  const a = parseOpeningAmount(String(amountText).trim())
  if (a.error) return { error: a.error }
  if (a.amount < 1) return { error: t('loans.errAmount') }
  return { entries: entries.map((e) => (e.id === id ? { ...e, date, amount: a.amount, memo, updatedAt: now } : e)) }
}
