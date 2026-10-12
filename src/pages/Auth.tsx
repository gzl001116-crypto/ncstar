import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../hooks";
import { isMessage, useI18n } from "../i18n";
import { safeNext } from "../site";
import { useStore } from "../store";

export function Auth({ mode }: { mode: "login" | "register" }) {
  const { t, lang } = useI18n();
  useTitle(mode === "login" ? t("auth.loginTitle") : t("auth.registerTitle"));
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
    const dest = safeNext(next);
    if (!dest) {
      navigate(mode === "register" && form.isCreator ? "/studio" : "/");
      return;
    }
    if (dest.startsWith("/")) navigate(dest);
    else window.location.assign(dest);
  };

  const sendCode = async () => {
    setError("");
    const email = form.email.trim();
    if (!email) {
      setError(t("err.email.first"));
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang }),
      });
      const data = (await response.json().catch(() => ({}))) as { code?: string; error?: string; token?: string; expiresAt?: number };
      if (!response.ok || !data.token || !data.expiresAt) {
        const key = data.code || data.error || "";
        setError(isMessage(key) ? t(key) : key || t("err.code.send"));
        return;
      }
      setTicket({ token: data.token, expiresAt: data.expiresAt });
      setCode("");
      setCooldown(60);
    } catch {
      setError(t("err.network.code"));
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "register") {
      if (!ticket) {
        setError(t("err.code.first"));
        return;
      }
      if (!/^\d{6}$/.test(code)) {
        setError(t("err.code.digits"));
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
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page auth-wrap">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="kicker">{mode === "login" ? t("auth.welcome") : t("auth.new")}</p>
        <h1>{mode === "login" ? t("auth.loginH") : t("auth.registerH")}</h1>
        <p className="muted">{mode === "register" ? t("auth.registerLead") : t("auth.loginLead")}</p>
        {mode === "register" && (
          <>
            <label>
              {t("auth.name")}
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              {t("auth.handle")}
              <input
                value={form.handle}
                placeholder={t("auth.handlePh")}
                onChange={(event) => setForm({ ...form, handle: event.target.value })}
                required
              />
            </label>
          </>
        )}
        <label>
          {t("auth.email")}
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
                {sending ? t("auth.sending") : cooldown > 0 ? t("auth.seconds", { n: cooldown }) : t("auth.getCode")}
              </button>
            )}
          </span>
        </label>
        {mode === "register" && (
          <label>
            {t("auth.code")}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              placeholder={t("auth.codePh")}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
          </label>
        )}
        {mode === "register" && ticket && <p className="banner-note">{t("auth.codeSent")}</p>}
        <label>
          {t("auth.password")}
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
            {t("auth.creatorCheck")}
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {mode === "register" && (
          <p className="fineprint">
            {t("auth.agreeBefore")} <Link to="/terms">{t("footer.terms")}</Link> {t("auth.agreeMid")}{" "}
            <Link to="/privacy">{t("footer.privacy")}</Link>
            {t("auth.agreeAfter")}
          </p>
        )}
        <button className="btn btn-dark btn-block" type="submit" disabled={busy}>
          {busy ? t("common.wait") : mode === "login" ? t("login") : t("register")}
        </button>
        {mode === "login" ? (
          <p>
            {t("auth.noAccount")} <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("register")}</Link>
          </p>
        ) : (
          <p>
            {t("auth.hasAccount")} <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("login")}</Link>
          </p>
        )}
      </form>
    </div>
  );
}
