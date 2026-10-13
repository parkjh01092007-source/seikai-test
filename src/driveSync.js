// Google ドライブの同期の流れ（spec-drive.md 4章）。ドライブとのやりとり・端末が覚えること・手元のデータへの出し入れは、env から渡される（ブラウザ・React を読み込まない。
// node の check から、にせのドライブで動かせる）。判定は driveLogic.js の純関数。本物のドライブは driveStore.js、手元との結びつきは useDriveSync.js。
//
// env：
//   drive   { find() → { id, headRevisionId } | null, read(id) → 文字, create(text) → { id, headRevisionId }, update(id, text) → { id, headRevisionId }, revisions(id) → 古い順の [{ id }],
//             readRevision(fileId, revId) → 文字（版がなければ status 404 の DriveError）、createBackup(name, text)、listBackups() → [{ id, name }]、remove(id) }（後ろの4つは作業30(c)）
//           失敗は DriveError を投げる（login：ログインが切れた、offline：つながらない、failed：ほか）
//   state   { get(), set(patch) }   端末が覚えること（driveLogic の readSync の形）
//   local   { syncable()（移行中・新しい版のデータなら false）, initial()（手元が初めの状態か）, version()（手元のデータが変わるたびに増える数）, text()（今のデータの文字）, data()（今のデータ）,
//             read(text) → { kind: 'ok', apply() } | { kind: 'newer' } | { kind: 'broken' }（ドライブのデータを検証する。apply は手元のデータを置き換える） }
//           read(text) の ok には、apply（ドライブから下ろした置き換え。変更に数えない）のほかに、replace（控えから戻す置き換え。ふつうの変更として、あとで上がる）がある
//   canReplace()  置き換えてよいか（編集の画面・確認画面などが開いていない）／ now() ／ sleep(ms)
// 結果（kind）：idle（何もしない）、synced（同じだった）、uploaded、downloaded、conflict（食い違い。確認画面は 30(c)）、newer（ドライブのデータが新しい版）、
//   waiting（置き換えたいが、画面が開いている）、changed（読んでいる間に手元が変わった）、error（reason：login・offline・failed）
import { plan, checkAfterUpload, dataSummary, backupName, backupsToDelete, parseBackupName } from './driveLogic.js'

export class DriveError extends Error {
  constructor(kind, message, status = null) {
    super(message)
    this.kind = kind
    this.status = status
  }
}

export async function syncOnce(env) {
  const { drive, state, local } = env
  const first = state.get()
  if (!first.connected) return { kind: 'idle' }
  if (first.conflict) return { kind: 'conflict' } // 確認画面で選ぶまで、何も変えない
  if (!local.syncable()) return { kind: 'idle' }
  try {
    if (first.pending) {
      const stopped = await verify(env)
      if (stopped) return stopped
    }
    const s = state.get()
    const file = await drive.find()
    const remoteRev = file ? file.headRevisionId : null
    const action = plan({ dirty: s.dirty, baseRev: s.baseRev, remoteRev, localInitial: local.initial() })
    if (action === 'none') {
      state.set({ lastSyncedAt: env.now() })
      return { kind: 'synced' }
    }
    if (action === 'upload') return await upload(env, file)
    // 下ろす・食い違い：どちらも、ドライブのデータを読んで、新しい版・読めないものでないかを確かめる
    const v0 = local.version()
    const remote = local.read(await drive.read(file.id))
    if (remote.kind === 'newer') return { kind: 'newer' } // 置き換えず、上げもしない（古い版のアプリで新しい版のデータを壊さないため）
    if (remote.kind === 'broken') return conflict(state, 'broken', remoteRev)
    if (action === 'conflict') return conflict(state, s.baseRev === null ? 'first' : 'both', remoteRev)
    if (local.version() !== v0) return { kind: 'changed' } // 読んでいる間に手元が変わった：置き換えない（次にやり直す）
    if (!env.canReplace()) return { kind: 'waiting' }
    await remote.apply()
    state.set({ baseRev: remoteRev, dirty: false, lastSyncedAt: env.now() })
    return { kind: 'downloaded' }
  } catch (e) {
    if (e instanceof DriveError) return { kind: 'error', reason: e.kind }
    return { kind: 'error', reason: 'failed' }
  }
}

function conflict(state, kind, theirsRev) {
  state.set({ conflict: { kind, theirsRev } })
  return { kind: 'conflict' }
}

