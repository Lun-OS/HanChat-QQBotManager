/**
 * Lua代码分析器
 * 用于检测死循环、无限递归等潜在问题，以及语法错误
 */

export interface LuaAnalysisResult {
  hasIssues: boolean;
  hasSyntaxErrors: boolean;
  issues: LuaIssue[];
}

export interface LuaIssue {
  type: 'warning' | 'error';
  message: string;
  line?: number;
  suggestion?: string;
}

/**
 * 分析Lua代码，检测潜在问题和语法错误
 */
export function analyzeLuaCode(code: string): LuaAnalysisResult {
  const issues: LuaIssue[] = [];
  const lines = code.split('\n');

  // 0. 首先检查语法错误
  checkSyntaxErrors(code, lines, issues);

  // 1. 检测while true死循环
  detectWhileTrueLoops(lines, issues);

  // 2. 检测没有退出条件的repeat循环
  detectRepeatLoops(lines, issues);

  // 3. 检测无限递归
  detectInfiniteRecursion(code, lines, issues);

  // 4. 检测没有递增/递减的for循环
  detectInfiniteForLoops(lines, issues);

  // 5. 检测goto导致的无限循环
  detectGotoLoops(lines, issues);

  // 6. 检测递归调用但没有终止条件
  detectRecursiveFunctions(code, lines, issues);

  const syntaxErrors = issues.filter(i => i.type === 'error' && i.message.includes('语法错误'));

  return {
    hasIssues: issues.length > 0,
    hasSyntaxErrors: syntaxErrors.length > 0,
    issues
  };
}

/**
 * 检查Lua语法错误
 */
function checkSyntaxErrors(code: string, lines: string[], issues: LuaIssue[]): void {
  // 1. 检查未闭合的字符串
  checkUnclosedStrings(code, lines, issues);

  // 2. 检查未闭合的注释
  checkUnclosedComments(code, lines, issues);

  // 3. 检查括号匹配
  checkBracketMatching(code, lines, issues);

  // 4. 检查关键字错误
  checkKeywordErrors(lines, issues);

  // 5. 检查end关键字匹配
  checkEndMatching(code, lines, issues);

  // 6. 检查非法字符
  checkIllegalCharacters(lines, issues);
}

/**
 * 检查未闭合的字符串
 */
function checkUnclosedStrings(code: string, lines: string[], issues: LuaIssue[]): void {
  let inString: string | null = null;
  let stringStartLine = 0;
  let escaped = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const lineNum = code.substring(0, i).split('\n').length;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (inString === null) {
      if (char === '"' || char === "'") {
        inString = char;
        stringStartLine = lineNum;
      }
    } else {
      if (char === inString) {
        inString = null;
      }
    }
  }

  if (inString !== null) {
    issues.push({
      type: 'error',
      message: `语法错误: 字符串未闭合 (开始于第${stringStartLine}行)`,
      line: stringStartLine,
      suggestion: '检查字符串是否有配对的引号'
    });
  }
}

/**
 * 检查未闭合的多行注释
 */
function checkUnclosedComments(code: string, lines: string[], issues: LuaIssue[]): void {
  const commentPattern = /--\[\[([\s\S]*?)\]\]/g;
  const longCommentStart = /--\[\[/g;

  let match;
  while ((match = longCommentStart.exec(code)) !== null) {
    const startIndex = match.index;
    const endPattern = /\]\]/;
    const afterComment = code.substring(startIndex + 4);

    if (!endPattern.test(afterComment)) {
      const lineNum = code.substring(0, startIndex).split('\n').length;
      issues.push({
        type: 'error',
        message: `语法错误: 多行注释未闭合 (第${lineNum}行)`,
        line: lineNum,
        suggestion: '多行注释需要以 ]] 结束'
      });
    }
  }
}

/**
 * 检查括号匹配
 */
