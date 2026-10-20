import React, { useEffect, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';

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

/** Like Jira's "Create branch" for GitHub: suggests a name with the issue key and copies the git command. */
export default function CreateBranchPanel({ issueKey, title }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => suggestBranchName(issueKey, title));
  const [copied, setCopied] = useState('');

  useEffect(() => { setName(suggestBranchName(issueKey, title)); }, [issueKey, title]);

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
      <label>
        <span>{t('Название ветки')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      </label>
      {!branch.toUpperCase().includes(String(issueKey).toUpperCase()) && (
        <p className="create-branch-hint">{t('Оставьте ключ ${issueKey} в названии, чтобы ветка привязалась к задаче.', { issueKey })}</p>
      )}
      <div className="create-branch-command">
        <code>{command}</code>
        <button type="button" onClick={() => copy(command, 'command')}>{copied === 'command' ? t('Скопировано') : t('Копировать команду')}</button>
      </div>
      <div className="create-branch-actions">
        <button type="button" onClick={() => copy(branch, 'name')}>{copied === 'name' ? t('Скопировано') : t('Копировать название')}</button>
        <button type="button" onClick={() => setOpen(false)}>{t('Закрыть')}</button>
      </div>
      <p className="create-branch-hint">{t('Коммиты с ${issueKey} в сообщении тоже привяжутся. Команды: #comment текст, #time 1h 30m, #done.', { issueKey })}</p>
    </div>
  );
}
