import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import catalog from './translations.json';
import { applyLocale, detectLanguage, getIntlLocale, LANGUAGES, RTL_CODES } from './locale.js';

const LocalizationContext = createContext(null);
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
const translatableAttributes = ['title', 'placeholder', 'aria-label'];
const EN_OVERRIDES = {
  'Канбан': 'Kanban',
  'Вход': 'Sign in',
  'Войти': 'Sign in',
  'Выйти': 'Sign out',
  'Регистрация': 'Create account',
  'Зарегистрироваться': 'Create account',
  'Пароль': 'Password',
  'Имя': 'Name',
  'Профиль': 'Profile',
  'Доски': 'Boards',
  'Участники': 'Members',
  'Язык': 'Language',
  'Загрузка...': 'Loading...',
  'Ошибка': 'Error',
  'Отмена': 'Cancel',
  'Сохранить': 'Save',
  'Удалить': 'Delete',
  'Создать': 'Create',
  'Добавить': 'Add',
  'Описание': 'Description',
  'Название': 'Name',
  'Неверный email или пароль.': 'Incorrect email or password.',
  'Мои команды и доски': 'My teams and boards',
  'Новая доска': 'New board',
  'Название доски': 'Board name',
  'Название команды': 'Team name',
  'Персонаж': 'Character',
  'Достижения': 'Achievements',
  'Навыки': 'Skills',
  'Комментарии': 'Comments',
  'Вложения': 'Attachments',
  'Архив': 'Archive',
  'К доске': 'Back to board',
  'Профиль и прогресс': 'Profile and progress',
  'Участники сайта': 'Site members',
  'Все зарегистрированные пользователи': 'All registered users',
  'Забыли пароль?': 'Forgot password?',
  'Восстановление пароля': 'Reset password',
  'Новый пароль': 'New password',
  'Сбросить пароль': 'Reset password',
  'Вернуться к входу': 'Back to sign in',
  'Вернуться ко входу': 'Back to sign in',
  'Войти через Google': 'Sign in with Google',
};

function translateTemplate(source, translated, value) {
  const names = [];
  const pattern = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\$\\\{([^}]+)\\\}/g, (_, name) => {
    names.push(name);
    return '(.+?)';
  });
  const match = value.match(new RegExp(`^${pattern}$`));
  if (!match) return null;
  let result = translated;
  names.forEach((name, index) => { result = result.replace(`\${${name}}`, match[index + 1]); });
  return result;
}

export function createTranslator(language) {
  const phrases = catalog[language]?.phrases || {};
  const templates = Object.keys(phrases).filter((key) => key.includes('${'));
  return (value, vars) => {
    if (value == null) return value;
    let source = String(value);
    if (language === 'en' && EN_OVERRIDES[source]) return EN_OVERRIDES[source];
    if (vars) {
      const translated = phrases[source] ?? source;
      return translated.replace(/\$\{([^}]+)\}/g, (_, name) => vars[name] ?? '');
    }
    if (phrases[source] != null) return phrases[source];
    for (const template of templates) {
      const result = translateTemplate(template, phrases[template], source);
      if (result != null) return result;
    }
    return source;
  };
}

function localizeTree(root, translate) {
  if (!root) return;
  const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    let saved = originalText.get(node);
    if (!saved || node.nodeValue !== saved.last) {
      saved = { source: node.nodeValue, last: node.nodeValue };
      originalText.set(node, saved);
    }
    const source = saved.source;
    const leading = source.match(/^\s*/)?.[0] || '';
    const trailing = source.match(/\s*$/)?.[0] || '';
    const core = source.trim();
    const nextValue = core ? `${leading}${translate(core)}${trailing}` : source;
    saved.last = nextValue;
    if (node.nodeValue !== nextValue) node.nodeValue = nextValue;
  }
  root.querySelectorAll('*').forEach((element) => {
    let saved = originalAttributes.get(element);
    if (!saved) {
      saved = {};
      originalAttributes.set(element, saved);
    }
    translatableAttributes.forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      if (!(attribute in saved)) saved[attribute] = element.getAttribute(attribute);
      const nextValue = translate(saved[attribute]);
      if (element.getAttribute(attribute) !== nextValue) element.setAttribute(attribute, nextValue);
    });
  });
}

export function LocalizationProvider({ children }) {
  const [language, setLanguageState] = useState(detectLanguage);
  const t = useMemo(() => createTranslator(language), [language]);
  const setLanguage = useCallback((code) => {
    if (catalog[code]) setLanguageState(code);
  }, []);

  useLayoutEffect(() => {
    applyLocale(language);
    document.title = catalog[language]['meta.title'];
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', catalog[language]['meta.description']);
    localizeTree(document.getElementById('root'), t);
    const observer = new MutationObserver(() => localizeTree(document.getElementById('root'), t));
    observer.observe(document.getElementById('root'), { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [language, t]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    languages: LANGUAGES,
    locale: getIntlLocale(language),
    isRtl: RTL_CODES.has(language),
    formatDate: (value, options) => new Intl.DateTimeFormat(getIntlLocale(language), options).format(new Date(value)),
  }), [language, setLanguage, t]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization must be used inside LocalizationProvider');
  return context;
}
