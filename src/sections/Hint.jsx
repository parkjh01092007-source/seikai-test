import { useLayoutEffect, useRef, useState } from 'react'
import { t } from '../text.js'

// 元帳（群青の PC）のヒントのページ札（区切り16-2a）。科目を選ぶ前だけ出す。出し方：初めはランダムで 1 本、「次のヒント」で順に回る
// 飾りなので、画面の高さが足りないとき（直前の札の下に収まらないとき）は、いちばん先に隠す（区切り16-2b）
const HINTS = [
  ['hint.title1', 'hint.body1', 'hint.where1'],
  ['hint.title2', 'hint.body2', 'hint.where2'],
  ['hint.title3', 'hint.body3', 'hint.where3'],
  ['hint.title4', 'hint.body4', 'hint.where4'],
  ['hint.title5', 'hint.body5', 'hint.where5'],
  ['hint.title6', 'hint.body6', 'hint.where6'],
  ['hint.title7', 'hint.body7', 'hint.where7'],
  ['hint.title8', 'hint.body8', 'hint.where8'],
]
const COUNT = HINTS.length
const BELOW = 26 // 札の上の余白
const NOTE = 56 // 札の下の注意書きと余白

export default function Hint() {
  const [i, setI] = useState(() => Math.floor(Math.random() * COUNT))
  const [off, setOff] = useState(false)
  const [title, body, where] = HINTS[i]
  const el = useRef(null)
  const tall = useRef(0) // 見えたときの高さの最大（隠れているあいだも、これで収まるかを調べる）

  useLayoutEffect(() => {
    const me = el.current
    const card = me.previousElementSibling // 直前の選ぶ札
    const fit = () => {
      if (me.offsetHeight > 0) tall.current = Math.max(tall.current, me.offsetHeight)
      const bottom = card.getBoundingClientRect().bottom + window.scrollY
      setOff(bottom + BELOW + tall.current + NOTE > window.innerHeight)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(card)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [i])

  return (
    <section className={`g-hint${off ? ' off' : ''}`} ref={el} aria-label={t('hint.label')}>
      <div className="pg"><i />{t('hint.label')}</div>
      <h3>{t(title)}</h3>
      <p aria-live="polite">{t(body)}</p>
      <div className="ft">
        <span className="wh">{t('hint.where')}<b>{t(where)}</b></span>
        <button type="button" className="nx" onClick={() => setI((i + 1) % COUNT)}>{t('hint.next')} ›</button>
        <span className="no">{i + 1} / {COUNT}</span>
      </div>
      <span className="curl" aria-hidden="true" />
    </section>
  )
}
