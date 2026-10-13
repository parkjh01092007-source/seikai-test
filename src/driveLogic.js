// Google ドライブの同期（spec-drive.md）の、判定と整形の純関数。ブラウザ・Google とのやりとりは driveStore.js。React を読み込まない（node の check から読める）。
// 作業30(a)：ログイン（ログインの画面へ移って戻ってくる形。spec-drive.md 11章）と、端末が覚えること。

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata' // ドライブのアプリ専用の場所だけ（3章）
export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'

// 端末が覚えること（ブラウザの別のキー。保存データには入れない。4.1）
export const SYNC_KEY = 'orenoyome-drive' // つないでいるか・アカウント・最後に同期した日時
export const TOKEN_KEY = 'orenoyome-drive-token' // ログインの鍵（1時間で切れる）と切れる時刻
export const LOGIN_KEY = 'orenoyome-drive-login' // ログインの画面へ移っている間だけ。戻ったときの確認の印と、元の画面の #

const TOKEN_MARGIN = 60 * 1000 // 切れる1分前からは、使えないものとして扱う

// 戻り先。承認済みのリダイレクト URI と一字違わず同じ（最後の / まで）。例：https://kitsunesphinx.github.io/seikai/、http://localhost:5173/
export const redirectUri = (origin, base) => `${origin}${base}`

// ログインの画面のアドレス。response_type=token（ブラウザだけで、秘密の鍵なし）。loginHint は、つないでいたアカウント（あれば、選ぶ画面を省ける）
export function authUrl({ clientId, redirectUri: redirect, state, loginHint }) {
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'token', scope: DRIVE_SCOPE, state })
  if (loginHint) p.set('login_hint', loginHint)
  return `${AUTH_ENDPOINT}?${p}`
}

// 戻り先の #（画面の # の代わりに、Google が #access_token=... か #error=... を付けて返す）を読む。
// ふつうの画面の # なら null。ログインの戻りなら { token, expiresAt, returnHash }（成功）か { error, returnHash }（失敗）。
// error：state（確認の印が合わない・ログインの記録がない）、denied（取り消した）、scope（権限が足りない）、other
// login：移る前に覚えた { state, returnHash, tab } か null。returnHash は、移る前にいた画面の #（なければ ''）、tab は、設定で開いていたタブの id（なければ null。App が、あるタブか確かめる）
export function parseAuthReturn(hash, login, now) {
  if (typeof hash !== 'string' || !(hash.startsWith('#access_token=') || hash.startsWith('#error=') || hash.startsWith('#state='))) return null
  const returnHash = safeHash(login?.returnHash)
  const tab = safeTab(login?.tab)
  const p = new URLSearchParams(hash.slice(1))
  if (!login || typeof login.state !== 'string' || login.state === '' || p.get('state') !== login.state) return { error: 'state', returnHash, tab }
  if (p.has('error')) return { error: p.get('error') === 'access_denied' ? 'denied' : 'other', returnHash, tab }
  const token = p.get('access_token')
  const seconds = Number(p.get('expires_in'))
  if (!token || !Number.isFinite(seconds) || seconds <= 0) return { error: 'other', returnHash, tab }
  if (!(p.get('scope') ?? '').split(' ').includes(DRIVE_SCOPE)) return { error: 'scope', returnHash, tab }
  return { token, expiresAt: now + seconds * 1000, returnHash, tab }
}

// 戻ったあとに書き換える # は、画面の # の形（#/...）か空だけ。ログインの戻りの # や、知らない形は空にする
function safeHash(h) {
  return typeof h === 'string' && (h === '' || (h.startsWith('#/') && !h.includes('access_token'))) ? h : ''
}

const safeTab = (v) => (typeof v === 'string' && /^[a-zA-Z]{1,20}$/.test(v) ? v : null)

// ---- 覚えること。storage は getItem / setItem / removeItem を持つ物（ブラウザの localStorage、check では偽物）。読めない・壊れているときは初めの値。例外にしない
const readJson = (storage, key) => {
  try {
    return JSON.parse(storage.getItem(key))
  } catch {
    return null
  }
}
const writeJson = (storage, key, value) => {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch { /* 覚えられなくても、今の画面は動く */ }
}
const remove = (storage, key) => {
  try {
    storage.removeItem(key)
  } catch { /* 消せなくてもよい */ }
}
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

// 端末が覚えること（4.1）：つないでいるか・アカウント・最後に同期した日時、ドライブのファイルの最後に合わせたときの版（baseRev）、
// まだドライブに上げていない変更があるか（dirty）、上げたあとの確かめが済んでいない上げ（pending）、食い違いの確認待ち（conflict。確認画面は作業30(c)）
// pending：{ fileId, mine（上げた版）, expectedPrev（上げる前に見た版。なければ null） }。conflict：{ kind, theirsRev }。
// kind：both（両方が変わった）、first（初めてつなぐとき、どちらにもデータがある）、slipped（上げるすき間で、ほかの端末が上げた）、
// unverified（上げたあとの確かめができなかった：版の履歴が消えた、など）、broken（ドライブのデータが読めない）。theirsRev は、ドライブ側の版（分かれば。なければ null）
export const CONFLICT_KINDS = ['both', 'first', 'slipped', 'unverified', 'broken']
export const emptySync = () => ({ connected: false, account: null, lastSyncedAt: null, baseRev: null, dirty: false, pending: null, conflict: null })

