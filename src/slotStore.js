// スロット（セーブ・ロードのファイル）の読み書きの入口。画面とオートセーブは、ここから返る1つの形だけを使う（spec-drive.md 13.2）。
// 形：{ kind, status({request}), readSlots(), readSlot(file), writeSlot(file, text), deleteSlot(file), savedAts() }
// Google ドライブにつないでいるとき（つなぐのを切るまで）はドライブ、つないでいないときはセーブフォルダー。つないでいるときに、ログインが切れていても電波がなくても、フォルダには切り替えない（13.5）
import { isSupported, folderStatus, readSlots, readSlot, writeSlot, deleteSlot } from './saveStore.js'
import { drive, getSync, getToken } from './driveStore.js'
import { makeDriveSlots } from './driveSlots.js'
import { slotView } from './saveLogic.js'

const folder = {
  kind: 'folder',
  status: folderStatus,
  readSlots,
  readSlot,
  writeSlot,
  deleteSlot,
  async savedAts() {
    return (await readSlots()).filter((r) => r.text !== null).map((r) => slotView(r.text).savedAt).filter(Boolean)
  },
}

// ドライブの状態：granted（使える）・offline（電波がない）・login（ログインが切れている）。許可を求めることはない（request は使わない）
const driveStatus = async () => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'offline', name: null }
  if (!getToken()) return { state: 'login', name: null }
  return { state: 'granted', name: null }
}
const driveStore = { kind: 'drive', status: driveStatus, ...makeDriveSlots(drive) }

export const slotStore = () => (getSync().connected ? driveStore : folder)
export const slotsAvailable = () => getSync().connected || isSupported()

// 13.4：フォルダのセーブをドライブへ写すときに使う。今つないでいるかに関係なく、ドライブのスロットとフォルダを、それぞれ直接使う
export const driveSlotStore = driveStore
export const folderSlotStore = folder
