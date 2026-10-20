import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './calc.css'
import { Icon } from './Icon.jsx'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
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
      className="keypad"
      aria-label={t('calc.name')}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === dialogRef.current) onClose() }} // 外（幕）を押したとき
      onKeyDown={keyDown}
    >
      <div className="keypad-body">
        <div className="keypad-display" aria-live="polite">
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
export function AmountInput({ value, onChange, label }) {
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false) // PC：欄（と帯）にフォーカスがあるか
  const [dismissed, setDismissed] = useState(false) // PC：Esc で帯を閉じた（打つ・入り直すと戻る）
  const buttonRef = useRef(null)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const bandRef = useRef(null)
  const wasOpen = useRef(false)
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
  }, [focused, dismissed, phone])

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
    if (e.key === 'Escape' && focused && !dismissed) { e.preventDefault(); setDismissed(true); return }
    if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); setOpen(true); return }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && expression) { // 日本語の変換中の Enter（確定）では何もしない
      e.preventDefault()
      setDismissed(false)
      if (!answer.error) onChange(String(answer.rounded))
    }
  }
  const showBand = focused && !dismissed
  const hold = (e) => e.preventDefault() // 帯のボタンを押しても、欄からフォーカスを外さない
  const apply = (k) => { setDismissed(false); onChange(press(value, k)); inputRef.current?.focus() }
  return (
    <span
      className="amount-wrap"
      ref={wrapRef}
      onFocus={(e) => { if (e.currentTarget.contains(e.target)) setFocused(true) }} // キーパッド（portal）の中の動きは、React では欄の子として届くので、DOM で欄の中のものだけ見る
      onBlur={(e) => { if (e.currentTarget.contains(e.target) && !e.currentTarget.contains(e.relatedTarget)) { setFocused(false); setDismissed(false) } }}
    >
      <input ref={inputRef} inputMode="numeric" placeholder={label} aria-label={label} value={value} onChange={(e) => { setDismissed(false); onChange(e.target.value) }} onKeyDown={keyDown} />
      {showBand && (
        <span className="calc-band" role="group" aria-label={t('calc.name')} ref={bandRef}>
          {/* 上の行：式と答え。式に記号がないときは出さない（欄に打った数字と同じなので）。理由は、答えの代わりにここへ（行の高さは同じ） */}
          <span className="calc-band-line" hidden={!expression}>
            <FitExpr className="calc-band-expr" text={expression ? formatExpr(value) : ''} />
            <span className={`calc-band-answer${answer?.error ? ' error' : ''}`} aria-live="polite" title={answer?.error ? ERROR_TEXT[answer.error]() : undefined}>{answer?.error ? ERROR_TEXT[answer.error]() : text}</span>
          </span>
          {/* 下の行：電卓の絵（大きなキーパッドを開く）と、ボタン */}
          <span className="calc-band-tools">
            <button type="button" tabIndex={-1} className="calc-open" aria-label={t('calc.name')} title={t('calc.name')} onMouseDown={hold} onClick={() => setOpen(true)}><Icon name="calc" /></button>
            {OPS.map(([label, k]) => <button key={k} type="button" tabIndex={-1} className="op" onMouseDown={hold} onClick={() => apply(k)}>{label}</button>)}
            <button type="button" tabIndex={-1} onMouseDown={hold} onClick={() => apply('*1.1')}>×1.1</button>
            <button type="button" tabIndex={-1} onMouseDown={hold} onClick={() => apply('*1.08')}>×1.08</button>
          </span>
        </span>
      )}
      {keypad}
    </span>
  )
}
