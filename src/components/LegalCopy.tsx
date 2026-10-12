import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { ja } from "../locales/ja";
import type { MessageKey } from "../locales/zh";

export const TERMS_BLOCKS = [
  ["terms.hOperator", "terms.pOperator"],
  ["terms.hAccount", "terms.pAccount"],
  ["terms.hRoles", "terms.pRoles"],
  ["terms.hDigital", "terms.pDigital"],
  ["terms.hPlay", "terms.pPlay"],
  ["terms.hFee", "terms.pFee"],
  ["terms.hReturn", "terms.pReturn"],
  ["terms.hBad", "terms.pBad"],
  ["terms.hChange", "terms.pChange"],
  ["terms.hContact", "terms.pContact"],
] as const;

export const PRIVACY_BLOCKS = [
  ["privacy.hWho", "privacy.pWho"],
  ["privacy.hCollect", "privacy.pCollect"],
  ["privacy.hCookie", "privacy.pCookie"],
  ["privacy.hEmail", "privacy.pEmail"],
  ["privacy.hPay", "privacy.pPay"],
  ["privacy.hUse", "privacy.pUse"],
  ["privacy.hShare", "privacy.pShare"],
  ["privacy.hKeep", "privacy.pKeep"],
  ["privacy.hKids", "privacy.pKids"],
  ["privacy.hChange", "privacy.pChange"],
] as const;

type Blocks = ReadonlyArray<readonly [MessageKey, MessageKey]>;

export function LegalBlocks({ blocks }: { blocks: Blocks }) {
  const { t } = useI18n();
  return (
    <>
      {blocks.map(([heading, body]) => (
        <section key={heading}>
          <h2>{t(heading)}</h2>
          <p>{t(body)}</p>
        </section>
      ))}
    </>
  );
}

export function JapaneseLegal({ title, note, blocks }: { title: string; note: MessageKey; blocks: Blocks }) {
  const { lang } = useI18n();
  if (lang === "ja") return null;
  return (
    <>
      <h2>{title}</h2>
      <p>{ja[note]}</p>
      {blocks.map(([heading, body]) => (
        <section key={`ja-${heading}`}>
          <h3>{ja[heading]}</h3>
          <p>{ja[body]}</p>
        </section>
      ))}
    </>
  );
}

export function LegalLinks() {
  const { t } = useI18n();
  return (
    <p>
      <Link to="/terms">{t("footer.terms")}</Link>
      <span> · </span>
      <Link to="/privacy">{t("footer.privacy")}</Link>
      <span> · </span>
      <Link to="/tokushoho">{t("footer.tokushoho")}</Link>
    </p>
  );
}