function checkBracketMatching(code: string, lines: string[], issues: LuaIssue[]): void {
  const brackets: { [key: string]: string } = { '(': ')', '[': ']', '{': '}' };
  const closingBrackets: { [key: string]: string } = { ')': '(', ']': '[', '}': '{' };
  const stack: { char: string; line: number }[] = [];

  let inString: string | null = null;
  let escaped = false;
  let inComment = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const lineNum = code.substring(0, i).split('\n').length;

    // 处理注释
    if (!inString && char === '-' && code[i + 1] === '-') {
      inComment = true;
    }
    if (inComment && char === '\n') {
      inComment = false;
    }

    if (inComment) continue;

    // 处理字符串
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      if (inString === null) {
        inString = char;
      } else if (inString === char) {
        inString = null;
      }
      continue;
    }

    if (inString !== null) continue;

    // 处理括号
    if (brackets[char]) {
      stack.push({ char, line: lineNum });
    } else if (closingBrackets[char]) {
      if (stack.length === 0) {
        issues.push({
          type: 'error',
          message: `语法错误: 多余的闭合括号 '${char}' (第${lineNum}行)`,
          line: lineNum,
          suggestion: '检查括号是否配对'
        });
      } else {
        const last = stack.pop()!;
        if (last.char !== closingBrackets[char]) {
          issues.push({
            type: 'error',
            message: `语法错误: 括号不匹配，期望 '${brackets[last.char]}' 但找到 '${char}' (第${lineNum}行)`,
            line: lineNum,
            suggestion: `第${last.line}行的 '${last.char}' 没有正确闭合`
          });
        }
      }
    }
  }

  // 检查未闭合的括号
  while (stack.length > 0) {
    const item = stack.pop()!;
    issues.push({
      type: 'error',
      message: `语法错误: 括号 '${item.char}' 未闭合 (第${item.line}行)`,
      line: item.line,
      suggestion: `添加 '${brackets[item.char]}' 来闭合括号`
    });
  }
}

/**
 * 检查关键字错误
 */
function checkKeywordErrors(lines: string[], issues: LuaIssue[]): void {
  // 检查常见的拼写错误
  const misspellings: { [key: string]: string } = {
    'fucntion': 'function',
    'funtion': 'function',
    'funciton': 'function',
    'fuction': 'function',
    'loacl': 'local',
    'locla': 'local',
    'reutrn': 'return',
    'retunr': 'return',
    'retrun': 'return',
    'retuen': 'return',
    'thne': 'then',
    'tehn': 'then',
    'els': 'else',
    'eles': 'else',
    'eilf': 'elseif',
    'endw': 'end',
    'edn': 'end',
    'ned': 'end'
  };

  lines.forEach((line, index) => {
    // 跳过注释和字符串中的内容
    const codePart = line.split('--')[0];

    for (const [wrong, correct] of Object.entries(misspellings)) {
      const pattern = new RegExp(`\\b${wrong}\\b`, 'i');
      if (pattern.test(codePart)) {
        issues.push({
          type: 'error',
          message: `语法错误: 关键字拼写错误 '${wrong}' (第${index + 1}行)`,
          line: index + 1,
          suggestion: `是否应该是 '${correct}'?`
        });
      }
    }
  });
}

/**
 * 检查end关键字匹配
 */
function checkEndMatching(code: string, lines: string[], issues: LuaIssue[]): void {
  const keywords = ['function', 'if', 'for', 'while', 'repeat'];
  const stack: { keyword: string; line: number }[] = [];

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // 提取代码部分（去除注释）
    let codePart = line;
    const commentIndex = codePart.indexOf('--');
    if (commentIndex !== -1) {
      codePart = codePart.substring(0, commentIndex);
    }
    
    const trimmed = codePart.trim();
    if (trimmed === '') return;

    // 移除字符串内容，避免误判
    const codeWithoutStrings = removeStrings(codePart);

    // 检测关键字开始
    for (const keyword of keywords) {
      const pattern = new RegExp(`\\b${keyword}\\b`);
      if (pattern.test(codeWithoutStrings)) {
        // 检查是否是 elseif，这不需要新的 end
        if (keyword === 'if' && /\belseif\b/.test(codeWithoutStrings)) {
          continue;
        }
        stack.push({ keyword, line: lineNum });
        break;
      }
    }

    // 检测end
    if (/\bend\b/.test(codeWithoutStrings)) {
      if (stack.length === 0) {
        issues.push({
          type: 'error',
          message: `语法错误: 多余的 'end' (第${lineNum}行)`,
          line: lineNum,
          suggestion: '检查是否有未匹配的 end'
        });
      } else {
        stack.pop();
      }
    }
  });

  // 检查未闭合的关键字
  while (stack.length > 0) {
    const item = stack.pop()!;
    issues.push({
      type: 'error',
      message: `语法错误: '${item.keyword}' 缺少对应的 'end' (第${item.line}行)`,
      line: item.line,
      suggestion: `在适当位置添加 'end' 来闭合 ${item.keyword}`
    });
  }
}

/**
 * 移除字符串内容
 */
