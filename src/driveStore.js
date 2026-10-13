// Google のログインとドライブとのやりとりは、このファイルだけで行う（fetch と location。判定・整形は driveLogic.js、同期の流れは driveSync.js）。
// 作業30(a)：ログイン（ログインの画面へ移って戻る）、つなぐ・切る、アカウントの表示。作業30(b)：ドライブのファイルの読み書き（drive）、同期の状態（syncState・getStatus）。
// Google の部品（Identity Services）は読み込まない（spec-drive.md 11章）。保存データ（localStorage の orenoyome）には触らない。
import { authUrl, redirectUri, parseAuthReturn, readSync, writeSync, emptySync, withAccount, readToken, writeToken, clearToken, readLogin, writeLogin, clearLogin } from './driveLogic.js'
import { DriveError } from './driveSync.js'

// アプリの登録の番号（クライアント ID。秘密ではない。spec-drive.md 3章）。Google Cloud で作ったもの（7章）。空のあいだは、つなげない
export const CLIENT_ID = '493619946438-9mr1givnv4vekbn0kicean9gifuimr92.apps.googleusercontent.com'

export const CHANGE_EVENT = 'orenoyome-drive-change' // 覚えたこと・同期の結果が変わったとき（画面が読み直す）

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
// 前と違うアカウントなら、前のアカウントのドライブの版は捨てる（withAccount）
export async function refreshAccount() {
  const token = getToken()
  if (!token) return
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const account = (await res.json())?.user?.emailAddress
    if (typeof account === 'string' && account !== '') writeSync(store(), withAccount(getSync(), account))
  } catch { /* 電波がないなど。あとで聞き直す */ }
  notify()
}

// 切る：鍵と、覚えたこと（アカウント・版など）を消す。手元のデータとドライブのファイルは消さない（5章）
export function disconnect() {
  clearToken(store())
  writeSync(store(), emptySync())
  loginError = null
  status = { problem: null, newer: false }
  notify()
}

// ---- 同期（作業30(b)）
// 端末が覚えること（driveLogic の readSync の形）の読み書き。書いたら、画面に知らせる
export const syncState = { get: getSync, set: (patch) => { writeSync(store(), { ...getSync(), ...patch }); notify() } }

// メモリの中の、最後の同期の結果：problem（login・offline・failed。なければ null）、newer（ドライブのデータが、このアプリより新しい版）。ページを読み直すと消える（次の同期でまた分かる）
let status = { problem: null, newer: false }
export const getStatus = () => status
export const setStatus = (next) => {
  if (next.problem === status.problem && next.newer === status.newer) return
  status = next
  notify()
}

// 編集の画面・確認画面・セーブ画面・ロード画面が開いている、または文字を入力している間は、ドライブのデータで置き換えない（spec-drive.md 11章）
export const modalOpen = () => {
  const a = document.activeElement
  const typing = a && a.closest?.('main') && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'color', 'range'].includes(a.type)))
  return Boolean(document.querySelector('dialog[open], .sheet-layer')) || Boolean(typing)
}

// ドライブのファイル（appDataFolder の中の1つ）。鍵がなければ login、通信ができなければ offline、401 は鍵を捨てて login、ほかの失敗は failed
export const DATA_FILE = 'orenoyome-data.json'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FILE_FIELDS = 'id,headRevisionId'
async function call(url, init = {}) {
  const token = getToken()
  if (!token) throw new DriveError('login', 'no token')
  let res
  try {
    res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  } catch (e) {
    throw new DriveError('offline', e.message)
  }
  if (res.status === 401) {
    clearToken(store()) // 切れた鍵は捨てる（設定の欄で「切れています」と出る）
    notify()
    throw new DriveError('login', 'HTTP 401', 401)
  }
  if (!res.ok) throw new DriveError('failed', `HTTP ${res.status}`, res.status)
  return res
}
const CRLF = String.fromCharCode(13, 10) // multipart の改行
export const drive = {
  // 同じ名前のファイルが2つあるとき（2台が同時に初めてつないだ）は、先にできた方
  async find() {
    const q = encodeURIComponent(`name='${DATA_FILE}' and trashed=false`)
    const res = await call(`${API}/files?spaces=appDataFolder&q=${q}&orderBy=createdTime&pageSize=10&fields=files(${FILE_FIELDS})`)
    const file = (await res.json()).files?.[0]
    return file ? { id: file.id, headRevisionId: file.headRevisionId } : null
  },
  async read(id) {
    return (await call(`${API}/files/${id}?alt=media`)).text()
  },
  async create(text) {
    const boundary = `b${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    const meta = JSON.stringify({ name: DATA_FILE, parents: ['appDataFolder'] })
    const body = [`--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', meta, `--${boundary}`, 'Content-Type: application/json', '', text, `--${boundary}--`].join(CRLF)
    const res = await call(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
    return res.json()
  },
  async update(id, text) {
    const res = await call(`${UPLOAD}/files/${id}?uploadType=media&fields=${FILE_FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text })
    return res.json()
  },
  // 版の履歴。古い順（更新の日時で並べ、同じ日時なら、ドライブが返した順のまま）
  async revisions(id) {
    const out = []
    let page = ''
    do {
      const res = await call(`${API}/files/${id}/revisions?pageSize=200&fields=nextPageToken,revisions(id,modifiedTime)${page}`)
      const json = await res.json()
      out.push(...(json.revisions ?? []))
      page = json.nextPageToken ? `&pageToken=${encodeURIComponent(json.nextPageToken)}` : ''
    } while (page)
    return out.map((r, i) => ({ r, i })).sort((a, b) => (a.r.modifiedTime < b.r.modifiedTime ? -1 : a.r.modifiedTime > b.r.modifiedTime ? 1 : a.i - b.i)).map(({ r }) => ({ id: r.id }))
  },
}
