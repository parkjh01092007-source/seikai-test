import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './themes.css'
import App from './App.jsx'
import { applyDocumentLanguage } from './text.js'
import { applyTheme, loadTheme } from './themes.js'

applyDocumentLanguage() // 覚えてある言語に、html の lang を合わせる（描く前に）
applyTheme(document.documentElement, loadTheme()) // 覚えてある見た目を html に反映（描く前。初めてのときは基本）
window.addEventListener('load', () => applyTheme(document.documentElement, loadTheme())) // CSS が読み終わったあとにも、もう一度（CSS の値で、メインカラーを直すため。何度呼んでも同じ）
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
