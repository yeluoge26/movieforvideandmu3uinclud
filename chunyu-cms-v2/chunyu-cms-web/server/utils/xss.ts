/**
 * XSS 防护工具
 * 用于过滤用户输入中的潜在恶意代码
 */

// HTML 实体转义映射
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * 转义 HTML 特殊字符
 * @param str 需要转义的字符串
 * @returns 转义后的安全字符串
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/[&<>"'`=/]/g, char => HTML_ENTITIES[char] || char);
}

/**
 * 移除 HTML 标签
 * @param str 包含 HTML 的字符串
 * @returns 纯文本字符串
 */
export function stripHtml(str: string): string {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

/**
 * 移除潜在的 JavaScript 代码
 * @param str 需要过滤的字符串
 * @returns 过滤后的字符串
 */
export function removeScripts(str: string): string {
  if (!str || typeof str !== 'string') return str;

  // 移除 script 标签及其内容
  str = str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // 移除事件处理器属性 (onclick, onerror, onload 等)
  str = str.replace(/\s*on\w+\s*=\s*(['"])[^'"]*\1/gi, '');
  str = str.replace(/\s*on\w+\s*=\s*[^\s>]+/gi, '');

  // 移除 javascript: 协议
  str = str.replace(/javascript\s*:/gi, '');

  // 移除 data: 协议（可能包含脚本）
  str = str.replace(/data\s*:/gi, '');

  // 移除 vbscript: 协议
  str = str.replace(/vbscript\s*:/gi, '');

  // 移除 expression() CSS 表达式
  str = str.replace(/expression\s*\([^)]*\)/gi, '');

  return str;
}

/**
 * 完整的 XSS 过滤
 * 移除所有 HTML 标签和潜在的恶意代码
 * @param str 需要过滤的字符串
 * @returns 安全的纯文本字符串
 */
export function sanitize(str: string): string {
  if (!str || typeof str !== 'string') return str;

  // 先移除脚本
  str = removeScripts(str);
  // 再移除所有 HTML 标签
  str = stripHtml(str);
  // 最后转义剩余的特殊字符
  str = escapeHtml(str);

  return str.trim();
}

/**
 * 过滤对象中的字符串字段
 * @param obj 需要过滤的对象
 * @param fields 需要过滤的字段名数组
 * @returns 过滤后的对象
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      result[field] = sanitize(result[field] as string) as T[keyof T];
    }
  }
  return result;
}

/**
 * 验证并清理用户昵称
 * 只允许字母、数字、中文、下划线
 * @param nickname 用户昵称
 * @param maxLength 最大长度
 * @returns 清理后的昵称
 */
export function sanitizeNickname(nickname: string, maxLength: number = 20): string {
  if (!nickname || typeof nickname !== 'string') return '';
  // 移除所有特殊字符，只保留安全字符
  const clean = nickname.replace(/[^\w\u4e00-\u9fa5_-]/g, '');
  return clean.substring(0, maxLength);
}

/**
 * 验证并清理 URL
 * 只允许 http 和 https 协议
 * @param url URL 字符串
 * @returns 安全的 URL 或空字符串
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}
