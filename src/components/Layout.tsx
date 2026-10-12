import { FormEvent, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { Avatar } from "./Cover";

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="M16 5.2c.7 4.5 3.1 7.8 7.4 8.8-4.3.9-6.7 4.2-7.4 8.8-.7-4.6-3.1-7.9-7.4-8.8 4.3-1 6.7-4.3 7.4-8.8z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function Layout() {
  const { t } = useI18n();
  const { user, logout, toasts } = useStore();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const cartCount = user?.cart.length ?? 0;

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [location.pathname, location.search]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/explore?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <Mark />
            <span>{t("brand")}</span>
          </Link>
          <nav className="nav-links">
            <NavLink to="/explore">{t("nav.explore")}</NavLink>
            <NavLink to="/studio">{t("nav.studio")}</NavLink>
            <NavLink to="/about">{t("nav.about")}</NavLink>
          </nav>
          <form className="search" onSubmit={onSearch}>
            <input
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search.placeholder")}
              aria-label={t("search.label")}
            />
          </form>
          <div className="nav-actions">
            <Link to="/checkout" className="cart-link" aria-label={t("cart")}>
              {t("cart")}
              {cartCount > 0 && <span className="badge">{cartCount}</span>}
            </Link>
            {user ? (
              <div className="account">
                <button className="account-btn" type="button" onClick={() => setMenu((value) => !value)} aria-expanded={menu}>
                  <Avatar name={user.name} id={user.handle} size={32} />
                  <span>{user.name}</span>
                </button>
                {menu && (
                  <div className="menu-pop">
                    <Link to="/library">{t("library")}</Link>
                    <Link to="/studio">{t("nav.studio")}</Link>
                    {user.isCreator && <Link to={`/c/${user.handle}`}>{t("my.page")}</Link>}
                    <button type="button" onClick={logout}>
                      {t("logout")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" className="btn btn-dark btn-small">
                {t("login")}
              </Link>
            )}
            <button className="menu-btn" type="button" aria-label={open ? t("menu.close") : t("menu.open")} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              <span />
              <span />
            </button>
          </div>
        </div>
        {open && (
          <div className="mobile-panel">
            <form onSubmit={onSearch}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search.short")}
                aria-label={t("search.label")}
              />
            </form>
            <NavLink to="/explore">{t("nav.explore")}</NavLink>
            <NavLink to="/studio">{t("nav.studio")}</NavLink>
            <NavLink to="/about">{t("nav.about")}</NavLink>
            <NavLink to="/library">{t("library")}</NavLink>
            <NavLink to="/checkout">{t("cart")}</NavLink>
          </div>
        )}
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <div>
            <Link to="/" className="brand">
              <Mark />
              <span>{t("brand")}</span>
            </Link>
            <p>{t("footer.blurb")}</p>
          </div>
          <div>
            <strong>{t("footer.browse")}</strong>
            <Link to="/explore">{t("nav.explore")}</Link>
            <Link to="/about">{t("footer.about")}</Link>
            <Link to="/terms">{t("footer.terms")}</Link>
            <Link to="/tokushoho">{t("footer.tokushoho")}</Link>
          </div>
          <div>
            <strong>{t("footer.account")}</strong>
            <Link to="/register">{t("register")}</Link>
            <Link to="/login">{t("login")}</Link>
            <Link to="/library">{t("library")}</Link>
            <Link to="/studio">{t("nav.studio")}</Link>
          </div>
        </div>
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
