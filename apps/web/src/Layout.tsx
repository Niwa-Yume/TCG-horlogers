import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MuteButton, SoundCaption, useOnline } from '@wm/ui';
import s from './layout.module.css';

export function Layout() {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  return (
    <>
      <header className={s.header}>
        <div className={`wm-wrap ${s.bar}`}>
          <Link to="/" className={s.logo}>
            <span className={s.word}>WRISTMASTERS</span>
            <span className="wm-mono">TCG</span>
          </Link>
          <nav aria-label={t('nav.label')} className={`wm-mono ${s.nav}`}>
            <NavLink to="/" end>
              ({t('nav.catalogue')})
            </NavLink>
            <NavLink to="/systeme#raretes">({t('nav.rarities')})</NavLink>
            <NavLink to="/systeme" end>
              ({t('nav.system')})
            </NavLink>
          </nav>
          <div className={s.tools}>
            <button
              type="button"
              className={`wm-mono ${s.lang}`}
              lang={i18n.language === 'fr' ? 'en' : 'fr'}
              onClick={() => i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr')}
            >
              {t('lang.switch')}
            </button>
            <MuteButton />
          </div>
        </div>
      </header>
      {!online && (
        <p role="status" className={`wm-mono ${s.offline}`}>
          {t('offline')}
        </p>
      )}
      <main className={s.main}>
        <Outlet />
      </main>
      <footer className={s.footer}>
        <div className={`wm-wrap ${s.cols}`}>
          <div>
            <h2 className="wm-mono">({t('footer.credits')})</h2>
            <p className="wm-muted">{t('footer.creditsText')}</p>
          </div>
          <div>
            <p className="wm-muted">{t('footer.dials')}</p>
            <p className="wm-mono wm-muted">{t('footer.made')}</p>
          </div>
        </div>
        <p aria-hidden="true" className={s.giant}>
          WRISTMASTERS
        </p>
      </footer>
      <SoundCaption />
      <ScrollRestoration />
    </>
  );
}
