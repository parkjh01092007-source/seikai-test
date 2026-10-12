import { createContext, useContext, useEffect, useRef, useState } from 'react'
import './confirm.css'
import { t } from '../text.js'

// 確認画面。画面は const confirm = useConfirm() で受け取り、if (!(await confirm({ message }))) return のように使う（true＝はい、false＝いいえ）。
// options：message（改行はそのまま出す）、yesLabel / noLabel（省略時は辞書の confirm.yes / confirm.no）、requireText（打たせる文字。null ならふつうの確認）、
// extra（本文の下に出す部品。中のボタンは type="button" にする。押しても確認画面は閉じず、答えも返さない）
// Provider がないときの既定は「いいえ」（何も起きない）
export const ConfirmContext = createContext(() => Promise.resolve(false))
export const useConfirm = () => useContext(ConfirmContext)

// 画面に出す確認画面。request は confirm() に渡された options、onAnswer(true | false) で答える。標準の <dialog>（モーダル）を使う：
// 外を押しても閉じない。後ろの画面は押せない。Esc は「いいえ」と同じ。開いたとき、ふつうは「いいえ」、打たせる確認は入力欄にフォーカスし、閉じると元の場所に戻す
export function ConfirmDialog({ request, onAnswer }) {
  const dialogRef = useRef(null)
  const noRef = useRef(null)
  const inputRef = useRef(null)
  const [typed, setTyped] = useState('')
  const { message, yesLabel = t('confirm.yes'), noLabel = t('confirm.no'), requireText = null, extra = null } = request
  const matched = requireText === null || typed.trim() === requireText // 前後の空白だけ取り除く。ほかは完全一致

  useEffect(() => {
    const before = document.activeElement
    dialogRef.current.showModal()
    ;(inputRef.current ?? noRef.current).focus()
    return () => { if (before instanceof HTMLElement && before.isConnected) before.focus() }
  }, [])

  const submit = (e) => {
    e.preventDefault()
    if (matched) onAnswer(true)
  }

  return (
    <dialog ref={dialogRef} className="confirm" onCancel={(e) => { e.preventDefault(); onAnswer(false) }}>
      <form onSubmit={submit}>
        <p className="message">{message}</p>
        {extra && <div className="extra">{extra}</div>}
        {requireText !== null && (
          <label className="typed">
            {t('confirm.typePrompt')}「{requireText}」
            <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
        )}
        <div className="actions">
          <button type="submit" disabled={!matched}>{yesLabel}</button>
          <button type="button" ref={noRef} onClick={() => onAnswer(false)}>{noLabel}</button>
        </div>
      </form>
    </dialog>
  )
}
