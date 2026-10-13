// ドライブのセーブのスロット（spec-drive.md 13.3）。appDataFolder の中の orenoyome-save01.json〜orenoyome-save20.json・orenoyome-autosave.json を、
// saveStore.js のフォルダと同じ形（readSlots・readSlot・writeSlot・deleteSlot）で読み書きする。ドライブとのやりとりは env の drive から渡される
// （ブラウザ・React を読み込まない。node の check から、にせのドライブで動く。driveSync.js と同じ作り）。
// drive：{ listFiles() → 先にできた順の [{ id, name, modifiedTime, appProperties }]、read(id)、createNamed(name, text, properties)、update(id, text, properties)、remove(id) }。失敗は DriveError（kind：login・offline・failed）
// 同期のような版の確かめはしない（本人が1つずつ操作する。最後に書いた方が残る）。同じ名前のファイルが2つあるとき：読みは先にできた方、削除は全部
import { SLOTS, isSlotFile, driveSlotName, slotFileOfDriveName, driveSavedAts } from './saveLogic.js'

const assertSlot = (file) => {
  if (!isSlotFile(file)) throw new Error(`not a slot file: ${file}`)
}
const notFound = (file) => Object.assign(new Error(`no such slot on the drive: ${file}`), { name: 'NotFoundError' })
const gone = (e) => e?.kind === 'failed' && e.status === 404 // 読んでいる間に消えた
// セーブした日時（ファイルの中の savedAt）。appProperties に入れる。読めなければ入れない（更新日時で代わりにする）
const savedAtOf = (text) => {
  try {
    const v = JSON.parse(text)?.savedAt
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

export function makeDriveSlots(drive) {
  const named = async (file) => {
    const name = driveSlotName(file)
    return (await drive.listFiles()).filter((f) => f.name === name)
  }
  // 1つ読む。ファイルがなければ null
  const readFrom = async (group) => {
    if (group.length === 0) return null
    try {
      return await drive.read(group[0].id)
    } catch (e) {
      if (gone(e)) return null
      throw e
    }
  }
  return {
    // 全スロット（オートセーブ、ファイル1〜20）：{ file, text, error }。1回の一覧で探し、あるものだけを並行して読む。1つ読めなくても、ほかは読む。
    // ログイン切れ・つながらないときは、全部が同じなので、例外のまま返す
    async readSlots() {
      const files = await drive.listFiles()
      return Promise.all(SLOTS.map(async ({ file }) => {
        const group = files.filter((f) => f.name === driveSlotName(file))
        try {
          return { file, text: await readFrom(group), error: null }
        } catch (e) {
          if (e?.kind === 'login' || e?.kind === 'offline') throw e
          return { file, text: null, error: 'failed' }
        }
      }))
    },
    async readSlot(file) {
      assertSlot(file)
      return readFrom(await named(file))
    },
    // 書く：あれば上書き、なければ作る。セーブした日時を appProperties にも入れる
    async writeSlot(file, text) {
      assertSlot(file)
      const group = await named(file)
      const savedAt = savedAtOf(text)
      const properties = savedAt === null ? null : { savedAt }
      if (group.length > 0) await drive.update(group[0].id, text, properties)
      else await drive.createNamed(driveSlotName(file), text, properties)
    },
    // 消す：同じ名前を全部。1つもなければ NotFoundError
    async deleteSlot(file) {
      assertSlot(file)
      const group = await named(file)
      if (group.length === 0) throw notFound(file)
      for (const f of group) {
        try {
          await drive.remove(f.id)
        } catch (e) {
          if (!gone(e)) throw e
        }
      }
    },
    // 「最後のセーブ」に使う日時の一覧。読まない（一覧の1回だけ）
    async savedAts() {
      return driveSavedAts(await drive.listFiles())
    },
    // 13.4：ドライブにあるスロットのファイル名（save01.json など）。中身が壊れていても「ある」
    async existing() {
      return (await drive.listFiles()).map((f) => slotFileOfDriveName(f.name)).filter((v) => v !== null)
    },
    // 13.4：名前を指定して作る（上書きできない作り）
    async createSlot(file, text) {
      assertSlot(file)
      const savedAt = savedAtOf(text)
      await drive.createNamed(driveSlotName(file), text, savedAt === null ? null : { savedAt })
    },
  }
}
