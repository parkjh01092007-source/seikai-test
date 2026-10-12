// 設定の画面のタブ（グループ）と項目の並び（1か所の定義。spec-ui.md 4.1）。React を読み込まない（node の check から読める）。
// 項目を足す・並べ替える・分ける・グループを変えるときは、ここの定義と、sections/Settings.jsx の BODIES（id → 中身）だけを変える。title は辞書のキー（見出しの文字）

// タブ（グループ。この順に左から並べる）。記帳・照会は、メニューのグループと同じキー（同じ言葉）
export const SETTINGS_GROUPS = [
  { id: 'record', title: 'nav.group.record' }, // 記帳：仕訳の画面
  { id: 'inquiry', title: 'nav.group.inquiry' }, // 照会：残高・クレカの画面
  { id: 'data', title: 'settings.dataHeading' }, // データ：保存データそのもの
  { id: 'general', title: 'settings.group.general' }, // 一般：アプリ全体
]
export const DEFAULT_TAB = 'record' // 初めに開くタブ（どのタブを開いていたかは覚えない）

// 項目（タブの順に、タブごとに続けて並べる）。phoneOnly：スマホの形だけに出す。danger：エラーの色の枠で囲む（危ない操作）
export const SETTINGS_SECTIONS = [
  { id: 'entries', group: 'record', title: 'settings.entriesHeading' },
  { id: 'favorites', group: 'record', title: 'settings.favoritesHeading' },
  { id: 'balanceView', group: 'inquiry', title: 'balanceView.title' },
  { id: 'card', group: 'inquiry', title: 'card.title' },
  { id: 'save', group: 'data', title: 'save.title' },
  { id: 'backup', group: 'data', title: 'dataSettings.backupTitle', phoneOnly: true }, // PC は右上の帯にある
  { id: 'purge', group: 'data', title: 'dataSettings.purgeTitle', danger: true },
  { id: 'reset', group: 'data', title: 'dataSettings.resetTitle', danger: true },
  { id: 'language', group: 'general', title: 'language.title' },
  { id: 'currency', group: 'general', title: 'currency.title' },
  { id: 'display', group: 'general', title: 'theme.title' },
]

// タブとパネルの id（aria-controls・aria-labelledby 用）。作りは tabs.js（予算の画面と共通）
import { tabDomId as tabId, panelDomId as panelId, nextTab } from './tabs.js'
export const tabDomId = (group) => tabId('settings', group)
export const panelDomId = (group) => panelId('settings', group)
export { nextTab }
