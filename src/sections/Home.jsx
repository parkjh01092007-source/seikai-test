import '../nav.css'
import { NAV } from '../nav.js'
import { t } from '../text.js'
import { entryHash } from '../route.js'

// ホーム画面。入口のボタンだけ（入口は nav.js の定義から作る）
export default function Home() {
  return (
    <div className="home">
      <h1>{t('home.title')}</h1>
      <ul className="entries">
        {NAV.map((e) => (
          <li key={e.id}><a className="entry-button" href={entryHash(e.id)}>{t(e.label)}</a></li>
        ))}
      </ul>
    </div>
  )
}
