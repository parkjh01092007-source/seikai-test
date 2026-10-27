// 画面に出す文言を取る。t('save.title')、値を入れる文は t('dataSettings.purgeHead', { target: '2026-10', total: 3 })（辞書の {target}・{total} に入る）。React は読み込まない（node のテストから読める）。
// 今の言語の辞書にあればそれを、なければ日本語を出す（仕様 6.2）。日本語にもないキー、渡していない {名前} は、例外にする（抜けは text.check.js が先に見つける）。
// 文言は描くときに取る（読み込み時に固めない）。言語を変えたら、App が全体を描き直す（一番外側の key に言語を入れる）。
// 言語は、ブラウザごとに覚える（localStorage の別のキー。保存データ・書き出し・セーブファイルには入れない）。初期値はブラウザの言語（韓国語なら韓国語、それ以外は日本語）。覚えるのは、選んだときだけ。
import ja from './lang/ja.js'
import jo from './lang/jo.js'
import ko from './lang/ko.js'

export const LANGUAGES = ['ja', 'jo', 'ko'] // jo＝お嬢様語（日本語の言い回しを変えた辞書。書いていないキーは日本語が出る）
export const DEFAULT_LANGUAGE = 'ja'
export const LANGUAGE_KEY = 'orenoyome-language' // 保存データのキー（orenoyome）とは別
export const dictionaries = { ja, jo, ko }

export const parseLanguage = (value) => (LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE)

// 言語の初期値（仕様 6.2）：まだ選んでいないとき、ブラウザの言語が韓国語なら韓国語、それ以外は日本語
export const initialLanguage = (browserLanguage) => (typeof browserLanguage === 'string' && /^ko(-|$)/i.test(browserLanguage) ? 'ko' : DEFAULT_LANGUAGE)

// storage は getItem / setItem を持つ物（ブラウザの localStorage、テストでは偽物）。使えなくても例外にしない。
// 覚えた値が正しければそれ。なければ（不正な値・読めないときも）初期値（browserLanguage はブラウザの言語。node では渡さない）
export function readLanguage(storage, browserLanguage) {
  try {
    const stored = storage.getItem(LANGUAGE_KEY)
    if (LANGUAGES.includes(stored)) return stored
  } catch { /* 読めなければ初期値 */ }
  return initialLanguage(browserLanguage)
}

export function saveLanguage(storage, language) {
  try {
    storage.setItem(LANGUAGE_KEY, language)
  } catch { /* 覚えられなくても、今の画面は変わる */ }
}

// 純関数。dicts は { ja, ko }。language の辞書にあればそれ、なければ日本語
export function translate(dicts, language, key, vars = {}) {
  const dictionary = [dicts[language], dicts.ja].find((d) => d !== undefined && Object.hasOwn(d, key))
  if (dictionary === undefined) throw new Error(`辞書にないキー：${key}`)
  return dictionary[key].replace(/\{([A-Za-z_]\w*)\}/g, (_, name) => {
    if (!Object.hasOwn(vars, name)) throw new Error(`${key}：{${name}} の値がありません`)
    return String(vars[name])
  })
}

const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const browserLanguage = () => (typeof navigator === 'undefined' ? undefined : navigator.language)

let current = browserStorage() ? readLanguage(browserStorage(), browserLanguage()) : initialLanguage(browserLanguage())

export const getLanguage = () => current

export function t(key, vars) {
  return translate(dictionaries, current, key, vars)
}

// 言語を変える。覚えて、html の lang を合わせる。画面の描き直しは、呼ぶ側（App）が行う。タブの題は index.html で決める（言語で変えない。仕様 6.10.1）
export function setLanguage(language) {
  current = parseLanguage(language)
  if (browserStorage()) saveLanguage(browserStorage(), current)
  applyDocumentLanguage()
}

// html の lang を、今の言語に合わせる。document がなければ（node など）何もしない
export function applyDocumentLanguage() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = current === 'jo' ? 'ja' : current // jo は言語の記号ではない。読み上げは日本語
  document.documentElement.dataset.lang = current // お嬢様語（jo）だけ、言葉の切れ目で折り返す（index.css）
}
