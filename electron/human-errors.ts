import { ProviderHttpError } from "./providers/errors.js";
import type { UiLanguage } from "./shared/ipc-contract.js";

// One sentence the user can act on, for the "test key" button. Main-process
// text because it is built from the provider's answer; both languages here.
const TEXT: Record<UiLanguage, Record<string, string>> = {
  en: {
    noKey: "No key is saved for this provider yet. Paste it and press Save.",
    auth: "The provider did not accept this key. Check that it was copied whole and is still active.",
    model: "The provider does not know this model name. Check the model in the settings.",
    rate: "The provider refused for now: rate limit or no credit left on the account.",
    network: "Could not reach the provider. Check the internet connection or the base URL.",
    server: "The provider had a problem on its side. Try again in a minute.",
    other: "The test call failed:",
  },
  ru: {
    noKey: "Для этого провайдера ещё нет ключа. Вставьте его и нажмите Сохранить.",
    auth: "Провайдер не принял ключ. Проверьте, что он скопирован целиком и ещё действует.",
    model: "Провайдер не знает такой модели. Проверьте название модели в настройках.",
    rate: "Провайдер пока отказывает: лимит запросов или на счёте закончились деньги.",
    network: "Не удалось связаться с провайдером. Проверьте интернет или базовый адрес.",
    server: "У провайдера сбой на его стороне. Попробуйте через минуту.",
    other: "Проверочный запрос не прошёл:",
  },
};

export function humanProviderError(error: unknown, language: UiLanguage): string {
  const t = TEXT[language];
  if (error instanceof ProviderHttpError) {
    if (error.status === 401 || error.status === 403) return t.auth;
    if (error.status === 404) return t.model;
    if (error.status === 429 || error.status === 402) return t.rate;
    if (error.status >= 500) return t.server;
    return `${t.other} ${error.message.slice(0, 160)}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|timeout/i.test(message)) return t.network;
  return `${t.other} ${message.slice(0, 160)}`;
}

export function noKeyMessage(language: UiLanguage): string {
  return TEXT[language].noKey;
}
