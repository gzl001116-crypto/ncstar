import { useTitle } from "../hooks";
import { useI18n } from "../i18n";

export function Terms() {
  const { t } = useI18n();
  useTitle(t("terms.title"));
  return (
    <article className="page reading prose-page">
      <p className="kicker">{t("terms.kicker")}</p>
      <h1>{t("terms.h1")}</h1>
      <p>{t("terms.lead")}</p>
      <h2>{t("terms.hAccount")}</h2>
      <p>{t("terms.pAccount")}</p>
      <h2>{t("terms.hRoles")}</h2>
      <p>{t("terms.pRoles")}</p>
      <h2>{t("terms.hDigital")}</h2>
      <p>{t("terms.pDigital")}</p>
      <h2>{t("terms.hFee")}</h2>
      <p>{t("terms.pFee")}</p>
      <h2>{t("terms.hBad")}</h2>
      <p>{t("terms.pBad")}</p>
    </article>
  );
}
