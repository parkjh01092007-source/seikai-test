import { nowLocal } from '../today.js'
import { t } from '../text.js'
import { slotView, lastSaveText } from '../saveLogic.js'
import { folderStatus, readSlots } from '../saveStore.js'

// 「最後のセーブ：…」の行（設定 → データの確認画面と、メニューの上で使う）。許可は求めない（確かめるだけ）。ブラウザが対応していなければ null（行を出さない）
export async function lastSaveLine() {
  try {
    const st = await folderStatus()
    if (st.state === 'unsupported') return null
    if (st.state === 'none') return t('save.lastSaveLine', { value: t('save.noFolder') })
    if (st.state !== 'granted') return t('save.lastSaveLine', { value: t('save.unknownLastSave') })
    const savedAts = (await readSlots()).filter((r) => r.text !== null).map((r) => slotView(r.text).savedAt).filter(Boolean)
    return t('save.lastSaveLine', { value: lastSaveText(savedAts, nowLocal()) })
  } catch {
    return t('save.lastSaveLine', { value: t('save.unknownLastSave') })
  }
}
