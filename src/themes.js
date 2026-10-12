// 見た目のプリセットと、その設定（spec-design.md 第2・3章）。React は読み込まない（node のテストから読める）。
// 基本（basic）の色は index.css の :root（今までの見た目）、プリセットの色は themes.css が持つ。ここにあるのは、一覧（id・辞書のキー・標準の不透明度）、
// メインカラー（3.1）の計算、設定の読み書き。色の表（地・文字・標準の強調）は持たない：applyTheme が、CSS の今の値を読む。
// プリセットを足す：PRESETS に1つ足す → 辞書（theme.<id>）→ themes.css。
// 設定は、ブラウザごとに覚える（localStorage の別のキー）。保存データ・書き出し・セーブファイルには入れない。

export const ACCENTS = ['pink', 'purple', 'blue', 'red', 'jade'] // 最深部のすぐ選べる5色。先頭（ピンク）が標準
export const ACCENT_LABELS = { pink: 'theme.accent.pink', purple: 'theme.accent.purple', blue: 'theme.accent.blue', red: 'theme.accent.red', jade: 'theme.accent.jade' } // 辞書のキー
export const ACCENT_COLORS = { pink: '#FF3D8B', purple: '#A65BFF', blue: '#3D8BFF', red: '#FF4040', jade: '#22D3A0' } // themes.css の data-accent のブロックの強調と同じ（check が合わせる）

// label は辞書のキー。defaultOpacity：メニューの不透明度の標準（％）。null は、不透明度とメインカラーの設定を持たない（基本）。
// accents：すぐ選べる色（最深部だけ）。linkKey：大事な数字（--color-key）もメインカラーに合わせる（群青）。linkBorder：自由な色のとき、線も選んだ色に合わせる（最深部）
export const PRESETS = [
  { id: 'basic', label: 'theme.basic', defaultOpacity: null, accents: null },
  { id: 'gunjo', label: 'theme.gunjo', defaultOpacity: 95, accents: null, linkKey: true },
  { id: 'shinbu', label: 'theme.shinbu', defaultOpacity: 80, accents: ACCENTS, linkBorder: true },
  { id: 'seizu', label: 'theme.seizu', defaultOpacity: 55, accents: null },
  { id: 'prism', label: 'theme.prism', defaultOpacity: 45, accents: null },
  { id: 'merchant', label: 'theme.merchant', defaultOpacity: 95, accents: null },
  { id: 'kousou', label: 'theme.kousou', defaultOpacity: 86, accents: null },
]

export const THEME_KEY = 'orenoyome-theme' // 保存データのキー（orenoyome）とは別
export const DEFAULT_PRESET = 'basic'
export const OPACITY_MIN = 30
export const OPACITY_MAX = 100
export const MIN_CONTRAST = 4.5 // 強調色と地の明るさの比

export const presetOf = (id) => PRESETS.find((p) => p.id === id)
const validOpacity = (v) => Number.isInteger(v) && v >= OPACITY_MIN && v <= OPACITY_MAX
const HEX = /^#[0-9a-fA-F]{6}$/
export const isHex = (v) => typeof v === 'string' && HEX.test(v)

// ---- 色の計算（純関数。色は #RRGGBB）----
export const parseHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
export const toHex = (rgb) => '#' + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('').toUpperCase()

// 相対輝度と、明るさの比（WCAG）
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [R,G,B]（0〜255）⇄ [H（0〜360）, S（0〜1）, L（0〜1）]
export function rgbToHsl([r, g, b]) {
  const [R, G, B] = [r, g, b].map((c) => c / 255)
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === R ? ((G - B) / d + 6) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h * 60, s, l]
}
export function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

