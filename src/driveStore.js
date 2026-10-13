// Google のログインとドライブとのやりとりは、このファイルだけで行う（fetch と location。判定・整形は driveLogic.js）。
// 作業30(a)：ログイン（ログインの画面へ移って戻る）、つなぐ・切る、アカウントの表示。上げる・下ろすは 30(b)。
// Google の部品（Identity Services）は読み込まない（spec-drive.md 11章）。保存データ（localStorage の orenoyome）には触らない。
import { authUrl, redirectUri, parseAuthReturn, readSync, writeSync, emptySync, readToken, writeToken, clearToken, readLogin, writeLogin, clearLogin } from './driveLogic.js'

// アプリの登録の番号（クライアント ID。秘密ではない。spec-drive.md 3章）。Google Cloud で作ったもの（7章）。空のあいだは、つなげない
export const CLIENT_ID = '493619946438-9mr1givnv4vekbn0kicean9gifuimr92.apps.googleusercontent.com'

export const CHANGE_EVENT = 'orenoyome-drive-change' // 覚えたことが変わったとき（画面が読み直す）

const store = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
const notify = () => window.dispatchEvent(new Event(CHANGE_EVENT))

export const isConfigured = () => CLIENT_ID !== ''
export const getSync = () => readSync(store())
export const getToken = () => readToken(store(), Date.now()) // 使える鍵。切れていれば null

// 最後のログインの失敗の理由（driveLogic の LOGIN_ERROR_KEYS の名前）。ページを読み直すまで覚える。なければ null
let loginError = null
export const getLoginError = () => loginError

// ログインから戻ってきたとき、移る前に開いていた設定のタブの id（なければ null。戻ってきたページでだけ入る）
let returnTab = null
export const getReturnTab = () => returnTab

// ログインの画面へ移る。移る前に分かる失敗は、理由を返す（移らない）。ホームに置いたアプリで、Google のエラーの画面に行き止まらないため
// tab：移る前に開いていた設定のタブの id。戻ったあとに、同じタブを開く（getReturnTab）
export function startLogin(tab = null) {
  loginError = null
  if (!isConfigured()) return fail('notConfigured')
  if (!navigator.onLine) return fail('offline')
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const state = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  writeLogin(store(), { state, returnHash: window.location.hash, tab }) // 戻ったら、この画面の # に戻す
  window.location.assign(authUrl({
    clientId: CLIENT_ID,
    redirectUri: redirectUri(window.location.origin, import.meta.env.BASE_URL),
    state,
    loginHint: getSync().account ?? undefined,
  }))
  return null
}
function fail(reason) {
  loginError = reason
  notify()
  return reason
}

// ページを読み込んだとき、画面を描く前に呼ぶ：ログインから戻ってきた # なら、鍵を覚えて、# を元の画面に戻す（鍵の入った # を残さない）。
// App は、最初に window.location.hash を読むので、その前でないといけない
export function consumeAuthReturn() {
  const r = parseAuthReturn(window.location.hash, readLogin(store()), Date.now())
  if (r === null) return
  clearLogin(store())
  returnTab = r.tab
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${r.returnHash}`)
  if (r.error) {
    loginError = r.error
    return
  }
  loginError = null
  writeToken(store(), r.token, r.expiresAt)
  writeSync(store(), { ...getSync(), connected: true })
  refreshAccount()
}

// つないでいるアカウント（メールアドレス）をドライブに聞いて覚える。聞けなくても、つないだことは変わらない
export async function refreshAccount() {
  const token = getToken()
  if (!token) return
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const account = (await res.json())?.user?.emailAddress
    if (typeof account === 'string' && account !== '') writeSync(store(), { ...getSync(), account })
  } catch { /* 電波がないなど。あとで聞き直す */ }
  notify()
}

// 切る：鍵と、覚えたこと（アカウントなど）を消す。手元のデータとドライブのファイルは消さない（5章）
export function disconnect() {
  clearToken(store())
  writeSync(store(), emptySync())
  loginError = null
  notify()
}