const str = (v) => (typeof v === 'string' && v !== '' ? v : null)
export function readSync(storage) {
  const v = readJson(storage, SYNC_KEY)
  if (!isObj(v)) return emptySync()
  const p = v.pending
  const c = v.conflict
  return {
    connected: v.connected === true,
    account: str(v.account),
    lastSyncedAt: typeof v.lastSyncedAt === 'string' ? v.lastSyncedAt : null,
    baseRev: str(v.baseRev),
    dirty: v.dirty === true,
    pending: isObj(p) && str(p.fileId) && str(p.mine) ? { fileId: p.fileId, mine: p.mine, expectedPrev: str(p.expectedPrev) } : null,
    conflict: isObj(c) && CONFLICT_KINDS.includes(c.kind) ? { kind: c.kind, theirsRev: str(c.theirsRev) } : null,
  }
}
export const writeSync = (storage, sync) => writeJson(storage, SYNC_KEY, sync)

// 使える鍵（切れる1分前まで）。なければ・切れていれば・壊れていれば null
export function readToken(storage, now) {
  const v = readJson(storage, TOKEN_KEY)
  if (!isObj(v) || typeof v.token !== 'string' || v.token === '' || !Number.isFinite(v.expiresAt)) return null
  return now < v.expiresAt - TOKEN_MARGIN ? v.token : null
}
export const writeToken = (storage, token, expiresAt) => writeJson(storage, TOKEN_KEY, { token, expiresAt })
export const clearToken = (storage) => remove(storage, TOKEN_KEY)

export function readLogin(storage) {
  const v = readJson(storage, LOGIN_KEY)
  return isObj(v) && typeof v.state === 'string' ? { state: v.state, returnHash: safeHash(v.returnHash), tab: safeTab(v.tab) } : null
}
export const writeLogin = (storage, login) => writeJson(storage, LOGIN_KEY, login)
export const clearLogin = (storage) => remove(storage, LOGIN_KEY)

// ログインの失敗の理由 → 辞書のキー（driveStore が返す理由。offline・notConfigured は、移る前に分かるもの）
export const LOGIN_ERROR_KEYS = {
  offline: 'drive.error.offline',
  notConfigured: 'drive.notConfigured',
  state: 'drive.error.state',
  denied: 'drive.error.denied',
  scope: 'drive.error.scope',
  other: 'drive.error.other',
}

// ---- 同期の判定（4.2・4.3・4.6）。ドライブのファイルの版（remoteRev。ファイルがなければ null）と、端末が覚えている版を比べる
// 結果：none（何もしない）／upload（上げる。ファイルがなければ作る）／download（ドライブのデータで置き換える）／conflict（食い違い）
// baseRev が null は、初めてつなぐとき（4.6）：ドライブにデータがない→上げる、手元が初めの状態→下ろす、どちらにもある→食い違い
// ドライブのファイルがなくなっている（baseRev があるのに remoteRev が null）→ 手元のデータを上げて作り直す（手元は消さない）
export function plan({ dirty, baseRev, remoteRev, localInitial }) {
  if (remoteRev === null) return 'upload'
  if (baseRev === null) return localInitial ? 'download' : 'conflict'
  if (remoteRev === baseRev) return dirty ? 'upload' : 'none'
  return dirty ? 'conflict' : 'download'
}

// 上げたあとの確かめ（版の履歴で、自分の版のすぐ前が、上げる前に見た版か）。revisions は古い順の [{ id }]。
// ok：すぐ前が expectedPrev（作ったときは、前の版がない）。slipped：間にほかの端末の版がある（theirs はその版）。
// unknown：確かめられない（自分の版が履歴にない、または、自分の版が一番古くて、前の版が消えている）
export function checkAfterUpload(revisions, mine, expectedPrev) {
  const i = revisions.findIndex((r) => r.id === mine)
  if (i < 0) return { ok: false, reason: 'unknown' }
  const prev = i > 0 ? revisions[i - 1].id : null
  if (prev === expectedPrev) return { ok: true }
  if (prev === null) return { ok: false, reason: 'unknown' }
  return { ok: false, reason: 'slipped', theirs: prev }
}

// 手元が初めの状態か（4.6）：仕訳・定期支払い・予算・スキル・お気に入りがなく、科目が初期科目（preset か key を持つもの）だけ
export function isInitialData(data) {
  const fav = data?.settings?.favorites
  return Array.isArray(data?.entries) && data.entries.length === 0 &&
    Array.isArray(data.subscriptions) && data.subscriptions.length === 0 &&
    Array.isArray(data.budgets) && data.budgets.length === 0 &&
    Array.isArray(data.skills) && data.skills.length === 0 &&
    Array.isArray(data.accounts) && data.accounts.every((a) => a.preset !== undefined || a.key !== undefined) &&
    (fav?.debit?.length ?? 0) === 0 && (fav?.credit?.length ?? 0) === 0
}

// アカウントが分かったとき（つないだ直後に、ドライブに聞いて分かる）。前と違うアカウントなら、前のアカウントのドライブの版は使えないので、覚えた版・確かめ待ち・食い違いを捨てる
export function withAccount(sync, account) {
  if (sync.account !== null && sync.account !== account) return { ...sync, account, baseRev: null, pending: null, conflict: null }
  return { ...sync, account }
}

// 上の帯に出すこと（4.5）。null なら出さない。problem：メモリの中の、最後の失敗の理由（login・offline・failed）。newer：ドライブのデータが、このアプリより新しい版
// 優先：新しい版 → 食い違い → 失敗
export function bannerKind({ connected, conflict }, { problem, newer }) {
  if (!connected) return null
  if (newer) return 'newer'
  if (conflict) return 'conflict'
  return problem ?? null
}

// 上げるデータの文字（書き出しと同じ形：schemaVersion を一番上に、書き出した日時を付ける）
export function serializeData(data, exportedAt) {
  const { schemaVersion, ...rest } = data
  return JSON.stringify({ schemaVersion, exportedAt, ...rest }, null, 2)
}