// 読めるように直した強調色。地（bg）の上で 4.5:1 に足りなければ、色相と彩度を残して、明るさ（HSL の L）だけを、地から離れる向き（暗い地は明るく、明るい地は暗く）に動かし、
// 4.5 を満たす一番近い色にする（丸めた #RRGGBB で測る）。向きの端（白・黒）は、どんな地でも約4.58以上なので、必ず満たせる（満たせなければ端の色）。
// 戻り値 { color, adjusted }。adjusted は null（そのまま）/ 'lighter' / 'darker'
export function readableAccent(accent, bg) {
  accent = accent.toUpperCase()
  if (contrast(accent, bg) >= MIN_CONTRAST) return { color: accent, adjusted: null }
  const lighter = contrast('#FFFFFF', bg) > contrast('#000000', bg)
  const adjusted = lighter ? 'lighter' : 'darker'
  const [h, s, l] = rgbToHsl(parseHex(accent))
  const at = (x) => toHex(hslToRgb([h, s, x]))
  const ok = (x) => contrast(at(x), bg) >= MIN_CONTRAST
  const end = lighter ? 1 : 0
  if (!ok(end)) return { color: lighter ? '#FFFFFF' : '#000000', adjusted }
  let [bad, good] = [l, end] // bad は足りない、good は足りている
  for (let i = 0; i < 40; i++) {
    const mid = (bad + good) / 2
    if (ok(mid)) good = mid
    else bad = mid
  }
  return { color: at(good), adjusted }
}

// 強調色の上に置く文字の色：白・そのプリセットの文字の色・地の色の中で、強調色との比が一番高いもの（同じ比なら、文字の色、白、地の順）。bg は読めないとき省ける
export function onAccent(accent, text, bg) {
  const candidates = [text, '#FFFFFF', bg].filter(isHex).map((c) => c.toUpperCase())
  return candidates.reduce((best, c) => (contrast(c, accent) > contrast(best, accent) ? c : best))
}

// ---- 設定 ----
// 設定の形：{ preset, colors, opacity }。colors：メインカラー、opacity：メニューの不透明度（％）。どちらも、本人が選んだプリセットだけ { id: 値 } で持つ（標準に戻す＝キーを消す）
export const defaultTheme = () => ({ preset: DEFAULT_PRESET, colors: {}, opacity: {} })

// 純関数。覚えてある文字列を設定にする。例外にしない。読めない・形が違うときは初期値、一部だけ違うときは、その項目だけ初期値
export function parseTheme(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    return defaultTheme()
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return defaultTheme()
  const map = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {})
  const opacity = {}
  const colors = {}
  for (const p of PRESETS) {
    if (p.defaultOpacity === null) continue // 基本は、どちらも持たない
    const o = Object.hasOwn(map(raw.opacity), p.id) ? raw.opacity[p.id] : undefined
    if (validOpacity(o) && o !== p.defaultOpacity) opacity[p.id] = o
    const c = Object.hasOwn(map(raw.colors), p.id) ? raw.colors[p.id] : undefined
    if (isHex(c)) colors[p.id] = c.toUpperCase()
  }
  // 今までの形（accent：最深部の5色の名前だけ）は、最深部のメインカラーとして引き継ぐ。ピンクは標準。新しい形の色があれば、そちらが先
  if (!colors.shinbu && ACCENTS.includes(raw.accent) && raw.accent !== ACCENTS[0]) colors.shinbu = ACCENT_COLORS[raw.accent]
  return { preset: presetOf(raw.preset) ? raw.preset : DEFAULT_PRESET, colors, opacity }
}

// そのプリセットのメニューの不透明度（％）。覚えていなければ標準。基本は持たない（null）
export const menuOpacity = (theme, id) => theme.opacity[id] ?? presetOf(id).defaultOpacity
// 本人が選んだメインカラー（なければ null＝標準）
export const chosenColor = (theme, id) => theme.colors[id] ?? null
// 選んだ色が、最深部のすぐ選べる5色のどれかなら、その名前（なければ null）
export const quickAccent = (color) => ACCENTS.find((a) => ACCENT_COLORS[a] === color?.toUpperCase()) ?? null

// 以下は、新しい設定を返す純関数。不正な値（未知の id、範囲外・小数、#RRGGBB でない色）や、基本への設定は、設定をそのまま返す（無視）
const hasSettings = (id) => presetOf(id)?.defaultOpacity != null
export const setPreset = (theme, id) => (presetOf(id) ? { ...theme, preset: id } : theme)
export function setOpacity(theme, id, value) {
  const p = presetOf(id)
  if (!p || p.defaultOpacity === null || !validOpacity(value)) return theme
  const { [id]: _, ...rest } = theme.opacity
  return { ...theme, opacity: value === p.defaultOpacity ? rest : { ...rest, [id]: value } }
}
export const resetOpacity = (theme, id) => {
  if (!Object.hasOwn(theme.opacity, id)) return theme
  const { [id]: _, ...rest } = theme.opacity
  return { ...theme, opacity: rest }
}
export const setColor = (theme, id, color) => (hasSettings(id) && isHex(color) ? { ...theme, colors: { ...theme.colors, [id]: color.toUpperCase() } } : theme)
export const resetColor = (theme, id) => {
  if (!Object.hasOwn(theme.colors, id)) return theme
  const { [id]: _, ...rest } = theme.colors
  return { ...theme, colors: rest }
}
// 最深部のすぐ選べる5色のボタン。ピンクは標準なので、色を消す
export const setQuickAccent = (theme, name) => (!ACCENTS.includes(name) ? theme : name === ACCENTS[0] ? resetColor(theme, 'shinbu') : setColor(theme, 'shinbu', ACCENT_COLORS[name]))

