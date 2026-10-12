import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { isAbsolute, playPath, shopHref } from "../site";
import { useStore } from "../store";

function Jump({ to, className, children, end, nav }: { to: string; className?: string; children: ReactNode; end?: boolean; nav?: boolean }) {
  if (isAbsolute(to)) {
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  }
  if (nav) {
    return (
      <NavLink to={to} end={end} className={className}>
        {children}
      </NavLink>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

export function PlayLayout() {
  const { t } = useI18n();
  const { toasts } = useStore();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="shell play-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Jump to={playPath()} className="brand">
            <span className="play-mark">▶</span>
            <span>play.fanstar</span>
          </Jump>
          <nav className="nav-links">
            <Jump to={playPath()} end nav>
              {t("play.library")}
            </Jump>
            <Jump to={shopHref("/explore")} nav>
              {t("play.shopLink")}
            </Jump>
          </nav>
          <div className="nav-actions">
            <Jump to={shopHref("/")} className="btn btn-line btn-small">
              {t("play.back")}
            </Jump>
            <button
              className="menu-btn"
              type="button"
              aria-label={open ? t("menu.close") : t("menu.open")}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
        {open && (
          <div className="mobile-panel">
            <Jump to={playPath()} end nav>
              {t("play.library")}
            </Jump>
            <Jump to={shopHref("/explore")} nav>
              {t("play.shopLink")}
            </Jump>
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="play-legal">
        <Jump to={shopHref("/terms")}>{t("footer.terms")}</Jump>
        <Jump to={shopHref("/privacy")}>{t("footer.privacy")}</Jump>
        <Jump to={shopHref("/tokushoho")}>{t("footer.tokushoho")}</Jump>
      </footer>
      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <div className="toast" key={item.id}>
            {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
