import { applyLocale, detectLanguage, LANGUAGES, STORAGE_KEY, withLangQuery } from './locale.js';
import { createTranslator } from './LocalizationContext.jsx';

describe('client localization', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/login');
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
  });

  test('uses a valid URL language before saved and browser languages', () => {
    localStorage.setItem(STORAGE_KEY, 'ru');
    window.history.replaceState({}, '', '/login?lang=de');
    expect(detectLanguage()).toBe('de');
  });

  test('ignores an unsupported URL language and uses saved language', () => {
    localStorage.setItem(STORAGE_KEY, 'ru');
    window.history.replaceState({}, '', '/login?lang=unsupported');
    expect(detectLanguage()).toBe('ru');
  });

  test('switching language synchronizes storage, document, and URL', () => {
    applyLocale('fr');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(window.location.search).toBe('?lang=fr');
  });

  test('sets RTL direction for RTL locales', () => {
    applyLocale('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  test('preserves language on internal navigation', () => {
    expect(withLangQuery('/board/42?view=list#top', 'ru')).toBe('/board/42?view=list&lang=ru#top');
  });

  test('contains the exact Misa locale set and representative RU/EN copy', () => {
    expect(LANGUAGES).toHaveLength(76);
    expect(createTranslator('ru')('Вход')).toBe('Вход');
    expect(createTranslator('en')('Вход')).toBe('Sign in');
    expect(createTranslator('en')('Мои команды и доски')).toBe('My teams and boards');
  });
});
