import { Link } from "react-router-dom";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";
import type { MessageKey } from "../locales/zh";

const LABELS = ["toku.l0", "toku.l1", "toku.l2", "toku.l3", "toku.l4", "toku.l5", "toku.l6", "toku.l7", "toku.l8", "toku.l9", "toku.l10", "toku.l11", "toku.l12"] as const;
const VALUES = ["toku.v0", "toku.v1", "toku.v2", "toku.v3", "toku.v4", "toku.v5", "toku.v6", "toku.v7", "toku.v8", "toku.v9", "toku.v10", "toku.v11", "toku.v12"] as const;

export function Tokushoho() {
  const { t } = useI18n();
  useTitle(t("toku.docTitle"));
  const rows = LABELS.map((label, index) => [t(label), t(VALUES[index] as MessageKey)] as [string, string]);

  return (
    <article className="page reading prose-page">
      <p className="kicker">{t("toku.kicker")}</p>
      <h1>{t("toku.h1")}</h1>
      <p>{t("toku.intro")}</p>
      <table className="legal-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value === "support@fanstar.dev" ? <a href={`mailto:${value}`}>{value}</a> : value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <Link to="/">{t("toku.home")}</Link>
        <span> · </span>
        <Link to="/terms">{t("footer.terms")}</Link>
        <span> · </span>
        <Link to="/privacy">{t("footer.privacy")}</Link>
      </p>
    </article>
  );
}
