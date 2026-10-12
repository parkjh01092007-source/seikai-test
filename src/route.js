// # と画面の対応の純関数（お金の計算ではないので ledgerLogic.js とは別）。画面の定義は nav.js。new Date は使わない。
// 画面を表す値（route）：{ entry: 'home' | 入口の id, tab: タブの id | null, detailId: string | null }

import { NAV } from './nav.js'

export const HOME = { entry: 'home', tab: null, detailId: null }

const tabsOf = (entry) => entry.groups.flatMap((g) => g.tabs)
const defaultTab = (entry) => tabsOf(entry).find((t) => t.path === '') ?? tabsOf(entry)[0] // 入口だけの # で出すタブ

// location.hash（'' / '#/' / '#/ledger/entries' など）→ route。必ず有効な route を返す（例外は投げない）
// 知らない入口・タブ・余分な部分はホーム。入口だけは最初のタブ。detail のタブは、detailIds（今ある id）にない id なら一覧（detailId: null）
export function parseHash(hash, detailIds = [], nav = NAV) {
  if (typeof hash !== 'string' || (hash !== '' && !hash.startsWith('#'))) return { ...HOME }
  const path = hash.replace(/^#\/?/, '').replace(/\/$/, '')
  const segments = path === '' ? [] : path.split('/')
  const entry = nav.find((e) => e.id === segments[0])
  if (!entry) return { ...HOME }
  if (segments.length === 1) return { entry: entry.id, tab: defaultTab(entry).id, detailId: null }
  const tab = tabsOf(entry).find((t) => t.path !== '' && t.path === segments[1])
  if (!tab) return { ...HOME }
  const list = { entry: entry.id, tab: tab.id, detailId: null }
  if (segments.length === 2) return list
  if (!tab.detail || segments.length > 3) return { ...HOME }
  let id
  try {
    id = decodeURIComponent(segments[2])
  } catch {
    return list // 壊れた id は、存在しない id と同じ
  }
  return detailIds.includes(id) ? { ...list, detailId: id } : list
}

// route → '#/'、'#/skills'、'#/ledger/entries'、'#/ledger/card/<id>'。parseHash(toHash(r)) は r に戻る。入口が分からなければホーム、タブが分からなければ最初のタブ
export function toHash(route, nav = NAV) {
  const entry = nav.find((e) => e.id === route.entry)
  if (!entry) return '#/'
  const tab = tabsOf(entry).find((t) => t.id === route.tab) ?? defaultTab(entry)
  return `#/${entry.id}${tab.path ? `/${tab.path}` : ''}${tab.detail && route.detailId ? `/${encodeURIComponent(route.detailId)}` : ''}`
}

// 入口の最初のタブの hash（ホームの入口ボタン用）
export const entryHash = (entryId, nav = NAV) => toHash({ entry: entryId, tab: null, detailId: null }, nav)
