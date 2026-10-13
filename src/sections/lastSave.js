import { nowLocal } from '../today.js'
import { t } from '../text.js'
import { lastSaveText } from '../saveLogic.js'
import { slotStore } from '../slotStore.js'

// 「最後のセーブ：…」の行（設定 → データの確認画面と、メニューの上で使う）。許可は求めない（確かめるだけ）。ブラウザが対応していなければ null（行を出さない）
export async function lastSaveLine() {
  try {
    const store = slotStore()
    const st = await store.status()
    if (st.state === 'unsupported') return null
    if (st.state === 'none') return t('save.lastSaveLine', { value: t('save.noFolder') })
    if (st.state !== 'granted') return t('save.lastSaveLine', { value: t('save.unknownLastSave') })
    const savedAts = await store.savedAts()
    return t('save.lastSaveLine', { value: lastSaveText(savedAts, nowLocal()) })
  } catch {
    return t('save.lastSaveLine', { value: t('save.unknownLastSave') })
  }
}