// storage は getItem / setItem を持つ物（ブラウザの localStorage、テストでは偽物）。使えなくても例外にしない
export function readTheme(storage) {
  try {
    return parseTheme(storage.getItem(THEME_KEY))
  } catch {
    return defaultTheme()
  }
}

export function saveTheme(storage, theme) {
  try {
    storage.setItem(THEME_KEY, JSON.stringify(theme))
  } catch { /* 覚えられなくても、今の画面は変わる */ }
}

const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
export const loadTheme = () => (browserStorage() ? readTheme(browserStorage()) : defaultTheme())
export const rememberTheme = (theme) => { if (browserStorage()) saveTheme(browserStorage(), theme) }

// html 要素（root）に反映する。getStyle(root) は、CSS の今の値を読む物（既定はブラウザの getComputedStyle。テストでは偽物）。
// data-theme、最深部で選んだ色がすぐ選べる5色のどれかのときだけ data-accent（線と薄い文字が8.1の表の値になる）、メニューの不透明度（--menu-opacity、0〜1。基本は外す）。
// 選んだメインカラーがあるときだけ、html の style に、直した色（--color-accent）などを入れる。標準のとき・基本のときは入れない（CSS の値のまま）。切り替えたら、前の分は外す。
// CSS がまだ読めないとき（値が空・形が違う・例外）は、直さずに、選んだ色をそのまま使う。例外にしない。何度呼んでも同じ結果になる。
// 戻り値 { accent, adjusted }：今のメインカラー（直したあと。基本は null）と、直したかどうか（画面が見本と文に使う）
const INLINE = ['--color-accent', '--color-key', '--color-border', '--menu-edge', '--color-on-accent']
const browserStyle = (root) => getComputedStyle(root)
export function applyTheme(root, theme, getStyle = browserStyle) {
  const p = presetOf(theme.preset) ?? presetOf(DEFAULT_PRESET)
  const chosen = hasSettings(p.id) ? chosenColor(theme, p.id) : null
  const quick = p.accents ? quickAccent(chosen) : null
  root.setAttribute('data-theme', p.id)
  if (quick) root.setAttribute('data-accent', quick)
  else root.removeAttribute('data-accent')
  const opacity = menuOpacity(theme, p.id)
  if (opacity === null) root.style.removeProperty('--menu-opacity')
  else root.style.setProperty('--menu-opacity', String(opacity / 100))
  for (const name of INLINE) root.style.removeProperty(name)
  if (p.id === 'basic') return { accent: null, adjusted: null }

  let read = () => ''
  try {
    const style = getStyle(root)
    read = (name) => {
      try {
        const v = String(style.getPropertyValue(name) ?? '').trim()
        return isHex(v) ? v.toUpperCase() : ''
      } catch {
        return '' // 1つ読めなくても、ほかは読む
      }
    }
  } catch { /* 読めない */ }
  const [bg, text] = [read('--color-bg'), read('--color-text')]
  let accent = read('--color-accent') // 標準の強調色（インラインは外したあと）
  let adjusted = null
  if (chosen) {
    const r = bg ? readableAccent(chosen, bg) : { color: chosen, adjusted: null }
    accent = r.color
    adjusted = r.adjusted
    root.style.setProperty('--color-accent', accent)
    if (p.linkKey) root.style.setProperty('--color-key', accent)
    if (p.linkBorder && !quick) {
      root.style.setProperty('--color-border', `rgba(${parseHex(chosen).join(', ')}, 0.25)`)
      root.style.setProperty('--menu-edge', chosen) // メニューの縁の線と光
    }
  }
  if (accent) root.style.setProperty('--color-on-accent', onAccent(accent, text || '#FFFFFF', bg))
  return { accent: accent || null, adjusted }
}
