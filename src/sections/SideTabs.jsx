import { useState, useEffect, useRef } from 'react'
import '../nav.css'
import { t } from '../text.js'
import { HOME, toHash } from '../route.js'
import { usePhone } from '../layout.js'
import { useGunjoPc, useCanPin } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { useModalLayer } from '../modalLayer.js'
import { lastSaveLine } from './lastSave.js'
import { Icon } from './Icon.jsx'

// 縦タブ（spec-design.md 第4章、spec-ui.md 第2章、spec-mobile.md 第4章）。上に「正解」と「最後のセーブ」、下に「セーブ」「ロード」「ホームへ」を横に並べる。
// スマホの形かどうかは layout.js（幅 960px 未満、または指だけで操作する機械）。
// スマホでは、縦タブは画面の上の細い帯になる：☰、今の画面の名前、知らせ（notice。「オートセーブできません」）。中身は横幅を全部使う。
// PC（960px 以上）：畳んだ状態は ☰ だけ。☰ にマウスを乗せると開く（帯のほかの場所では開かない）。開いたあとは、パネル全体（☰ の位置も含む）の中にある間は開いたまま、
// 外へ出ると畳む。☰ を押すと開いたまま固定（もう一度で解除）。固定したかどうかは覚えない。
// キーボードで移動したとき（:focus-visible）も開く。マウスで押したあとのフォーカスでは開かない（離せば畳む）。移動は a（# の移動）
// スマホ：☰ を押すと、中身の上に重なって開く。☰・外側・Esc・タブを選ぶ、で閉じる。開いている間は、後ろの画面をスクロールさせず、
// Tab はメニューの中（☰ を含む）だけを回る（ほかの部分は inert）。
// 共通：☰ を押して開いたら、最初のタブにフォーカスを移す。Esc で閉じたら ☰ に戻す。幅が境目をまたいだら、閉じた状態に戻す
// 「正解」の円の中の文字（群青の PC）。韓国語の「정해(正解)」は、かっこの前と後ろを2行に分ける（日本語の「正解」は分けない）
const markParts = (text) => { const m = /^(.*?)\s*(\(.*\))$/.exec(text); return m ? [m[1], m[2]] : [text, ''] }
function Mark({ text }) {
  const [main, sub] = markParts(text)
  return <><span className="mk-main">{main}</span>{sub && <span className="mk-sub">{sub}</span>}</>
}
export default function SideTabs({ entry, currentTab, onOpenPanel, notices = [] }) {
  const phone = usePhone()
  const gunjoPc = useGunjoPc() // 群青の PC のときだけ描く部品（閉じた形の「正解」の円、見出しの英字）
  const basicPc = useBasicPc() // 基本の PC は、縦タブをいつも開いておく（basic-pc.css）
  const canPin = useCanPin() // 群青の PC は、幅 1100px 未満では固定しない（☰ は乗せる・Tab で開くだけ）
  const [pinned, setPinned] = useState(false)
  const [hover, setHover] = useState(false)
  const [kbFocus, setKbFocus] = useState(false)
  const [phoneOpen, setPhoneOpen] = useState(false)
  const [noticesOpen, setNoticesOpen] = useState(false) // スマホの帯の「⚠ 件数」を押して開く、知らせの一覧
  const [lastSave, setLastSave] = useState(null) // 「最後のセーブ：…」。対応していないブラウザでは null（出さない）
  const asideRef = useRef(null)
  const toggleRef = useRef(null)
  const focusFirst = useRef(false) // ☰ を押して開いたとき、最初のタブへフォーカスを移す印
  const open = phone ? phoneOpen : basicPc || pinned || hover || kbFocus
  useEffect(() => { if (!canPin) setPinned(false) }, [canPin]) // 固定していて、幅が 1100px 未満になったら外す

  // 幅が境目をまたいだら、閉じた状態に戻す
  useEffect(() => {
    setPinned(false)
    setHover(false)
    setKbFocus(false)
    setPhoneOpen(false)
  }, [phone])

  // 開いたら：最後のセーブを読み直す（許可は求めない）。☰ を押して開いたときは、最初のタブにフォーカス
  useEffect(() => {
    if (!open) return
    if (focusFirst.current) asideRef.current?.querySelector('.panel nav a')?.focus()
    focusFirst.current = false
    let alive = true
    lastSaveLine().then((line) => { if (alive) setLastSave(line) })
    return () => { alive = false }
  }, [open])

  // スマホで開いている間：ほかの部分を inert に、後ろのスクロールを止め、Esc で閉じ、Tab をメニューの中で回す。閉じる・幅が変わる・消えるときに戻す（modalLayer.js）。
  // 帯の知らせ（パネルの下に隠れる）は Tab の輪に入れない
  useModalLayer(asideRef, phone && phoneOpen, {
    onEscape: () => {
      setPhoneOpen(false)
      toggleRef.current?.focus()
    },
    focusables: '.toggle, .panel button, .panel a[href]',
    inertSiblings: true,
  })

  // 知らせの一覧：⚠ をもう一度押す・外を押す・Esc・知らせを押す、で閉じる。知らせがなくなったら閉じる
  useEffect(() => {
    if (!noticesOpen) return
    if (notices.length === 0) { setNoticesOpen(false); return }
    const onDown = (e) => { if (!e.target.closest?.('.notices-wrap')) setNoticesOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setNoticesOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [noticesOpen, notices.length])
  useEffect(() => { if (!phone) setNoticesOpen(false) }, [phone])

  const pressToggle = () => {
    if (phone) {
      focusFirst.current = !phoneOpen
      setPhoneOpen((o) => !o)
    } else if (canPin) {
      focusFirst.current = !pinned
      setPinned((p) => !p)
    }
  }
  const closePhone = () => setPhoneOpen(false) // タブを選んだとき・外側を押したとき（PC では何もしない）
  const openPanel = (mode) => {
    setPhoneOpen(false)
    onOpenPanel(mode)
  }
  const entryName = t(entry.label)
  const currentTabLabel = entry.groups.flatMap((g) => g.tabs).find((tb) => tb.id === currentTab)?.label ?? entry.label // 帯に出す今の画面の名前（クレカの個別ページも「クレカ」）

  return (
    <aside
      ref={asideRef}
      className={`sidetabs${pinned ? ' pinned' : ''}${open ? ' open' : ''}${phone && open ? ' overlay' : ''}`}
      onMouseLeave={phone ? undefined : () => setHover(false)} // aside の子孫（☰ とパネル）の外へ出たときだけ発火する
      onFocus={phone ? undefined : (e) => { if (e.target.matches(':focus-visible')) setKbFocus(true) }}
      onBlur={phone ? undefined : (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setKbFocus(false) }}
    >
      {phone && open && <div className="scrim" aria-hidden="true" onClick={closePhone} />}
      <button
        ref={toggleRef}
        type="button"
        className="toggle"
        aria-label={t('nav.menu')}
        title={t('nav.menu')}
        aria-expanded={open}
        aria-pressed={phone || !canPin ? undefined : pinned}
        onMouseEnter={phone ? undefined : () => setHover(true)}
        onClick={pressToggle}
      ><Icon name="menu" /></button>
      {gunjoPc && !open && <a className="strip-mark" href={toHash(HOME)}>{gunjoPc ? <Mark text={t('home.title')} /> : t('home.title')}</a>}
      {phone && <span className="bar-title">{t(currentTabLabel)}</span>}
      {phone && notices.length > 0 && (
        <span className="bar-notice notices-wrap">
          <button type="button" className="notices-toggle" aria-expanded={noticesOpen} aria-label={t('notices.label', { count: notices.length })} onClick={() => setNoticesOpen((o) => !o)}><Icon name="warning" />{notices.length}</button>
          {noticesOpen && (
            <ul className="notices-list" aria-label={t('notices.title')}>
              {notices.map((n) => <li key={n.key}><button type="button" className="notice-row" title={n.title} onClick={() => { setNoticesOpen(false); n.onPress() }}>{n.text}</button></li>)}
            </ul>
          )}
        </span>
      )}
      {open && (
        <div className="panel" {...(phone ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': entryName } : {})}>
          <div className="menu-head">
            <a className="menu-title" href={toHash(HOME)} onClick={closePhone}>{gunjoPc ? <Mark text={t('home.title')} /> : t('home.title')}</a>
            {basicPc && <span className="b-entry">{entryName}</span>}
            {lastSave && !basicPc && <span className="menu-last">{gunjoPc ? lastSave.split(/(?<=[\uFF1A:])/).flatMap((part, i) => (i ? [<br key="br" />, part] : [part])) : lastSave}</span>}
          </div>
          <nav aria-label={entryName}>
            {entry.groups.map((g) => (
              <section key={g.label}>
                <h3>{t(g.label)}{gunjoPc && <span className="en" lang="en">{t(g.en)}</span>}</h3>
                <ul>
                  {g.tabs.map((tb) => (
                    <li key={tb.id}>
                      <a href={toHash({ entry: entry.id, tab: tb.id, detailId: null })} aria-current={tb.id === currentTab ? 'page' : undefined} onClick={closePhone}>{t(tb.label)}{basicPc && tb.id === currentTab && <small className="b-current">{t('nav.current')}</small>}</a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </nav>
          {basicPc && lastSave && <span className="menu-last">{lastSave}</span>}
          <div className="bottom">
            <button type="button" onClick={() => openPanel('save')}><Icon name="save" />{t('save.title')}</button>
            <button type="button" onClick={() => openPanel('load')}><Icon name="load" />{t('save.load')}</button>
            <a href={toHash(HOME)} onClick={closePhone}>{t('nav.toHome')}</a>
          </div>
        </div>
      )}
    </aside>
  )
}
