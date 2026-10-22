import { useRef } from 'react'
import { PRESET_ICON_PICKER, PRESET_ICON_LABELS } from '../icons.js'
import { t } from '../text.js'
import { Icon } from './Icon.jsx'

// 記号の選択（radiogroup。矢印で移動）。used：ほかのプリセットが使っている記号（小さい点を出す。選べはする）。選んだものは反転
export default function IconPicker({ value, onChange, used }) {
  const ref = useRef(null)
  const ids = PRESET_ICON_PICKER
  const tab = ids.includes(value) ? value : ids[0] // 選択肢にない記号（初めの記号）のときは、先頭に Tab を置く
  const onKey = (e) => {
    const i = ids.indexOf(document.activeElement?.dataset.icon)
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (step === undefined || i < 0) return
    e.preventDefault()
    const next = ids[(i + step + ids.length) % ids.length]
    onChange(next)
    ref.current?.querySelector(`[data-icon="${next}"]`)?.focus()
  }
  return (
    <div className="pset-icons" role="radiogroup" aria-label={t('presets.pickIcon')} ref={ref} onKeyDown={onKey}>
      {ids.map((id) => {
        const on = id === value
        const dup = used.has(id)
        const label = dup ? t('presets.iconLabelUsed', { label: t(PRESET_ICON_LABELS[id]) }) : t(PRESET_ICON_LABELS[id])
        return (
          <span key={id} className="pset-icon-cell">{/* span で包む：群青の PC の「隣り合う部品は余白で 12px」規則に、格子を巻き込まないため（間は格子の gap） */}
          <button type="button" role="radio" aria-checked={on} data-icon={id} tabIndex={id === tab ? 0 : -1}
            className={`icon-only pset-icon-opt${on ? ' on' : ''}${dup ? ' used' : ''}`}
            aria-label={label} title={label} onClick={() => onChange(id)}>
            <Icon name={id} />{dup && <i className="pset-dot" aria-hidden="true" />}
          </button>
          </span>
        )
      })}
    </div>
  )
}
