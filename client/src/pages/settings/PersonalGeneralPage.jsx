import React, { useEffect, useMemo, useState } from 'react';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { personalSettings } from '../../api.js';
import { usePrefs } from '../../utils/preferences.js';
import { THEME_OPTIONS } from '../../components/HeaderMenus.jsx';
import SettingsShell, { PERSONAL_NAV, SaveStatus, SettingsSection, Toggle } from './SettingsShell.jsx';

function browserTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

function timeZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch {
    // older browsers: fall back to a short list below
  }
  return ['UTC', 'Europe/Moscow', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Tokyo', 'America/New_York', 'America/Los_Angeles'];
}

function ThemePreview({ variant }) {
  return (
    <span className={`theme-preview theme-preview-${variant}`}>
      <span className="theme-preview-side">
        <span className="theme-preview-bar is-accent" />
        <span className="theme-preview-bar" />
        <span className="theme-preview-bar" />
      </span>
      <span className="theme-preview-main">
        <span className="theme-preview-bar" />
        <span className="theme-preview-card" />
        <span className="theme-preview-card" />
      </span>
    </span>
  );
}

export default function PersonalGeneralPage() {
  const { t, language, setLanguage, languages } = useLocalization();
  const [prefs, setPrefs] = usePrefs();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const zones = useMemo(timeZones, []);
  const detectedZone = browserTimeZone();

  useEffect(() => {
    personalSettings.get().then(setSettings).catch((e) => setStatus(e.message || t('Не удалось загрузить настройки')));
  }, [t]);

  const saveServer = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setStatus('saving');
    try {
      setSettings(await personalSettings.save(next));
      setStatus('saved');
    } catch (e) {
      setSettings(settings);
      setStatus(e.message || t('Не удалось сохранить настройки'));
    }
  };

  const saveLocal = (patch) => { setPrefs(patch); setStatus('saved'); };

  return (
    <SettingsShell
      nav={PERSONAL_NAV}
      breadcrumbs={[['Персональные настройки', '/settings/personal/general'], ['Общее']]}
      title={t('Общее')}
      actions={<SaveStatus state={status} />}
    >
      <SettingsSection title={t('Язык и регион')} description={t('Язык интерфейса и часовой пояс, в котором показываются даты.')}>
        <label className="settings-field">
          <span>{t('Язык')}</span>
          <select value={language} onChange={(e) => { setLanguage(e.target.value); setStatus('saved'); }}>
            {languages.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <label className="settings-field">
          <span>{t('Часовой пояс')}</span>
          <select value={prefs.timeZone || ''} onChange={(e) => saveLocal({ timeZone: e.target.value })}>
            <option value="">{t('Как в браузере')} ({detectedZone})</option>
            {zones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
      </SettingsSection>

      <SettingsSection title={t('Автоматическое отслеживание задач')}>
        <div className="settings-row">
          <label className="settings-row-text" htmlFor="auto-watch">
            <span className="settings-row-title">{t('Отслеживать задачи, которые я создаю или изменяю')}</span>
            <span className="settings-row-desc">{t('Вы будете автоматически добавлены в наблюдатели и получите уведомления о дальнейших изменениях.')}</span>
          </label>
          <Toggle id="auto-watch" checked={Boolean(settings?.autoWatch)} disabled={!settings} label={t('Автоматическое отслеживание задач')} onChange={(value) => saveServer({ autoWatch: value })} />
        </div>
      </SettingsSection>

      <SettingsSection title={t('Главная страница')} description={t('Страница, которая открывается при нажатии на логотип и после входа.')}>
        <div className="settings-radio-group" role="radiogroup" aria-label={t('Главная страница')}>
          {[['foryou', 'Для вас', 'Ваша работа, недавние и рекомендованные разделы'], ['spaces', 'Разделы', 'Список всех разделов, к которым у вас есть доступ'], ['issues', 'Фильтры', 'Поиск задач с помощью JQL']].map(([value, label, hint]) => (
            <label key={value} className="settings-checkbox">
              <input type="radio" name="home-page" value={value} checked={prefs.homePage === value} onChange={() => saveLocal({ homePage: value })} />
              <span>{t(label)}<small>{t(hint)}</small></span>
            </label>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('Тема')} description={t('Выберите оформление интерфейса. «Как в браузере» следует настройкам вашей системы.')}>
        <div className="theme-cards" role="radiogroup" aria-label={t('Тема')}>
          {THEME_OPTIONS.map(([value, , label]) => (
            <label key={value} className={`theme-card ${prefs.theme === value ? 'is-selected' : ''}`}>
              <span className="theme-card-preview">
                {value === 'system' ? <><ThemePreview variant="light" /><ThemePreview variant="dark" /></> : <ThemePreview variant={value} />}
              </span>
              <span className="theme-card-label">
                <input type="radio" name="theme" value={value} checked={prefs.theme === value} onChange={() => saveLocal({ theme: value })} />
                {t(label)}
              </span>
            </label>
          ))}
        </div>
      </SettingsSection>
    </SettingsShell>
  );
}
