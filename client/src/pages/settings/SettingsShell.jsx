import React from 'react';
import { Link, useLocation } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { useBilling } from '../../utils/billing.js';
import './Settings.css';

export const PERSONAL_NAV = {
  title: 'Персональные настройки',
  back: { to: '/', label: 'Назад к Канбан' },
  groups: [
    { items: [
      ['/settings/personal/general', 'settings', 'Общее'],
      ['/settings/personal/notifications', 'bell', 'Электронные письма и уведомления'],
      ['/settings/personal/security', 'lock', 'Безопасность'],
    ] },
  ],
};

export const ADMIN_NAV = {
  title: 'Настройки Канбан',
  back: { to: '/', label: 'Назад к Канбан' },
  groups: [
    { items: [['/admin', 'overview', 'Обзор']] },
    { title: 'Система', items: [
      ['/admin/system', 'system', 'Системные настройки'],
      ['/settings/issues/issue-types', 'issues', 'Типы задач'],
      ['/settings/issues/fields', 'forms', 'Поля задач'],
      ['/settings/issues/screens', 'columns', 'Экраны'],
      ['/settings/issues/field-configurations', 'list', 'Конфигурации полей'],
      ['/settings/issues/workflows', 'workflow', 'Workflow'],
    ] },
    { title: 'Разделы', items: [['/spaces', 'spaces', 'Управление разделами']] },
    { title: 'Приложения', items: [['/admin/apps', 'appsAdd', 'Подключённые приложения']] },
    { title: 'Пользователи', items: [['/admin/users', 'teams', 'Пользователи'], ['/admin/groups', 'person', 'Группы']] },
    { title: 'Безопасность', items: [['/admin/audit', 'activity', 'Журнал аудита']] },
    { title: 'Платежи', items: [
      ['/admin/billing', 'billing', 'Тариф и счёт'],
      ['/admin/billing/plans', 'card', 'Тарифные планы', { upsell: true }],
    ] },
  ],
};

export default function SettingsShell({ nav, breadcrumbs = [], title, description, actions, children, wide = false }) {
  const { t } = useLocalization();
  const { pathname } = useLocation();
  const billing = useBilling();
  const hideUpsell = !billing || billing.hideUpsell;
  return (
    <div className="settings-shell">
      <aside className="settings-nav" aria-label={t(nav.title)}>
        {nav.back && (
          <Link to={nav.back.to} className="settings-nav-back"><NavIcon name="chevronRight" size={14} className="settings-nav-back-icon" />{t(nav.back.label)}</Link>
        )}
        <div className="settings-nav-title">{t(nav.title)}</div>
        {nav.groups.map((group, index) => (
          <div key={group.title || index} className="settings-nav-group">
            {group.title && <div className="settings-nav-group-title">{t(group.title)}</div>}
            {group.items.filter(([, , , opts]) => !(opts?.upsell && hideUpsell)).map(([to, icon, label]) => (
              <Link key={to} to={to} className={`settings-nav-item ${pathname === to ? 'is-active' : ''}`} aria-current={pathname === to ? 'page' : undefined}>
                <NavIcon name={icon} />
                <span>{t(label)}</span>
              </Link>
            ))}
          </div>
        ))}
      </aside>
      <section className={`settings-content ${wide ? 'is-wide' : ''}`}>
        {breadcrumbs.length > 0 && (
          <nav className="settings-breadcrumbs" aria-label={t('Навигационная цепочка')}>
            {breadcrumbs.map(([label, to], index) => (
              <React.Fragment key={label}>
                {index > 0 && <span className="settings-breadcrumbs-sep">/</span>}
                {to ? <Link to={to}>{t(label)}</Link> : <span>{t(label)}</span>}
              </React.Fragment>
            ))}
          </nav>
        )}
        <div className="settings-title-row">
          <h1 className="settings-title">{title}</h1>
          {actions && <div className="settings-actions">{actions}</div>}
        </div>
        {description && <p className="settings-description">{description}</p>}
        {children}
      </section>
    </div>
  );
}

export function SettingsSection({ title, description, children }) {
  return (
    <section className="settings-section">
      {title && <h2 className="settings-section-title">{title}</h2>}
      {description && <p className="settings-section-desc">{description}</p>}
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label, disabled, id }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`settings-toggle ${checked ? 'is-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-knob">{checked && <NavIcon name="check" size={10} />}</span>
    </button>
  );
}

export function SaveStatus({ state }) {
  const { t } = useLocalization();
  if (!state) return null;
  if (state === 'saving') return <span className="settings-save-status">{t('Сохранение…')}</span>;
  if (state === 'saved') return <span className="settings-save-status is-ok"><NavIcon name="check" size={14} />{t('Изменения сохранены')}</span>;
  return <span className="settings-save-status is-error" role="alert">{state}</span>;
}