// 上げる（4.3）。ドライブの版は、上げる前に見たものと同じ（または、ファイルがない）ことを、plan が確かめている。
// 「同じときだけ書く」はドライブにない（作業30(b)の確認）ので、上げたあとに、版の履歴で確かめる（verify）
async function upload(env, file, override = null) {
  const { drive, state, local } = env
  const v0 = local.version()
  const text = override ?? local.text() // override：食い違いの確認で、ドライブの古い版を残すとき（置き換えた手元のデータは、画面が描き直されるまで text() に出ないため、ドライブから読んだ文字をそのまま上げる）
  const expectedPrev = file ? file.headRevisionId : null
  const res = file ? await drive.update(file.id, text) : await drive.create(text)
  // 上げている間に手元が変わっていたら、変更ありのまま（次にまた上げる）。確かめが済むまで、確かめ待ちを覚える（アプリが閉じても、次に開いたときに確かめる）
  state.set({ baseRev: res.headRevisionId, dirty: local.version() !== v0, pending: { fileId: res.id ?? file.id, mine: res.headRevisionId, expectedPrev }, lastSyncedAt: env.now() })
  return (await verify(env)) ?? { kind: 'uploaded' }
}

// 上げたあとの確かめ。問題なければ null。食い違い・確かめられないときは、確認待ちにして { kind: 'conflict' } を返す（手元のデータもドライブも、変えない）。
// 上げた直後は、履歴にまだ出ないことがあるので、少し待って3回まで読む。ファイルが消えているとき（404）は、確かめを捨てる
async function verify(env) {
  const { drive, state } = env
  const { fileId, mine, expectedPrev } = state.get().pending
  let revs
  try {
    for (let i = 0; i < 3; i++) {
      revs = await drive.revisions(fileId)
      if (revs.some((r) => r.id === mine)) break
      if (i < 2) await env.sleep(1000)
    }
  } catch (e) {
    if (e instanceof DriveError && e.status === 404) {
      state.set({ pending: null })
      return null
    }
    throw e
  }
  const r = checkAfterUpload(revs, mine, expectedPrev)
  if (r.ok) {
    state.set({ pending: null })
    return null
  }
  state.set({ pending: null, conflict: r.reason === 'slipped' ? { kind: 'slipped', theirsRev: r.theirs } : { kind: 'unverified', theirsRev: null } })
  return { kind: 'conflict' }
}

// ---- 食い違いの確認画面（4.4。作業30(c)）
// 画面に出す材料：この端末のデータと、ドライブ側のデータ（食い違いになった版）の、最後に変えた日時と仕訳の件数。
// ドライブ側が、ok（読める）・broken（読めない）・newer（新しい版）・gone（版が消えた、ファイルがない）のどれかも返す。選ぶまで、何も変えない
export async function describeConflict(env) {
  const { drive, state, local } = env
  const conflict = state.get().conflict
  if (!conflict) return null
  try {
    const theirs = await readTheirs(env, conflict)
    const remote = theirs.text === null ? null : local.read(theirs.text)
    let driveSummary = null
    if (remote && remote.kind !== 'broken') {
      try { driveSummary = dataSummary(JSON.parse(theirs.text)) } catch { /* 読めないものは、件数を出さない */ }
    }
    return { kind: conflict.kind, local: dataSummary(local.data()), drive: driveSummary, driveState: remote === null ? 'gone' : remote.kind === 'ok' ? 'ok' : remote.kind }
  } catch (e) {
    return { error: e instanceof DriveError ? e.kind : 'failed' }
  }
}

// ドライブ側の、食い違いになった版の中身。theirsRev がなければ、今の版（unverified のとき）。版が消えていれば text は null
async function readTheirs(env, conflict) {
  const file = await env.drive.find()
  const rev = conflict.theirsRev ?? file?.headRevisionId ?? null
  let text = null
  if (file && rev) {
    try {
      text = await env.drive.readRevision(file.id, rev)
    } catch (e) {
      if (!(e instanceof DriveError && e.status === 404)) throw e
    }
  }
  return { file, rev, text }
}

// 控えを作る（別のファイル）。新しいものから5個より古い控えは消す（消せなくてもよい）。作れなければ例外（そのとき、選んだことは行わない）
async function backup(env, side, text) {
  await env.drive.createBackup(backupName(env.now(), side), text)
  try {
    for (const f of backupsToDelete(await env.drive.listBackups())) await env.drive.remove(f.id)
  } catch { /* 古い控えを消せなくても、あとで消える */ }
}

