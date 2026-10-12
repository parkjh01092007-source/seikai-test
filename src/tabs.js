// タブ（tablist・tab・tabpanel）の共通の純関数。React を読み込まない（node の check から読める）。設定の画面・予算の画面が使う（Tabs.jsx）。

// タブとパネルの id（aria-controls・aria-labelledby 用）。prefix は画面ごと（settings・budgets）
export const tabDomId = (prefix, id) => `${prefix}-tab-${id}`
export const panelDomId = (prefix, id) => `${prefix}-panel-${id}`

// 矢印キー・Home・End で、次に開くタブ（tabIds は並び順のタブの id、current は今のタブ）。
// 右は次（最後からは最初へ回る）、左は前（最初からは最後へ回る）、Home は最初、End は最後。知らないキー・知らない current は、current のまま
export function nextTab(tabIds, current, key) {
  const i = tabIds.indexOf(current)
  if (i < 0) return current
  if (key === 'ArrowRight') return tabIds[(i + 1) % tabIds.length]
  if (key === 'ArrowLeft') return tabIds[(i - 1 + tabIds.length) % tabIds.length]
  if (key === 'Home') return tabIds[0]
  if (key === 'End') return tabIds[tabIds.length - 1]
  return current
}
