import * as Blockly from 'blockly';
import 'blockly/blocks';
import { multilineEditorBridge } from '../multilineEditorBridge';
import { blocklyConfigApi, BlocklyConfigData } from '../../services/api';

class FieldMultilineText extends Blockly.FieldTextInput {
  static CUSTOM_FIELD = true;

  constructor(opt_value?: string, opt_validator?: any) {
    super(opt_value, opt_validator);
  }

  static fromJson(options: any): FieldMultilineText {
    return new FieldMultilineText(options['text']);
  }

  showEditor_(): void {
    const value = this.getValue() || '';
    multilineEditorBridge.openEditor(value, this, 'lua');
  }

  protected doClassValidation_(newValue: any): string | null {
    if (newValue === null) {
      return null;
    }
    return String(newValue);
  }

  protected updateText_(): void {
    const text = this.getText();
    let displayText = text;
    if (text) {
      const lines = text.split('\n');
      if (lines.length > 1) {
        displayText = lines[0] + '...';
      }
      if (displayText.length > 30) {
        displayText = displayText.substring(0, 30) + '...';
      }
    }
    this.setText_?.(displayText || '(点击编辑)');
  }
}

Blockly.fieldRegistry.register('field_multilinetext', FieldMultilineText);

let registered = false;
let currentBlocks: any[] = [];
let currentConfig: BlocklyConfigData | null = null;

const BLOCKLY_CONFIG_STORAGE_KEY = 'blockly_config_data';
const BLOCKLY_CONFIG_TIMESTAMP_KEY = 'blockly_config_timestamp';

export function defineCustomBlocks(blocks?: any[]): void {
  if (registered) {
    return;
  }
  const blocksToRegister = blocks || currentBlocks;
  if (blocksToRegister.length === 0) {
    return;
  }
  for (const block of blocksToRegister) {
    if (block.type && Blockly.Blocks[block.type]) {
      delete Blockly.Blocks[block.type];
    }
  }
  Blockly.common.defineBlocksWithJsonArray(blocksToRegister);

  const hexBlock = Blockly.Blocks['logic_compare_hex'];
  if (hexBlock) {
    const originalInit = hexBlock.init;
    hexBlock.init = function() {
      originalInit.call(this);
      this.setOutput(true, 'Boolean');
    };
  }

  registered = true;
}

function loadCachedConfig(): BlocklyConfigData | null {
  try {
    const cached = localStorage.getItem(BLOCKLY_CONFIG_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.blocks)) {
        return parsed as BlocklyConfigData;
      }
    }
  } catch {
    localStorage.removeItem(BLOCKLY_CONFIG_STORAGE_KEY);
    localStorage.removeItem(BLOCKLY_CONFIG_TIMESTAMP_KEY);
  }
  return null;
}

function saveConfigToCache(config: BlocklyConfigData): void {
  try {
    localStorage.setItem(BLOCKLY_CONFIG_STORAGE_KEY, JSON.stringify(config));
    localStorage.setItem(BLOCKLY_CONFIG_TIMESTAMP_KEY, new Date().toISOString());
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      try {
        localStorage.removeItem(BLOCKLY_CONFIG_STORAGE_KEY);
        localStorage.removeItem(BLOCKLY_CONFIG_TIMESTAMP_KEY);
        localStorage.setItem(BLOCKLY_CONFIG_STORAGE_KEY, JSON.stringify(config));
        localStorage.setItem(BLOCKLY_CONFIG_TIMESTAMP_KEY, new Date().toISOString());
      } catch {
        // 忽略二次保存失败
      }
    }
  }
}

export async function fetchBlockConfig(forceRefresh: boolean = false): Promise<{ config: BlocklyConfigData | null; fromCache: boolean; error?: string }> {
  if (!forceRefresh) {
    const cached = loadCachedConfig();
    if (cached) {
      currentConfig = cached;
      currentBlocks = cached.blocks;
      return { config: cached, fromCache: true };
    }
  }

  try {
    const res = await blocklyConfigApi.getBlockConfig();
    if (res.success && res.data && Array.isArray(res.data.blocks) && res.data.blocks.length > 0) {
      const config = res.data;
      saveConfigToCache(config);
      currentConfig = config;
      currentBlocks = config.blocks;
      return { config, fromCache: false };
    }

    const cached = loadCachedConfig();
    if (cached) {
      currentConfig = cached;
      currentBlocks = cached.blocks;
      return { config: cached, fromCache: true, error: 'API返回空配置，使用缓存数据' };
    }

    return { config: null, fromCache: false, error: '无法获取积木配置' };
  } catch {
    const cached = loadCachedConfig();
    if (cached) {
      currentConfig = cached;
      currentBlocks = cached.blocks;
      return { config: cached, fromCache: true, error: '网络请求失败，使用缓存数据' };
    }

    return { config: null, fromCache: false, error: error?.message || '网络请求失败' };
  }
}

export function getCurrentConfig(): BlocklyConfigData | null {
  return currentConfig;
}

export function getApiToolbox(): any | null {
  if (currentConfig && currentConfig.toolbox && Object.keys(currentConfig.toolbox).length > 0) {
    return currentConfig.toolbox;
  }
  return null;
}

export function clearConfigCache(): void {
  localStorage.removeItem(BLOCKLY_CONFIG_STORAGE_KEY);
  localStorage.removeItem(BLOCKLY_CONFIG_TIMESTAMP_KEY);
  currentConfig = null;
  currentBlocks = [];
}

export function getBlockMessageMap(): Record<string, { message0: string; tooltip: string }> {
  const map: Record<string, { message0: string; tooltip: string }> = {};
  for (const block of currentBlocks) {
    if (block.type) {
      map[block.type] = {
        message0: block.message0 || '',
        tooltip: typeof block.tooltip === 'string' ? block.tooltip : '',
      };
    }
  }
  return map;
}

export function reinitializeBlocks(blocks: any[]): void {
  registered = false;
  currentBlocks = blocks;
  defineCustomBlocks(blocks);
}
