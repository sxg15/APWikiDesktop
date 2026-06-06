export const defaultLanguage = "zh";

export const supportedLanguages = [
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "en", flag: "🇺🇸", label: "English" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
  { code: "ru", flag: "🇷🇺", label: "Русский" },
] as const;

export type LanguageCode = (typeof supportedLanguages)[number]["code"];

export function normalizeLanguage(value?: string): LanguageCode {
  return supportedLanguages.some((language) => language.code === value)
    ? (value as LanguageCode)
    : defaultLanguage;
}

export function languageName(code: LanguageCode) {
  return (
    supportedLanguages.find((language) => language.code === code)?.label ??
    code
  );
}
