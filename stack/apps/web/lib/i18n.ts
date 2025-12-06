import enGB from "../locales/en-GB.json";

export type Locale = "en-GB";

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${NestedKeyOf<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

type LocaleStrings = typeof enGB;
export type TranslationKey = NestedKeyOf<LocaleStrings>;

const locales: Record<Locale, LocaleStrings> = {
  "en-GB": enGB,
};

const defaultLocale: Locale = "en-GB";

const getNestedValue = (obj: Record<string, unknown>, path: string): string => {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return path;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : path;
};

export const t = (
  key: string,
  params?: Record<string, string | number>,
  locale: Locale = defaultLocale
): string => {
  const strings = locales[locale];
  let value = getNestedValue(strings as unknown as Record<string, unknown>, key);

  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      value = value.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
    });
  }

  return value;
};

export const useTranslation = (locale: Locale = defaultLocale) => {
  const translate = (key: string, params?: Record<string, string | number>): string => {
    return t(key, params, locale);
  };

  return { t: translate, locale };
};

export const getLocaleStrings = (locale: Locale = defaultLocale): LocaleStrings => {
  return locales[locale];
};
