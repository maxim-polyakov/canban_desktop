import React from 'react';
import '../components/MentionTextarea.css';

const SAFE_URL = /^(https?:\/\/|mailto:|\/)/i;

/** Inline markdown: `code`, **bold**, *italic*, ~~strike~~ and [text](url). Returns React nodes, never HTML. */
export function renderInline(text, keyPrefix = 'i') {
  const nodes = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(@\[[^\]\r\n]+\]\([0-9a-fA-F-]{36}\))|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let match;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index += 1}`;
    if (match[1]) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (match[2]) nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    else if (match[3]) nodes.push(<del key={key}>{renderInline(token.slice(2, -2), key)}</del>);
    else if (match[4]) nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    else if (match[5]) nodes.push(<span key={key} className="mention-chip">@{token.slice(2, token.indexOf(']('))}</span>);
    else {
      const [, label, url] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      nodes.push(SAFE_URL.test(url)
        ? <a key={key} href={url} target={url.startsWith('/') ? undefined : '_blank'} rel="noopener noreferrer">{renderInline(label, key)}</a>
        : label);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Splits markdown into blocks: headings, paragraphs, lists, task lists, quotes, code fences and rules. */
export function parseMarkdown(source = '') {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (line.startsWith('```')) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) { body.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) { blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); i += 1; continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ type: 'rule' }); i += 1; continue; }
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) { body.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const text = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        const task = text.match(/^\[( |x|X)\]\s+(.*)$/);
        items.push(task ? { text: task[2], checked: task[1] !== ' ' } : { text });
        i += 1;
      }
      blocks.push({ type: items.every((x) => 'checked' in x) ? 'tasks' : ordered ? 'ol' : 'ul', items });
      continue;
    }
    const body = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|```|\s*([-*]|\d+\.)\s+)/.test(lines[i])) { body.push(lines[i]); i += 1; }
    blocks.push({ type: 'paragraph', text: body.join('\n') });
  }
  return blocks;
}

export function MarkdownView({ source, className = '' }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={`md-view ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case 'heading': return React.createElement(`h${block.level + 1}`, { key }, renderInline(block.text, key));
          case 'code': return <pre key={key}><code>{block.text}</code></pre>;
          case 'rule': return <hr key={key} />;
          case 'quote': return <blockquote key={key}>{renderInline(block.text, key)}</blockquote>;
          case 'ul': return <ul key={key}>{block.items.map((item, n) => <li key={n}>{renderInline(item.text, `${key}-${n}`)}</li>)}</ul>;
          case 'ol': return <ol key={key}>{block.items.map((item, n) => <li key={n}>{renderInline(item.text, `${key}-${n}`)}</li>)}</ol>;
          case 'tasks':
            return (
              <ul key={key} className="md-tasks">
                {block.items.map((item, n) => (
                  <li key={n}><input type="checkbox" checked={item.checked} readOnly disabled />{renderInline(item.text, `${key}-${n}`)}</li>
                ))}
              </ul>
            );
          default:
            return <p key={key}>{block.text.split('\n').flatMap((part, n) => (n ? [<br key={`br${n}`} />, ...renderInline(part, `${key}-${n}`)] : renderInline(part, `${key}-${n}`)))}</p>;
        }
      })}
    </div>
  );
}

/** Plain-text excerpt for lists. */
export function markdownExcerpt(source = '', max = 140) {
  const text = String(source).replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~[\]()-]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
