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

export const emptySync = () => ({ connected: false, account: null, lastSyncedAt: null })

export function readSync(storage) {
  const v = readJson(storage, SYNC_KEY)
  if (!isObj(v)) return emptySync()
  return {
    connected: v.connected === true,
    account: typeof v.account === 'string' && v.account !== '' ? v.account : null,
    lastSyncedAt: typeof v.lastSyncedAt === 'string' ? v.lastSyncedAt : null,
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
