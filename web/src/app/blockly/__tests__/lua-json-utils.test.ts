/**
 * Blockly Lua JSON处理工具模块测试
 * 
 * 测试重构后的Lua JSON处理功能
 */

import {
  generateLuaJSONEncodeCode,
  generateLuaJSONDecodeCode,
  generateLuaJSONGetCode,
  generateLuaJSONExtractCode,
  generateLuaTableGetCode,
  generateLuaTableSetCode,
  BLOCKLY_JSON_RUNTIME_LIBRARY,
  generatePluginHeaderWithJSONLibrary,
} from '../lua-json-utils';

describe('Lua JSON Utils', () => {
  describe('generateLuaJSONEncodeCode', () => {
    it('应该生成正确的JSON编码代码', () => {
      const code = generateLuaJSONEncodeCode('myTable');
      expect(code).toBe('blockly_json.encode(myTable)');
    });

    it('应该处理默认值', () => {
      const code = generateLuaJSONEncodeCode('{}');
      expect(code).toBe('blockly_json.encode({})');
    });
  });

  describe('generateLuaJSONDecodeCode', () => {
    it('应该生成正确的JSON解码代码', () => {
      const code = generateLuaJSONDecodeCode('jsonStr');
      expect(code).toBe('blockly_json.decode(jsonStr)');
    });

    it('应该处理默认值', () => {
      const code = generateLuaJSONDecodeCode('"{}"');
      expect(code).toBe('blockly_json.decode("{}")');
    });
  });

  describe('generateLuaJSONGetCode', () => {
    it('应该生成正确的JSON路径获取代码', () => {
      const code = generateLuaJSONGetCode('jsonStr', '"data.name"');
      // 使用辅助函数，代码更简洁
      expect(code).toBe('blockly_json.get_path(jsonStr, "data.name")');
    });

    it('应该使用辅助函数而非IIFE', () => {
      const code = generateLuaJSONGetCode('jsonStr', '"path"');
      expect(code).toContain('blockly_json.get_path');
      // 不再使用IIFE包装
      expect(code).not.toMatch(/\(function\(\)/);
      expect(code).not.toMatch(/end\)\(\)/);
    });
  });

  describe('generateLuaJSONExtractCode', () => {
    it('应该生成正确的JSON提取代码', () => {
      const code = generateLuaJSONExtractCode('jsonStr', '"message[0].text"');
      // 使用辅助函数，代码更简洁
      expect(code).toBe('blockly_json.get_path(jsonStr, "message[0].text")');
    });

    it('应该使用与get_code相同的辅助函数', () => {
      const extractCode = generateLuaJSONExtractCode('jsonStr', '"path"');
      const getCode = generateLuaJSONGetCode('jsonStr', '"path"');
      expect(extractCode).toBe(getCode);
    });
  });

  describe('generateLuaTableGetCode', () => {
    it('应该生成正确的表路径获取代码', () => {
      const code = generateLuaTableGetCode('myTable', '"user.name"');
      expect(code).toBe('blockly_table_utils.get(myTable, "user.name")');
    });

    it('应该处理复杂路径', () => {
      const code = generateLuaTableGetCode('data', '"items[0].id"');
      expect(code).toBe('blockly_table_utils.get(data, "items[0].id")');
    });
  });

  describe('generateLuaTableSetCode', () => {
    it('应该生成正确的表路径设置代码', () => {
      const code = generateLuaTableSetCode('myTable', '"user.name"', '"John"');
      expect(code).toBe('blockly_table_utils.set(myTable, "user.name", "John")');
    });

    it('应该处理nil值', () => {
      const code = generateLuaTableSetCode('myTable', '"key"', 'nil');
      expect(code).toBe('blockly_table_utils.set(myTable, "key", nil)');
    });
  });

  describe('BLOCKLY_JSON_RUNTIME_LIBRARY', () => {
    it('应该包含blockly_json模块', () => {
      expect(BLOCKLY_JSON_RUNTIME_LIBRARY).toContain('blockly_json = blockly_json or {}');
    });

    it('应该包含blockly_json.encode函数', () => {
      expect(BLOCKLY_JSON_RUNTIME_LIBRARY).toContain('function blockly_json.encode(value)');
    });

    it('应该包含blockly_json.decode函数', () => {
      expect(BLOCKLY_JSON_RUNTIME_LIBRARY).toContain('function blockly_json.decode(jsonStr)');
    });

    it('应该包含blockly_table_utils模块', () => {
      expect(BLOCKLY_JSON_RUNTIME_LIBRARY).toContain('blockly_table_utils = blockly_table_utils or {}');
    });

    it('应该包含parse_path函数', () => {
      expect(BLOCKLY_JSON_RUNTIME_LIBRARY).toContain('function blockly_table_utils.parse_path(path)');
    });

    it('应该包含get函数', () => {
      expect(BLOCKLY_JSON_RUNTIME_LIBRARY).toContain('function blockly_table_utils.get(tbl, path)');
    });

    it('应该包含set函数', () => {
      expect(BLOCKLY_JSON_RUNTIME_LIBRARY).toContain('function blockly_table_utils.set(tbl, path, value)');
    });

    it('应该支持数组索引路径解析', () => {
      expect(BLOCKLY_JSON_RUNTIME_LIBRARY).toContain('message[0].text');
    });
  });

  describe('generatePluginHeaderWithJSONLibrary', () => {
    it('应该生成包含插件元信息的头部', () => {
      const metadata = {
        name: 'TestPlugin',
        version: '1.0.0',
        description: 'A test plugin',
      };
      const header = generatePluginHeaderWithJSONLibrary(metadata);
      expect(header).toContain('plugin.name = "TestPlugin"');
      expect(header).toContain('plugin.version = "1.0.0"');
      expect(header).toContain('plugin.description = "A test plugin"');
    });

    it('应该包含JSON运行时库', () => {
      const metadata = {
        name: 'Test',
        version: '1.0',
        description: 'Test',
      };
      const header = generatePluginHeaderWithJSONLibrary(metadata);
      expect(header).toContain('blockly_json');
      expect(header).toContain('blockly_table_utils');
    });
  });
});

