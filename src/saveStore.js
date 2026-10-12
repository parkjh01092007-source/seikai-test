// セーブフォルダーの読み書きは、このファイルだけで行う（File System Access と IndexedDB。ブラウザの標準の仕組み）。
// 文の整形や判定はしない（それは saveLogic.js）。触るのは、フォルダの中のスロットのファイル（save01.json〜save20.json、autosave.json）と config.json だけ。
// 消すのはスロットのファイルだけ（config.json は消さない）。
// フォルダの鍵（handle）と、オートセーブの ON・OFF の控えは、IndexedDB にだけ保存する。保存データ（localStorage）には入れない。
import { SLOTS, isSlotFile, CONFIG_FILE } from './saveLogic.js'

const DB_NAME = 'orenoyome-save'
const STORE = 'handles'
const KEY = 'folder'
const HINT_KEY = 'autosave'

export const isSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

// ---- IndexedDB（鍵の保存）----
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbRun(mode, run) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

// 保存されている鍵。ない・IndexedDB が使えないときは null
async function getHandle() {
  try {
    return (await dbRun('readonly', (s) => s.get(KEY))) ?? null
  } catch {
    return null
  }
}

const putHandle = (handle) => dbRun('readwrite', (s) => s.put(handle, KEY))

// オートセーブの ON・OFF の控え（最後に config.json から分かった値）。許可がなくて config.json を読めないときの目安に使う。ない・使えないときは null
export async function getAutosaveHint() {
  try {
    const v = await dbRun('readonly', (s) => s.get(HINT_KEY))
    return typeof v === 'boolean' ? v : null
  } catch {
    return null
  }
}

export async function setAutosaveHint(on) {
  try {
    await dbRun('readwrite', (s) => s.put(on, HINT_KEY))
  } catch { /* 控えが残せなくても、config.json が正 */ }
}

// ---- フォルダ ----

// フォルダを選ぶ。選んだフォルダの名前を返す。取り消したときは null（前のフォルダも、前のフォルダのファイルもそのまま）
export async function chooseFolder() {
  let handle
  try {
    handle = await window.showDirectoryPicker({ id: 'orenoyome-save', mode: 'readwrite' })
  } catch (e) {
    if (e.name === 'AbortError') return null
    throw e
  }
  await putHandle(handle)
  return handle.name
}

// フォルダの状態：{ state, name }。state は 'unsupported' | 'none' | 'granted' | 'prompt' | 'denied'
// request が true のときだけ、許可を求める（ボタンを押した処理の中から呼ぶこと）
export async function folderStatus({ request = false } = {}) {
  if (!isSupported()) return { state: 'unsupported', name: null }
  const handle = await getHandle()
  if (!handle) return { state: 'none', name: null }
  const options = { mode: 'readwrite' }
  let state = await handle.queryPermission(options)
  if (state === 'prompt' && request) state = await handle.requestPermission(options)
  return { state, name: handle.name }
}

async function folder() {
  const handle = await getHandle()
  if (!handle) throw new DOMException('セーブフォルダーが選ばれていません', 'NotFoundError')
  return handle
}

// スロットのファイル名だけを通す（ほかのファイルには触らない）
function assertSlot(file) {
  if (!isSlotFile(file)) throw new Error(`スロットのファイルではありません：${file}`)
}

// ---- スロット ----

// 読む。ファイルがなければ null（スロットのファイルと config.json だけ）
async function readText(name) {
  if (!isSlotFile(name) && name !== CONFIG_FILE) throw new Error(`読めるファイルではありません：${name}`)
  const dir = await folder()
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text()
  } catch (e) {
    if (e.name === 'NotFoundError') return null
    throw e
  }
}

// 1つ読む。ファイルがなければ null
export async function readSlot(file) {
  assertSlot(file)
  return readText(file)
}

// config.json を読む。ファイルがなければ null。同じ名前のフォルダなど、読めないときは例外
export const readConfig = () => readText(CONFIG_FILE)

// 全スロット（オートセーブ、ファイル1〜20）を読む。{ file, text, error }。text はファイルがなければ null。1つ読めなくても、ほかは読む（その file の error に例外の name が入る）
export async function readSlots() {
  await folder() // 選ばれていなければ、ここで例外
  return Promise.all(SLOTS.map(async ({ file }) => {
    try {
      return { file, text: await readSlot(file), error: null }
    } catch (e) {
      return { file, text: null, error: e.name }
    }
  }))
}

// 書く（スロットのファイルと config.json だけ）。close まで成功したときだけ中身が入れ替わる（失敗しても、前のファイルは壊れない）
async function writeText(name, text) {
  if (!isSlotFile(name) && name !== CONFIG_FILE) throw new Error(`書けるファイルではありません：${name}`)
  const dir = await folder()
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable()
  try {
    await writable.write(text)
    await writable.close()
  } catch (e) {
    try { await writable.abort() } catch { /* すでに閉じている */ }
    throw e
  }
}

// スロットに書く
export async function writeSlot(file, text) {
  assertSlot(file)
  return writeText(file, text)
}

// config.json に書く（スロットの関数では書けない）
export const writeConfig = (text) => writeText(CONFIG_FILE, text)

// 消す。先にファイルだと確かめる（同じ名前のフォルダは消さない）。ファイルがなければ NotFoundError
export async function deleteSlot(file) {
  assertSlot(file)
  const dir = await folder()
  await dir.getFileHandle(file) // フォルダなら TypeMismatchError
  await dir.removeEntry(file)
}
