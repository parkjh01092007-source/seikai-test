import { useState, useEffect, useRef, useCallback } from 'react'
import { screens } from './sections.js'
import { NAV } from './nav.js'
import { t, getLanguage, setLanguage } from './text.js'
import { parseHash, toHash } from './route.js'
import { cardAccounts } from './ledgerLogic.js'
import { DEFAULT_TAB, SETTINGS_GROUPS } from './settingsSections.js'
import { getReturnTab, startLogin, modalOpen } from './driveStore.js'
import { useDriveSync } from './useDriveSync.js'
import Home from './sections/Home.jsx'
import SideTabs from './sections/SideTabs.jsx'
import PageBand from './sections/PageBand.jsx'
import { BandHostContext, BandTopContext, BandRoadContext } from './sections/bandHost.js'

// 群青の PC のホームの帯（メニューはホームでは出さない）
const HOME_BAND = { label: 'home.title', en: 'home.titleEn', band: 'S' }
import { useGunjoPc } from './gunjoPc.js'
import { ConfirmContext, ConfirmDialog } from './sections/ConfirmDialog.jsx'
import SaveLoadPanel from './sections/SaveLoadPanel.jsx'
import ConflictDialog from './sections/ConflictDialog.jsx'
import DriveBusy from './sections/DriveBusy.jsx'
import './nav.css'
import { loadData, saveData, exportJson, parseImport, needsMigration, isNewerData, migrate, autoRecord } from './storage.js'
import { checkForNewBuild } from './pwa.js'
import { today, nowLocal } from './today.js'
import { buildConfig, parseConfig, buildSaveFile, autosaveBlocker, storeErrorText, errName } from './saveLogic.js'
import { folderStatus, readConfig, writeConfig, getAutosaveHint, setAutosaveHint } from './saveStore.js'
import { slotStore } from './slotStore.js'

const DRIVE_WAIT_LIMIT = 8000 // ドライブへの直前のオートセーブを、操作が待つ長さ（ミリ秒）。書き込みそのものは、これを過ぎても続く

// アプリを開いたとき：データを読み、移行が要らなければ、定期支払いの自動記入を行って保存する。
// このアプリより新しい版のデータ（isNewerData）は、記入も保存もしない（spec-pwa.md 6章）。
// 最後に記入した月（lastMonth）が保存されるので、何回走っても（StrictMode の2回呼びでも）二重にならない。
function startup() {
  const data = loadData()
  if (needsMigration(data)) return data // 移行のあと（doMigrate）で記入する
  if (isNewerData(data)) return data // 新しい版のデータ：何も書かない
  const r = autoRecord(data, today())
  if (r.added) saveData(r.data)
  return r.data
}

