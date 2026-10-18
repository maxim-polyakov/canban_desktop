import React from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';

export default function LanguageSelector({ className = '' }) {
  const { language, setLanguage, languages, t } = useLocalization();
  return (
    <label className={`language-selector ${className}`.trim()}>
      <span className="language-selector-label">{t('Язык')}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t('Язык')}>
        {languages.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
  );
}
