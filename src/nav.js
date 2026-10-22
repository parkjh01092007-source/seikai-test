// 画面の定義（入口 → グループ → タブ）。データだけで、React は読み込まない（node のテストから読める）。
// label は文言そのものではなく、辞書（lang/ja.js）のキー。出すときは t(label) で文にする。
// 入口を足す：NAV に1つ足す（辞書にも名前を足す）。タブを足す：NAV に足し、sections.js の対応表（タブの id → 画面の部品）にも足す。
// path：URL の中のタブの名前（#/ledger/<path>）。'' のタブは、入口だけの URL（#/skills）になる。detail: true は、後ろに id を1つ付けられるタブ（クレカ）

const tab = (id, label, options = {}) => ({ id, label, path: id, ...options })

export const NAV = [
  {
    id: 'skills',
    label: 'nav.entry.skills',
    en: 'nav.entryEn.skills',
    groups: [
      { label: 'nav.group.skills', en: 'nav.groupEn.skills', tabs: [tab('skills', 'nav.tab.skills', { path: '', en: 'nav.tabEn.skills', band: 'S' })] }, // 今は1つだけ。将来、一覧とスキル変更に分けるときは、ここに足す
    ],
  },
  {
    id: 'ledger',
    label: 'nav.entry.ledger',
    en: 'nav.entryEn.ledger',
    groups: [
      { label: 'nav.group.record', en: 'nav.groupEn.record', tabs: [tab('entries', 'nav.tab.entries', { en: 'nav.tabEn.entries', band: 'L' }), tab('subscriptions', 'nav.tab.subscriptions', { en: 'nav.tabEn.subscriptions', band: 'S' }), tab('opening', 'nav.tab.opening', { en: 'nav.tabEn.opening', band: 'S' }), tab('adjustment', 'nav.tab.adjustment', { en: 'nav.tabEn.adjustment', band: 'S' })] },
      { label: 'nav.group.inquiry', en: 'nav.groupEn.inquiry', tabs: [tab('balance', 'nav.tab.balance', { en: 'nav.tabEn.balance', band: 'L' }), tab('monthly', 'nav.tab.monthly'), tab('book', 'nav.tab.book', { en: 'nav.tabEn.book', band: 'S' }), tab('card', 'nav.tab.card', { detail: true, en: 'nav.tabEn.card', band: 'S' }), tab('savings', 'nav.tab.savings', { en: 'nav.tabEn.savings', band: 'S' }), tab('budgets', 'nav.tab.budgets', { en: 'nav.tabEn.budgets', band: 'S' })] },
      { label: 'nav.group.manage', en: 'nav.groupEn.manage', tabs: [tab('accounts', 'nav.tab.accounts', { en: 'nav.tabEn.accounts', band: 'S' }), tab('settings', 'nav.tab.settings', { en: 'nav.tabEn.settings', band: 'S' })] },
    ],
  },
]
