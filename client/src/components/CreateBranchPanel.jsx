import React, { useEffect, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { integrations } from '../api.js';

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Jira-style branch name: issue key first so GitHub events link back, then a short latin slug of the title. */
export function suggestBranchName(issueKey, title = '') {
  const slug = [...String(title).toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return slug ? `${issueKey}-${slug}` : String(issueKey);
}

export function sanitizeBranchName(name) {
  return String(name).trim().replace(/\s+/g, '-').replace(/[~^:?*[\\\]]+/g, '').replace(/\.{2,}/g, '.');
}

/** Like Jira's "Create branch" for GitHub: creates the branch in a connected repository and links it to the issue. */
export default function CreateBranchPanel({ questId, issueKey, title, onCreated }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => suggestBranchName(issueKey, title));
  const [copied, setCopied] = useState('');
  const [repos, setRepos] = useState(null);
  const [repoId, setRepoId] = useState('');
  const [fromBranch, setFromBranch] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');

  useEffect(() => { setName(suggestBranchName(issueKey, title)); }, [issueKey, title]);

  useEffect(() => {
    if (!open || repos !== null || !questId) return;
    let cancelled = false;
    integrations.getRepositories(questId)
      .then((list) => {
        if (cancelled) return;
        setRepos(list || []);
        if (list?.length) setRepoId(list[0].integrationId);
      })
      .catch((e) => { if (!cancelled) { setRepos([]); setError(e.message); } });
    return () => { cancelled = true; };
  }, [open, repos, questId]);

  const repo = repos?.find((r) => r.integrationId === repoId);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const summary = await integrations.createBranch(questId, { integrationId: repoId, name: branch, fromBranch: fromBranch.trim() || null });
      setCreated(branch);
      onCreated?.(summary);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const branch = sanitizeBranchName(name);
  const command = `git checkout -b ${branch}`;
  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      window.prompt(t('Скопируйте вручную'), text);
    }
  };

  if (!open) {
    return <button type="button" className="create-branch-toggle" onClick={() => setOpen(true)}>⑂ {t('Создать ветку')}</button>;
  }
  return (
    <div className="create-branch-panel">
      {repos?.length > 0 && (
        <label>
          <span>{t('Репозиторий')}</span>
          <select value={repoId} onChange={(e) => setRepoId(e.target.value)}>
            {repos.map((r) => <option key={r.integrationId} value={r.integrationId}>{r.owner}/{r.name}</option>)}
          </select>
        </label>
      )}
      {repos?.length > 0 && (
        <label>
          <span>{t('Из ветки')}</span>
          <input value={fromBranch} onChange={(e) => setFromBranch(e.target.value)} placeholder={repo?.defaultBranch || 'main'} spellCheck={false} />
        </label>
      )}
      <label>
        <span>{t('Название ветки')}</span>
        <input value={name} onChange={(e) => { setName(e.target.value); setCreated(''); }} spellCheck={false} />
      </label>
      {!branch.toUpperCase().includes(String(issueKey).toUpperCase()) && (
        <p className="create-branch-hint">{t('Оставьте ключ ${issueKey} в названии, чтобы ветка привязалась к задаче.', { issueKey })}</p>
      )}
      {repos === null && <p className="create-branch-hint">{t('Загрузка репозиториев…')}</p>}
      {repos?.length === 0 && !error && (
        <p className="create-branch-hint">{t('К разделу не подключён репозиторий GitHub — ветку можно создать командой ниже.')}</p>
      )}
      {repos?.length > 0 && (
        <div className="create-branch-actions">
          <button type="button" className="create-branch-primary" disabled={creating || !branch || !repoId} onClick={create}>
            {creating ? t('Создание…') : t('Создать ветку')}
          </button>
          {created && repo && (
            <a href={`https://github.com/${repo.owner}/${repo.name}/tree/${created}`} target="_blank" rel="noreferrer">
              {t('Ветка ${branch} создана', { branch: created })}
            </a>
          )}
        </div>
      )}
      {error && <p className="create-branch-error">{error}</p>}
      {created && (
        <div className="create-branch-command">
          <code>{`git fetch origin && git checkout ${created}`}</code>
          <button type="button" onClick={() => copy(`git fetch origin && git checkout ${created}`, 'checkout')}>
            {copied === 'checkout' ? t('Скопировано') : t('Копировать команду')}
          </button>
        </div>
      )}
      {!created && <div className="create-branch-command">
        <code>{command}</code>
        <button type="button" onClick={() => copy(command, 'command')}>{copied === 'command' ? t('Скопировано') : t('Копировать команду')}</button>
      </div>}
      <div className="create-branch-actions">
        <button type="button" onClick={() => copy(branch, 'name')}>{copied === 'name' ? t('Скопировано') : t('Копировать название')}</button>
        <button type="button" onClick={() => setOpen(false)}>{t('Закрыть')}</button>
      </div>
      <p className="create-branch-hint">{t('Коммиты с ${issueKey} в сообщении тоже привяжутся. Команды: #comment текст, #time 1h 30m, #done.', { issueKey })}</p>
    </div>
  );
}
