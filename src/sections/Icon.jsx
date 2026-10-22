import './icon.css'
import { ICONS, PRESET_ICONS } from '../icons.js'

// ボタンの絵（spec-design.md 12.6）。形は src/icons.js。読み上げには出さない（名前は、ボタンの文字か aria-label が持つ）。大きさは icon.css
export function Icon({ name }) {
  return (
    <svg className={`icon icon-${name}`} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {(ICONS[name] ?? PRESET_ICONS[name]).map(([kind, ...a], i) => (
        kind === 'p' ? <path key={i} d={a[0]} />
          : kind === 'r' ? <rect key={i} x={a[0]} y={a[1]} width={a[2]} height={a[3]} rx={a[4]} />
            : <circle key={i} cx={a[0]} cy={a[1]} r={a[2]} fill="currentColor" stroke="none" />
      ))}
    </svg>
  )
}

// 絵だけのボタン。label は、読み上げの名前と、PC でマウスを乗せたときの名前（辞書の文）。withText が true なら、絵と文字（label が文字）。
// 押せる場所は icon.css（スマホは 44px 以上）
export function IconButton({ icon, label, withText = false, className = '', ...props }) {
  return withText
    ? <button type="button" className={className || undefined} {...props}><Icon name={icon} />{label}</button>
    : <button type="button" className={`icon-only ${className}`.trim()} aria-label={label} title={label} {...props}><Icon name={icon} /></button>
}
