import { CUSTOM_BLOCKS } from './blocks/index';

export interface BlockSearchItem {
  type: string;
  displayName: string;
  tooltip: string;
  colour: number;
}

let searchIndex: BlockSearchItem[] | null = null;

function stripPlaceholders(message: string): string {
  return message
    .replace(/%\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchIndex(): BlockSearchItem[] {
  if (searchIndex) {
    return searchIndex;
  }

  searchIndex = CUSTOM_BLOCKS.map((block: any) => ({
    type: block.type,
    displayName: stripPlaceholders(block.message0 || ''),
    tooltip: block.tooltip || '',
    colour: block.colour || 0,
  }));

  return searchIndex;
}

export function searchBlocks(query: string): BlockSearchItem[] {
  const index = buildSearchIndex();
  const q = query.toLowerCase().trim();

  if (!q) {
    return [];
  }

  return index.filter((item) => {
    const name = item.displayName.toLowerCase();
    const tooltip = item.tooltip.toLowerCase();

    if (name.includes(q)) return true;

    const keywords = q.split(/\s+/);
    return keywords.every((kw) => name.includes(kw) || tooltip.includes(kw));
  });
}

export function getBlockByType(type: string): BlockSearchItem | undefined {
  const index = buildSearchIndex();
  return index.find((item) => item.type === type);
}
