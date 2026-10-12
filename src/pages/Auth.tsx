import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../hooks";
import { useStore } from "../store";

const DEMOS = [
  { email: "fan@xingye.app", password: "xingye123", label: "支持者 · 周予安" },
  { email: "studio@xingye.app", password: "xingye123", label: "创作者 · 阿禾" },
];

export function Auth({ mode }: { mode: "login" | "register" }) {
  useTitle(mode === "login" ? "登录 · 星页" : "注册 · 星页");
  const { login, register } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    handle: "",
    bio: "",
    isCreator: params.get("as") === "creator",
  });

  const go = () => {
    if (next && next.startsWith("/") && !next.startsWith("//")) navigate(next);
    else navigate(mode === "register" && form.isCreator ? "/studio" : "/");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const result =
      mode === "login"
        ? login(form.email, form.password)
        : register(form);
    if (result) {
      setError(result);
      return;
    }
    go();
  };

  const fill = (email: string, password: string) => setForm((current) => ({ ...current, email, password }));

  return (
    <div className="page auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="kicker">{mode === "login" ? "欢迎回来" : "新的一页"}</p>
        <h1>{mode === "login" ? "登录星页" : "创建账号"}</h1>
        <p className="muted">账号只保存在这台浏览器里，用来演示关注、会员和购买。</p>
        {mode === "register" && (
          <>
            <label>
              名字
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              主页地址
              <input
                value={form.handle}
                placeholder="例如 heye"
                onChange={(event) => setForm({ ...form, handle: event.target.value })}
                required
              />
            </label>
          </>
        )}
        <label>
          邮箱
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </label>
        <label>
          密码
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
        </label>
        {mode === "register" && (
          <label className="check">
            <input
              type="checkbox"
              checked={form.isCreator}
              onChange={(event) => setForm({ ...form, isCreator: event.target.checked })}
            />
            我要开通创作页，发布动态和作品
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-dark btn-block" type="submit">
          {mode === "login" ? "登录" : "注册"}
        </button>
        {mode === "login" ? (
          <p>
            还没有账号？ <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>注册</Link>
          </p>
        ) : (
          <p>
            已有账号？ <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>登录</Link>
          </p>
        )}
        <div className="demo-accounts">
          <p className="muted">一键填入演示账号</p>
          {DEMOS.map((demo) => (
            <button key={demo.email} type="button" className="chip" onClick={() => fill(demo.email, demo.password)}>
              {demo.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
