import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { useStore } from "../store";

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
          <Link to="/play" className="brand">
            <span className="play-mark">▶</span>
            <span>play.fanstar</span>
          </Link>
          <nav className="nav-links">
            <NavLink to="/play" end>
              {t("play.library")}
            </NavLink>
            <NavLink to="/explore">{t("play.shopLink")}</NavLink>
          </nav>
          <div className="nav-actions">
            <Link to="/" className="btn btn-line btn-small">
              {t("play.back")}
            </Link>
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
            <NavLink to="/play" end>
              {t("play.library")}
            </NavLink>
            <NavLink to="/explore">{t("play.shopLink")}</NavLink>
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
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