function removeStrings(line: string): string {
  let result = '';
  let inString: string | null = null;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (escaped) {
      escaped = false;
      if (inString === null) {
        result += char;
      }
      continue;
    }

    if (char === '\\') {
      escaped = true;
      if (inString === null) {
        result += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (inString === null) {
        inString = char;
        result += ' '; // 用空格替代字符串
      } else if (inString === char) {
        inString = null;
        result += ' ';
      } else {
        result += ' ';
      }
      continue;
    }

    if (inString === null) {
      result += char;
    } else {
      result += ' ';
    }
  }

  return result;
}

/**
 * 检查非法字符
 */
function checkIllegalCharacters(lines: string[], issues: LuaIssue[]): void {
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // 提取代码部分（去除注释）
    let codePart = line;
    const commentIndex = codePart.indexOf('--');
    if (commentIndex !== -1) {
      codePart = codePart.substring(0, commentIndex);
    }

    // 移除字符串内容，避免误判字符串中的中文
    const codeWithoutStrings = removeStrings(codePart);

    // 检查中文字符是否出现在标识符中
    // Lua标识符规则: [a-zA-Z_][a-zA-Z0-9_]*
    // 检查是否有中文字符紧跟在标识符字符前后
    const identifierPattern = /[a-zA-Z0-9_]/;
    const chinesePattern = /[\u4e00-\u9fa5]/;
    
    for (let i = 0; i < codeWithoutStrings.length; i++) {
      const char = codeWithoutStrings[i];
      
      // 如果当前字符是中文
      if (chinesePattern.test(char)) {
        // 检查前一个字符是否是标识符字符
        const prevChar = i > 0 ? codeWithoutStrings[i - 1] : '';
        // 检查后一个字符是否是标识符字符
        const nextChar = i < codeWithoutStrings.length - 1 ? codeWithoutStrings[i + 1] : '';
        
        // 如果中文前后有标识符字符，说明中文在标识符中
        if (identifierPattern.test(prevChar) || identifierPattern.test(nextChar)) {
          issues.push({
            type: 'error',
            message: `语法错误: 标识符中包含中文字符 (第${lineNum}行)`,
            line: lineNum,
            suggestion: 'Lua标识符只能包含字母、数字和下划线'
          });
          break; // 每行只报告一次
        }
      }
    }

    // 检查未转义的特殊字符
    const unescapedSpecial = /[^\s"']\$[a-zA-Z_]/;
    if (unescapedSpecial.test(codeWithoutStrings)) {
      issues.push({
        type: 'warning',
        message: `可能的错误: 变量插值语法 '\$variable' 在Lua中无效 (第${lineNum}行)`,
        line: lineNum,
        suggestion: "Lua中使用 '..variable..' 进行字符串拼接"
      });
    }
  });
}

/**
 * 检测while true死循环
 */
function detectWhileTrueLoops(lines: string[], issues: LuaIssue[]): void {
  const whileTruePattern = /while\s+(true|1)\s+do/;
  
  lines.forEach((line, index) => {
    if (whileTruePattern.test(line)) {
      // 检查是否有break语句在同一代码块中
      const hasBreak = checkHasBreakInScope(lines, index);
      
      if (!hasBreak) {
        issues.push({
          type: 'warning',
          message: `检测到可能的无条件死循环: "while true do"`,
          line: index + 1,
          suggestion: '确保循环内有break、return或os.exit()等退出机制，或者使用条件循环'
        });
      }
    }
  });
}

/**
 * 检测repeat循环是否有until条件
 */
function detectRepeatLoops(lines: string[], issues: LuaIssue[]): void {
  const repeatPattern = /\brepeat\b/;
  
  lines.forEach((line, index) => {
    if (repeatPattern.test(line)) {
      // 检查后续行是否有until
      const hasUntil = checkHasUntil(lines, index);
      
      if (!hasUntil) {
        issues.push({
          type: 'error',
          message: 'repeat语句缺少until条件',
          line: index + 1,
          suggestion: '添加until条件来结束循环，例如: until condition'
        });
      }
    }
  });
}

/**
 * 转义正则表达式中的特殊字符
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 检测无限递归
 */
