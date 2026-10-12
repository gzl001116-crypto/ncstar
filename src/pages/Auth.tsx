import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../hooks";
import { useStore } from "../store";

export function Auth({ mode }: { mode: "login" | "register" }) {
  useTitle(mode === "login" ? "登录 · 星页" : "注册 · 星页");
  const { login, register } = useStore();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState<{ token: string; expiresAt: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    handle: "",
    bio: "",
    isCreator: params.get("as") === "creator",
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const go = () => {
    if (next && next.startsWith("/") && !next.startsWith("//")) navigate(next);
    else navigate(mode === "register" && form.isCreator ? "/studio" : "/");
  };

  const sendCode = async () => {
    setError("");
    const email = form.email.trim();
    if (!email) {
      setError("先填写邮箱");
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; token?: string; expiresAt?: number };
      if (!response.ok || !data.token || !data.expiresAt) {
        setError(data.error || "验证码没有发出");
        return;
      }
      setTicket({ token: data.token, expiresAt: data.expiresAt });
      setCode("");
      setCooldown(60);
    } catch {
      setError("网络异常，验证码没有发出");
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register") {
      if (!ticket) {
        setError("请先获取邮箱验证码");
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        setError("请输入 6 位验证码");
        return;
      }
    }
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await login(form.email, form.password)
          : await register({
              ...form,
              code,
              token: ticket?.token ?? "",
              expiresAt: ticket?.expiresAt ?? 0,
            });
      if (result) {
        setError(result);
        return;
      }
      go();
    } catch {
      setError("网络异常，请稍后再试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="kicker">{mode === "login" ? "欢迎回来" : "新的一页"}</p>
        <h1>{mode === "login" ? "登录星页" : "创建账号"}</h1>
        <p className="muted">
          {mode === "register"
            ? "注册前会向邮箱发送 6 位验证码。账号会保存在星页，换一台设备也能登录。"
            : "使用注册时的邮箱和密码登录。"}
        </p>
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
          <span className="code-row">
            <input
              type="email"
              value={form.email}
              onChange={(event) => {
                setForm({ ...form, email: event.target.value });
                setTicket(null);
              }}
              required
            />
            {mode === "register" && (
              <button className="btn btn-line" type="button" onClick={sendCode} disabled={sending || cooldown > 0}>
                {sending ? "发送中" : cooldown > 0 ? `${cooldown} 秒` : "获取验证码"}
              </button>
            )}
          </span>
        </label>
        {mode === "register" && (
          <label>
            邮箱验证码
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              placeholder="6 位数字"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </label>
        )}
        {mode === "register" && ticket && <p className="banner-note">验证码已发到邮箱，10 分钟内有效。</p>}
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
        <button className="btn btn-dark btn-block" type="submit" disabled={busy}>
          {busy ? "请稍候" : mode === "login" ? "登录" : "注册"}
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
      </form>
    </div>
  );
}
