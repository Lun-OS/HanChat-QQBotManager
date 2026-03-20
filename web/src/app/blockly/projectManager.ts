import { pluginManagerApi, pluginApi } from '../services/api';
import { BlocklyProject, BlocklyProjectFile } from './types';

const BLOCKLY_PROJECTS_PATH = '/plugins/blockly';

/**
 * 确保 Blockly 目录存在
 * 
 * 注意：Blockly 目录现在由后端自动创建，前端不再调用 API 创建目录
 * 这是为了安全考虑，防止前端滥用目录创建权限
 */
export async function ensureBlocklyDir(): Promise<boolean> {
  // 后端会自动创建 blockly 目录，前端只需要假设它存在
  // 如果目录不存在，后续的文件操作会返回错误
  return true;
}

export async function listBlocklyProjects(): Promise<BlocklyProjectFile[]> {
  try {
    const res = await pluginManagerApi.getPluginFiles('blockly');
    if (res.success && res.data) {
      return res.data
        .filter((node: any) => node.isDirectory)
        .map((node: any) => ({
          name: node.name,
          path: node.path,
          updatedAt: new Date().toISOString()
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return [];
  } catch (error) {
    console.error('Failed to list blockly projects:', error);
    return [];
  }
}

export async function createBlocklyProject(name: string): Promise<{ success: boolean; message?: string; exists?: boolean }> {
  try {
    const sanitizedName = name.replace(/[<>:"/\\|?*]/g, '_');
    
    const res = await pluginManagerApi.createFile(BLOCKLY_PROJECTS_PATH, sanitizedName, 'folder');
    
    // 检查是否已存在
    const alreadyExists = !res.success && (
      res.message?.includes('已存在') || 
      res.message?.includes('exists') ||
      res.message?.includes('Conflict')
    );
    
    if (alreadyExists) {
      return { success: false, exists: true, message: '项目已存在' };
    }
    
    if (res.success) {
      const projectData: BlocklyProject = {
        id: generateId(),
        name: sanitizedName,
        description: '',
        version: '1.0.0',
        xmlContent: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const jsonRes = await pluginManagerApi.writeFile(
        `${BLOCKLY_PROJECTS_PATH}/${sanitizedName}/project.json`,
        JSON.stringify(projectData, null, 2)
      );
      
      if (jsonRes.success) {
        return { success: true };
      }
      return { success: false, message: jsonRes.message || 'Failed to create project file' };
    }
    return { success: false, message: res.message || 'Failed to create project folder' };
  } catch (error: any) {
    console.error('Create project error:', error);
    // 检查错误消息是否包含已存在
    if (error?.message?.includes('已存在') || error?.message?.includes('exists') || error?.message?.includes('Conflict')) {
      return { success: false, exists: true, message: '项目已存在' };
    }
    return { success: false, message: error.message || 'Unknown error' };
  }
}

export async function loadBlocklyProject(path: string): Promise<BlocklyProject | null> {
  try {
    const res = await pluginManagerApi.readFile(`${path}/project.json`);
    if (res.success && res.data) {
      const project = JSON.parse(res.data.content);
      project.path = path;
      return project;
    }
    return null;
  } catch (error) {
    console.error('Failed to load blockly project:', error);
    return null;
  }
}

export async function saveBlocklyProject(project: BlocklyProject): Promise<{ success: boolean; message?: string }> {
  try {
    if (!project.path) {
      return { success: false, message: 'Project path is missing' };
    }
    
    const projectToSave = {
      ...project,
      updatedAt: new Date().toISOString()
    };
    
    const res = await pluginManagerApi.writeFile(
      `${project.path}/project.json`,
      JSON.stringify(projectToSave, null, 2)
    );
    if (res.success) {
      return { success: true };
    }
    return { success: false, message: res.message || 'Failed to save project' };
  } catch (error: any) {
    console.error('Save project error:', error);
    return { success: false, message: error.message || 'Unknown error' };
  }
}

export async function deleteBlocklyProject(path: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await pluginManagerApi.deleteFile(path);
    if (res.success) {
      return { success: true };
    }
    return { success: false, message: res.message || 'Failed to delete project' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Unknown error' };
  }
}

export async function renameBlocklyProject(oldPath: string, newName: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await pluginManagerApi.renameFile(oldPath, newName);
    if (res.success) {
      return { success: true };
    }
    return { success: false, message: res.message || 'Failed to rename project' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Unknown error' };
  }
}

export async function exportPlugin(
  code: string,
  targetAccountId: string,
  pluginName: string,
  configContent?: string,
  forceOverwrite?: boolean
): Promise<{ success: boolean; message?: string; exists?: boolean }> {
  try {
    // 排除 blockly 目录，这是 Blockly 项目存储的保留目录
    if (pluginName.toLowerCase() === 'blockly') {
      return { success: false, message: '插件名称 "blockly" 是保留名称，请使用其他名称' };
    }

    const pluginPath = `/plugins/${targetAccountId}/${pluginName}`;

    // 检查插件是否已存在 - 使用 getPluginList
    const checkRes = await pluginApi.getPluginList(targetAccountId);
    const exists = checkRes.data?.some((p: any) => p.name === pluginName);

    if (exists && !forceOverwrite) {
      // 插件已存在，但未强制覆盖，返回存在状态
      return { success: false, exists: true, message: '插件已存在' };
    }

    if (exists && forceOverwrite) {
      // 插件已存在，强制覆盖，先卸载再删除
      try {
        await pluginApi.unloadPlugin(targetAccountId, pluginName);
      } catch (e) {
        // 忽略卸载错误，可能插件未运行
      }
      const deleteRes = await pluginManagerApi.deleteFile(pluginPath);
      if (!deleteRes.success && !deleteRes.message?.includes('不存在')) {
        return { success: false, message: deleteRes.message || 'Failed to delete existing plugin' };
      }
    }
    
    // 创建插件目录
    const folderRes = await pluginManagerApi.createFile(`/plugins/${targetAccountId}`, pluginName, 'folder');
    if (!folderRes.success) {
      return { success: false, message: folderRes.message || 'Failed to create plugin folder' };
    }
    
    // 写入 main.lua
    const mainRes = await pluginManagerApi.writeFile(`${pluginPath}/main.lua`, code);
    if (!mainRes.success) {
      return { success: false, message: mainRes.message || 'Failed to write main.lua' };
    }
    
    // 写入或更新 config.json
    if (configContent) {
      const configRes = await pluginManagerApi.writeFile(`${pluginPath}/config.json`, configContent);
      if (!configRes.success) {
        return { success: false, message: configRes.message || 'Failed to write config.json' };
      }
    } else {
      const defaultConfig = JSON.stringify({
        name: pluginName,
        version: '1.0.0',
        description: 'Generated by Blockly',
        enabled: true
      }, null, 2);
      
      const configRes = await pluginManagerApi.writeFile(`${pluginPath}/config.json`, defaultConfig);
      if (!configRes.success) {
        return { success: false, message: configRes.message || 'Failed to write config.json' };
      }
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message || 'Unknown error' };
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function createEmptyProject(name: string): BlocklyProject {
  return {
    id: generateId(),
    name: name,
    description: '',
    version: '1.0.0',
    xmlContent: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * 导出Blockly工程到本地文件
 * 将xmlContent进行格式化和反转移后导出
 */
export function exportBlocklyProject(project: BlocklyProject): void {
  // 准备导出的数据
  const exportData = {
    name: project.name,
    description: project.description,
    version: project.version,
    xmlContent: formatXml(project.xmlContent),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    exportTime: new Date().toISOString()
  };

  // 创建Blob并下载
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.name}.blockly.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 文件大小限制：10MB
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
// 允许的文件扩展名
const ALLOWED_IMPORT_EXTENSIONS = ['.blockly.json', '.json'];

/**
 * 验证导入文件的安全性
 */
function validateImportFile(file: File): { valid: boolean; error?: string } {
  // 检查文件大小
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return { valid: false, error: `文件过大，最大支持 ${MAX_IMPORT_FILE_SIZE / 1024 / 1024}MB` };
  }
  
  if (file.size === 0) {
    return { valid: false, error: '文件不能为空' };
  }
  
  // 检查文件扩展名
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_IMPORT_EXTENSIONS.some(ext => fileName.endsWith(ext));
  if (!hasValidExtension) {
    return { valid: false, error: '无效的文件类型，仅支持 .blockly.json 文件' };
  }
  
  // 检查文件名中的非法字符
  const nameWithoutExt = file.name.replace(/\.blockly\.json$/i, '').replace(/\.json$/i, '');
  if (!nameWithoutExt || nameWithoutExt.length > 100) {
    return { valid: false, error: '文件名无效或过长' };
  }
  
  // 检查 MIME 类型（如果浏览器提供）
  if (file.type && !['application/json', 'text/plain', ''].includes(file.type)) {
    return { valid: false, error: '文件类型不匹配' };
  }
  
  return { valid: true };
}

/**
 * 从本地文件导入Blockly工程
 */
export function importBlocklyProject(file: File): Promise<BlocklyProject | null> {
  return new Promise((resolve, reject) => {
    // 先进行安全验证
    const validation = validateImportFile(file);
    if (!validation.valid) {
      reject(new Error(validation.error));
      return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        
        // 限制解析的字符串长度，防止内存溢出
        if (content.length > MAX_IMPORT_FILE_SIZE) {
          reject(new Error('文件内容过大'));
          return;
        }
        
        const data = JSON.parse(content);
        
        // 验证必要字段
        if (!data.xmlContent || typeof data.xmlContent !== 'string') {
          reject(new Error('无效的工程文件：缺少 xmlContent 或格式不正确'));
          return;
        }
        
        // 验证 xmlContent 长度
        if (data.xmlContent.length > MAX_IMPORT_FILE_SIZE) {
          reject(new Error('工程内容过大'));
          return;
        }
        
        // 验证 XML 内容的基本格式
        if (!data.xmlContent.includes('<xml') || !data.xmlContent.includes('</xml>')) {
          reject(new Error('无效的工程文件：XML 格式不正确'));
          return;
        }
        
        // 清理项目名称，防止 XSS
        const sanitizeName = (name: string): string => {
          return name
            .replace(/[<>"']/g, '')  // 移除潜在危险的 HTML 字符
            .replace(/[\\/:*?|]/g, '_')  // 替换文件系统非法字符
            .trim()
            .substring(0, 50);  // 限制长度
        };
        
        // 创建项目对象
        const project: BlocklyProject = {
          id: generateId(),
          name: sanitizeName(data.name) || file.name.replace(/\.blockly\.json$/i, '').replace(/\.json$/i, ''),
          description: (data.description || '').toString().substring(0, 200),
          version: (data.version || '1.0.0').toString().substring(0, 20),
          xmlContent: data.xmlContent,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString()
        };
        
        resolve(project);
      } catch (error) {
        if (error instanceof SyntaxError) {
          reject(new Error('JSON 解析失败：文件格式不正确'));
        } else {
          reject(new Error('解析工程文件失败：' + (error as Error).message));
        }
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败，请检查文件是否损坏'));
    };
    
    reader.onabort = () => {
      reject(new Error('读取操作被取消'));
    };
    
    try {
      reader.readAsText(file);
    } catch (error) {
      reject(new Error('无法读取文件'));
    }
  });
}

/**
 * 格式化XML字符串（美化输出）
 * 注意：不处理文本内容中的空格，只格式化标签结构
 */
function formatXml(xml: string): string {
  if (!xml) return '';
  
  // 使用DOM解析器来正确处理XML，保留文本内容的原始格式
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  
  // 序列化时保留原始格式
  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc);
}
