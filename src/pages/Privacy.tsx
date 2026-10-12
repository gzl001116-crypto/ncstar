import { LegalBlocks, LegalLinks, PRIVACY_BLOCKS } from "../components/LegalCopy";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";

export function Privacy() {
  const { t } = useI18n();
  useTitle(t("privacy.title"));
  return (
    <article className="page reading prose-page">
      <p className="kicker">{t("privacy.kicker")}</p>
      <h1>{t("privacy.h1")}</h1>
      <p>{t("privacy.lead")}</p>
      <p>
        {t("privacy.urlLabel")}{" "}
        <a className="legal-url" href="https://fanstar.dev/privacy">
          https://fanstar.dev/privacy
        </a>
      </p>
      <LegalBlocks blocks={PRIVACY_BLOCKS} />
      <LegalLinks />
    </article>
  );
}
