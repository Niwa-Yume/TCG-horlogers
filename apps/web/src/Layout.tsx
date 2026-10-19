import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { useTranslation } from 'react-i18next';
import { buttonClass, MuteButton, SoundCaption, StepTimer, useOnline } from '@wm/ui';
import { useMe } from './api';
import s from './layout.module.css';

export function Layout() {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const me = useMe();
  const stock = me.data?.stock ?? 3;
  return (
    <>
      <header className={s.header}>
        <div className={`wm-wrap ${s.bar}`}>
          <Link to="/" className={s.logo}>
            <span className={s.word}>WRISTMASTERS</span>
            <span className="wm-mono">TCG</span>
          </Link>
          <nav aria-label={t('nav.label')} className={`wm-mono ${s.nav}`}>
            <NavLink to="/collection">({t('nav2.collection')})</NavLink>
            <NavLink to="/catalogue">({t('nav.catalogue')})</NavLink>
            <NavLink to="/duel">({t('nav2.duel')})</NavLink>
            <Link to="/#comment">({t('nav2.how')})</Link>
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
            <Link to="/remonter" className={`${buttonClass('primary')} ${s.cta}`}>
              {t('nav2.wind')} <span aria-hidden="true">→</span>
            </Link>
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
      <nav aria-label={t('nav2.game')} className={`wm-mono ${s.game}`}>
        <NavLink to="/remonter">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
          </svg>
          {stock > 0 || !me.data?.nextAt ? (
            <span>
              {t('nav2.wind')} · {stock}
            </span>
          ) : (
            <StepTimer to={Date.parse(me.data.nextAt)} onDone={() => void me.refetch()} />
          )}
        </NavLink>
        <NavLink to="/collection">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="4" y="3" width="10" height="14" />
            <path d="M8 21h11V7" />
          </svg>
          <span>{t('nav2.album')}</span>
        </NavLink>
        <NavLink to="/catalogue">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M4 5h16M4 12h16M4 19h16" />
          </svg>
          <span>{t('nav.catalogue')}</span>
        </NavLink>
        <NavLink to="/duel">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="8" height="12" transform="rotate(-8 7 11)" />
            <rect x="13" y="5" width="8" height="12" transform="rotate(8 17 11)" />
          </svg>
          <span>{t('nav2.duel')}</span>
        </NavLink>
      </nav>
      <SoundCaption />
      <ScrollRestoration />
    </>
  );
}
