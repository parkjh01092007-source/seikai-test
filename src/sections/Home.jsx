import { createPortal } from 'react-dom'
import '../nav.css'
import { NAV } from '../nav.js'
import { t, dictionaries } from '../text.js'
import { entryHash } from '../route.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { basicHomeEntries } from '../basicPcHome.js'
import { useBandHost } from './bandHost.js'
import { Icon } from './Icon.jsx'

// ホーム画面。入口のボタンだけ（入口は nav.js の定義から作る）
export default function Home() {
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()
  const bandHost = useBandHost()
  // 群青の PC（見本 E-home）：画面の名前は帯のマス、帯に 1 文。入口は白い札（上に英字、名前、右下に ›）
  if (gunjoPc) {
    return (
      <div className="home g-home">
        {bandHost && createPortal(<p className="g-lead">{t('home.lead')}</p>, bandHost)}
        <ul className="entries g-entries">
          {NAV.map((e) => (
            <li key={e.id}>
              <a className="entry-button" href={entryHash(e.id)}>
                <span className="en" lang="en">{t(e.en)}</span>
                <b>{t(e.label)}</b>
                <Icon name="chevRight" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (basicPc) {
    return (
      <div className="home b-home">
        <h1>{t('home.title')}</h1>
        <p className="b-home-lead">{t('basicPc.homeLead')}</p>
        <ul className="entries">
          {basicHomeEntries(NAV, dictionaries.ja).map((e) => (
            <li key={e.id}>
              <a className="entry-button" href={entryHash(e.id)}>
                <b>{t(e.label)}</b>
                <span>{e.descriptionKey ? t(e.descriptionKey) : ''}</span>
                <Icon name="chevRight" />
              </a>
            </li>
          ))}
        </ul>
        <p className="b-home-note">{t('basicPc.homeDataNote')}</p>
      </div>
    )
  }
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
