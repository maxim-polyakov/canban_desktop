export const STORAGE_KEY = 'canban_locale';

export const LANGUAGES = [
  ['en', 'English'], ['ru', 'Русский'], ['de', 'Deutsch'], ['ar', 'العربية'],
  ['sq', 'Shqip'], ['am', 'አማርኛ'], ['hy', 'Հայերեն'], ['az', 'Azərbaycan'],
  ['eu', 'Euskara'], ['be', 'Беларуская'], ['bn', 'বাংলা'], ['bg', 'Български'],
  ['my', 'မြန်မာဘာသာ'], ['ca', 'Català'], ['zh', '简体中文'], ['zh-TW', '繁體中文'],
  ['hr', 'Hrvatski'], ['cs', 'Čeština'], ['da', 'Dansk'], ['nl', 'Nederlands'],
  ['et', 'Eesti'], ['fi', 'Suomi'], ['fr', 'Français'], ['gl', 'Galego'],
  ['ka', 'ქართული'], ['el', 'Ελληνικά'], ['he', 'עברית'], ['hi', 'हिन्दी'],
  ['hu', 'Magyar'], ['is', 'Íslenska'], ['id', 'Bahasa Indonesia'], ['ga', 'Gaeilge'],
  ['it', 'Italiano'], ['ja', '日本語'], ['kn', 'ಕನ್ನಡ'], ['kk', 'Қазақша'],
  ['km', 'ភាសាខ្មែរ'], ['ko', '한국어'], ['lo', 'ພາສາລາວ'], ['lv', 'Latviešu'],
  ['lt', 'Lietuvių'], ['mk', 'Македонски'], ['ms', 'Bahasa Melayu'], ['ml', 'മലയാളം'],
  ['mt', 'Malti'], ['mr', 'मराठी'], ['mn', 'Монгол'], ['ne', 'नेपाली'],
  ['nb', 'Norsk (bokmål)'], ['fa', 'فارسی'], ['pl', 'Polski'], ['pt', 'Português'],
  ['pa', 'ਪੰਜਾਬੀ'], ['ro', 'Română'], ['sr', 'Српски'], ['si', 'සිංහල'],
  ['sk', 'Slovenčina'], ['sl', 'Slovenščina'], ['es', 'Español'], ['sw', 'Kiswahili'],
  ['tl', 'Tagalog'], ['tg', 'Тоҷикӣ'], ['th', 'ภาษาไทย'], ['tr', 'Türkçe'],
  ['uk', 'Українська'], ['ur', 'اردو'], ['uz', 'Oʻzbek'], ['vi', 'Tiếng Việt'],
  ['cy', 'Cymraeg'], ['xh', 'isiXhosa'], ['yi', 'ייִדיש'], ['yo', 'Yorùbá'],
  ['zu', 'isiZulu'], ['gu', 'ગુજરાતી'], ['haw', 'ʻŌlelo Hawaiʻi'], ['ig', 'Igbo'],
].map(([code, label]) => ({ code, label }));

export const RTL_CODES = new Set(['ar', 'he', 'fa', 'ur', 'yi']);
export const isSupportedLanguage = (code) => LANGUAGES.some((item) => item.code === code);

export function getIntlLocale(code) {
  return ({ zh: 'zh-CN', 'zh-TW': 'zh-TW', pt: 'pt-BR', nb: 'nb-NO', pa: 'pa-IN' })[code] || code;
}

export function detectLanguage() {
  if (typeof window === 'undefined') return 'en';
  const urlCode = new URLSearchParams(window.location.search).get('lang');
  if (isSupportedLanguage(urlCode)) return urlCode;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isSupportedLanguage(saved)) return saved;
  } catch {}
  const browserCode = window.navigator?.language || '';
  const exact = LANGUAGES.find(({ code }) => code.toLowerCase() === browserCode.toLowerCase());
  if (exact) return exact.code;
  const short = browserCode.split('-')[0].toLowerCase();
  return LANGUAGES.find(({ code }) => code.toLowerCase() === short)?.code || 'en';
}

export function withLangQuery(destination, language = detectLanguage()) {
  if (!destination || typeof destination !== 'string' || /^(?:[a-z]+:|\/\/)/i.test(destination)) return destination;
  const [beforeHash, hash] = destination.split('#', 2);
  const [pathname, search = ''] = beforeHash.split('?', 2);
  const params = new URLSearchParams(search);
  params.set('lang', isSupportedLanguage(language) ? language : 'en');
  return `${pathname || ''}?${params.toString()}${hash ? `#${hash}` : ''}`;
}

export function applyLocale(language) {
  if (typeof window === 'undefined' || !isSupportedLanguage(language)) return;
  try { window.localStorage.setItem(STORAGE_KEY, language); } catch {}
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(language)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.lang = getIntlLocale(language);
  document.documentElement.dir = RTL_CODES.has(language) ? 'rtl' : 'ltr';
  const url = new URL(window.location.href);
  url.searchParams.set('lang', language);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