function detectInfiniteRecursion(code: string, lines: string[], issues: LuaIssue[]): void {
  // 提取所有函数定义 - 改进的正则表达式
  // 支持 local function name() 和 function name() 两种形式
  const functionPattern = /(?:local\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  const functionNames: string[] = [];
  let match;

  while ((match = functionPattern.exec(code)) !== null) {
    functionNames.push(match[1]);
  }

  // 检查每个函数是否调用自身且没有终止条件
  functionNames.forEach(funcName => {
    // 使用转义后的函数名构建正则
    const escapedName = escapeRegExp(funcName);
    const funcPattern = new RegExp(`(?:local\\s+)?function\\s+${escapedName}\\s*\\(`, 'g');
    let funcMatch;
    
    while ((funcMatch = funcPattern.exec(code)) !== null) {
      const funcStartIndex = funcMatch.index;
      const funcEndIndex = findFunctionEnd(code, funcStartIndex);
      const funcBody = code.substring(funcStartIndex, funcEndIndex);
      
      // 检查是否调用自身 - 使用转义后的函数名
      const selfCallPattern = new RegExp(`\\b${escapedName}\\s*\\(`, 'g');
      const hasSelfCall = selfCallPattern.test(funcBody);
      
      if (hasSelfCall) {
        // 检查是否有终止条件（if语句 + return）
        const hasTermination = checkHasTerminationCondition(funcBody);
        
        if (!hasTermination) {
          // 找到函数定义的行号
          const lineNum = code.substring(0, funcStartIndex).split('\n').length;
          
          issues.push({
            type: 'warning',
            message: `函数 "${funcName}" 可能存在无限递归风险`,
            line: lineNum,
            suggestion: '确保递归函数有明确的终止条件（如 if n <= 0 then return end）'
          });
        }
      }
    }
  });
}

/**
 * 检测没有递增/递减的for循环
 */
function detectInfiniteForLoops(lines: string[], issues: LuaIssue[]): void {
  // 匹配 for i = start, end, step do
  const forPattern = /for\s+(\w+)\s*=\s*(.+?),\s*(.+?)(?:,\s*(.+?))?\s+do/;
  
  lines.forEach((line, index) => {
    const match = line.match(forPattern);
    if (match) {
      const [, varName, startExpr, endExpr, stepExpr] = match;
      
      // 检查是否是数字常量
      const startNum = parseFloat(startExpr.trim());
      const endNum = parseFloat(endExpr.trim());
      const stepNum = stepExpr ? parseFloat(stepExpr.trim()) : 1;
      
      // 如果都是数字，检查是否会无限循环
      if (!isNaN(startNum) && !isNaN(endNum)) {
        const actualStep = isNaN(stepNum) ? 1 : stepNum;
        
        // 检查是否会无限循环
        if ((actualStep > 0 && startNum > endNum) || 
            (actualStep < 0 && startNum < endNum) ||
            actualStep === 0) {
          issues.push({
            type: 'warning',
            message: `for循环可能永远不会执行或无限执行`,
            line: index + 1,
            suggestion: `检查循环变量 ${varName} 的起始值、结束值和步长`
          });
        }
      }
    }
  });
}

/**
 * 检测goto导致的无限循环
 */
function detectGotoLoops(lines: string[], issues: LuaIssue[]): void {
  const gotoPattern = /\bgoto\s+(\w+)/;
  const labelPattern = /::(\w+)::/;
  
  lines.forEach((line, index) => {
    const gotoMatch = line.match(gotoPattern);
    if (gotoMatch) {
      const labelName = gotoMatch[1];
      
      // 检查是否跳转到之前的标签（可能导致无限循环）
      const labelIndex = findLabelIndex(lines, labelName, index);
      
      if (labelIndex !== -1 && labelIndex < index) {
        // 检查中间是否有退出条件
        const hasExit = checkHasExitBetween(lines, labelIndex, index);
        
        if (!hasExit) {
          issues.push({
            type: 'warning',
            message: `goto语句可能导致无限循环`,
            line: index + 1,
            suggestion: '避免使用goto跳转到之前的代码位置，使用循环结构代替'
          });
        }
      }
    }
  });
}

/**
 * 检测递归函数
 */
function detectRecursiveFunctions(code: string, lines: string[], issues: LuaIssue[]): void {
  // 检测匿名函数递归（通过变量名）
  const localFuncPattern = /local\s+(\w+)\s*=\s*function/g;
  let match;
  
  while ((match = localFuncPattern.exec(code)) !== null) {
    const funcName = match[1];
    const funcStartIndex = match.index;
    const funcEndIndex = findFunctionEnd(code, funcStartIndex);
    const funcBody = code.substring(funcStartIndex, funcEndIndex);
    
    // 检查是否调用自身
    const selfCallPattern = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
    const hasSelfCall = selfCallPattern.test(funcBody);
    
    if (hasSelfCall) {
      const hasTermination = checkHasTerminationCondition(funcBody);
      
      if (!hasTermination) {
        const lineNum = code.substring(0, funcStartIndex).split('\n').length;
        
        issues.push({
          type: 'warning',
          message: `匿名函数 "${funcName}" 可能存在无限递归风险`,
          line: lineNum,
          suggestion: '确保递归函数有明确的终止条件'
        });
      }
    }
  }
}

// ============ 辅助函数 ============

/**
 * 检查作用域内是否有break语句
 */
function checkHasBreakInScope(lines: string[], startIndex: number): boolean {
  let depth = 1;
  
  for (let i = startIndex + 1; i < lines.length && depth > 0; i++) {
    const line = lines[i];
    
    // 简单的深度计数（不考虑字符串中的关键字）
    if (/\bwhile\b|\bfor\b|\brepeat\b|\bfunction\b/.test(line) && !line.includes('--')) {
      depth++;
    }
    if (/\bend\b/.test(line) && !line.includes('--')) {
      depth--;
    }
    
    // 检查break
    if (depth === 1 && /\bbreak\b/.test(line) && !line.includes('--')) {
      return true;
    }
    
    // 检查return
    if (depth === 1 && /\breturn\b/.test(line) && !line.includes('--')) {
      return true;
    }
  }
  
  return false;
}

/**
 * 检查是否有until语句
 */
function checkHasUntil(lines: string[], startIndex: number): boolean {
  let depth = 1;
  
  for (let i = startIndex + 1; i < lines.length && depth > 0; i++) {
    const line = lines[i];
    
    if (/\brepeat\b/.test(line) && !line.includes('--')) {
      depth++;
    }
    if (/\buntil\b/.test(line) && !line.includes('--')) {
      depth--;
      if (depth === 0) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * 查找函数结束位置
 */
function findFunctionEnd(code: string, startIndex: number): number {
  let depth = 1;
  let i = startIndex;
  
  // 跳过函数定义行
  while (i < code.length && code[i] !== '\n') {
    i++;
  }
  
  while (i < code.length && depth > 0) {
    // 跳过注释
    if (code[i] === '-' && code[i + 1] === '-') {
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      continue;
    }
    
    // 跳过字符串
    if (code[i] === '"' || code[i] === "'") {
      const quote = code[i];
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    
    // 检测关键字
    if (/\bfunction\b/.test(code.substring(i, i + 8))) {
      depth++;
      i += 8;
      continue;
    }
    
    if (/\bend\b/.test(code.substring(i, i + 3))) {
      depth--;
      if (depth === 0) {
        return i + 3;
      }
      i += 3;
      continue;
    }
    
    i++;
  }
  
  return code.length;
}

/**
 * 检查函数是否有终止条件
 */
function checkHasTerminationCondition(funcBody: string): boolean {
  // 检查是否有if语句包含return
  const patterns = [
    /if\s+.+?then\s*return/,  // if ... then return
    /if\s+.+?then\s*.+?\s*return/,  // if ... then ... return
    /return\s+if/,  // return if (某些Lua方言)
  ];
  
  return patterns.some(pattern => pattern.test(funcBody));
}

/**
 * 查找标签位置
 */
function findLabelIndex(lines: string[], labelName: string, beforeIndex: number): number {
  const labelPattern = new RegExp(`::${labelName}::`);
  
  for (let i = 0; i < beforeIndex; i++) {
    if (labelPattern.test(lines[i])) {
      return i;
    }
  }
  
  return -1;
}

/**
 * 检查两个位置之间是否有退出语句
 */
function checkHasExitBetween(lines: string[], startIndex: number, endIndex: number): boolean {
  for (let i = startIndex; i < endIndex; i++) {
    const line = lines[i];
    if (/\breturn\b|\bbreak\b|\bgoto\s+\w+/.test(line) && !line.includes('--')) {
      return true;
    }
  }
  return false;
}

/**
 * 生成分析报告
 */
export function generateAnalysisReport(result: LuaAnalysisResult): string {
  if (!result.hasIssues) {
    return '代码分析完成，未发现明显问题';
  }

  const lines: string[] = [];
  lines.push('代码分析发现以下问题：\n');

  const errors = result.issues.filter(i => i.type === 'error');
  const warnings = result.issues.filter(i => i.type === 'warning');

  if (errors.length > 0) {
    lines.push(`❌ 错误 (${errors.length}个):`);
    errors.forEach(issue => {
      lines.push(`  第${issue.line}行: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`    建议: ${issue.suggestion}`);
      }
    });
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push(`警告 (${warnings.length}个):`);
    warnings.forEach(issue => {
      lines.push(`  第${issue.line}行: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`    建议: ${issue.suggestion}`);
      }
    });
  }

  return lines.join('\n');
}
