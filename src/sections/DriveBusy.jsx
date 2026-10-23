import { useEffect, useRef, useState } from 'react'
import './drivebusy.css'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { BUSY_EVENT, getBusy } from '../driveStore.js'

// ドライブと通信している間の表示（⑫）。数えるのは driveStore.js の call()。
// スマホ：人が押した操作（セーブ・ロード・控え・競合解決）のときだけ、画面全体の薄い幕（操作をふさぐ）＋四角が跳ねる絵＋LOADING。同期・オートセーブは出さない（右下は「＋」があるため）。
// PC：同期も含めて、右下に小さく LOADING と点の点滅（操作はふさがない）。
// 出すのは 0.6 秒を超えたとき、出したら最低 0.5 秒は残す（短い通信でチカチカさせない）。popover="manual" で最前面の層に出すので、確認画面（<dialog>）の上にも出る。
// 見える文字は英語の LOADING 固定（aria-hidden）。読み上げは、見えない文字 drive.busy
const SHOW_AFTER = 600
const SHOW_MIN = 500
// 群青の PC：点の点滅のかわりに、小さな月の満ち欠け（8 段階・0.2 秒ごと・一周 1.6 秒）。新月→右から満ちる→満月→左から欠ける→新月
const MOON_STEPS = 8
const MOON_MS = 200
function moonPath(i) {
  const c = 9, r = 7.5, p = i / MOON_STEPS, f = (1 - Math.cos(2 * Math.PI * p)) / 2, right = p < 0.5
  if (f < 0.005) return null
  if (f > 0.995) return <circle className="lit" cx={c} cy={c} r={r} />
  const k = (Math.abs(2 * f - 1) * r).toFixed(2)
  return <path className="lit" d={`M${c} ${c - r}A${r} ${r} 0 0 ${right ? 1 : 0} ${c} ${c + r}A${k} ${r} 0 0 ${(f > 0.5) === right ? 1 : 0} ${c} ${c - r}Z`} />
}

export default function DriveBusy() {
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const [step, setStep] = useState(0) // 群青の PC：月のコマ
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches // 動きを止める設定：月は出さず、文字だけ
  const ref = useRef(null)
  const [want, setWant] = useState(null) // 今出したい形：'curtain'・'corner'・null
  const [now, setNow] = useState(false) // 人が押した操作の最中（待たずに、すぐ出す）
  const [shown, setShown] = useState(null) // 実際に出している形
  const since = useRef(0)

  useEffect(() => {
    const read = () => {
      const b = getBusy()
      setWant(phone ? (b.manual + b.op > 0 ? 'curtain' : null) : (b.manual + b.sync + b.op > 0 ? 'corner' : null))
      setNow(b.op > 0)
    }
    read()
    window.addEventListener(BUSY_EVENT, read)
    return () => window.removeEventListener(BUSY_EVENT, read)
  }, [phone])

  useEffect(() => {
    if (want === shown) return
    if (want) {
      const id = setTimeout(() => { since.current = Date.now(); setShown(want) }, shown || now ? 0 : SHOW_AFTER)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setShown(null), Math.max(0, SHOW_MIN - (Date.now() - since.current)))
    return () => clearTimeout(id)
  }, [want, shown, now])

  // 群青の PC の月：出ている間だけコマを進める。動きを止める設定のときは、進めない（CSS でも月ごと隠す）
  useEffect(() => {
    if (!gunjoPc || still || shown !== 'corner') return
    setStep(0)
    const id = setInterval(() => setStep((n) => (n + 1) % MOON_STEPS), MOON_MS)
    return () => clearInterval(id)
  }, [gunjoPc, still, shown])

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
        {shown === 'corner' && gunjoPc && !still ? <svg className="db-moon" width="18" height="18" viewBox="0 0 18 18" data-step={step}><circle className="ring" cx="9" cy="9" r="7.5" />{moonPath(step)}</svg> : null}
        <span className="db-text">LOADING</span>
        {shown === 'corner' && !gunjoPc ? <span className="db-dots"><i /><i /><i /></span> : null}
      </span>
    </div>
  )
}
