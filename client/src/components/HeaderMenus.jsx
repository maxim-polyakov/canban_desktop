import React, { useState } from 'react';
import { Link } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import LanguageSelector from './LanguageSelector.jsx';
import { usePrefs } from '../utils/preferences.js';

export const THEME_OPTIONS = [
  ['light', 'sun', 'Светлая'],
  ['dark', 'moon', 'Темная'],
  ['system', 'monitor', 'Как в браузере'],
];

function MenuLink({ to, icon, title, description, onClose }) {
  const { t } = useLocalization();
  return (
    <Link to={to} className="app-settings-item" role="menuitem" onClick={onClose}>
      <NavIcon name={icon} size={18} />
      <span>
        <span className="app-settings-item-title">{t(title)}</span>
        {description && <span className="app-settings-item-desc">{t(description)}</span>}
      </span>
    </Link>
  );
}

export function SettingsMenu({ boardId, onClose }) {
  const { t } = useLocalization();
  return (
    <div className="app-menu app-menu-right app-settings-menu" role="menu">
      <div className="app-settings-heading">{t('Персональные настройки')}</div>
      <MenuLink to="/settings/personal/general" icon="person" title="Общие" description="Язык, тема, главная страница и отслеживание задач" onClose={onClose} />
      <MenuLink to="/settings/personal/notifications" icon="bell" title="Электронные письма и уведомления" description="Какие письма вы получаете и в каком формате" onClose={onClose} />
      {boardId && (
        <>
          <div className="app-settings-heading">{t('Настройки раздела')}</div>
          <MenuLink to={`/board/${boardId}/settings`} icon="settings" title="Конфигурация раздела" description="Сведения, ключ, участники, рабочие процессы и интеграции раздела" onClose={onClose} />
        </>
      )}
      <div className="app-settings-heading">{t('Настройки Канбан')}</div>
      <MenuLink to="/admin/system" icon="system" title="Система" description="Общая конфигурация, почта и языки" onClose={onClose} />
      <MenuLink to="/spaces" icon="spaces" title="Разделы" description="Управление разделами, их ключами и руководителями" onClose={onClose} />
      <MenuLink to="/settings/issues/issue-types" icon="issues" title="Задачи" description="Типы задач и их иерархия" onClose={onClose} />
      <MenuLink to="/admin/apps" icon="appsAdd" title="Приложения" description="GitHub и вебхуки во всех разделах" onClose={onClose} />
      <MenuLink to="/admin/users" icon="teams" title="Управление пользователями" description="Пользователи, команды и доступ" onClose={onClose} />
      <MenuLink to="/admin/billing" icon="billing" title="Платежи" description="Тарифный план и предварительный просмотр счёта" onClose={onClose} />
    </div>
  );
}

export function ProfileMenu({ user, character, onClose, onLogout, onSwitchAccount }) {
  const { t } = useLocalization();
  const [prefs, setPrefs] = usePrefs();
  const [themeOpen, setThemeOpen] = useState(false);
  return (
    <div className="app-menu app-menu-right app-profile-menu" role="menu">
      <div className="app-profile-card">
        {user?.avatarUrl
          ? <img src={user.avatarUrl} alt="" className="app-avatar app-avatar-lg" />
          : <span className="app-avatar app-avatar-lg app-avatar-placeholder">{user?.displayName?.charAt(0) || '?'}</span>}
        <span className="app-profile-card-text">
          <span className="app-profile-card-name">{user?.displayName}</span>
          <span className="app-profile-card-email">{user?.email}</span>
          {character && <span className="app-profile-card-level">{t('Уровень')} {character.levelNumber} · {character.totalXp} XP</span>}
        </span>
      </div>
      <Link to="/profile" className="app-menu-item" role="menuitem" onClick={onClose}><NavIcon name="person" />{t('Профиль')}</Link>
      <Link to="/settings/personal/general" className="app-menu-item" role="menuitem" onClick={onClose}><NavIcon name="settings" />{t('Настройки аккаунта')}</Link>
      <button type="button" className="app-menu-item" role="menuitem" aria-expanded={themeOpen} onClick={() => setThemeOpen((v) => !v)}>
        <NavIcon name="theme" />{t('Тема')}
        <NavIcon name={themeOpen ? 'chevronDown' : 'chevronRight'} size={14} className="app-menu-item-chevron" />
      </button>
      {themeOpen && (
        <div className="app-menu-submenu" role="group" aria-label={t('Тема')}>
          {THEME_OPTIONS.map(([value, icon, label]) => (
            <button key={value} type="button" role="menuitemradio" aria-checked={prefs.theme === value} className={`app-menu-item ${prefs.theme === value ? 'is-active' : ''}`} onClick={() => setPrefs({ theme: value })}>
              <NavIcon name={icon} />{t(label)}
              {prefs.theme === value && <NavIcon name="check" size={14} className="app-menu-item-chevron" />}
            </button>
          ))}
        </div>
      )}
      <div className="app-menu-item app-menu-language">
        <NavIcon name="globe" />
        <LanguageSelector className="language-selector-profile" />
      </div>
      <div className="app-menu-divider" />
      <button type="button" className="app-menu-item" role="menuitem" onClick={onSwitchAccount}><NavIcon name="switchAccount" />{t('Сменить аккаунт')}</button>
      <button type="button" className="app-menu-item" role="menuitem" onClick={onLogout}><NavIcon name="logout" />{t('Выйти')}</button>
    </div>
  );
}
