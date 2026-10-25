import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './calc.css'
import { Icon } from './Icon.jsx'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { answerOf, normalize, press, formatExpr, formatNumber, isExpression } from '../calc.js'

const hasOperator = isExpression

// 金額の電卓（作業32。spec-ledger.md 5.16）。EntryForm の金額の欄の置きかえ。
// スマホの形：欄の右に電卓の絵のボタン。押すと、画面の下からキーパッド（<dialog>）が出る。キーパッドの中に入力欄は置かない（置くと、ふつうのキーボードが出る）

// 理由の文言（キーは文字で書く：辞書の使っているキーの検査に見つけてもらうため）
const ERROR_TEXT = {
  incomplete: () => t('calc.error.incomplete'),
  invalid: () => t('calc.error.invalid'),
  divZero: () => t('calc.error.divZero'),
  tooSmall: () => t('calc.error.tooSmall'),
  tooLarge: () => t('error.amountTooLarge'),
}

// PC の帯の、＋ − × ÷ のボタン（押すと、欄の式に足す）
const OPS = [['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/']]

// 行ごとの、キーの並び（4列）。[見える文字, press に渡すキー, 種類]
const ROWS = [
  [['C', 'clear', 'fn'], ['⌫', 'back', 'fn'], ['×1.1', '*1.1', 'fn'], ['×1.08', '*1.08', 'fn']],
  [['7', '7'], ['8', '8'], ['9', '9'], ['÷', '/', 'op']],
  [['4', '4'], ['5', '5'], ['6', '6'], ['×', '*', 'op']],
  [['1', '1'], ['2', '2'], ['3', '3'], ['−', '-', 'op']],
  [['0', '0'], ['00', '00'], ['.', '.'], ['+', '+', 'op']],
]

// 群青の PC の月（E-rules.html 15章）：入れられる＝満月（full）、式が途中＝欠けた月（part）、ほかの理由＝点線の月（dash）。answer の結果から形を選ぶだけ（新しい判断は持たない）。
// 名前（title・aria-label）は、理由の文と同じ。入れられるときは「入れられる」
const moonOf = (answer) => (!answer?.error ? 'full' : answer.error === 'incomplete' ? 'part' : 'dash')
function Moon({ answer, className }) {
  const id = useId()
  const kind = moonOf(answer)
  const label = answer?.error ? ERROR_TEXT[answer.error]() : t('calc.canInsert')
  return (
    <svg className={className} role="img" aria-label={label} data-moon={kind} width="130" height="130" viewBox="0 0 130 130">
      <title>{label}</title>
      <defs>
        <radialGradient id={`${id}g`} cx="38%" cy="42%" r="70%"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E4E3FF" /></radialGradient>
        <radialGradient id={`${id}h`}><stop offset=".55" stopColor="#fff" stopOpacity=".32" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      {kind === 'dash'
        ? <circle cx="65" cy="65" r="41.6" fill="rgba(255,255,255,.06)" stroke="#fff" strokeWidth="1.6" strokeDasharray="3 4" />
        : <>
          <circle cx="65" cy="65" r="64.5" fill={`url(#${id}h)`} />
          <circle cx="65" cy="65" r="41.6" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.45)" strokeWidth="1" />
          <path d={kind === 'full' ? 'M23.4 65a41.6 41.6 0 1 0 83.2 0a41.6 41.6 0 1 0 -83.2 0Z' : 'M65 23.4A41.6 41.6 0 0 0 65 106.6A23.3 41.6 0 0 1 65 23.4Z'} fill={`url(#${id}g)`} stroke="#fff" strokeWidth="1.2" />
        </>}
    </svg>
  )
}
// 空の星（3個。群青の PC のキーパッドだけ）：[左, 上, 大きさ]
const STARS = [[236, 40, 7], [392, 74, 6], [250, 88, 5]]

