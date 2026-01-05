// Agent 工具库

// 计算器工具
function calculate(expression) {
  try {
    // 安全的数学表达式计算
    const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
    const result = Function(`"use strict"; return (${sanitized})`)();
    return {
      success: true,
      result: result,
      expression: expression
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 获取当前时间工具
function getCurrentTime(format = 'full') {
  const now = new Date();
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  if (format === 'date') {
    return now.toLocaleDateString('zh-CN');
  } else if (format === 'time') {
    return now.toLocaleTimeString('zh-CN', { hour12: false });
  } else {
    return now.toLocaleString('zh-CN', options);
  }
}

const axios = require('axios');
async function searchWeb(query, limit = 5) {
  console.log(`🔍 使用百度百科搜索: "${query}"`);
  
  try {

    const baiduResult = await searchWithBaiduBaike(query, limit);
    if (baiduResult.success && baiduResult.results.length > 0) {
      console.log(`✅ 百度百科搜索成功，找到 ${baiduResult.results.length} 条结果`);
      return baiduResult;
    }
  } catch (error) {
    console.error('❌ 百度搜索失败:', error.message);
    return getLocalKnowledgeData(query, error.message);
  }
}

// 百度百科搜索函数
async function searchWithBaiduBaike(query, limit = 5) {
  console.log(`📚 查询百度百科: "${query}"`);
  
  try {
    const response = await axios.get(`https://baike.baidu.com/item/${encodeURIComponent(query)}`, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': 'https://baike.baidu.com/'
      }
    });
    
    const html = response.data;
    console.log(`📄 收到HTML，长度: ${(html.length / 1024).toFixed(1)} KB`);
    
    const results = [];
    
    // === 1. 提取标题和基本信息 ===
    const titleMatch = html.match(/<h1[^>]*>\s*(?:<span[^>]*>)?([^<]+?)(?:<\/span>)?\s*<\/h1>/);
    let title = titleMatch ? titleMatch[1].trim() : query;
    
    // 尝试从title标签获取
    if (!title || title.length < 2) {
      const pageTitle = html.match(/<title>([^<]+)<\/title>/);
      if (pageTitle) {
        title = pageTitle[1].replace(/_百度百科$/, '').replace(/- 百度百科$/, '').trim();
      }
    }
    
    results.push(`📖 ${title}`);
    
    // === 2. 提取副标题/别名 ===
    const subTitleMatch = html.match(/<h2[^>]*>\s*<span[^>]*>([^<]+)<\/span>\s*<\/h2>/);
    if (subTitleMatch) {
      const subTitle = subTitleMatch[1].trim();
      if (subTitle !== title && !subTitle.includes('目录') && !subTitle.includes('参考资料')) {
        results.push(`📌 别名: ${subTitle}`);
      }
    }
    
    // === 3. 提取摘要（lemma-summary）=== 
    let summaryText = '';
    const summaryMatch = html.match(/<div[^>]*class="lemma-summary"[^>]*>([\s\S]*?)<\/div>/);
    
    if (summaryMatch) {
      summaryText = summaryMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#[0-9]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\[\d+\]/g, '')  // 移除引用标记
        .trim();
      
      if (summaryText.length > 30) {
        // 分割成多个句子，每句单独一行
        const sentences = summaryText.split(/[。！？；\.\!\?\;]/).filter(s => s.trim().length > 10);
        sentences.slice(0, 3).forEach(sentence => {
          const trimmed = sentence.trim();
          if (trimmed && !results.some(r => r.includes(trimmed.substring(0, 20)))) {
            results.push(`📝 ${trimmed}。`);
          }
        });
      }
    }
    
    // === 4. 提取基本信息卡片（关键-值对）===
    const basicInfoRegex = /<dt[^>]*>(?:<span[^>]*>)?([^<]+?)(?:<\/span>)?<\/dt>\s*<dd[^>]*>(?:<span[^>]*>)?([\s\S]*?)(?:<\/span>)?<\/dd>/g;
    let basicMatch;
    let basicCount = 0;
    
    while ((basicMatch = basicInfoRegex.exec(html)) !== null && basicCount < 6) {
      let key = basicMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      let value = basicMatch[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\[\d+\]/g, '')
        .trim();
      
      // 过滤掉太长的值和无效值
      if (key && value && value.length < 150 && value.length > 3) {
        // 避免重复的关键信息
        const commonKeys = ['中文名', '外文名', '别名', '简称', '提出者', '提出时间', '应用学科', '适用领域'];
        if (commonKeys.some(k => key.includes(k)) || key.length < 10) {
          results.push(`🔑 **${key}**: ${value}`);
          basicCount++;
        }
      }
    }
    
    // === 5. 提取详细内容段落 ===
    // 先找到主要内容的开始
    const contentStart = html.indexOf('class="main-content"') || html.indexOf('class="content"') || 0;
    const contentEnd = html.indexOf('<div class="side-content"', contentStart) || 
                      html.indexOf('<div class="lemmaWgt-sideBar"', contentStart) || 
                      html.length;
    
    if (contentEnd - contentStart > 1000) {
      const contentSection = html.substring(contentStart, contentEnd);
      
      // 提取所有段落
      const paraRegex = /<div[^>]*class="para"[^>]*>([\s\S]*?)<\/div>/g;
      let paraMatch;
      let paraCount = 0;
      let extractedTexts = new Set(); // 用于去重
      
      while ((paraMatch = paraRegex.exec(contentSection)) !== null && paraCount < 8) {
        let para = paraMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&#[0-9]+;/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/\[\d+\]/g, '')
          .trim();
        
        // 清理和格式化
        if (para.length > 60 && para.length < 500) {
          // 检查是否和已有的内容重复
          const paraStart = para.substring(0, 50);
          if (!extractedTexts.has(paraStart) && !hasTooManySpecialChars(para)) {
            // 分段处理：如果段落太长，分割成句子
            if (para.length > 150) {
              const sentences = para.split(/[。！？；\.\!\?\;]/).filter(s => s.trim().length > 30);
              sentences.slice(0, 2).forEach(sentence => {
                const trimmed = sentence.trim();
                if (trimmed && !results.some(r => r.includes(trimmed.substring(0, 30)))) {
                  results.push(`📄 ${trimmed}。`);
                  paraCount++;
                }
              });
            } else {
              results.push(`📄 ${para}`);
              paraCount++;
            }
            extractedTexts.add(paraStart);
          }
        }
      }
    }
    
    // === 6. 提取目录结构（了解内容组织）===
    const catalogMatch = html.match(/<div[^>]*class="catalog"[^>]*>([\s\S]*?)<\/div>/);
    if (catalogMatch) {
      const catalogText = catalogMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // 提取主要章节
      const sections = catalogText.match(/\d+(?:\.\d+)*\s+[^0-9\s].{2,30}/g);
      if (sections && sections.length > 0) {
        results.push(`📚 **主要内容章节**:`);
        sections.slice(0, 5).forEach((section, i) => {
          if (i < 3) { // 只显示前3个主要章节
            results.push(`   ${section}`);
          }
        });
      }
    }
    
    // === 7. 提取关键特点/特性 ===
    // 查找列表项
    const listItemRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let listMatch;
    let listCount = 0;
    
    while ((listMatch = listItemRegex.exec(html)) !== null && listCount < 5) {
      let item = listMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (item.length > 20 && item.length < 200 && 
          !item.includes('function') && !item.includes('baidu') &&
          !results.some(r => r.includes(item.substring(0, 30)))) {
        results.push(`✓ ${item}`);
        listCount++;
      }
    }
    
    // === 8. 如果没有提取到足够内容，使用备用解析方法 ===
    if (results.length < 6) {
      console.log('⚠️ 内容较少，使用备用解析方法...');
      
      // 备用方法：直接提取所有文本，然后筛选关键句子
      const allText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#[0-9]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\[\d+\]/g, '');
      
      // 寻找包含关键词的句子
      const sentences = allText.split(/[。！？；\.\!\?\;]/);
      const keyword = query.length > 2 ? query.substring(0, 3) : query;
      let keywordSentences = [];
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > 40 && trimmed.length < 300) {
          if (trimmed.includes(keyword) || 
              trimmed.includes('是') || 
              trimmed.includes('包括') || 
              trimmed.includes('分为') ||
              trimmed.includes('主要')) {
            if (!keywordSentences.some(s => s.includes(trimmed.substring(0, 30)))) {
              keywordSentences.push(trimmed);
            }
          }
        }
      }
      
      // 添加关键句子
      keywordSentences.slice(0, 4).forEach(sentence => {
        if (!results.some(r => r.includes(sentence.substring(0, 30)))) {
          results.push(`💡 ${sentence}。`);
        }
      });
    }
    
    // === 9. 补充本地知识（如果在线内容不足）===
    if (results.length < 5) {
      const localKnowledge = getEnhancedLocalKnowledge(query);
      if (localKnowledge.length > 0) {
        results.push(`📚 **补充知识**:`);
        localKnowledge.slice(0, 3).forEach(item => {
          results.push(`   ${item}`);
        });
      }
    }
    
    // === 10. 添加结构化总结 ===
    if (results.length > 3) {
      results.push(`\n📊 **信息总结**:`);
      results.push(`   • 共提取 ${results.length - 1} 条关键信息`);
      results.push(`   • 包含定义、特点、应用等内容`);
    }
    
    // === 11. 添加访问链接 ===
    const encodedQuery = encodeURIComponent(query);
    results.push(`\n🔗 **完整内容**: https://baike.baidu.com/item/${encodedQuery}`);
    results.push(`📱 **移动端**: https://m.baike.baidu.com/item/${encodedQuery}`);
    
    console.log(`✅ 百度百科解析完成，提取 ${results.length} 条信息`);
    
    return {
      query: query,
      results: results.slice(0, limit + 8), // 多留一些空间
      count: results.length,
      success: true,
      source: '百度百科（增强解析）',
      baike_url: `https://baike.baidu.com/item/${encodedQuery}`,
      info_count: results.length
    };
    
  } catch (error) {
    console.error('百度百科查询失败:', error.message);
    throw error;
  }
}

