// 基本 PC のホームの表示用。NAV 自身は変えず、仕訳帳だけを先に出す。
// 説明は入口の id から辞書を引く。説明をまだ用意していない入口も表示できる。
export function basicHomeEntries(nav, dictionary) {
  return [...nav.filter((entry) => entry.id === 'ledger'), ...nav.filter((entry) => entry.id !== 'ledger')].map((entry) => {
    const key = `basicPc.homeDesc.${entry.id}`
    return { ...entry, descriptionKey: Object.hasOwn(dictionary, key) ? key : null }
  })
}
