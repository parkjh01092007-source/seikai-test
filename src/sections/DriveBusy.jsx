import { useEffect, useRef, useState } from 'react'
import './drivebusy.css'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { BUSY_EVENT, getBusy } from '../driveStore.js'

// ドライブと通信している間の表示（⑫）。数えるのは driveStore.js の call()。
// スマホ：人が押した操作（セーブ・ロード・控え・競合解決）のときだけ、画面全体の薄い幕（操作をふさぐ）＋四角が跳ねる絵＋LOADING。同期・オートセーブは出さない（右下は「＋」があるため）。
// PC：同期も含めて、右下に小さく LOADING と点の点滅（操作はふさがない）。
// 出すのは 0.6 秒を超えたとき、出したら最低 0.5 秒は残す（短い通信でチカチカさせない）。popover="manual" で最前面の層に出すので、確認画面（<dialog>）の上にも出る。
// 見える文字は英語の LOADING 固定（aria-hidden）。読み上げは、見えない文字 drive.busy
const SHOW_AFTER = 600
const SHOW_MIN = 500

export default function DriveBusy() {
  const phone = usePhone()
  const ref = useRef(null)
  const [want, setWant] = useState(null) // 今出したい形：'curtain'・'corner'・null
  const [shown, setShown] = useState(null) // 実際に出している形
  const since = useRef(0)

  useEffect(() => {
    const read = () => {
      const b = getBusy()
      setWant(phone ? (b.manual > 0 ? 'curtain' : null) : (b.manual + b.sync > 0 ? 'corner' : null))
    }
    read()
    window.addEventListener(BUSY_EVENT, read)
    return () => window.removeEventListener(BUSY_EVENT, read)
  }, [phone])

  useEffect(() => {
    if (want === shown) return
    if (want) {
      const id = setTimeout(() => { since.current = Date.now(); setShown(want) }, shown ? 0 : SHOW_AFTER)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setShown(null), Math.max(0, SHOW_MIN - (Date.now() - since.current)))
    return () => clearTimeout(id)
  }, [want, shown])

  // 最前面の層に出し入れする。あとから開いた確認画面の下にならないよう、通信の数が変わるたびに出し直す（確認画面が開いているときだけ）
  useEffect(() => {
    const el = ref.current
    if (!shown || !el?.showPopover) return
    try {
      if (!el.matches(':popover-open')) el.showPopover()
      else if (document.querySelector('dialog[open]')) { el.hidePopover(); el.showPopover() }
    } catch { /* 出せなくても、通信そのものには影響しない */ }
  }, [shown, want])

  // 幕のあいだ、開いている確認画面（<dialog>）も操作できなくする。確認画面が開いているとき、その外にある幕は、ブラウザの決まりで操作を受けられないため（幕の下に確認画面の操作が残ってしまう）。幕が消えたら、元に戻して、フォーカスも戻す
  useEffect(() => {
    if (shown !== 'curtain') return
    const dialogs = [...document.querySelectorAll('dialog[open]')]
    const focused = document.activeElement
    for (const d of dialogs) d.inert = true
    return () => {
      for (const d of dialogs) d.inert = false
      if (focused?.isConnected) focused.focus({ preventScroll: true })
    }
  }, [shown])

  if (!shown) return null // ふだんは何も描かない（ふだんの画面の DOM は、今までと同じ）
  return (
    <div ref={ref} popover="manual" className={`drive-busy ${shown}`} role="status">
      <span className="sr-only">{t('drive.busy')}</span>
      <span className="db-box" aria-hidden="true">
        {shown === 'curtain' ? <span className="db-hop"><i /><i /><i /></span> : null}
        <span className="db-text">LOADING</span>
        {shown === 'corner' ? <span className="db-dots"><i /><i /><i /></span> : null}
      </span>
    </div>
  )
}