// 式を1行に収める。入りきらないときは、前の方を記号の区切りで省いて「… 」にする（いま打っている式の最後は、必ず見せる）。幅は、置かれた箱の幅
function FitExpr({ text, className }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    const fit = () => {
      const tokens = text.split(' ') // formatExpr は、記号の前後に空白を入れる
      el.textContent = text
      for (let k = 1; el.scrollWidth > el.clientWidth && k < tokens.length; k++) el.textContent = `… ${tokens.slice(k).join(' ')}`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text])
  return <span ref={ref} className={className} title={text} />
}

// キーパッド。initial：金額の欄の今の文字（数字なら式の初めに入れる）。onInsert(四捨五入した整数の文字)・onClose()。どちらも、呼んだあとは呼んだ側が閉じる
export function Keypad({ initial, onInsert, onClose }) {
  const gunjoPc = useGunjoPc()
  const dialogRef = useRef(null)
  const insertRef = useRef(null)
  const cancelRef = useRef(null)
  const [expr, setExpr] = useState(() => normalize(initial))
  const answer = expr === '' ? null : answerOf(expr)
  const ok = answer !== null && !answer.error

  useEffect(() => {
    dialogRef.current.showModal()
    ;(insertRef.current.disabled ? cancelRef.current : insertRef.current).focus() // 入力欄ではなく、ボタンに置く（キーボードを出さない）
  }, [])

  // 群青の PC：「入れる」が押せなくなってフォーカスを失ったら（式の途中）、ダイアログ自身へ戻す。キーはダイアログが受けるので、続きが打てる
  useEffect(() => {
    const d = dialogRef.current
    const active = document.activeElement
    if (gunjoPc && !ok && (!d.contains(active) || active.disabled)) d.focus() // 押せなくなったボタンは、このときまだ activeElement に残っている
  }, [gunjoPc, ok])

  const key = (k) => setExpr((e) => press(e, k))
  // キーボードの数字・記号・Backspace（⌫）・Delete（C）・=・Enter（入れる）。フォーカスは、いつもボタンにある（入力欄ではない）
  const keyDown = (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return
    const k = e.key === 'Backspace' ? 'back' : e.key === 'Delete' ? 'clear' : /^[\d.+\-*/=]$/.test(e.key) ? e.key : null
    if (k) { e.preventDefault(); key(k) }
    else if (e.key === 'Enter') { e.preventDefault(); if (ok) onInsert(String(answer.rounded)) }
  }
  return createPortal(
    <dialog
      ref={dialogRef}
      className={`keypad${gunjoPc ? ' g-keypad' : ''}`}
      aria-label={t('calc.name')}
      tabIndex={gunjoPc ? -1 : undefined}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === dialogRef.current) onClose() }} // 外（幕）を押したとき
      onKeyDown={keyDown}
    >
      <div className="keypad-body">
        <div className="keypad-display" aria-live="polite">
          {gunjoPc && <>
            {STARS.map(([left, top, size]) => <svg key={left} className="keypad-star" style={{ left, top }} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0L6 4L10 5L6 6L5 10L4 6L0 5L4 4Z" fill="#fff" /></svg>)}
            <Moon className="keypad-moon" answer={answer ?? { error: 'incomplete' }} />
          </>}
          <FitExpr className="keypad-expr" text={formatExpr(expr)} />
          {/* 入れられない理由は、答えの代わりに、答えの行に出す（行の高さは変えない。下のキーが動かない） */}
          <div className="keypad-answer">{answer?.error ? <span className="keypad-reason">{ERROR_TEXT[answer.error]()}</span> : answerLine(expr, answer)}</div>
        </div>
        <div className="keypad-keys">
          {ROWS.map((row) => row.map(([label, k, kind]) => (
            <button
              key={label}
              type="button"
              className={`key${kind ? ` ${kind}` : ''}`}
              aria-label={k === 'back' ? t('calc.backspace') : k === 'clear' ? t('calc.clear') : undefined}
              onClick={() => key(k)}
            >{k === 'back' ? <Icon name="backspace" /> : label}</button>
          )))}
          <button type="button" className="key cancel" ref={cancelRef} onClick={onClose}>{t('entries.sheetClose')}</button>
          <button type="button" className="key eq" onClick={() => key('=')}>=</button>
          <button type="button" className="key insert" ref={insertRef} disabled={!ok} onClick={() => onInsert(String(answer.rounded))}>{t('calc.insert')}</button>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}

// 答えの表示（式に記号があるか、小数のときだけ。数字だけのときは出さない）：「= 1,538」「= 666.67 → 667」。出せないときは空
const answerText = (expr, answer) =>
  answer && !answer.error && (answer.decimal || hasOperator(expr))
    ? `= ${answer.decimal ? `${formatNumber(answer.value)} → ` : ''}${formatNumber(answer.rounded)}`
    : ''

// キーパッドの答えの行：式に記号があるか小数なら「= 1,538」「= 666.67 → 667」、数字だけなら、その数をそのまま（金額の欄の 835 を持って開いたときも、答えの行に大きく出す）
const answerLine = (expr, answer) => (answer && !answer.error && !answer.decimal && !hasOperator(expr) ? formatNumber(answer.rounded) : answerText(expr, answer))

// 金額の欄。value・onChange(文字)・label（読み上げの名前と、薄い文字）
// スマホの形：欄の右に絵のボタン → キーパッド。PC の形：欄に入ると、欄の下に帯（上の行に式と答え、下の行に電卓の絵のボタン・＋ − × ÷・×1.1・×1.08）。絵のボタンか Alt+↓ で、大きなキーパッド。
// PC の Enter：欄に記号があるときだけ、答えを欄に入れる（送信しない）。記号がなければ、今までどおり（送信）
// focusRequest：増えるたびに、欄へフォーカスを移す（金額が入っていれば全選択）。0 は何もしない。PC の電卓の帯は、打つまで出さない（下の部品を隠さない）
// bare：群青の PC の、仕訳以外の金額の欄（定期支払い・残高調整・開始残高・予算・プリセット）。帯は出さない：式は欄の中にそのまま出し、Enter で結果に置き換える（記号がなければ、今までどおり送信）。
// Alt+↓ で、同じキーパッドが開く。式が読めないとき（途中は除く）は、欄を赤の枠にして、理由を title に出す。placeholder：省略すると label（開始残高のように、科目名を label にして、欄は空にするときは ''）
export function AmountInput({ value, onChange, label, focusRequest = 0, bare = false, placeholder = label }) {
  const phone = usePhone()
  const gunjoPc = useGunjoPc() // 群青の PC の帯には、税率のボタン（×1.1・×1.08）を出さない
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false) // PC：欄（と帯）にフォーカスがあるか
  const [dismissed, setDismissed] = useState(false) // PC：Esc で帯を閉じた（打つ・入り直すと戻る）
  const buttonRef = useRef(null)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const bandRef = useRef(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!focusRequest || !inputRef.current) return
    setDismissed(true)
    inputRef.current.focus()
    if (inputRef.current.value !== '') inputRef.current.select()
  }, [focusRequest])
  // 閉じたあと、フォーカスは、スマホは絵のボタンに（キーボードを出さない）、PC は金額の欄に戻す。キーパッドが消えてから（モーダルの間は、後ろにフォーカスを置けない）
  useEffect(() => {
    if (wasOpen.current && !open) (phone ? buttonRef.current : inputRef.current)?.focus()
    wasOpen.current = open
  }, [open, phone])

  // PC の帯が、画面の右端を越えないようにする（越えるときは、式の前の方を省く）
  useLayoutEffect(() => {
    const band = bandRef.current
    if (band) {
      // 帯の右端の限り：ふつうは画面の右端。群青の PC の入力の札の中では、札の中の右端（札の幅からはみ出して、横スクロールを出さない）
      const card = band.closest('.g-slip-card')
      const right = card ? card.getBoundingClientRect().right - (parseFloat(getComputedStyle(card).paddingRight) || 0) : document.documentElement.clientWidth - 8
      band.style.maxWidth = `${right - wrapRef.current.getBoundingClientRect().left}px`
    }
    if (band?.closest('.g-entries-list, .g-slip-card')) band.scrollIntoView({ block: 'nearest' }) // 群青の PC の仕訳：一覧・札の中でスクロールする領域で、帯が下の端で切れないように
  }, [focused, dismissed, phone, value]) // value：式を打つと帯の上の行が出て高さが変わるので、そのたびに見える位置へ（block: 'nearest' なので、見えているときは動かない）

  const close = () => setOpen(false)
  const keypad = open && <Keypad initial={value} onInsert={(v) => { onChange(v); close() }} onClose={close} />

  if (phone) {
    return (
      <span className="amount-wrap phone">
        <input ref={inputRef} inputMode="numeric" placeholder={label} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="calc-btn" ref={buttonRef} aria-label={t('calc.name')} title={t('calc.name')} onClick={() => setOpen(true)}><Icon name="calc" /></button>
        {keypad}
      </span>
    )
  }

  const expression = hasOperator(value)
  const answer = expression ? answerOf(value) : null
  const text = answerText(value, answer)
  const keyDown = (e) => {
    if (e.key === 'Escape' && focused && !dismissed && !bare) { e.preventDefault(); setDismissed(true); return }
    if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); setOpen(true); return }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && expression) { // 日本語の変換中の Enter（確定）では何もしない
      e.preventDefault()
      setDismissed(false)
      if (!answer.error) onChange(String(answer.rounded))
    }
  }
  const showBand = focused && !dismissed && !bare
  const wrong = bare && expression && answer?.error && answer.error !== 'incomplete' // 式の途中（incomplete）は、打っている最中なので赤にしない
  const hold = (e) => e.preventDefault() // 帯のボタンを押しても、欄からフォーカスを外さない
  const apply = (k) => { setDismissed(false); onChange(press(value, k)); inputRef.current?.focus() }
  return (
    <span
      className={bare ? 'amount-wrap bare' : 'amount-wrap'}
      ref={wrapRef}
      onFocus={(e) => { if (e.currentTarget.contains(e.target)) setFocused(true) }} // キーパッド（portal）の中の動きは、React では欄の子として届くので、DOM で欄の中のものだけ見る
      onBlur={(e) => { if (e.currentTarget.contains(e.target) && !e.currentTarget.contains(e.relatedTarget)) { setFocused(false); setDismissed(false) } }}
    >
      <input ref={inputRef} inputMode="numeric" placeholder={placeholder} aria-label={label} value={value} onChange={(e) => { setDismissed(false); onChange(e.target.value) }} onKeyDown={keyDown} aria-invalid={wrong || undefined} title={wrong ? ERROR_TEXT[answer.error]() : undefined} />
      {showBand && (
        <span className="calc-band" role="group" aria-label={t('calc.name')} ref={bandRef}>
          {/* 上の行：式と答え。式に記号がないときは出さない（欄に打った数字と同じなので）。理由は、答えの代わりにここへ（行の高さは同じ） */}
          <span className="calc-band-line" hidden={!expression}>
            {gunjoPc && expression && <Moon className="calc-band-moon" answer={answer} />}
            <FitExpr className="calc-band-expr" text={expression ? formatExpr(value) : ''} />
            <span className={`calc-band-answer${answer?.error ? ' error' : ''}`} aria-live="polite" title={answer?.error ? ERROR_TEXT[answer.error]() : undefined}>{answer?.error ? ERROR_TEXT[answer.error]() : text}</span>
          </span>
          {/* 下の行：電卓の絵（大きなキーパッドを開く）と、ボタン */}
          <span className="calc-band-tools">
            <button type="button" tabIndex={-1} className="calc-open" aria-label={t('calc.name')} title={t('calc.name')} onMouseDown={hold} onClick={() => setOpen(true)}><Icon name="calc" /></button>
            {OPS.map(([label, k]) => <button key={k} type="button" tabIndex={-1} className="op" onMouseDown={hold} onClick={() => apply(k)}>{label}</button>)}
            {!gunjoPc && <button type="button" tabIndex={-1} onMouseDown={hold} onClick={() => apply('*1.1')}>×1.1</button>}
            {!gunjoPc && <button type="button" tabIndex={-1} onMouseDown={hold} onClick={() => apply('*1.08')}>×1.08</button>}
          </span>
        </span>
      )}
      {keypad}
    </span>
  )
}
