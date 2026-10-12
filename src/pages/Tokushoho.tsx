import { Link } from "react-router-dom";
import { useTitle } from "../hooks";
import { useI18n } from "../i18n";

const LABELS = ["toku.l0", "toku.l1", "toku.l2", "toku.l3", "toku.l4", "toku.l5", "toku.l6", "toku.l7", "toku.l8", "toku.l9", "toku.l10", "toku.l11", "toku.l12"] as const;
const VALUES = ["toku.v0", "toku.v1", "toku.v2", "toku.v3", "toku.v4", "toku.v5", "toku.v6", "toku.v7", "toku.v8", "toku.v9", "toku.v10", "toku.v11", "toku.v12"] as const;

function Table({ rows }: { rows: Array<[string, string]> }) {
  return (
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
  );
}

export function Tokushoho() {
  const { t, lang } = useI18n();
  useTitle(t("toku.docTitle"));
  const rows = LABELS.map((label, index) => [t(label), t(VALUES[index])] as [string, string]);
  const statutory: Array<[string, string]> =
    lang === "ja" ? rows : LABELS.map((label, index) => [jaLabel(label), jaValue(VALUES[index])]);

  return (
    <article className="page reading prose-page">
      <p className="kicker">{t("toku.kicker")}</p>
      <h1>{t("toku.h1")}</h1>
      <p>{t("toku.intro")}</p>
      <Table rows={lang === "ja" ? statutory : rows} />
      {lang !== "ja" && (
        <>
          <h2>特定商取引法に基づく表記</h2>
          <p>{t("toku.statutory")}</p>
          <Table rows={statutory} />
        </>
      )}
      <p>
        <Link to="/">{t("toku.home")}</Link>
        <span> · </span>
        <Link to="/terms">{t("toku.terms")}</Link>
      </p>
    </article>
  );
}

function jaLabel(key: (typeof LABELS)[number]) {
  const map = {
    "toku.l0": "ショップ名",
    "toku.l1": "販売業者",
    "toku.l2": "運営統括責任者",
    "toku.l3": "所在地",
    "toku.l4": "電話番号",
    "toku.l5": "メールアドレス",
    "toku.l6": "販売価格",
    "toku.l7": "商品代金以外の必要料金",
    "toku.l8": "お支払方法",
    "toku.l9": "お支払時期",
    "toku.l10": "役務・商品の提供時期",
    "toku.l11": "返品・キャンセル",
    "toku.l12": "資格・免許",
  } as const;
  return map[key];
}

function jaValue(key: (typeof VALUES)[number]) {
  const map = {
    "toku.v0": "星页（Fanstar）",
    "toku.v1": "星页（fanstar.dev）の運営者",
    "toku.v2": "星页 運営担当",
    "toku.v3": "販売業者の登記または開業届に記載された事業所。お問い合わせは下記メールアドレスで受け付けます。",
    "toku.v4": "下記メールアドレスにてご連絡ください。",
    "toku.v5": "support@fanstar.dev",
    "toku.v6": "各作品・会員プランのページに税込価格を表示します。購入者が支払う金額は、そのページに表示された価格です。",
    "toku.v7":
      "購入者に商品代金以外の手数料はかかりません。表示価格が支払総額です。インターネット接続にかかる通信費はお客様のご負担です。プラットフォーム手数料（表示価格の 8%）はクリエイターの受取額から差し引き、購入者の支払額には加算しません。",
    "toku.v8":
      "注文画面に表示された方法でお支払いください。クレジットカード決済を利用する場合は決済代行の KOMOJU を通じ、カード番号は当サイトでは保持しません。",
    "toku.v9": "ご注文の確定時。クレジットカードの場合、引落日は各カード会社の規定によります。",
    "toku.v10":
      "デジタルコンテンツおよび会員資格は、注文確定後ただちに購入者のアカウントへ反映されます。物品の発送はありません。会員の有効期間は開通日から 30 日で、自動更新はありません。",
    "toku.v11":
      "デジタルコンテンツは提供開始後、返品・返金・途中解約による日割り返金には応じられません。購入前に作品ページまたは会員プランの内容をご確認ください。",
    "toku.v12": "古物、酒類、化粧品、医薬品の販売は行っていません。該当する販売許可はありません。",
  } as const;
  return map[key];
}
