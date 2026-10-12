import { useRef } from 'react'
import './tabs.css'
import { tabDomId, panelDomId, nextTab } from '../tabs.js'

// タブの並び（tablist）。設定の画面と予算の画面で共通（spec-ui.md 4.1・spec-ledger.md 5.15）。
// 押したタブの中身だけを出すのは、呼ぶ側（パネルは呼ぶ側が <div role="tabpanel" id={panelDomId(prefix, current)} aria-labelledby={tabDomId(prefix, current)}> で作る）。
// 選ばれているタブだけ tabIndex=0（Tab キーでタブの列に止まるのは1つ）。左右の矢印・Home・End で、フォーカスを移すと同時にそのタブを開く（端で回る。フォーカスはタブに残る）。
// tabs：[{ id, title }]（title は表示する文字）。label：タブの列の名前（読み上げ）。prefix：画面ごとの id の頭（settings・budgets）
export default function Tabs({ label, tabs, current, onChange, prefix }) {
  const refs = useRef({})
  const ids = tabs.map((tb) => tb.id)
  const onKeyDown = (e) => {
    const next = nextTab(ids, current, e.key)
    if (next === current && !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    onChange(next)
    refs.current[next]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className="tabs" onKeyDown={onKeyDown}>
      {tabs.map((tb) => (
        <button
          key={tb.id}
          ref={(el) => { refs.current[tb.id] = el }}
          type="button"
          role="tab"
          id={tabDomId(prefix, tb.id)}
          aria-selected={tb.id === current}
          aria-controls={panelDomId(prefix, tb.id)}
          tabIndex={tb.id === current ? 0 : -1}
          className="tab"
          onClick={() => onChange(tb.id)}
        >{tb.title}</button>
      ))}
    </div>
  )
}
