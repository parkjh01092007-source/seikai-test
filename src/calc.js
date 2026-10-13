// 金額の電卓（spec-ledger.md 5.16）の純関数。式を読んで計算する（eval・Function など、文字をそのまま動かす仕組みは使わない）。React・ブラウザを読み込まない。
// 式の中の形：半角の数字・.・+ - * /・( )。画面に出すときは formatExpr で、カンマと × ÷ − にする

// 全角（ＮＦＫＣ で半角になる）・× ÷ − を半角の記号に。空白とカンマは消す
export const normalize = (text) => String(text ?? '').normalize('NFKC').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/[\s,]/g, '')

// 記号があるか（PC の Enter で計算するか。記号がなければ、今までどおり送信する）
export const isExpression = (text) => /[-+*/()]/.test(normalize(text))

// 式の値（小数のまま）か { error }。× ÷ を ＋ − より先に、同じ強さは左から。error：incomplete（途中）・invalid（読めない）・divZero（0 で割った）
function calculate(text) {
  const tokens = [...normalize(text).matchAll(/\d*\.\d*|\d+|./g)].map((m) => m[0])
  let i = 0
  const fail = (error) => { throw { error } }
  const factor = () => {
    const tk = tokens[i++]
    if (tk === undefined) fail('incomplete')
    if (tk === '(') {
      const v = sum()
      if (tokens[i] === undefined) fail('incomplete')
      if (tokens[i++] !== ')') fail('invalid')
      return v
    }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(tk)) fail('invalid')
    return Number(tk)
  }
  const product = () => {
    let v = factor()
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++]
      const r = factor()
      if (op === '/' && r === 0) fail('divZero')
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const sum = () => {
    let v = product()
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++]
      const r = product()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  try {
    const value = sum()
    if (i < tokens.length) fail('invalid') // 余った「)」や、数のあとの数
    return { value: Number(value.toFixed(9)) } // 浮動小数の誤差を消す（1.15×10 が 11.4999… になるのを 11.5 に）
  } catch (e) {
    if (e?.error) return e
    throw e
  }
}

// 金額の欄に入れる答え：{ value（小数のまま）, rounded（四捨五入した整数）, decimal（小数があるか） } か { error }。
// 1 より小さいかは、入れる値（四捨五入したあと）で決める（parseAmount の「1 以上」と同じ）。error：上の3つと tooSmall・tooLarge
export function answerOf(text) {
  const r = calculate(text)
  if (r.error) return r
  const rounded = Math.round(r.value)
  if (rounded < 1) return { error: 'tooSmall', value: r.value }
  if (!Number.isSafeInteger(rounded)) return { error: 'tooLarge', value: r.value }
  return { value: r.value, rounded, decimal: !Number.isInteger(r.value) }
}

const hasOuterAddSub = (expr) => {
  let depth = 0
  for (const c of expr) {
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && (c === '+' || c === '-')) return true
  }
  return false
}

// キーパッドのキーを押したあとの式。key：'0'〜'9'・'00'・'.'・'+'・'-'・'*'・'/'・'back'（1文字消す）・'clear'（全部消す）・'*1.1'・'*1.08'・'='
export function press(text, key) {
  const expr = normalize(text)
  const num = /[\d.]*$/.exec(expr)[0] // 今打っている数
  if (key === 'clear') return ''
  if (key === 'back') return expr.slice(0, -1)
  if (/^\d$/.test(key)) return num === '0' ? expr.slice(0, -1) + key : expr + key
  if (key === '00') return num === '' ? expr + '0' : num === '0' ? expr : expr + '00'
  if (key === '.') return num.includes('.') ? expr : expr + (num === '' ? '0.' : '.')
  if (['+', '-', '*', '/'].includes(key)) {
    if (expr === '') return expr
    return /[-+*/]$/.test(expr) ? expr.slice(0, -1) + key : expr + key // 記号が続いたら、置きかえる（押し間違いの直し）
  }
  const r = calculate(expr)
  if (key === '*1.1' || key === '*1.08') {
    if (r.error) return expr
    return hasOuterAddSub(expr) ? `(${expr})${key}` : expr + key // 足し算の式には、合計に掛ける
  }
  if (key === '=') return r.error || r.value < 0 ? expr : String(r.value) // マイナスの値は式に書けない（先頭が記号）ので、変えない
  return expr
}

const withCommas = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' }

// 画面に出す式：数にカンマ、記号は × ÷ −、記号の前後に空白（例：1200+340*1.1 → 1,200 + 340 × 1.1）
export const formatExpr = (text) =>
  normalize(text)
    .replace(/\d+/g, (m, at, s) => (s[at - 1] === '.' ? m : withCommas(m))) // 小数の部分にはカンマを付けない
    .replace(/[-+*/]/g, (op) => ` ${SYMBOLS[op]} `)
    .trim()

// 答えの数：カンマつき、小数は第2位まで（666.666… → 666.67、1357.4 → 1,357.4）
export const formatNumber = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
