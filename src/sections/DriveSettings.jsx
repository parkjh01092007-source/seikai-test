import { useState, useEffect } from 'react'
import './saveload.css'
import { t } from '../text.js'
import { versionLabel } from '../pwa.js'
import { LOGIN_ERROR_KEYS } from '../driveLogic.js'
import DriveCopy from './DriveCopy.jsx'
import { CHANGE_EVENT, isConfigured, getSync, getToken, getLoginError, startLogin, disconnect } from '../driveStore.js'
import { Icon } from './Icon.jsx'
import { useGunjoPc } from '../gunjoPc.js'

// 設定 → データ → Google ドライブ（spec-drive.md 5章）：つなぐ・切る、つないでいるアカウント、ログインの状態、最後に同期した日時。
// 覚えていること（つないでいるか・アカウント・鍵）は driveStore が持つ。変わったら CHANGE_EVENT で知らされる。保存データには触らない
export default function DriveSettings({ tab }) {
  const [, redraw] = useState(0)
  const gunjoPc = useGunjoPc() // 群青の PC：「Google ドライブにつなぐ」は、幅いっぱいの大きい青いボタン（見本 E-set3）
  useEffect(() => {
    const on = () => redraw((n) => n + 1)
    window.addEventListener(CHANGE_EVENT, on)
    return () => window.removeEventListener(CHANGE_EVENT, on)
  }, [])

  const sync = getSync()
  const loggedIn = getToken() !== null
  const errorKey = getLoginError()
  const login = () => { startLogin(tab); redraw((n) => n + 1) } // 移れないときは、理由が覚えられるので、描き直して出す
  const lastSync = sync.lastSyncedAt ? versionLabel(sync.lastSyncedAt, null) : null

  return (
    <section className="save-settings">
      <p className="note">{t('drive.desc')}</p>
      {!isConfigured() && <p className="note">{t('drive.notConfigured')}</p>}
      {sync.connected ? (
        <>
          <p>{t('drive.account', { account: sync.account ?? t(loggedIn ? 'drive.accountChecking' : 'drive.accountUnknown') })}</p>
          <p>{t(loggedIn ? 'drive.loginOk' : 'drive.loginExpired')}</p>
          <p>{t('drive.lastSync', { time: lastSync ?? t('drive.never') })}</p>
          <div className="row">
            {!loggedIn && <button type="button" onClick={login}>{t('drive.reconnect')}</button>}
            <button type="button" onClick={disconnect}><Icon name="cloudOff" />{t('drive.disconnect')}</button>
          </div>
          <p className="note">{t('drive.keptNote')}</p>
          <DriveCopy />
        </>
      ) : (
        <div className="row">
          <button type="button" className={gunjoPc ? 'primary large g-wide' : undefined} onClick={login} disabled={!isConfigured()}>{t('drive.connect')}</button>
        </div>
      )}
      {errorKey && <p className="error" role="alert">{t(LOGIN_ERROR_KEYS[errorKey])}</p>}
    </section>
  )
}
