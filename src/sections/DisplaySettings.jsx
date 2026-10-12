import { useState } from 'react'
import { t } from '../text.js'
import {
  PRESETS, ACCENTS, ACCENT_LABELS, ACCENT_COLORS, OPACITY_MIN, OPACITY_MAX, presetOf, menuOpacity, chosenColor, quickAccent,
  setPreset, setColor, resetColor, setQuickAccent, setOpacity, resetOpacity, loadTheme, rememberTheme, applyTheme,
} from '../themes.js'

// 設定 → 表示：見た目（基本とプリセット）、メインカラー（プリセットだけ。基本は出さない）、メニューの不透明度（プリセットだけ）。
// ブラウザごとに覚える（保存データには入れない）。変えたらすぐ画面に反映する（確認画面なし）。
// 覚えるのは、本人が選んだ色。見本は、読めるように直したあとの色（applyTheme の戻り値）
export default function DisplaySettings() {
  const [state, setState] = useState(() => {
    const theme = loadTheme()
    return { theme, view: applyTheme(document.documentElement, theme) }
  })
  const { theme, view } = state
  const change = (next) => {
    rememberTheme(next)
    setState({ theme: next, view: applyTheme(document.documentElement, next) })
  }
  const preset = presetOf(theme.preset)
  const opacity = menuOpacity(theme, preset.id) // 基本は null
  const chosen = chosenColor(theme, preset.id) // 本人が選んだ色（なければ標準）
  const currentQuick = chosen ? quickAccent(chosen) : ACCENTS[0]
  return (
    <div className="display-settings">
      <p className="display-row">
        <label>
          {t('theme.preset')}{' '}
          <select value={theme.preset} onChange={(e) => change(setPreset(theme, e.target.value))}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
          </select>
        </label>
      </p>
      {view.accent !== null && (
        <div className="accent-block">
          <p className="display-row">
            <span>{t('theme.accent')}</span>
            <span>
              {t('theme.accentSample')}{' '}
              <span className="swatch" style={{ background: view.accent }} aria-hidden="true" /> <span>{view.accent}</span>
            </span>
            <label>
              {t('theme.accentPick')}{' '}
              <input type="color" value={(chosen ?? view.accent).toLowerCase()} onChange={(e) => change(setColor(theme, preset.id, e.target.value))} />
            </label>
            <button type="button" disabled={chosen === null} onClick={() => change(resetColor(theme, preset.id))}>{t('theme.accentReset')}</button>
          </p>
          {preset.accents && (
            <p className="display-row quick-colors">
              {ACCENTS.map((a) => (
                <button key={a} type="button" aria-pressed={currentQuick === a} onClick={() => change(setQuickAccent(theme, a))}>
                  <span className="swatch" style={{ background: ACCENT_COLORS[a] }} aria-hidden="true" />{t(ACCENT_LABELS[a])}
                </button>
              ))}
            </p>
          )}
          <p className="note" aria-live="polite">{view.adjusted === 'lighter' ? t('theme.accentLighter') : view.adjusted === 'darker' ? t('theme.accentDarker') : ''}</p>
        </div>
      )}
      {opacity !== null && (
        <p className="display-row">
          <label>
            {t('theme.menuOpacity')}{' '}
            <input type="range" min={OPACITY_MIN} max={OPACITY_MAX} step={1} value={opacity} onChange={(e) => change(setOpacity(theme, preset.id, Number(e.target.value)))} />
          </label>
          <output>{t('theme.percent', { value: opacity })}</output>
          <button type="button" disabled={opacity === preset.defaultOpacity} onClick={() => change(resetOpacity(theme, preset.id))}>{t('theme.reset', { value: preset.defaultOpacity })}</button>
        </p>
      )}
      {opacity !== null && <p className="note">{t('theme.menuOpacityNote')}</p>}
    </div>
  )
}
