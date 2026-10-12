import { Link } from "react-router-dom";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";

export function About() {
  const { t } = useI18n();
  useTitle(t("about.title"));
  return (
    <article className="page reading prose-page">
      <p className="kicker">{t("about.kicker")}</p>
      <h1>{t("about.h1")}</h1>
      <p>{t("about.p1")}</p>
      <p>{t("about.p2")}</p>
      <h2>{t("about.h2")}</h2>
      <p>{t("about.p3")}</p>
      <p>
        <Link to="/explore">{t("about.explore")}</Link>
        <span> · </span>
        <Link to="/terms">{t("footer.terms")}</Link>
        <span> · </span>
        <Link to="/privacy">{t("footer.privacy")}</Link>
      </p>
    </article>
  );
}
