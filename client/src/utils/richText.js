export function parseRichText(value) {
  if (!value) return [];
  if (typeof value === 'object') return Array.isArray(value.blocks) ? value.blocks : [];
  const source = String(value).trim();
  if (source.startsWith('{')) {
    try {
      const document = JSON.parse(source);
      if (Array.isArray(document.blocks)) return document.blocks;
    } catch {
      // Legacy descriptions remain plain text.
    }
  }
  return String(value).split(/\n{2,}/).map((text) => ({ type: 'paragraph', text }));
}

export function richTextToPlainText(value) {
  return parseRichText(value).map((block) => String(block.text || '')).join('\n\n');
}

export function serializeRichText(text) {
  return JSON.stringify({
    version: 1,
    blocks: String(text || '').split(/\n{2,}/).map((value) => ({
      type: value.startsWith('# ') ? 'heading' : value.startsWith('- ') ? 'listItem' : 'paragraph',
      text: value.replace(/^(# |- )/, ''),
    })),
  });
}
