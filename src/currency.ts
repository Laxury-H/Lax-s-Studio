import type { DisplayCurrency } from "./types";

export const SUPPORTED_DISPLAY_CURRENCIES: Array<{
  code: DisplayCurrency;
  label: string;
  name: string;
  locale: string;
}> = [
  { code: "USD", label: "USD", name: "US Dollar", locale: "en-US" },
  { code: "VND", label: "VND", name: "Vietnamese Dong", locale: "vi-VN" },
  { code: "EUR", label: "EUR", name: "Euro", locale: "de-DE" },
  { code: "JPY", label: "JPY", name: "Japanese Yen", locale: "ja-JP" },
  { code: "SGD", label: "SGD", name: "Singapore Dollar", locale: "en-SG" },
  { code: "GBP", label: "GBP", name: "British Pound", locale: "en-GB" }
];

const supportedCodes = new Set(SUPPORTED_DISPLAY_CURRENCIES.map(currency => currency.code));

export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === "string" && supportedCodes.has(value as DisplayCurrency);
}

export function normalizeCurrencyCode(value?: string): DisplayCurrency {
  const normalized = (value || "USD").trim().toUpperCase();
  if (isDisplayCurrency(normalized)) return normalized;
  if (["$", "US$", "USD$"].includes(normalized)) return "USD";
  if (["₫", "Đ", "D", "VND"].includes(normalized)) return "VND";
  if (["€", "EUR"].includes(normalized)) return "EUR";
  if (["¥", "JPY"].includes(normalized)) return "JPY";
  if (["S$", "SGD"].includes(normalized)) return "SGD";
  if (["£", "GBP"].includes(normalized)) return "GBP";
  return "USD";
}

function currencyLocale(currency: DisplayCurrency) {
  return SUPPORTED_DISPLAY_CURRENCIES.find(item => item.code === currency)?.locale || "en-US";
}

function fractionDigits(currency: DisplayCurrency, compact?: boolean) {
  if (compact) return 1;
  if (currency === "VND" || currency === "JPY") return 0;
  return 2;
}

export function convertCurrencyValue(
  value: number,
  fromCurrency: string | undefined,
  toCurrency: DisplayCurrency,
  rates: Record<string, number>
) {
  if (!Number.isFinite(value)) return 0;
  const from = normalizeCurrencyCode(fromCurrency);
  if (from === toCurrency) return value;

  const sourceRate = from === "USD" ? 1 : rates[from];
  const targetRate = toCurrency === "USD" ? 1 : rates[toCurrency];

  if (!sourceRate || !targetRate) return value;
  return (value / sourceRate) * targetRate;
}

export function formatCurrencyValue(
  value: number,
  fromCurrency: string | undefined,
  toCurrency: DisplayCurrency,
  rates: Record<string, number>,
  options: { compact?: boolean } = {}
) {
  const converted = convertCurrencyValue(value, fromCurrency, toCurrency, rates);
  const digits = fractionDigits(toCurrency, options.compact);

  return new Intl.NumberFormat(currencyLocale(toCurrency), {
    style: "currency",
    currency: toCurrency,
    notation: options.compact ? "compact" : "standard",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(converted);
}
