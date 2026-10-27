import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './themes.css'
import './basic-tokens.css' // 基本の色・文字・余白の変数（PC とスマホで共通）。basic-pc.css・basic-phone.css より前
import './fonts.css'
import App from './App.jsx'
import './gunjo-pc.css' // 群青の PC の規則は、画面ごとの CSS（App が読む）より後に置く。同じ強さのとき、後ろが勝つ
import './basic-pc.css' // 基本の PC の規則も、同じ理由で App より後（basicPc.check.js が確かめる）
import './basic-phone.css' // 基本のスマホの規則も、同じ理由で App より後（basicPhone.check.js が確かめる）
import { applyDocumentLanguage } from './text.js'
import { applyTheme, loadTheme } from './themes.js'
import { registerServiceWorker } from './pwa.js'
import { consumeAuthReturn } from './driveStore.js'

consumeAuthReturn() // Google のログインから戻ってきたときは、鍵を覚えて # を元の画面に戻す（App が # を読む前。spec-drive.md 11章）
applyDocumentLanguage() // 覚えてある言語に、html の lang を合わせる（描く前に）
applyTheme(document.documentElement, loadTheme()) // 覚えてある見た目を html に反映（描く前。初めてのときは基本）
window.addEventListener('load', () => applyTheme(document.documentElement, loadTheme())) // CSS が読み終わったあとにも、もう一度（CSS の値で、メインカラーを直すため。何度呼んでも同じ）
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
window.addEventListener('load', registerServiceWorker) // アプリのファイルを端末に保存する（spec-pwa.md 4章。ビルドした版だけ。npm run dev では登録しない）
