import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../hooks";
import { isMessage, useI18n } from "../i18n";
import { safeNext } from "../site";
import { useStore } from "../store";

export function PasswordForm({ lockedEmail, redirect }: { lockedEmail?: string; redirect?: string }) {
  const { t, lang } = useI18n();
  const { changePassword } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ticket, setTicket] = useState<{ token: string; expiresAt: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (lockedEmail) setEmail(lockedEmail);
  }, [lockedEmail]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async () => {
    setError("");
    const address = (lockedEmail || email).trim();
    if (!address) {
      setError(t("err.email.first"));
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, lang }),
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
    if (!ticket) {
      setError(t("err.code.first"));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError(t("err.code.digits"));
      return;
    }
    if (password.length < 6) {
      setError(t("err.password"));
      return;
    }
    if (password !== confirm) {
      setError(t("err.password.match"));
      return;
    }
    setBusy(true);
    try {
      const result = await changePassword({
        email: lockedEmail || email,
        code,
        token: ticket.token,
        expiresAt: ticket.expiresAt,
        password,
      });
      if (result) {
        setError(result);
        return;
      }
      setCode("");
      setPassword("");
      setConfirm("");
      setTicket(null);
      const next = safeNext(redirect ?? params.get("next"));
      if (!next) return;
      if (next.startsWith("/")) navigate(next);
      else window.location.assign(next);
    } catch {
      setError(t("err.network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={redirect ? "auth-card" : "panel"} onSubmit={onSubmit}>
      {redirect ? (
        <>
          <p className="kicker">fanstar</p>
          <h1>{t("auth.resetH")}</h1>
          <p className="muted">{t("auth.resetLead")}</p>
        </>
      ) : (
        <>
          <h2>{t("page.passwordH")}</h2>
          <p className="muted">{t("auth.passwordLead")}</p>
        </>
      )}
      <label>
        {t("auth.email")}
        {lockedEmail ? (
          <input value={lockedEmail} readOnly />
        ) : (
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setTicket(null);
            }}
            required
          />
        )}
      </label>
      <button className="btn btn-line" type="button" onClick={sendCode} disabled={sending || cooldown > 0}>
        {sending ? t("auth.sending") : cooldown > 0 ? t("auth.seconds", { n: cooldown }) : t("auth.getCode")}
      </button>
      <label>
        {t("auth.code")}
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder={t("auth.codePh")}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          required
        />
      </label>
      {ticket && <p className="banner-note">{t("auth.codeSent")}</p>}
      <label>
        {t("auth.newPassword")}
        <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      <label>
        {t("auth.confirmPassword")}
        <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-dark" type="submit" disabled={busy}>
        {busy ? t("common.wait") : t("auth.changePassword")}
      </button>
    </form>
  );
}

export function ResetPassword() {
  const { t } = useI18n();
  useTitle(t("auth.resetTitle"));
  const { ready, user } = useStore();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next")) ?? "/";
  if (!ready) {
    return (
      <div className="page narrow">
        <p className="muted">{t("common.loading")}</p>
      </div>
    );
  }
  return (
    <div className="page auth-wrap">
      <PasswordForm lockedEmail={user?.email} redirect={next} />
    </div>
  );
}