export default function App() {
  const [data, setData] = useState(startup)
  const [hash, setHash] = useState(() => window.location.hash) // 画面は # で決まる（戻る・進む・再読み込みで同じ画面が出る）

  const [error, setError] = useState('')
  const [warning, setWarning] = useState('') // 読み込みで、その項目だけ無視したときの警告（エラーではない）
  const [generation, setGeneration] = useState(0) // 読み込みのたびに増やし、画面の入力状態を作り直す
  const [settingsTab, setSettingsTab] = useState(() => (SETTINGS_GROUPS.some((g) => g.id === getReturnTab()) ? getReturnTab() : DEFAULT_TAB)) // 設定の画面で開いているタブ（Google のログインから戻ったときは、移る前に開いていたタブ。spec-drive.md 12章）（spec-ui.md 4.1）。覚えない（再読み込みで記帳に戻る）。画面の作り直し（言語の変更・読み込みなど）では変わらない。URL（#）にも入れない

  // 言語。変えたら、一番外側の key に言語を入れて、全体を描き直す（前の言語の文字が、計算の結果を覚えている部品に残らないように。入力途中の内容は消える）。
  // setLanguage が、覚える（localStorage の別のキー）のと、html の lang・タブの題を合わせるのも行う。保存データには入れない
  const [language, setLanguageState] = useState(getLanguage)
  const changeLanguage = (next) => {
    setLanguage(next)
    setLanguageState(getLanguage())
    setError('') // 前の言語で出した読み込みのエラー・警告は消す
    setWarning('')
  }

  // アプリ内の確認画面。confirm(options) は Promise で、はい＝true、いいえ＝false。同時に出るのは1つ（新しい確認が来たら、前のは「いいえ」で閉じる）
  const [request, setRequest] = useState(null)
  const resolver = useRef(null)
  const requestId = useRef(0)
  const answer = useCallback((value) => {
    const resolve = resolver.current
    resolver.current = null
    setRequest(null)
    resolve?.(value)
  }, [])
  const confirm = useCallback((options) => new Promise((resolve) => {
    resolver.current?.(false)
    resolver.current = resolve
    requestId.current += 1
    setRequest({ ...options, id: requestId.current })
  }), [])

  // セーブ画面・ロード画面（今の画面の上に重ねて出す）。null / 'save' / 'load'。開くときは、開いている確認画面を「いいえ」で閉じてから開く
  const [panel, setPanel] = useState(null)
  const openPanel = useCallback((mode) => { answer(false); setPanel(mode) }, [answer])

  // オートセーブの ON・OFF（セーブフォルダーの config.json が正。保存データには入れない）。on：今の値（許可がなくて config.json を読めないときは、IndexedDB の控え）、broken：config.json が読めない・形が違う
  const [autosaveState, setAutosaveState] = useState({ on: false, broken: false })
  const onRef = useRef(false) // 書くときに見る「今 ON か」（タイマーや非同期の中から、最新の値を読むため）
  const [problem, setProblem] = useState(null) // オートセーブが書けないときの理由の文（null なら出さない）
  const applyAutosave = useCallback((next) => {
    onRef.current = next.on
    if (!next.on) setProblem(null) // OFF にしたら「オートセーブできません」は消す
    setAutosaveState(next)
  }, [])
  const reloadAutosave = useCallback(async () => {
    let next = { on: false, broken: false }
    try {
      const st = await folderStatus()
      if (st.state === 'granted') {
        const r = parseConfig(await readConfig())
        await setAutosaveHint(r.autosave)
        next = { on: r.autosave, broken: r.broken }
      } else if (st.state !== 'none' && st.state !== 'unsupported') {
        next = { on: (await getAutosaveHint()) === true, broken: false } // 許可がない間は、最後に分かった値
      }
    } catch {
      next = { on: false, broken: true } // config.json が読めない（同じ名前のフォルダなど）
    }
    applyAutosave(next)
  }, [applyAutosave])
  // 切り替え：許可を確かめ（押した処理の中なので求められる）→ config.json に書く → 成功したら状態と控えを変える。失敗は例外のまま呼ぶ側に返す（ON・OFF は変わらない）
  const toggleAutosave = async (on) => {
    const st = await folderStatus({ request: true })
    if (st.state !== 'granted') throw new DOMException('フォルダの使用が許可されていません', 'NotAllowedError')
    await writeConfig(JSON.stringify(buildConfig(on), null, 2))
    await setAutosaveHint(on)
    applyAutosave({ on, broken: false })
  }
  useEffect(() => { reloadAutosave() }, [reloadAutosave])
  const autosave = { ...autosaveState, reload: reloadAutosave, toggle: toggleAutosave }

  // オートセーブの書き込み。データは変えない（書くだけ）。確認画面も出さない。書くのは、そのときの一番新しいデータ（latest）。同じデータをもう書いてあれば、書かない
  // 書き先：ドライブにつないでいるときはドライブ（ふだんの変化では書かず、大きな操作の直前 beforeReplace だけ。ON・OFF に関係なく書く）、つないでいないときはセーブフォルダー（spec-drive.md 13.2）
  const latest = useRef(data)
  const written = useRef(null) // 最後に autosave.json へ書けたデータと書き先：{ data, kind }
  const skip = useRef(data) // 起動時のデータと、置き換えの直後のデータ（update の quiet）は、書かない
  const chain = useRef(Promise.resolve()) // フォルダへの書き込みは、1本のつなぎに並べるので、重ならない
  // ドライブへの書き込み：同期のつなぎ（useDriveSync）には並べず、すぐ始める（同期が触るのは orenoyome-data.json と控えだけで、autosave のファイルとは重ならない）。
  // ドライブへの書き込み同士は、1本のつなぎ（driveWrite）に並べる（続けて2回書くと、同じ名前のファイルが2つできてしまうため）。
  // 書き込みは、書くと決めた時点のデータで、最後まで続ける（操作で手元のデータが置き換わっても、取り消さない）。失敗したときだけ「オートセーブできません」を出す
  const driveWrite = useRef(Promise.resolve())
  const inflight = useRef(null) // 今書いている（または並んでいる）データと、その書き込み：{ data, job }
  const writeDrive = useCallback(async (beforeReplace) => {
    const d = latest.current
    const store = slotStore()
    if (written.current?.data === d && written.current.kind === 'drive') return setProblem(null) // もう書いてある
    const st = await store.status()
    const why = autosaveBlocker({ on: onRef.current, migrating: needsMigration(d) || isNewerData(d), folderState: st.state, drive: true, beforeReplace })
    if (why === 'unavailable') return setProblem(storeErrorText(st.state)) // 電波がない・ログインが切れている
    if (why === 'drive-idle') return // ふだんの変化：書かない。出ている知らせは、そのまま
    if (why) return setProblem(null) // 移行中・新しい版：書かないだけ
    if (inflight.current?.data !== d) {
      const job = driveWrite.current.then(async () => {
        const t0 = Date.now()
        try {
          await store.writeSlot('autosave.json', JSON.stringify(buildSaveFile(d, { kind: 'auto', savedAt: nowLocal(), memo: '' }), null, 2))
          written.current = { data: d, kind: 'drive' }
          setProblem(null)
        } catch (e) {
          setProblem(storeErrorText(errName(e), e.message))
        }
        if (import.meta.env.DEV) console.info(`[autosave] drive write ${Date.now() - t0}ms`)
      })
      driveWrite.current = job
      inflight.current = { data: d, job }
    }
    // 操作を待たせるのは、8秒まで。書き込み自体は続く（終われば、ロード画面のオートセーブに出る）
    await Promise.race([inflight.current.job, new Promise((ok) => setTimeout(ok, DRIVE_WAIT_LIMIT))])
  }, [])
  const writeAutosave = useCallback((beforeReplace = false) => {
    if (slotStore().kind === 'drive') return writeDrive(beforeReplace)
    chain.current = chain.current.then(async () => {
      const d = latest.current
      if (written.current?.data === d && written.current.kind === 'folder') return setProblem(null) // 書くものがない（もう書いてある）
      try {
        const st = await slotStore().status() // 許可は求めない
        const why = autosaveBlocker({ on: onRef.current, migrating: needsMigration(d) || isNewerData(d), folderState: st.state, beforeReplace }) // 新しい版のデータも、移行中と同じく書かない
        if (why === 'permission') return setProblem(storeErrorText('NotAllowedError'))
        if (why) return setProblem(null) // OFF・移行中・フォルダなし・未対応は、書かないだけ（出さない）
        await slotStore().writeSlot('autosave.json', JSON.stringify(buildSaveFile(d, { kind: 'auto', savedAt: nowLocal(), memo: '' }), null, 2))
        written.current = { data: d, kind: 'folder' }
        setProblem(null)
      } catch (e) {
        setProblem(storeErrorText(errName(e), e.message))
      }
    })
    return chain.current
  }, [writeDrive])
  // データを大きく変える操作（読み込み・ロード・全体の初期化・仕訳の一括削除・控えから戻す）の直前に呼ぶ。書けるなら、今のデータを今すぐ書く（2秒待たない）。書けなくても、例外は投げない（操作はそのまま進む）
  const autosaveBeforeReplace = useCallback(() => writeAutosave(true), [writeAutosave])

  // データが変わったら、最後の変化から2秒後に1回だけ書く
  useEffect(() => {
    latest.current = data
    if (data === skip.current) return
    const timer = setTimeout(() => writeAutosave(), 2000)
    return () => clearTimeout(timer)
  }, [data, writeAutosave])

  // 「オートセーブできません」を押したとき：許可を求め、config.json を読み直し、書けていない変化があればすぐ書く
  const retryAutosave = async () => {
    try {
      if (slotStore().kind === 'folder') {
        await folderStatus({ request: true })
        await reloadAutosave()
      }
    } catch { /* 書くときに、もう一度確かめて表示する */ }
    await writeAutosave(slotStore().kind === 'drive') // ドライブ：押したら、書けていない直前の分をやり直す
  }

  useEffect(() => {
    const onHashChange = () => {
      answer(false) // 確認画面が開いたまま画面が移ったら「いいえ」で閉じる（移った先で、前の画面の処理が走らないように）
      setPanel(null) // 画面が移ったら、セーブ画面・ロード画面も閉じる
      setHash(window.location.hash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [answer])

  // データの移行画面が出ているときは、# に関係なく移行画面を出す（古い形のデータなので、# も読まない）。新しい版のデータのときも同じく、# を読まない
  const migrating = needsMigration(data)
  const newer = isNewerData(data)
  const route = migrating || newer ? null : parseHash(hash, cardAccounts(data.accounts).map((a) => a.id))
  const canonical = route ? toHash(route) : null
  // 設定以外の画面へ移ったら、設定のタブは初めの（記帳）に戻す。ほかの画面から設定へのリンク（セーブ画面の「設定へ」）は、移る前に setSettingsTab で開くタブを決める
  const onSettingsScreen = route?.tab === 'settings'
  useEffect(() => { if (!onSettingsScreen) setSettingsTab(DEFAULT_TAB) }, [onSettingsScreen])

  // 知らない # や、存在しないカードの id は、画面を戻すだけでなく、アドレスも正しい形に書き換える（履歴は増やさない）
  useEffect(() => {
    if (canonical !== null && canonical !== hash) {
      window.history.replaceState(null, '', canonical)
      setHash(canonical)
    }
  }, [canonical, hash])

  // 新しい版のお知らせ（spec-pwa.md 5章）：開いたとき・画面に戻ったとき・30分ごとに、公開されている版を確かめる。自動では読み直さない（入力の途中の内容が消えるため）。
  // 出しても、確認画面・セーブ画面・ロード画面・仕訳の編集画面は閉じない（ここではデータも画面も変えない）
  const [newBuild, setNewBuild] = useState(false)
  useEffect(() => {
    let alive = true
    const look = () => { if (document.visibilityState === 'visible') checkForNewBuild().then((yes) => { if (alive && yes) setNewBuild(true) }) }
    look()
    const timer = setInterval(look, 30 * 60 * 1000)
    document.addEventListener('visibilitychange', look)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', look) }
  }, [])
  const reloadApp = () => window.location.reload() // 新しい版で読み直す（データの localStorage はそのまま）

  const doExport = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }))
    a.download = `orenoyome-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}.backup.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const doImport = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // 同じファイルを続けて選べるように
    if (!file) return
    if (!(await confirm({ message: t('app.importConfirm') }))) return
    const r = parseImport(await file.text())
    setWarning('')
    if (r.error) return setError(r.error)
    applyImported(r)
  }

  // 検証と移行を通ったデータ（parseImport の成功の結果 { data, warnings }）で、データ全体を置き換える。読み込みとロードで共通。失敗のときは呼ばない
  // 完全な形のデータに置き換えるので、...data は付けない
  // 置き換える前に、今のデータをオートセーブへ書く（書けるときだけ。書けなくても進む）。置き換えた直後のデータは、オートセーブに書かない（quiet）
  const applyImported = async (r) => {
    await autosaveBeforeReplace()
    setError('')
    setWarning((r.warnings ?? []).join('\n'))
    update(autoRecord(r.data, today()).data, { quiet: true }) // 読み込み直後にも、定期支払いの自動記入を1回行う
    setGeneration((g) => g + 1)
  }

  const doMigrate = () => {
    const r = migrate(data)
    if (r.error) return setError(r.error) // 移行画面は残し、データは変えない
    setError('')
    setWarning((r.warnings ?? []).join('\n')) // v5 の設定で、その項目だけ無視したときの警告
    update(autoRecord(r.data, today()).data) // 移行直後にも、定期支払いの自動記入を1回行う
    setGeneration((g) => g + 1)
  }

  // quiet: true は、データ全体を置き換えるとき（直前にオートセーブへ書いてある）。その直後のデータは、オートセーブに書かない。次の変化から、いつもどおり
  const update = (next, { quiet = false } = {}) => {
    if (quiet) skip.current = next
    saveData(next)
    setData(next)
  }

  // データを丸ごと置き換える（全体の初期化）。読み込みのあとと同じに、エラー・警告の表示を消し、画面の入力状態を作り直す。
  // 渡されるのは完全な形のデータ（emptyData()）なので、...data は付けない（付けると古い値が残る）
  // 置き換える前に、今のデータをオートセーブへ書く（applyImported と同じ）
  const replaceData = async (next) => {
    await autosaveBeforeReplace()
    update(next, { quiet: true })
    setError('')
    setWarning('')
    setGeneration((g) => g + 1)
  }

  // Google ドライブの同期（spec-drive.md 4章）。ドライブから下ろしたデータで置き換える（読み込みと同じ検証と移行を通ったもの r）。手元の変更には数えない（driveSkip）。
  // 定期支払いの自動記入は、読み込みと同じく置き換えのあとに1回行う（変更には数えない）。置き換える前の、オートセーブへの書き込みはしない（下ろすたびに、直前の状態を残した autosave が上書きされないため。spec-drive.md 13.2）
  const driveSkip = useRef(data)
  const applyRemote = async (r) => {
    const next = autoRecord(r.data, today()).data
    driveSkip.current = next
    setError('')
    setWarning((r.warnings ?? []).join('\n'))
    update(next, { quiet: true })
    setGeneration((g) => g + 1)
  }
  const driveSync = useDriveSync({ data, skip: driveSkip, apply: applyRemote, restore: applyImported }) // 控えから戻す置き換えは、読み込みと同じ（ふつうの変更として、あとで上がる）
  // 食い違いの確認画面（4.4）：食い違いが見つかったとき、ほかの画面・入力が開いていなければ、自動で開く（そうでなければ、帯を押すと開く）。「あとで決める」で閉じても、帯は残る。解決すると閉じる
  const [conflictOpen, setConflictOpen] = useState(false)
  const gunjoPc = useGunjoPc() // 群青の PC のときだけ、画面の上に帯（PageBand）を描く
  const [bandHost, setBandHost] = useState(null) // 帯の中の、画面の要点を入れる場所
  const [bandTop, setBandTop] = useState(null) // 帯の上の段の、ボタンを入れる場所
  const [bandRoad, setBandRoad] = useState(null) // 帯 L の一番下の、月の道を入れる場所
  const conflictShown = useRef(null)
  const conflictKey = driveSync.conflict ? `${driveSync.conflict.kind}|${driveSync.conflict.theirsRev}` : null
  useEffect(() => {
    if (conflictKey === null) { conflictShown.current = null; setConflictOpen(false); return }
    if (conflictShown.current !== conflictKey) {
      conflictShown.current = conflictKey
      if (!modalOpen()) setConflictOpen(true)
    }
  }, [conflictKey])

  const entry = route && NAV.find((e) => e.id === route.entry)
  const Screen = route && route.tab ? screens[route.tab] : null
  const tabDef = entry && route.tab ? entry.groups.flatMap((g) => g.tabs).find((x) => x.id === route.tab) : null
  const band = gunjoPc && !newer && !migrating ? (tabDef?.band ? tabDef : !entry ? HOME_BAND : null) : null // 帯を出す画面（nav.js の band。ホームも）

  // 知らせ（書けない・つながらない・食い違いなどのとき）。1つの並び（notices）にまとめる：{ key, text, title, onPress }。出し場所（spec-mobile.md 第4章）：
  //   PC は右上の帯に並べる／スマホはメニューのある画面では上の帯の右端に「⚠ 件数」（押すと一覧）／ホーム・移行画面では中身の一番上に1つ1行
  // 「ドライブに保存できません」（4.5）：ログインが切れたときは、押すとログイン（移る前にいた設定のタブを覚える）、つながらないときは、押すとやり直し。食い違いは、押すと確認画面
  const driveText = { login: t('drive.banner.failed'), offline: t('drive.banner.failed'), failed: t('drive.banner.failed'), newer: t('drive.banner.newer'), conflict: t('drive.banner.conflict') }
  const driveTitle = { login: t('drive.bannerTitle.login'), offline: t('drive.bannerTitle.offline'), failed: t('drive.bannerTitle.failed'), newer: t('drive.bannerTitle.newer'), conflict: t('drive.bannerTitle.conflict') }
  const drivePress = () => (driveSync.kind === 'login' ? startLogin(onSettingsScreen ? settingsTab : null) : driveSync.kind === 'newer' ? reloadApp() : driveSync.kind === 'conflict' ? setConflictOpen(true) : driveSync.retry())
  const notices = [
    problem !== null && { key: 'autosave', text: t('save.autosaveFailed'), title: problem, onPress: retryAutosave },
    driveSync.kind && { key: 'drive', text: driveText[driveSync.kind], title: driveTitle[driveSync.kind], onPress: drivePress },
  ].filter(Boolean)
  const notice = notices.length > 0 && <>{notices.map((n) => <button key={n.key} type="button" className="autosave-problem" title={n.title} onClick={n.onPress}>{n.text}</button>)}</>
  const noticeRows = notices.length > 0 && <div className="notice-rows">{notices.map((n) => <button key={n.key} type="button" className="autosave-problem notice-row" title={n.title} onClick={n.onPress}>{n.text}</button>)}</div>
  // 新しい版のお知らせ。PC は右上の帯、スマホは中身の一番上（上の帯のすぐ下。重ねずに流れの中に置くので、入力の欄を隠さない）
  const updateNotice = newBuild && !newer && (
    <div className="update-notice" role="status">
      <span>{t('pwa.updateAvailable')}</span>
      <button type="button" onClick={reloadApp}>{t('pwa.update')}</button>
    </div>
  )

  return (
    <ConfirmContext.Provider value={confirm}>
    <div className="frame" key={language}>
      {entry &&<SideTabs entry={entry} currentTab={route.tab} onOpenPanel={openPanel} notices={notices} />}
      <BandHostContext.Provider value={band ? bandHost : null}>
      <BandTopContext.Provider value={band ? bandTop : null}>
      <BandRoadContext.Provider value={band ? bandRoad : null}>
      <div className={`main-col${band ? ' has-band' : ''}`}>
        {band && <PageBand name={t(band.label)} en={band.en ? t(band.en) : ''} kind={band.band} hostRef={setBandHost} topRef={setBandTop} roadRef={setBandRoad} />}
        {/* 右上の書き出し・読み込みの帯。スマホの形では出さない（同じ機能は 設定 → データ。index.css） */}
        {!newer && <header>
          <div>
            {/* 群青の PC：知らせは、書き出し・読み込みの下に、縦に並べる（月の選びと重ならない。帯 S・L とも同じ場所。gunjo-pc.css の g-notices） */}
            {gunjoPc ? <div className="g-notices">{updateNotice}{notice}</div> : <>{updateNotice}{notice}</>}
            <button onClick={doExport}>{t('app.export')}</button>
            <label>
              <input type="file" accept=".json" onChange={doImport} hidden />
              <span role="button" style={{ border: '1px solid var(--color-muted)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer' }}>{t('app.import')}</span>
            </label>
          </div>
        </header>}
        <div className="content">
          {updateNotice && <div className="phone-only">{updateNotice}</div>}
          {!entry && noticeRows && <div className="phone-only">{noticeRows}</div>}
          {error &&<p style={{ color: 'var(--color-error)' }}>{error}</p>}
          {warning && <p className="warning">{warning}</p>}
          {newer ? (
            <div className="newer-data">
              <p>{t('app.newerData')}</p>
              <button type="button" onClick={reloadApp}>{t('pwa.update')}</button>
            </div>
          ) : migrating ? (
            <div className="migration">
              <p>{t('app.migrationNote')}</p>
              <button onClick={doExport}>{t('app.exportDo')}</button>
              <button onClick={doMigrate}>{t('app.migrate')}</button>
            </div>
          ) : !entry ? (
            <main key={generation}>
              <Home />
            </main>
          ) : (
            <main key={generation}>
              {Screen ? <Screen driveSync={driveSync} data={data} update={update} detailId={route.detailId} openPanel={openPanel} replaceData={replaceData} autosave={autosave} autosaveBeforeReplace={autosaveBeforeReplace} language={language} onChangeLanguage={changeLanguage} onExport={doExport} onImport={doImport} tab={settingsTab} onTab={setSettingsTab} /> : <p className="error">{t('app.notFound')}</p>}
            </main>
          )}
        </div>
      </div>
      </BandRoadContext.Provider>
      </BandTopContext.Provider>
      </BandHostContext.Provider>
      {panel && <SaveLoadPanel key={panel} mode={panel} data={data} loadBlocked={Boolean(driveSync.conflict)} onClose={() => setPanel(null)} onToSettings={setSettingsTab} onLoad={async (r) => { await applyImported(r); setPanel(null) }} />}
      {request && <ConfirmDialog key={request.id} request={request} onAnswer={answer} />}
      <DriveBusy />
      {conflictOpen && driveSync.conflict && <ConflictDialog key={conflictKey} kind={driveSync.conflict.kind} describe={driveSync.describe} resolve={driveSync.resolve} onClose={() => setConflictOpen(false)} onLogin={() => startLogin(onSettingsScreen ? settingsTab : null)} />}
    </div>
    </ConfirmContext.Provider>
  )
}