// 文本处理工具
function textProcess(text, operation) {
  switch (operation) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'reverse':
      return text.split('').reverse().join('');
    case 'count':
      return {
        characters: text.length,
        words: text.split(/\s+/).filter(w => w).length,
        lines: text.split('\n').length
      };
    default:
      return { error: '不支持的操作' };
  }
}

// ===== ReAct / CoT & 自我修正支持工具 =====

// 简单的推理步骤日志（仅内存 + 控制台），用于 CoT / ReAct 风格
const reasoningLog = [];

function logReasoningStep(step, detail = '') {
  const entry = {
    time: new Date().toISOString(),
    step,
    detail
  };
  reasoningLog.push(entry);
  console.log('\n[ReAct] 推理步骤记录:', entry);
  return {
    success: true,
    entry,
    totalSteps: reasoningLog.length
  };
}

// 清空推理日志，避免对话变长后干扰
function clearReasoningLog() {
  const count = reasoningLog.length;
  reasoningLog.length = 0;
  console.log(`\n[ReAct] 已清空推理日志，清除条数: ${count}`);
  return {
    success: true,
    cleared: count
  };
}

// 错误记录与简单自我修正提示工具
function logErrorAndSuggestFix(errorMessage, context = '') {
  const lower = (errorMessage || '').toLowerCase();
  const suggestions = [];

  if (lower.includes('json')) {
    suggestions.push('检查 JSON 是否少逗号、少引号或多了尾逗号。');
  }
  if (lower.includes('timeout')) {
    suggestions.push('考虑减小请求数据量或增加超时时间，或检查网络/服务是否可用。');
  }
  if (lower.includes('not found') || lower.includes('enoent')) {
    suggestions.push('确认路径/资源名称是否正确，必要时打印当前工作目录或可用资源列表。');
  }
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('401') || lower.includes('403')) {
    suggestions.push('检查 API Key / 鉴权信息是否配置正确，或是否有对应权限。');
  }
  if (lower.includes('syntax') || lower.includes('unexpected')) {
    suggestions.push('检查最近修改的代码语法（括号、引号、分号等），可以尝试逐行缩小范围。');
  }

  // 默认泛化建议
  if (suggestions.length === 0) {
    suggestions.push('先精读错误信息，再根据关键字（如模块名、字段名）定位到最近的改动处进行检查。');
  }

  const result = {
    errorMessage,
    context,
    suggestions
  };

  console.log('\n[Self-Correct] 错误记录与建议:', result);
  return result;
}

