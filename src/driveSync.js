// Google ドライブの同期の流れ（spec-drive.md 4章）。ドライブとのやりとり・端末が覚えること・手元のデータへの出し入れは、env から渡される（ブラウザ・React を読み込まない。
// node の check から、にせのドライブで動かせる）。判定は driveLogic.js の純関数。本物のドライブは driveStore.js、手元との結びつきは useDriveSync.js。
//
// env：
//   drive   { find() → { id, headRevisionId } | null, read(id) → 文字, create(text) → { id, headRevisionId }, update(id, text) → { id, headRevisionId }, revisions(id) → 古い順の [{ id }] }
//           失敗は DriveError を投げる（login：ログインが切れた、offline：つながらない、failed：ほか）
//   state   { get(), set(patch) }   端末が覚えること（driveLogic の readSync の形）
//   local   { syncable()（移行中・新しい版のデータなら false）, initial()（手元が初めの状態か）, version()（手元のデータが変わるたびに増える数）, text()（今のデータの文字）,
//             read(text) → { kind: 'ok', apply() } | { kind: 'newer' } | { kind: 'broken' }（ドライブのデータを検証する。apply は手元のデータを置き換える） }
//   canReplace()  置き換えてよいか（編集の画面・確認画面などが開いていない）／ now() ／ sleep(ms)
// 結果（kind）：idle（何もしない）、synced（同じだった）、uploaded、downloaded、conflict（食い違い。確認画面は 30(c)）、newer（ドライブのデータが新しい版）、
//   waiting（置き換えたいが、画面が開いている）、changed（読んでいる間に手元が変わった）、error（reason：login・offline・failed）
import { plan, checkAfterUpload } from './driveLogic.js'

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
async function upload(env, file) {
  const { drive, state, local } = env
  const v0 = local.version()
  const text = local.text()
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
