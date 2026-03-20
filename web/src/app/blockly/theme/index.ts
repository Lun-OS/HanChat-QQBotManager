import * as Blockly from 'blockly';

const CATEGORY_STYLES = {
  event_category: { colour: '#5CA65C' },
  message_category: { colour: '#5B80A5' },
  log_category: { colour: '#5CA699' },
  storage_category: { colour: '#8A6BBE' },
  text_category: { colour: '#5CA6A6' },
  math_category: { colour: '#5C68A6' },
  logic_category: { colour: '#5C81A6' },
  loop_category: { colour: '#5CA6A6' },
  list_category: { colour: '#745CA6' },
  variable_category: { colour: '#A65C81' },
  function_category: { colour: '#9A5CA6' },
  advanced_category: { colour: '#7A5CA6' },
  group_category: { colour: '#5B9BD5' },
  user_category: { colour: '#9C6BBE' },
  file_category: { colour: '#D49A5C' },
  utils_category: { colour: '#5CBE8A' },
  system_category: { colour: '#BE5C9C' },
  request_category: { colour: '#5CBE5C' },
  http_category: { colour: '#BE8A5C' },
  bot_category: { colour: '#6B7CBE' },
  // 新增分类样式
  popular_category: { colour: '#FFD700' },
  data_category: { colour: '#5C9CA6' },
  array_category: { colour: '#A65C5C' },
  comment_category: { colour: '#808080' },
  database_category: { colour: '#4CAF50' },
  time_category: { colour: '#FF9800' },
};

const BLOCK_STYLES = {
  event_blocks: { colourPrimary: '#5CA65C', colourSecondary: '#4C8E4C', colourTertiary: '#3D7A3D' },
  message_blocks: { colourPrimary: '#5B80A5', colourSecondary: '#4D6F91', colourTertiary: '#3E5F7C' },
  log_blocks: { colourPrimary: '#5CA699', colourSecondary: '#4B9084', colourTertiary: '#3C7A70' },
  storage_blocks: { colourPrimary: '#8A6BBE', colourSecondary: '#765AA6', colourTertiary: '#644B8D' },
  text_blocks: { colourPrimary: '#5CA6A6', colourSecondary: '#4D9090', colourTertiary: '#3F7B7B' },
  logic_blocks: { colourPrimary: '#5C81A6', colourSecondary: '#4D6F90', colourTertiary: '#3F5D7A' },
  advanced_blocks: { colourPrimary: '#7A5CA6', colourSecondary: '#684D8F', colourTertiary: '#574078' },
};

const MODERN_THEME = Blockly.Theme.defineTheme('qqbot_modern', {
  name: 'qqbot_modern',
  base: Blockly.Themes.Zelos,
  blockStyles: BLOCK_STYLES,
  categoryStyles: CATEGORY_STYLES,
  componentStyles: {
    workspaceBackgroundColour: '#1d2129',
    toolboxBackgroundColour: '#2a2e38',
    toolboxForegroundColour: '#d1d5db',
    flyoutBackgroundColour: '#1f2430',
    flyoutForegroundColour: '#d1d5db',
    flyoutOpacity: 1,
    scrollbarColour: '#5b6171',
    insertionMarkerColour: '#165dff',
    insertionMarkerOpacity: 0.35,
    cursorColour: '#165dff',
    selectedGlowColour: '#165dff',
    selectedGlowOpacity: 0.25,
    replacementGlowColour: '#22c55e',
    replacementGlowOpacity: 0.2,
  },
  fontStyle: {
    family: '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif',
    weight: '500',
    size: 12,
  },
  startHats: true,
});

const HIGH_CONTRAST_THEME = Blockly.Theme.defineTheme('qqbot_high_contrast', {
  name: 'qqbot_high_contrast',
  base: Blockly.Themes.Zelos,
  blockStyles: BLOCK_STYLES,
  categoryStyles: CATEGORY_STYLES,
  componentStyles: {
    workspaceBackgroundColour: '#0f1115',
    toolboxBackgroundColour: '#141922',
    toolboxForegroundColour: '#ffffff',
    flyoutBackgroundColour: '#111722',
    flyoutForegroundColour: '#ffffff',
    flyoutOpacity: 1,
    scrollbarColour: '#f3f4f6',
    insertionMarkerColour: '#ffffff',
    insertionMarkerOpacity: 0.6,
    cursorColour: '#ffffff',
    selectedGlowColour: '#ffffff',
    selectedGlowOpacity: 0.35,
  },
  startHats: true,
});

const CLASSIC_THEME = Blockly.Theme.defineTheme('qqbot_classic', {
  name: 'qqbot_classic',
  base: Blockly.Themes.Classic,
  blockStyles: BLOCK_STYLES,
  categoryStyles: CATEGORY_STYLES,
  componentStyles: {
    workspaceBackgroundColour: '#ffffff',
    toolboxBackgroundColour: '#f7f7f7',
    toolboxForegroundColour: '#1f2937',
    flyoutBackgroundColour: '#f9fafb',
    flyoutForegroundColour: '#1f2937',
    flyoutOpacity: 1,
    scrollbarColour: '#9ca3af',
    insertionMarkerColour: '#165dff',
    insertionMarkerOpacity: 0.35,
    cursorColour: '#165dff',
    selectedGlowColour: '#165dff',
    selectedGlowOpacity: 0.2,
  },
  startHats: true,
});

export type BlocklyThemeName = 'classic' | 'high-contrast' | 'modern';

export const BLOCKLY_THEMES: Record<BlocklyThemeName, Blockly.Theme> = {
  classic: CLASSIC_THEME,
  'high-contrast': HIGH_CONTRAST_THEME,
  modern: MODERN_THEME,
};

export function getBlocklyTheme(themeName: BlocklyThemeName = 'modern'): Blockly.Theme {
  return BLOCKLY_THEMES[themeName];
}

export function setWorkspaceTheme(workspace: Blockly.WorkspaceSvg, themeName: BlocklyThemeName): void {
  workspace.setTheme(getBlocklyTheme(themeName));
}
