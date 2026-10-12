import { LegalBlocks, JapaneseLegal, LegalLinks, TERMS_BLOCKS } from "../components/LegalCopy";
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
      <p>
        {t("terms.urlLabel")}{" "}
        <a className="legal-url" href="https://fanstar.dev/terms">
          https://fanstar.dev/terms
        </a>
      </p>
      <LegalBlocks blocks={TERMS_BLOCKS} />
      <LegalLinks />
      <JapaneseLegal title="利用規約" note="terms.statutory" blocks={TERMS_BLOCKS} />
    </article>
  );
}
