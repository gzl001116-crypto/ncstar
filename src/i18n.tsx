import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { en } from "./locales/en";
import { ja } from "./locales/ja";
import { zh, type Dict, type MessageKey } from "./locales/zh";
import { zhHant } from "./locales/zh-Hant";
import { formatDate } from "./utils";

export type Lang = "zh" | "zh-Hant" | "ja" | "en";

const dicts: Record<Lang, Dict> = { zh, "zh-Hant": zhHant, ja, en };

const HTML_LANG: Record<Lang, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  ja: "ja",
  en: "en",
};

const LOCALE: Record<Lang, string> = {
  zh: "zh-CN",
  "zh-Hant": "zh-TW",
  ja: "ja-JP",
  en: "en-US",
};

export function detectLanguage(languages: readonly string[] = []): Lang {
  for (const raw of languages) {
    const tag = raw.toLowerCase().replace(/_/g, "-");
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("zh")) {
      if (/(^|-)(tw|hk|mo|hant)(-|$)/.test(tag)) return "zh-Hant";
      return "zh";
    }
    if (tag.startsWith("en")) return "en";
  }
  return "zh";
}

export function isMessage(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(zh, key);
}

function fill(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (vars[name] == null ? "" : String(vars[name])));
}

type I18nValue = {
  lang: Lang;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  phrase: (value: string) => string;
  rel: (iso: string) => string;
  rank: (value: number) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function makeI18n(lang: Lang): I18nValue {
  const table = dicts[lang];
  const t = (key: string, vars?: Record<string, string | number>) => {
    const raw = (isMessage(key) ? table[key] : undefined) ?? (isMessage(key) ? zh[key] : key);
    return fill(raw, vars);
  };
  return {
    lang,
    locale: LOCALE[lang],
    t,
    phrase: (value: string) => {
      const key = `phrase.${value}`;
      return isMessage(key) ? table[key] : value;
    },
    rel: (iso: string) => {
      const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
      if (days <= 0) return t("rel.today");
      if (days === 1) return t("rel.yesterday");
      if (days < 30) return t("rel.days", { n: days });
      return formatDate(iso);
    },
    rank: (value: number) => {
      if (value <= 0) return t("rank.public");
      if (value === 1) return t("rank.member");
      return t("rank.higher");
    },
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useMemo(
    () => detectLanguage(typeof navigator === "undefined" ? [] : navigator.languages),
    [],
  );
  const value = useMemo(() => makeI18n(lang), [lang]);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", value.t("meta.description"));
  }, [lang, value]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18n missing");
  return value;
}
