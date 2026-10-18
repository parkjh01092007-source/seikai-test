
// 群青の PC の帯（spec-design.md 9.1・作業19(d)。見本：design-ref/gunjo-pc の各画面の上）。群青かつ PC のときだけ、App が描く。
// 上：ページ名のマス（見出しだけ。1文字ずつ 56px の四角。5文字まで）と英字。下：画面の要点（画面が hostRef の場所へ入れる）。右の端は 14° の斜め。
// kind：'S'（高さ 172px。月の道なし）。'L' は、月の道つき（仕訳・残高・月次。区切り10〜）
// マスの文字は、空白を除いた字。6字以上（韓国語の長い名前）は、小さいマスにする
export default function PageBand({ name, en, kind = 'S', hostRef, topRef }) {
  const main = /^(.*?)\s*\(.*\)$/.exec(name)?.[1] ?? name // 韓国語の「정해(正解)」は、かっこの前だけをマスにする（aria-label は全部）
  const chars = [...main.replace(/\s/g, '')]
  return (
    <div className={`g-band ${kind}`}>
      <div className="g-accent" aria-hidden="true" />
      <div className="g-top">
        <h1 className={`g-masu${chars.length > 5 ? ' long' : ''}`} aria-label={name}>
          {chars.map((c, i) => <span key={i} aria-hidden="true">{c}</span>)}
        </h1>
        {en && <span className="g-en" lang="en">{en}</span>}
      </div>
      <div className="g-top-extra" ref={topRef} />
      <div className="g-hero" ref={hostRef} />
    </div>
  )
}

// 帯の中の数字：マイナスは、青い地の上で赤が読めないので、赤にせず白のまま「−」を付ける（design-ref/gunjo-pc/E-rules.html 10章）
export const signedYen = (n, format) => `${n < 0 ? '−' : ''}${format(Math.abs(n))}`

// 帯の中の要点1つ（ラベルと数字）。PageBand の hostRef の場所へ、画面が入れる
export function BandStat({ label, value, unit = '' }) {
  return (
    <div className="g-stat">
      <div className="g-stat-lab">{label}</div>
      <div className="g-stat-num">{value}{unit && <span className="g-stat-unit">{unit}</span>}</div>
    </div>
  )
}
