import { useState, useEffect, useRef, useCallback } from 'react'
import { screens } from './sections.js'
import { NAV } from './nav.js'
import { t, getLanguage, setLanguage } from './text.js'
import { parseHash, toHash } from './route.js'
import { cardAccounts } from './ledgerLogic.js'
import { DEFAULT_TAB } from './settingsSections.js'
import Home from './sections/Home.jsx'
import SideTabs from './sections/SideTabs.jsx'
import { ConfirmContext, ConfirmDialog } from './sections/ConfirmDialog.jsx'
import SaveLoadPanel from './sections/SaveLoadPanel.jsx'
import './nav.css'
import { loadData, saveData, exportJson, parseImport, needsMigration, migrate, autoRecord } from './storage.js'
import { today, nowLocal } from './today.js'
import { buildConfig, parseConfig, buildSaveFile, autosaveBlocker, storeErrorText } from './saveLogic.js'
import { folderStatus, readConfig, writeConfig, writeSlot, getAutosaveHint, setAutosaveHint } from './saveStore.js'

// アプリを開いたとき：データを読み、移行が要らなければ、定期支払いの自動記入を行って保存する。
// 最後に記入した月（lastMonth）が保存されるので、何回走っても（StrictMode の2回呼びでも）二重にならない。
function startup() {
  const data = loadData()
  if (needsMigration(data)) return data // 移行のあと（doMigrate）で記入する
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
  const [settingsTab, setSettingsTab] = useState(DEFAULT_TAB) // 設定の画面で開いているタブ（spec-ui.md 4.1）。覚えない（再読み込みで記帳に戻る）。画面の作り直し（言語の変更・読み込みなど）では変わらない。URL（#）にも入れない

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

  // オートセーブの書き込み。データは変えない（書くだけ）。確認画面も出さない。
  // 書き込みは1本のつなぎ（chain）に並べるので、重ならない。書くのは、そのときの一番新しいデータ（latest）。同じデータをもう書いてあれば、書かない
  const latest = useRef(data)
  const written = useRef(null) // 最後に autosave.json へ書けたデータ
  const skip = useRef(data) // 起動時のデータと、置き換えの直後のデータ（update の quiet）は、書かない
  const chain = useRef(Promise.resolve())
  const writeAutosave = useCallback(() => {
    chain.current = chain.current.then(async () => {
      const d = latest.current
      if (d === written.current) return setProblem(null) // 書くものがない（もう書いてある）
      try {
        const st = await folderStatus() // 許可は求めない
        const why = autosaveBlocker({ on: onRef.current, migrating: needsMigration(d), folderState: st.state })
        if (why === 'permission') return setProblem(storeErrorText('NotAllowedError'))
        if (why) return setProblem(null) // OFF・移行中・フォルダなし・未対応は、書かないだけ（出さない）
        await writeSlot('autosave.json', JSON.stringify(buildSaveFile(d, { kind: 'auto', savedAt: nowLocal(), memo: '' }), null, 2))
        written.current = d
        setProblem(null)
      } catch (e) {
        setProblem(storeErrorText(e.name, e.message))
      }
    })
    return chain.current
  }, [])
  // データを大きく変える操作（読み込み・ロード・全体の初期化・仕訳の一括削除）の直前に呼ぶ。書けるなら、今のデータを今すぐ書く（2秒待たない）。書けなくても、例外は投げない（操作はそのまま進む）
  const autosaveBeforeReplace = writeAutosave

  // データが変わったら、最後の変化から2秒後に1回だけ書く
  useEffect(() => {
    latest.current = data
    if (data === skip.current) return
    const timer = setTimeout(writeAutosave, 2000)
    return () => clearTimeout(timer)
  }, [data, writeAutosave])

  // 「オートセーブできません」を押したとき：許可を求め、config.json を読み直し、書けていない変化があればすぐ書く
  const retryAutosave = async () => {
    try {
      await folderStatus({ request: true })
      await reloadAutosave()
    } catch { /* 書くときに、もう一度確かめて表示する */ }
    await writeAutosave()
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

  // データの移行画面が出ているときは、# に関係なく移行画面を出す（古い形のデータなので、# も読まない）
  const migrating = needsMigration(data)
  const route = migrating ? null : parseHash(hash, cardAccounts(data.accounts).map((a) => a.id))
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

  const entry = route && NAV.find((e) => e.id === route.entry)
  const Screen = route && route.tab ? screens[route.tab] : null

  // 「オートセーブできません」（書けないときだけ）。出し場所は、PC は右上の帯、スマホはメニューのある画面では上の帯の右端、ホーム・移行画面では中身の一番上（spec-mobile.md 第4章）
  const notice = problem !== null && <button type="button" className="autosave-problem" title={problem} onClick={retryAutosave}>{t('save.autosaveFailed')}</button>

  return (
    <ConfirmContext.Provider value={confirm}>
    <div className="frame" key={language}>
      {entry &&<SideTabs entry={entry} currentTab={route.tab} onOpenPanel={openPanel} notice={notice} />}
      <div className="main-col">
        {/* 右上の書き出し・読み込みの帯。スマホの形では出さない（同じ機能は 設定 → データ。index.css） */}
        <header>
          <div>
            {notice}
            <button onClick={doExport}>{t('app.export')}</button>
            <label>
              <input type="file" accept=".json" onChange={doImport} hidden />
              <span role="button" style={{ border: '1px solid var(--color-muted)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer' }}>{t('app.import')}</span>
            </label>
          </div>
        </header>
        <div className="content">
          {!entry && notice && <div className="phone-only">{notice}</div>}
          {error &&<p style={{ color: 'var(--color-error)' }}>{error}</p>}
          {warning && <p className="warning">{warning}</p>}
          {migrating ? (
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
              {Screen ? <Screen data={data} update={update} detailId={route.detailId} openPanel={openPanel} replaceData={replaceData} autosave={autosave} autosaveBeforeReplace={autosaveBeforeReplace} language={language} onChangeLanguage={changeLanguage} onExport={doExport} onImport={doImport} tab={settingsTab} onTab={setSettingsTab} /> : <p className="error">{t('app.notFound')}</p>}
            </main>
          )}
        </div>
      </div>
      {panel && <SaveLoadPanel key={panel} mode={panel} data={data} onClose={() => setPanel(null)} onToSettings={setSettingsTab} onLoad={async (r) => { await applyImported(r); setPanel(null) }} />}
      {request && <ConfirmDialog key={request.id} request={request} onAnswer={answer} />}
    </div>
    </ConfirmContext.Provider>
  )
}