/**
 * 集成测试：验证生成的Lua代码结构
 */
describe('Integration Tests', () => {
  it('生成的代码应该可以在Lua环境中执行', () => {
    // 验证生成的Lua代码结构正确
    const metadata = {
      name: 'TestPlugin',
      version: '1.0.0',
      description: 'Test plugin for JSON handling',
    };
    
    const header = generatePluginHeaderWithJSONLibrary(metadata);
    
    // 验证代码结构
    expect(header).toMatch(/^-- Test plugin/);
    expect(header).toMatch(/plugin\.name = "TestPlugin"/);
    expect(header).toMatch(/function blockly_json\.encode/);
    expect(header).toMatch(/function blockly_json\.decode/);
    expect(header).toMatch(/function blockly_table_utils\.get/);
    expect(header).toMatch(/function blockly_table_utils\.set/);
  });

  it('JSON编码代码应该生成正确的函数调用', () => {
    const testCases = [
      { input: 'data', expected: 'blockly_json.encode(data)' },
      { input: '{name="test"}', expected: 'blockly_json.encode({name="test"})' },
      { input: 'event', expected: 'blockly_json.encode(event)' },
    ];

    testCases.forEach(({ input, expected }) => {
      expect(generateLuaJSONEncodeCode(input)).toBe(expected);
    });
  });

  it('表操作代码应该支持嵌套路径', () => {
    const paths = [
      '"user.name"',
      '"items[0]"',
      '"data.users[1].profile.name"',
      '"config.settings.debug"',
    ];

    paths.forEach(path => {
      const code = generateLuaTableGetCode('table', path);
      expect(code).toContain('blockly_table_utils.get');
      expect(code).toContain(path);
    });
  });
});
