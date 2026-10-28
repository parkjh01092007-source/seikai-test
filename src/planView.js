// クレカの分割・リボの見やすさ（基本 PC）：合計・分割とリボの割合・先の請求の月ごとの棒・買い物ごとの進み。計算だけ（画面は sections/PlanOverview.jsx）
import { cardPayPlans, payLinesByMode, payDateOf, nextMonth, payItemName, nextDebit, laterFromDate } from './ledgerLogic.js'

export const BAR_MONTHS = 12 // 棒に出す月数（PC）。スマホは 6

const sum = (list, pick) => list.reduce((n, x) => n + pick(x), 0)

// reports：cardReport の結果の並び（1 枚でも、借入ページのようにまとめてでもよい）。
// total ＝ まだ払っていない分（最後の締め日より後の行。分割とリボ。cardPayPlans の remaining と同じ）。bars は同じ行を、引き落とし（支払日）の月ごとに分けたもの：
// 最初の月から最後の月まで続けて並べる（間の月は 0）。barMonths（PC は 12、スマホは 6）を超える分は more（月数）と moreAmount（その金額の合計）。最初の棒が dark（次に請求される月）
// items：買い物ごと { id, kind: 'installment' | 'revolving', name, fallback（メモがなく代わりの名前）, cardName, count, done, left, monthly, remaining, endClosing, rate }
// today（'YYYY-MM-DD'。省くと「記録がまだ」を見ない）。「次の引き落とし」の札は nextDebit（締めた請求が残っていればその額と日、0 なら次の引き落とし日と未請求の利用額）。recordPending：どれかのカードで、残っているのに引き落とし日が過ぎている
export function planOverview(reports, accounts, entries, barMonths = BAR_MONTHS, today = '') {
  const byMonth = new Map()
  const add = (month, key, amount) => byMonth.set(month, { ...(byMonth.get(month) ?? { split: 0, revo: 0 }), [key]: (byMonth.get(month)?.[key] ?? 0) + amount })
  const items = []
  for (const report of reports) {
    const { account, lastClosing, payDay } = report
    const lines = payLinesByMode(account, entries)
    for (const [mode, key] of [['installment', 'split'], ['revolving', 'revo']]) {
      for (const l of lines[mode]) if (l.closingDate > lastClosing) add(payDateOf(l.closingDate, payDay).slice(0, 7), key, l.amount)
    }
    const plans = cardPayPlans(report, entries)
    for (const p of plans.installments) {
      const { name, fallback } = payItemName(p.entry, accounts)
      items.push({ id: p.entry.id, kind: 'installment', name, fallback, cardName: account.name, count: p.count, done: p.count - p.left, left: p.left, monthly: p.monthly, remaining: p.remaining, endClosing: p.endClosing, rate: p.rate })
    }
    if (plans.revolving) items.push({ id: `${account.id}-revolving`, kind: 'revolving', name: null, fallback: false, cardName: account.name, count: null, done: null, left: plans.revolving.left, monthly: plans.revolving.monthly, remaining: plans.revolving.remaining, endClosing: plans.revolving.endClosing, rate: plans.revolving.rate })
  }
  const months = [...byMonth.keys()].sort()
  const all = []
  for (let m = months[0]; months.length > 0 && m <= months.at(-1); m = nextMonth(m)) all.push({ month: m, ...(byMonth.get(m) ?? { split: 0, revo: 0 }) })
  const bars = all.slice(0, barMonths).map((b, i) => ({ ...b, dark: i === 0 }))
  const split = sum(items.filter((i) => i.kind === 'installment'), (i) => i.remaining)
  const revo = sum(items.filter((i) => i.kind === 'revolving'), (i) => i.remaining)
  const nexts = reports.map((r) => nextDebit(r, today))
  return {
    total: split + revo, split, revo, bars, more: Math.max(0, all.length - barMonths), moreAmount: sum(all.slice(barMonths), (b) => b.split + b.revo), items,
    next: sum(nexts, (n) => n.amount), nextPayDate: nexts.map((n) => n.date).sort()[0] ?? null, recordPending: nexts.some((n) => n.recordPending),
    laterFrom: reports.map((r) => laterFromDate(r)).sort()[0] ?? null,
    endClosing: items.map((i) => i.endClosing).sort().at(-1) ?? null,
  }
}