// 工具定义（用于发送给 AI）
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '执行数学计算。可以计算基本的数学表达式，如加法、减法、乘法、除法等。',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '要计算的数学表达式，例如: "2 + 2", "10 * 5", "(3 + 4) * 2"'
          }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentTime',
      description: '获取当前日期和时间。',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['full', 'date', 'time'],
            description: '时间格式：full(完整日期时间), date(仅日期), time(仅时间)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchWeb',
      description: '在网络上搜索信息。当用户需要查找信息、新闻、资料等时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词或查询内容'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'textProcess',
      description: '对文本进行各种处理操作，如大小写转换、反转、统计等。',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '要处理的文本内容'
          },
          operation: {
            type: 'string',
            enum: ['uppercase', 'lowercase', 'reverse', 'count'],
            description: '操作类型：uppercase(转大写), lowercase(转小写), reverse(反转), count(统计)'
          }
        },
        required: ['text', 'operation']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'logReasoningStep',
      description: '记录当前的思考/推理步骤，用于 CoT / ReAct 风格的显式推理链，便于后续自我审查与调试。',
      parameters: {
        type: 'object',
        properties: {
          step: {
            type: 'string',
            description: '当前这一步推理的简要描述，例如“分析用户需求”、“决定是否调用工具”等。'
          },
          detail: {
            type: 'string',
            description: '可选的详细推理内容或中间结论，便于后续回顾与自我修正。'
          }
        },
        required: ['step']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clearReasoningLog',
      description: '清空当前会话中的推理步骤日志，通常在一个大任务完成或需要开始全新任务时调用。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'logErrorAndSuggestFix',
      description: '在遇到错误时记录错误信息，并根据常见模式给出简单的自我修正建议，辅助 Agent 决定下一步修复动作。',
      parameters: {
        type: 'object',
        properties: {
          errorMessage: {
            type: 'string',
            description: '遇到的错误信息原文（可以来自接口、终端、日志等）。'
          },
          context: {
            type: 'string',
            description: '可选的上下文描述，例如“调用某某接口时出错”、“解析某段 JSON 时出错”等。'
          }
        },
        required: ['errorMessage']
      }
    }
  }
];

// 工具执行器
async function executeTool(toolName, arguments_) {
  console.log(`\n=== 执行工具: ${toolName} ===`);
  console.log('参数:', arguments_);
  
  let result;
  
  try {
    switch (toolName) {
      case 'calculate':
        result = calculate(arguments_.expression);
        break;
      case 'getCurrentTime':
        result = getCurrentTime(arguments_.format);
        break;
      case 'searchWeb':
        result = await searchWeb(arguments_.query);
        break;
      case 'textProcess':
        result = textProcess(arguments_.text, arguments_.operation);
        break;
      case 'logReasoningStep':
        result = logReasoningStep(arguments_.step, arguments_.detail);
        break;
      case 'clearReasoningLog':
        result = clearReasoningLog();
        break;
      case 'logErrorAndSuggestFix':
        result = logErrorAndSuggestFix(arguments_.errorMessage, arguments_.context);
        break;
      default:
        result = { error: `未知的工具: ${toolName}` };
    }
    
    console.log('工具执行结果:', result);
    return result;
  } catch (error) {
    console.error('工具执行错误:', error);
    return { error: error.message };
  }
}

module.exports = {
  toolDefinitions,
  executeTool
};

