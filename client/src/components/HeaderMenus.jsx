import React from 'react';
import { Link } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import LanguageSelector from './LanguageSelector.jsx';

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
      <MenuLink to="/profile" icon="person" title="Общие настройки" description="Управление языком, профилем, персонажем и другими персональными настройками" onClose={onClose} />
      <MenuLink to="/notifications-settings" icon="bell" title="Настройки уведомлений" description="Управление получением уведомлений по электронной почте и в приложении" onClose={onClose} />
      {boardId && (
        <>
          <div className="app-settings-heading">{t('Настройки раздела')}</div>
          <MenuLink to={`/board/${boardId}/workflow`} icon="workflow" title="Задачи" description="Настройка рабочих процессов, переходов и условий" onClose={onClose} />
          <MenuLink to={`/board/${boardId}/permissions`} icon="lock" title="Разрешения" description="Роли и уровни доступа участников раздела" onClose={onClose} />
          <MenuLink to={`/board/${boardId}/automations`} icon="automation" title="Автоматизация" description="Правила, которые выполняются при изменении задач" onClose={onClose} />
          <MenuLink to={`/board/${boardId}/integrations`} icon="integrations" title="Приложения и интеграции" description="GitHub, вебхуки и другие подключения" onClose={onClose} />
        </>
      )}
      <div className="app-settings-heading">{t('Администрирование')}</div>
      <MenuLink to="/spaces" icon="spaces" title="Разделы" description="Управление разделами, командами и приглашениями" onClose={onClose} />
      <MenuLink to="/users" icon="teams" title="Пользователи" description="Участники сайта и их профили" onClose={onClose} />
    </div>
  );
}

export function ProfileMenu({ user, character, onClose, onLogout, onSwitchAccount }) {
  const { t } = useLocalization();
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
      <Link to="/profile" className="app-menu-item" role="menuitem" onClick={onClose}><NavIcon name="settings" />{t('Настройки аккаунта')}</Link>
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
