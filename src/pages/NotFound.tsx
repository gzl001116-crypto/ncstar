import { Link } from "react-router-dom";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";

export function NotFound() {
  const { t } = useI18n();
  useTitle(t("nf.title"));
  return (
    <div className="page narrow">
      <div className="empty">
        <p className="kicker">404</p>
        <h1>{t("nf.h1")}</h1>
        <p>{t("nf.p")}</p>
        <Link to="/explore" className="btn btn-dark">
          {t("nf.back")}
        </Link>
      </div>
    </div>
  );
}
