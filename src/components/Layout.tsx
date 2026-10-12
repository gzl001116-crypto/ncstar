import { FormEvent, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  const { user, logout, toasts, reset } = useStore();
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
            <span>星页</span>
          </Link>
          <nav className="nav-links">
            <NavLink to="/explore">探索</NavLink>
            <NavLink to="/studio">创作台</NavLink>
            <NavLink to="/about">关于</NavLink>
          </nav>
          <form className="search" onSubmit={onSearch}>
            <input
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索创作者、动态、作品"
              aria-label="搜索"
            />
          </form>
          <div className="nav-actions">
            <Link to="/checkout" className="cart-link" aria-label="购物袋">
              购物袋
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
                    <Link to="/library">我的库</Link>
                    <Link to="/studio">创作台</Link>
                    {user.isCreator && <Link to={`/c/${user.handle}`}>我的主页</Link>}
                    <button type="button" onClick={logout}>
                      退出
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/login" className="btn btn-dark btn-small">
                登录
              </Link>
            )}
            <button className="menu-btn" type="button" aria-label={open ? "关闭菜单" : "打开菜单"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
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
                placeholder="搜索"
                aria-label="搜索"
              />
            </form>
            <NavLink to="/explore">探索</NavLink>
            <NavLink to="/studio">创作台</NavLink>
            <NavLink to="/about">关于</NavLink>
            <NavLink to="/library">我的库</NavLink>
            <NavLink to="/checkout">购物袋</NavLink>
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
              <span>星页</span>
            </Link>
            <p>把作品交给真正喜欢它的人。动态、数字商店，以及 30 天、不自动续费的会员。</p>
          </div>
          <div>
            <strong>逛一逛</strong>
            <Link to="/explore">探索</Link>
            <Link to="/about">关于星页</Link>
            <Link to="/terms">使用条款</Link>
          </div>
          <div>
            <strong>演示账号</strong>
            <p>支持者 fan@xingye.app</p>
            <p>创作者 studio@xingye.app</p>
            <p>密码都是 xingye123</p>
            <button type="button" className="text-btn" onClick={reset}>
              重置演示数据
            </button>
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