// どちらを残すか選んだあとの動き。choice：'drive'（ドライブのデータを残す）か 'device'（この端末のデータを残す）。残さなかった方は、先に控えとして、ドライブに残す。
// 確認画面そのものが開いている間でも動く（本人が選んだので、canReplace は見ない）。失敗したときは、食い違い待ちのまま、データも変えない
// 結果：resolved、unavailable（ドライブのデータが読めない・新しい版・消えた：ドライブを残せない）、error（reason）
export async function resolveConflict(env, choice) {
  const { drive, state, local } = env
  const before = state.get()
  const conflict = before.conflict
  if (!conflict) return { kind: 'idle' }
  try {
    const { file, rev, text } = await readTheirs(env, conflict)
    const head = file ? file.headRevisionId : null
    const theirs = text === null ? { kind: 'gone' } : local.read(text)
    if (choice === 'drive') {
      if (theirs.kind !== 'ok') return { kind: 'unavailable', reason: theirs.kind }
      await backup(env, 'device', local.text()) // この端末のデータを、先に控えとして残す
      await theirs.apply() // 手元をドライブのデータで置き換える（変更には数えない）
      if (rev === head) {
        state.set({ conflict: null, baseRev: head, dirty: false, lastSyncedAt: env.now() })
        return { kind: 'resolved' }
      }
      // すき間で上げられたデータ（履歴の古い版）を残すとき：ドライブの今の版は、この端末が上げたもの。残す方を、新しい版として上げ直す
      state.set({ conflict: null, dirty: false })
      const r = await upload(env, file, text)
      return r.kind === 'uploaded' ? { kind: 'resolved' } : r
    }
    // この端末を残す：ドライブ側の中身（読めなくても、そのまま）を、先に控えとして残す。ドライブのデータが新しい版のときは、古い版のデータで上書きしない
    if (theirs.kind === 'newer') return { kind: 'unavailable', reason: 'newer' }
    if (text !== null) await backup(env, 'drive', text)
    if (file && head === before.baseRev && !before.dirty && rev !== head) {
      // すき間のとき：ドライブの今の版は、すでにこの端末が上げたもの。上げ直さない
      state.set({ conflict: null, lastSyncedAt: env.now() })
      return { kind: 'resolved' }
    }
    state.set({ conflict: null })
    const r = await upload(env, file)
    return r.kind === 'uploaded' ? { kind: 'resolved' } : r
  } catch (e) {
    state.set({ conflict }) // 失敗：食い違い待ちのまま
    return { kind: 'error', reason: e instanceof DriveError ? e.kind : 'failed' }
  }
}

// ---- 控えから戻す（4.8。作業30(e)）
// 控えの一覧（新しい順）：{ id, at, side, summary（最後に変えた日時と仕訳の件数。読めなければ null）, state（ok・broken・newer）}。読むのは、控えの数だけ（最大5個）
export async function listBackupDetails(env) {
  const files = (await env.drive.listBackups()).map((f) => ({ f, info: parseBackupName(f.name) })).filter((x) => x.info !== null)
  files.sort((a, b) => (a.info.at < b.info.at ? 1 : a.info.at > b.info.at ? -1 : 0))
  const out = []
  for (const { f, info } of files) {
    let text = null
    try {
      text = await env.drive.read(f.id)
    } catch (e) {
      if (!(e instanceof DriveError && e.status === 404)) throw e
      continue // 一覧を読む間に消えた
    }
    const r = env.local.read(text)
    let summary = null
    if (r.kind === 'ok') {
      try { summary = dataSummary(JSON.parse(text)) } catch { /* 件数は出さない */ }
    }
    out.push({ id: f.id, at: info.at, side: info.side, summary, state: r.kind })
  }
  return out
}

// 控えに戻す：読み直す（押したあとに消えていても、今の中身で決める）→ 読み込みと同じ検証と移行 → 今のデータを「戻す前」の控えにする → 置き換える。
// 置き換えは、ふつうの変更なので、あとで（2秒後に）ドライブへ上がる。控えを作れない・読めないときは、置き換えない
// 結果：restored、blocked（食い違い待ち・移行中などで、今は戻せない）、gone（控えが消えた）、unavailable（読めない・新しい版。reason）、error（reason）
export async function restoreBackup(env, id) {
  const { drive, state, local } = env
  if (state.get().conflict || !local.syncable()) return { kind: 'blocked' }
  try {
    let text
    try {
      text = await drive.read(id)
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) return { kind: 'gone' }
      throw e
    }
    const r = local.read(text)
    if (r.kind !== 'ok') return { kind: 'unavailable', reason: r.kind }
    await backup(env, 'before', local.text()) // 戻す前のデータを、控えに残す（作れなければ、ここで止まる）
    await r.replace()
    return { kind: 'restored' }
  } catch (e) {
    return { kind: 'error', reason: e instanceof DriveError ? e.kind : 'failed' }
  }
}
