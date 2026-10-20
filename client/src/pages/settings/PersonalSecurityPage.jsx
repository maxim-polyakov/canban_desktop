import React, { useCallback, useEffect, useState } from 'react';
import { API_BASE, apiTokens } from '../../api.js';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import SettingsShell, { PERSONAL_NAV, SettingsSection } from './SettingsShell.jsx';

export const TOKEN_LIFETIMES = [
  [7, '7 дней'],
  [30, '30 дней'],
  [90, '90 дней'],
  [180, '180 дней'],
  [365, '1 год'],
];

export const TOKEN_SCOPES = [
  ['read:jira-work', 'Чтение задач, проектов и досок'],
  ['write:jira-work', 'Создание и изменение задач, комментариев и ворклогов'],
  ['read:jira-user', 'Чтение сведений о пользователях'],
  ['manage:jira-configuration', 'Администрирование: workflow, поля, участники, интеграции'],
];

function CreateTokenDialog({ onClose, onCreated }) {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [days, setDays] = useState('365');
  const [scoped, setScoped] = useState(false);
  const [scopes, setScopes] = useState(['read:jira-work']);
  const toggleScope = (scope) => setScopes((current) => (current.includes(scope) ? current.filter((x) => x !== scope) : [...current, scope]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      onCreated(await apiTokens.create({ name: name.trim(), expiresInDays: Number(days), scopes: scoped ? scopes : null }));
    } catch (err) {
      setError(t(err.message || 'Не удалось создать токен.'));
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal" role="dialog" aria-modal="true" aria-label={t('Создать API-токен')} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{t('Создать API-токен')}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          <label className="app-field">
            <span>{t('Название')} <span className="app-required">*</span></span>
            <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder={t('Например: CI-скрипт')} required autoFocus />
          </label>
          <label className="app-field">
            <span>{t('Срок действия')}</span>
            <select value={days} onChange={(e) => setDays(e.target.value)}>
              {TOKEN_LIFETIMES.map(([value, label]) => <option key={label} value={value}>{t(label)}</option>)}
            </select>
          </label>
          <fieldset className="token-kind">
            <legend>{t('Доступ')}</legend>
            <label><input type="radio" name="token-kind" checked={!scoped} onChange={() => setScoped(false)} /> {t('Полный доступ (классический токен)')}</label>
            <label><input type="radio" name="token-kind" checked={scoped} onChange={() => setScoped(true)} /> {t('Только выбранные области доступа')}</label>
            {scoped && (
              <div className="token-scopes">
                {TOKEN_SCOPES.map(([scope, label]) => (
                  <label key={scope}>
                    <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                    <span><code>{scope}</code> {t(label)}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <p className="app-modal-hint">{t('Токен действует от вашего имени и с вашими правами. Храните его как пароль.')}</p>
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving || !name.trim() || (scoped && scopes.length === 0)}>{saving ? '…' : t('Создать')}</button>
        </div>
      </form>
    </div>
  );
}

function CreatedTokenDialog({ secret, onClose }) {
  const { t } = useLocalization();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="app-modal-backdrop">
      <div className="app-modal" role="dialog" aria-modal="true" aria-label={t('Токен создан')}>
        <div className="app-modal-header">
          <h2>{t('Токен создан')}</h2>
        </div>
        <div className="app-modal-body">
          <p>{t('Скопируйте токен сейчас — после закрытия окна его нельзя будет посмотреть снова.')}</p>
          <div className="token-secret">
            <code data-testid="token-secret">{secret}</code>
            <button type="button" className="app-btn" onClick={copy}><NavIcon name={copied ? 'check' : 'copy'} size={14} /> {t(copied ? 'Скопировано' : 'Копировать')}</button>
          </div>
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-primary" onClick={onClose}>{t('Готово')}</button>
        </div>
      </div>
    </div>
  );
}

export default function PersonalSecurityPage() {
  const { t, formatDate } = useLocalization();
  const [tokens, setTokens] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState('');

  const load = useCallback(() => {
    apiTokens.list().then((list) => { setTokens(list); setError(''); }).catch((e) => setError(e.message || 'Не удалось загрузить токены.'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const day = (value) => formatDate(value, { dateStyle: 'medium' });
  const revoke = async (token) => {
    if (!window.confirm(t('Отозвать токен «{name}»? Скрипты, которые его используют, перестанут работать.').replace('{name}', token.name))) return;
    try {
      await apiTokens.revoke(token.id);
      load();
    } catch (e) {
      setError(e.message || 'Не удалось отозвать токен.');
    }
  };
  const revokeAll = async () => {
    if (!window.confirm(t('Отозвать все API-токены?'))) return;
    try {
      await apiTokens.revokeAll();
      load();
    } catch (e) {
      setError(e.message || 'Не удалось отозвать токены.');
    }
  };
  const apiBase = API_BASE || window.location.origin;

  return (
    <SettingsShell
      nav={PERSONAL_NAV}
      breadcrumbs={[['Личные настройки'], ['Безопасность']]}
      title={t('Безопасность')}
      actions={<button type="button" className="app-btn app-btn-primary" onClick={() => setCreating(true)}>{t('Создать API-токен')}</button>}
    >
      <SettingsSection
        title={t('API-токены')}
        description={t('API-токены позволяют скриптам и внешним сервисам работать с Канбан от вашего имени без пароля. Используйте базовую аутентификацию: адрес почты как имя пользователя и токен как пароль. Срок действия токена — от 1 до 365 дней.')}
      >
        <pre className="token-example">{`curl -u you@example.com:<token> ${apiBase}/api/search/issues?jql=assignee%3DcurrentUser()`}</pre>
        {error && <p className="settings-save-status is-error" role="alert">{t(error)}</p>}
        {!tokens && !error && <p className="settings-empty">{t('Загрузка…')}</p>}
        {tokens && tokens.length === 0 && <p className="settings-empty">{t('У вас пока нет API-токенов.')}</p>}
        {tokens && tokens.length > 0 && (
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>{t('Название')}</th>
                  <th>{t('Создан')}</th>
                  <th>{t('Действует до')}</th>
                  <th className="hide-mobile">{t('Последнее использование')}</th>
                  <th className="is-narrow"><span className="settings-sr-only">{t('Действия')}</span></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td>
                      <span className="settings-table-name">{token.name}</span>
                      <div className="settings-table-sub"><code>{token.hint}</code> · {token.scopes ? token.scopes.join(', ') : t('Полный доступ')}</div>
                    </td>
                    <td>{day(token.createdAt)}</td>
                    <td>
                      {token.expired
                        ? <span className="token-expired">{t('Истёк')} {day(token.expiresAt)}</span>
                        : day(token.expiresAt)}
                    </td>
                    <td className="hide-mobile">
                      {token.lastUsedAt ? day(token.lastUsedAt) : t('Не использовался')}
                      {token.lastUsedIp && <div className="settings-table-sub">{token.lastUsedIp}</div>}
                    </td>
                    <td className="is-narrow">
                      <button type="button" className="app-btn app-btn-subtle" onClick={() => revoke(token)}>{t('Отозвать')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tokens && tokens.length > 1 && (
          <p><button type="button" className="app-btn app-btn-subtle" onClick={revokeAll}>{t('Отозвать все токены')}</button></p>
        )}
      </SettingsSection>
      {creating && (
        <CreateTokenDialog
          onClose={() => setCreating(false)}
          onCreated={(created) => { setCreating(false); setSecret(created.secret); load(); }}
        />
      )}
      {secret && <CreatedTokenDialog secret={secret} onClose={() => setSecret('')} />}
    </SettingsShell>
  );
}
