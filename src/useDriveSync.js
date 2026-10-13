import { useEffect, useRef, useState, useCallback } from 'react'
import { syncOnce, describeConflict, resolveConflict, listBackupDetails, restoreBackup } from './driveSync.js'
import { serializeData, isInitialData, bannerKind } from './driveLogic.js'
import { drive, syncState, getSync, getStatus, setStatus, getToken, modalOpen, CHANGE_EVENT } from './driveStore.js'
import { needsMigration, isNewerData, parseImport } from './storage.js'

// Google ドライブの同期を、アプリにつなぐ React の hook（spec-drive.md 4章）。同期の流れは driveSync.js、ドライブとのやりとりは driveStore.js。
// data：今のデータ。skip：ref。ドライブから下ろして置き換えたデータは、手元の変更に数えない（App が、置き換える前に skip.current にそのデータを入れる）。
// 起動のときのデータ（定期支払いの自動記入を含む）も、変更に数えない（オートセーブと同じ。11章）。
// apply(r)：parseImport の成功の結果 r で、手元のデータを置き換える（App の持ち物）。restore(r)：控えから戻すとき、同じく置き換える（読み込みと同じ。ふつうの変更として、あとで上がる）
// 返すもの：kind（上の帯に出すこと。bannerKind）、retry（やり直す）
const DEBOUNCE = 2000 // 最後の変化から2秒待って上げる（4.3）
const RETRY = 3000 // 置き換えたいが画面が開いている・読んでいる間に手元が変わったとき、少し待ってやり直す
const PATROL = 15000 // 画面が開いている間の見回り（4.7）：15秒ごとに、ドライブの版を見る（変わっていなければ、問い合わせは1回）
const ONLINE_WAIT = 1000 // 電波が戻ったと知らされてから、通信が使えるようになるまで待つ
const backupCache = new Map() // 控えの一覧：中身を読んだ控えの結果（id ごと。控えは変わらない。ページを読み直すと消える）

export function useDriveSync({ data, skip, apply, restore }) {
  const latest = useRef(data)
  const version = useRef(0) // 手元のデータが変わるたびに増やす（driveSync が、読んだり上げたりしている間の変化を見つける）
  const applyRef = useRef(apply)
  applyRef.current = apply
  const restoreRef = useRef(restore)
  restoreRef.current = restore
  const chain = useRef(Promise.resolve())
  const timer = useRef(null)
  const [, redraw] = useState(0)

  const read = (text) => {
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return { kind: 'broken' }
    }
    if (isNewerData(json)) return { kind: 'newer' }
    const r = parseImport(text) // 検証と移行（読み込みと同じ）
    if (r.error) return { kind: 'broken' }
    return { kind: 'ok', apply: () => applyRef.current(r), replace: () => restoreRef.current(r) }
  }
  const env = () => ({
    drive,
    state: syncState,
    local: {
      syncable: () => !(needsMigration(latest.current) || isNewerData(latest.current)),
      initial: () => isInitialData(latest.current),
      version: () => version.current,
      text: () => serializeData(latest.current, new Date().toISOString()),
      data: () => latest.current,
      read,
    },
    canReplace: () => !modalOpen(),
    now: () => new Date().toISOString(),
    cache: backupCache,
    sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)),
  })

  const schedule = useCallback((ms) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => run(), ms)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- run は ref とモジュールだけを使う

  // 1本のつなぎに並べるので、同期は重ならない。やることは、毎回、覚えていることと今のデータから決める
  const running = useRef(0) // つなぎに並んでいる同期の数（見回りは、0 のときだけ）
  const run = useCallback(() => {
    running.current += 1
    chain.current = chain.current.then(async () => {
      if (!getSync().connected) return
      if (!getToken()) return setStatus({ problem: 'login', newer: false }) // ログインが切れている。押されたときだけ、ログインへ移る（11章）
      const result = await syncOnce(env())
      if (result.kind === 'error') setStatus({ problem: result.reason, newer: false })
      else if (result.kind === 'newer') setStatus({ problem: null, newer: true })
      else if (result.kind !== 'idle') setStatus({ problem: null, newer: false })
      if (result.kind === 'waiting' || result.kind === 'changed') schedule(RETRY)
      else if (result.kind === 'uploaded' && getSync().dirty) schedule(DEBOUNCE) // 上げている間に変わった分
    }).finally(() => { running.current -= 1 })
    return chain.current
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // データが変わったら、変更ありを覚え、最後の変化から2秒後に上げる。ドライブから下ろしたデータ・起動のときのデータは、数えない
  useEffect(() => {
    latest.current = data
    if (data === skip.current) return
    version.current += 1
    if (getSync().connected) {
      if (!getSync().dirty) syncState.set({ dirty: true })
      schedule(DEBOUNCE)
    }
  }, [data, skip, schedule])

  // 開いたとき・画面に戻ったとき（4.2）・電波が戻ったとき（少し待ってから）・つないだとき・画面が開いている間の見回り（15秒ごと。4.7）
  // 見回りは、画面が見えていて、つないでいて、鍵が使えて、食い違い待ちでなく、ほかの同期が並んでいないときだけ。電波が戻った直後に失敗しても、見回りがそのままやり直しになる
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') run() }
    let onlineTimer = null
    const online = () => { clearTimeout(onlineTimer); onlineTimer = setTimeout(run, ONLINE_WAIT) }
    const patrol = setInterval(() => {
      const s = getSync()
      if (document.visibilityState === 'visible' && s.connected && !s.conflict && getToken() && running.current === 0) run()
    }, PATROL)
    let wasConnected = getSync().connected
    const changed = () => {
      const now = getSync().connected
      if (now && !wasConnected) run()
      wasConnected = now
      redraw((n) => n + 1)
    }
    run()
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', online)
    window.addEventListener(CHANGE_EVENT, changed)
    return () => {
      clearTimeout(timer.current)
      clearTimeout(onlineTimer)
      clearInterval(patrol)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('online', online)
      window.removeEventListener(CHANGE_EVENT, changed)
    }
  }, [run])

  // 食い違いの確認画面（4.4）。describe：画面に出す材料（この端末とドライブの、最後に変えた日時と仕訳の件数）。resolve(choice)：'drive'・'device'。どちらも、同期と同じつなぎに並べる
  const enqueue = (job) => {
    const done = chain.current.then(job)
    chain.current = done.catch(() => {})
    return done
  }
  const describe = () => enqueue(() => describeConflict(env()))
  const resolve = (choice) => enqueue(async () => {
    const result = await resolveConflict(env(), choice)
    if (result.kind === 'resolved') {
      setStatus({ problem: null, newer: false })
      schedule(0) // そのあと、いつもの同期（置き換えた分・上げ直した分を確かめる）
    } else if (result.kind === 'error') setStatus({ problem: result.reason, newer: false })
    return result
  })

  // 控えの一覧と、控えから戻す（設定 → データ → ドライブの控え）。どちらも、同期と同じつなぎに並べる
  const listBackups = () => enqueue(() => listBackupDetails(env()))
  const restoreFrom = (id) => enqueue(async () => {
    const result = await restoreBackup(env(), id)
    if (result.kind === 'error') setStatus({ problem: result.reason, newer: false })
    return result
  })

  return { kind: bannerKind(getSync(), getStatus()), retry: run, conflict: getSync().conflict, describe, resolve, listBackups, restore: restoreFrom }
}
