// 群青の PC の共通の部品（区切り17。定期支払い・クレカ・貯蓄の見本が使う。まだどの画面にも入れていない。CSS は gunjo-pc.css の末尾の節）。
// 文字は持たない（辞書の文は呼ぶ側が渡す）。計算は src/flowArt.js
const R = 8 // 玉の半径（viewBox は -10〜10）

// 月の玉の 1 つ。state：done（満）／wait（輪＋欠け：今月でまだ来ていない）／before（点線：登録より前）／skip（小さな点：使わない間）
export function Moon({ state }) {
  if (state === 'done') return <circle className="full" r={R} />
  if (state === 'wait') return <><circle className="ring" r={R} /><path className="lit" d={`M0,${-R}A${R},${R} 0 0 1 0,${R}A${R * 0.4},${R} 0 0 0 0,${-R}Z`} /></>
  if (state === 'before') return <circle className="dash" r={R} />
  return <circle className="dot" r="2.5" />
}

// 月の玉の列。moons は flowArt.js の subscriptionMoons の結果（{ month: 'YYYY-MM', state }）。current は今月（'YYYY-MM'）。label は玉の説明を読み上げる文（任意）
export function MoonRow({ moons, current, label }) {
  return (
    <div className="g-moons" role="img" aria-label={label}>
      {moons.map((m) => (
        <span key={m.month} className={`m${m.month === current ? ' now' : ''}`}>
          <svg viewBox="-10 -10 20 20" aria-hidden="true"><Moon state={m.state} /></svg>
          {Number(m.month.slice(5))}
        </span>
      ))}
    </div>
  )
}

// 状態の札。tone：up（緑＝増える）／down（赤＝減る）／live（青＝進行中）／solid（青の塗り）／なし（無色＝中立）。色だけに頼らないので、必ず字を入れる
export function StateTag({ tone, children }) {
  return <span className={`g-tag${tone ? ` is-${tone}` : ''}`}>{children}</span>
}

// 履歴の行（g-hist の表の 1 行）。date・cells（左から並べる中身）・amount（金額の字）・after（そのあとの額の字）。tone は金額の色（up／down）。open は未確定の行
export function HistRow({ date, cells = [], tag, amount, tone, after, open }) {
  return (
    <tr className={open ? 'open' : undefined}>
      <td className="d">{date}</td>
      {cells.map((c, i) => <td key={i}>{c}</td>)}
      {tag !== undefined && <td>{tag}</td>}
      <td className={`n${tone ? ` is-${tone}` : ''}`}>{amount}</td>
      {after !== undefined && <td className="n">{after}</td>}
    </tr>
  )
}

// 空の状態の札（罫線の紙）。title と本文（children）は呼ぶ側が渡す。0 件・記録なしのときに、次に何をするかを一言で
export function EmptyCard({ title, children }) {
  return <div className="g-empty">{title && <b>{title}</b>}{children}</div>
}
