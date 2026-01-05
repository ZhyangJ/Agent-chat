const http = require('http');
const https = require('https');
const dotenv = require('dotenv');
const { toolDefinitions, executeTool } = require('./tools');

// 加载环境变量
dotenv.config();

const API_KEY = process.env.XUNFEI_API_KEY;
const PORT = process.env.PORT || 3000;

// 根据工具执行结果，构造要直接返回给前端的助手文案
function buildContentFromToolResults(toolResults) {
  if (!toolResults || toolResults.length === 0) return '';

  const first = toolResults[0];
  let parsed;

  try {
    parsed = JSON.parse(first.content);
  } catch {
    parsed = first.content;
  }

  const toolName = first.name || first.tool_name || '';

  switch (toolName) {
    case 'calculate':
      if (parsed && parsed.success) {
        return `计算表达式 ${parsed.expression} 的结果为：${parsed.result}`;
      }
      return `计算失败：${parsed && parsed.error ? parsed.error : parsed}`;

    case 'getCurrentTime':
      return `当前时间是：${parsed}`;

    case 'searchWeb':
      if (parsed && Array.isArray(parsed.results)) {
        console.log(`📊 搜索结果详情: count=${parsed.count}, results.length=${parsed.results.length}`);
        
        // 智能选择显示数量
        const MAX_DISPLAY = 10; // 最多显示10条
        const MIN_DISPLAY = 5;  // 最少显示5条
        
        let displayCount = Math.min(parsed.count, MAX_DISPLAY);
        if (parsed.count > MAX_DISPLAY) {
          // 如果结果很多，确保显示足够的信息
          displayCount = Math.max(MIN_DISPLAY, Math.min(MAX_DISPLAY, parsed.count / 2));
        }
        
        // 选择要显示的结果（避免全是链接）
        const displayedResults = [];
        let nonLinkCount = 0;
        
        for (const result of parsed.results) {
          if (displayedResults.length >= displayCount) break;
          
          // 优先显示非链接内容
          if (!result.includes('http://') && !result.includes('https://') && 
              !result.includes('完整内容') && !result.includes('移动端')) {
            displayedResults.push(result);
            nonLinkCount++;
          } else if (nonLinkCount >= 3) {
            // 至少显示了3条非链接内容后，才添加链接
            displayedResults.push(result);
          }
        }
        
        // 确保至少显示了一些内容
        if (displayedResults.length === 0 && parsed.results.length > 0) {
          displayedResults.push(...parsed.results.slice(0, Math.min(5, parsed.results.length)));
        }
        
        // 构建响应
        let response = `🔍 ${parsed.query}的搜索结果（共 ${parsed.count} 条）\n\n`;
        
        displayedResults.forEach((result, index) => {
          // 美化格式
          let formattedResult = result;
          
          // 移除多余的标记
          if (formattedResult.startsWith('📖')) {
            formattedResult = `${formattedResult.substring(2)}`;
          } else if (formattedResult.startsWith('🔑')) {
            formattedResult = formattedResult.substring(2);
          } else if (formattedResult.startsWith('📝')) {
            formattedResult = formattedResult.substring(2);
          } else if (formattedResult.startsWith('📄')) {
            formattedResult = formattedResult.substring(2);
          } else if (formattedResult.startsWith('✓')) {
            formattedResult = `• ${formattedResult.substring(2)}`;
          } else if (formattedResult.startsWith('💡')) {
            formattedResult = formattedResult.substring(2);
          }
          
          response += `${index + 1}. ${formattedResult}\n`;
        });
        
        // 添加更多信息
        if (parsed.count > displayedResults.length) {
          response += `\n... 还有 ${parsed.count - displayedResults.length} 条结果未显示`;
        }
        
        if (parsed.source) {
          response += `\n\n📚 信息来源: ${parsed.source}`;
        }
        
        if (parsed.baike_url) {
          response += `\n🔗 查看完整百科: ${parsed.baike_url}`;
        }
        
        if (parsed.success === false && parsed.error) {
          response += `\n\n⚠️ 注意: ${parsed.error}`;
          if (parsed.suggestion) {
            response += `\n💡 建议: ${parsed.suggestion}`;
          }
        }
        
        return response;
      }

    case 'textProcess':
      return `文本处理结果：${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`;

    default:
      return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
  }
}

// 智能分析内容，检测是否需要调用工具（备用方案）
// 只在第一次迭代时调用，避免重复检测
function analyzeContentForTools(content, messages) {
  const toolCalls = [];
  
  // 只分析最新的用户消息，避免分析整个对话历史
  const userMessages = messages.filter(m => m.role === 'user');
  const lastUserMessage = userMessages[userMessages.length - 1];
  const userContent = lastUserMessage?.content || '';
  
  // 始终分析最新的用户消息，不跳过
  console.log('分析用户消息:', userContent.substring(0, 100));
  
  // 检测计算需求 - 改进的匹配模式
  // 支持多种表达方式：计算、算、加上、减去、乘以、除以、是多少、等于多少等
  const calcKeywords = /计算|算|求|等于|结果|帮我算|帮我计算|加上|减去|乘以|除以|加|减|乘|除|是多少|等于多少/gi;
  const hasCalcKeyword = calcKeywords.test(userContent);
  
  // 匹配数学表达式：数字、运算符、括号的组合
  // 例如：123 * 456 + 789, (3 + 4) * 2, 10 / 5 等
  const mathExprPattern = /([\d\s]+[\+\-\*\/][\d\s\+\-\*\/\(\)]+)/;
  const mathExprMatch = userContent.match(mathExprPattern);
  
  // 检测中文数学表达：加上、减去、乘以、除以
  const chineseMathPattern = /(\d+)\s*(加上|减去|乘以|除以|加|减|乘|除)\s*(\d+)/gi;
  const chineseMathMatch = userContent.match(chineseMathPattern);
  
  // 检测"再加上X"、"再减去X"等表达（需要从上下文获取之前的计算结果）
  const contextCalcPattern = /(再|然后|接着)?\s*(加上|减去|乘以|除以|加|减|乘|除)\s*(\d+)\s*(是多少|等于多少|等于|结果)/gi;
  const contextCalcMatch = userContent.match(contextCalcPattern);
  
  if (hasCalcKeyword || mathExprMatch || chineseMathMatch || contextCalcMatch) {
    let expression = '';
    
    // 优先处理标准数学表达式
    if (mathExprMatch) {
      expression = mathExprMatch[1].trim().replace(/\s+/g, '');
    }
    // 处理中文数学表达
    else if (chineseMathMatch) {
      const match = chineseMathMatch[0];
      expression = match
        .replace(/加上|加/gi, '+')
        .replace(/减去|减/gi, '-')
        .replace(/乘以|乘/gi, '*')
        .replace(/除以|除/gi, '/')
        .replace(/\s+/g, '');
    }
    // 处理上下文计算（"再加上200是多少"）
    else if (contextCalcMatch) {
      let previousResult = null;
      
      // 从对话历史中查找最近的计算结果
      const toolMessages = messages.filter(m => m.role === 'tool' && m.name === 'calculate');
      if (toolMessages.length > 0) {
        try {
          const lastResult = JSON.parse(toolMessages[toolMessages.length - 1].content);
          if (lastResult.success && typeof lastResult.result === 'number') {
            previousResult = lastResult.result;
          }
        } catch (e) {
          console.warn('解析上下文计算结果失败:', e);
        }
      }
      
      // 如果找不到工具结果，尝试从助手消息中提取数字（可能是之前的计算结果）
      if (previousResult === null) {
        const assistantMessages = messages.filter(m => m.role === 'assistant');
        for (let i = assistantMessages.length - 1; i >= 0; i--) {
          const content = assistantMessages[i].content || '';
          // 尝试提取数字（可能是计算结果）
          const numberMatch = content.match(/(?:结果|等于|是)\s*(\d+(?:\.\d+)?)/);
          if (numberMatch) {
            previousResult = parseFloat(numberMatch[1]);
            console.log('从助手消息中提取到数字:', previousResult);
            break;
          }
        }
      }
      
      const match = contextCalcMatch[0];
      const number = match.match(/\d+/);
      const operation = match.match(/(加上|减去|乘以|除以|加|减|乘|除)/i);
      
      if (number && operation) {
        const op = operation[0];
        const num = number[0];
        let opSymbol = '';
        
        if (/加上|加/i.test(op)) opSymbol = '+';
        else if (/减去|减/i.test(op)) opSymbol = '-';
        else if (/乘以|乘/i.test(op)) opSymbol = '*';
        else if (/除以|除/i.test(op)) opSymbol = '/';
        
        if (opSymbol) {
          if (previousResult !== null) {
            expression = `${previousResult}${opSymbol}${num}`;
            console.log(`从上下文提取计算: ${previousResult} ${opSymbol} ${num}`);
          } else {
            // 如果没有上下文，提示用户需要先有计算结果
            console.log('⚠️ 检测到上下文计算但找不到之前的计算结果');
            // 仍然尝试提取数字，可能需要用户提供更多信息
            const allNumbers = userContent.match(/\d+/g);
            if (allNumbers && allNumbers.length > 0) {
              // 如果只有一个数字，可能需要用户提供基础值
              // 但为了不阻塞，我们可以假设用户想要一个简单的计算
              expression = `0${opSymbol}${num}`; // 默认从0开始
              console.log(`使用默认值0进行计算: 0${opSymbol}${num}`);
            }
          }
        }
      }
    }
    // 如果有关键词但没有匹配到表达式，尝试提取所有数字和运算符
    else if (hasCalcKeyword) {
      const numbersAndOps = userContent.match(/[\d\+\-\*\/\(\)\s]+/g);
      if (numbersAndOps && numbersAndOps.length > 0) {
        expression = numbersAndOps.join('').replace(/\s+/g, '').trim();
      }
      // 如果还是没有，尝试提取所有数字
      if (!expression || !/[\+\-\*\/]/.test(expression)) {
        const numbers = userContent.match(/\d+/g);
        if (numbers && numbers.length >= 2) {
          // 默认使用加法
          expression = numbers.join('+');
        }
      }
    }
    
    // 需要同时包含运算符和至少一个数字，避免把单独的 "-"、"+" 等误判为表达式
    if (expression && /[\+\-\*\/]/.test(expression) && /\d/.test(expression)) {
      // 验证表达式是否包含至少一个运算符
      toolCalls.push({
        id: `calc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        index: 0,
        function: {
          name: 'calculate',
          arguments: JSON.stringify({ expression: expression })
        }
      });
      console.log('✅ 检测到计算需求，表达式:', expression);
      return toolCalls; // 如果检测到计算，直接返回，优先处理
    } else if (expression) {
      console.log('⚠️ 提取到表达式但缺少运算符:', expression);
    }
  }
  
  // 检测时间需求（去掉单独的“现在”，避免普通句子如“现在请你...”被误判）
  if (/时间|现在几点|日期|今天|当前时间/gi.test(userContent)) {
    toolCalls.push({
      id: `time_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'function',
      index: toolCalls.length,
      function: {
        name: 'getCurrentTime',
        arguments: JSON.stringify({ format: 'full' })
      }
    });
    console.log('✅ 检测到时间查询需求');
  }
  
  // 检测搜索需求
  if (/搜索|查找|找|查询|搜索一下|帮我搜/gi.test(userContent)) {
    const searchQuery = userContent
      .replace(/搜索|查找|找|查询|搜索一下|帮我搜/gi, '')
      .replace(/关于|的|信息/gi, '')
      .trim();
    if (searchQuery && searchQuery.length > 1) {
      toolCalls.push({
        id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'function',
        index: toolCalls.length,
        function: {
          name: 'searchWeb',
          arguments: JSON.stringify({ query: searchQuery })
        }
      });
      console.log('✅ 检测到搜索需求，关键词:', searchQuery);
    }
  }
  
  return toolCalls;
}

// 创建与简化版服务器完全相同的HTTP服务器
const server = http.createServer((req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }
  
  // 只处理POST请求到/api/chat
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    
    // 接收请求体
    req.on('data', (chunk) => {
      body += chunk;
    });
    
    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);
        const { messages } = requestData;
        
        console.log('=== 收到请求 ===');
        console.log('消息:', messages);
        
        // 所有请求都使用流式处理（支持 Agent 模式）
        handleAgentRequest(messages, res);
      } catch (error) {
        console.error('解析请求体错误:', error);
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: '请求格式错误' }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    // 健康检查端点
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', message: 'AI Chat API is running' }));
  } else {
    res.statusCode = 404;
    res.end();
  }
});

// Agent 请求处理（支持工具调用）
async function handleAgentRequest(messages, res) {
  // 设置SSE响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  let conversationMessages = [...messages];
  let maxIterations = 10; // 防止无限循环
  let iteration = 0;
  let lastUserMessageIndex = messages.filter(m => m.role === 'user').length - 1; // 记录最后一条用户消息的索引

  // 在对话最前面添加系统指令，约束模型回答风格，避免重复讲解和输出 HTML 源码
  const hasSystemMessage = conversationMessages.some(m => m.role === 'system');
  if (!hasSystemMessage) {
    conversationMessages.unshift({
      role: 'system',
      content: [
        '你是一个工具增强的助理，具备 ReAct（推理 + 行动）和简单自我修正能力。',
        '当用户请求计算或查询信息时：',
        '1）如果已经有明确的工具结果（例如 calculate 的 result），优先直接使用该结果回答，不要重复推导或再次计算相同表达式。',
        '2）不要重复整段解释两次。',
        '3）禁止输出 HTML 源码或转义形式（例如 &lt;p&gt;、&lt;br&gt; 等），统一使用纯文本或 Markdown。',
        '4）如果没有必要，不要重复之前已经说过的内容。',
        '',
        '【推理 / ReAct 相关要求】',
        '5）在处理复杂任务时，请在内部进行分步思考；如有必要，可以调用 logReasoningStep 工具，记录关键推理步骤和中间结论（step 用一句话概括，detail 可写更详细原因）。',
        '6）当一个大任务完成或用户显式切换到全新话题时，可以调用 clearReasoningLog 清空旧的推理记录，避免后续被旧上下文干扰。',
        '',
        '【错误处理与自我修正】',
        '7）当你在调用接口、运行代码或使用其他工具时遇到错误，请调用 logErrorAndSuggestFix：',
        '   - 将完整错误信息传入 errorMessage；',
        '   - 将当前正在做的事情简要写入 context（例如“调用某某工具时出错”、“解析某段 JSON 时出错”）；',
        '   - 阅读返回的 suggestions，根据其中的提示调整你的计划和下一步操作。',
        '8）如果连续两次尝试都仍然失败，请停止盲目重试，向用户清晰说明你已尝试的步骤、看到的错误以及后续可行的人工排查思路。'
      ].join('\n')
    });
    // 系统消息插入后，用户消息索引整体向后移动 1，需要同步更新
    lastUserMessageIndex += 1;
  }
  
  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n=== Agent 迭代 ${iteration} ===`);
    
    // 检查是否有新的用户消息（避免在AI回复中无限循环）
    const currentUserMessageCount = conversationMessages.filter(m => m.role === 'user').length;
    if (currentUserMessageCount <= lastUserMessageIndex && iteration > 1) {
      // 没有新的用户消息，说明是在处理AI回复，不应该继续循环
      console.log('\n=== 没有新的用户消息，结束 Agent 循环 ===');
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    
    // 创建请求体（包含工具定义）
    // 尝试多种格式以兼容不同的 API
    const requestBody = {
      model: 'xop3qwen1b7',
      messages: conversationMessages,
      tools: toolDefinitions,  // OpenAI 格式
      // functions: toolDefinitions.map(t => t.function),  // 备用格式
      tool_choice: 'auto', // 让模型自动决定是否使用工具
      max_tokens: 4000,
      temperature: 0.7,
      stream: true
    };
    
    // 调试：打印完整的请求体（包括工具定义）
    console.log('\n=== 发送请求到 MaaS API ===');
    console.log('模型:', requestBody.model);
    console.log(`工具定义数量: ${toolDefinitions.length}`);
    console.log('工具列表:', toolDefinitions.map(t => t.function?.name || 'unknown').join(', '));
    console.log('工具选择模式:', requestBody.tool_choice);
    console.log('消息数量:', conversationMessages.length);
    // 打印工具定义的简化版本（避免输出过长）
    console.log('工具定义:', JSON.stringify(toolDefinitions.map(t => ({
      type: t.type,
      name: t.function?.name,
      description: t.function?.description?.substring(0, 50) + '...'
    })), null, 2));
    
    // 创建请求选项
    const options = {
      hostname: 'maas-api.cn-huabei-1.xf-yun.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'User-Agent': 'Node.js-Client',
        'Accept': '*/*'
      }
    };
    
    // 发送请求并处理响应
    const toolCalls = await new Promise((resolve, reject) => {
      const maasReq = https.request(options, (maasRes) => {
        console.log('\n=== MaaS API 响应 ===');
        console.log('状态码:', maasRes.statusCode);
        
        if (maasRes.statusCode !== 200) {
          let errorBody = '';
          maasRes.on('data', (chunk) => { errorBody += chunk; });
          maasRes.on('end', () => {
            reject(new Error(`API错误: ${maasRes.statusCode} - ${errorBody}`));
          });
          return;
        }
        
        let buffer = '';
        let fullContent = '';
        const llmChunks = [];           // 缓存 LLM 的原始流式片段，按需一次性返回给前端
        const toolCallsMap = new Map(); // 使用 Map 来存储工具调用
        let streamEnded = false;
        
        maasRes.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // 保留不完整的行
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                streamEnded = true;
                continue;
              }
              
              try {
                const json = JSON.parse(data);
                
                // 检查是否有错误
                if (json.error) {
                  console.error('\n=== API 返回错误 ===');
                  console.error('错误代码:', json.error.code);
                  console.error('错误信息:', json.error.message);
                  
                  // 发送错误给客户端
                  res.write(`data: ${JSON.stringify({
                    error: {
                      code: json.error.code,
                      message: json.error.message || 'API 请求失败'
                    }
                  })}\n\n`);
                  
                  // 结束流并拒绝 Promise
                  res.write('data: [DONE]\n\n');
                  reject(new Error(`API错误: ${json.error.code} - ${json.error.message}`));
                  return;
                }
                
                // 调试：打印完整的 JSON 响应（仅前几次）
                if (iteration === 1 && toolCallsMap.size === 0) {
                  console.log('收到数据块:', JSON.stringify(json, null, 2));
                }

                // 缓存原始 LLM 片段，暂不直接发送给前端
                llmChunks.push(json);

                // 收集内容（用于本地智能分析 / 进一步处理）
                if (json.choices && json.choices[0]) {
                  const choice = json.choices[0];
                  const delta = choice.delta;
                  
                  // 调试：打印 delta 内容（仅前几次）
                  if (delta && Object.keys(delta).length > 0 && toolCallsMap.size === 0) {
                    console.log('Delta 内容:', JSON.stringify(delta, null, 2));
                  }
                  
                  // 检查 finish_reason
                  if (choice.finish_reason) {
                    console.log('Finish reason:', choice.finish_reason);
                    if (choice.finish_reason === 'tool_calls') {
                      console.log('检测到 finish_reason 为 tool_calls');
                    }
                  }
                  
                  if (delta?.content) {
                    fullContent += delta.content;
                  }
                  
                  // 检查工具调用 - 支持多种可能的格式
                  if (delta?.tool_calls) {
                    console.log('检测到工具调用 delta:', JSON.stringify(delta.tool_calls, null, 2));
                    for (const toolCall of delta.tool_calls) {
                      const index = toolCall.index ?? 0;
                      const key = `${index}_${toolCall.id || 'unknown'}`;
                      
                      if (!toolCallsMap.has(key)) {
                        toolCallsMap.set(key, {
                          id: toolCall.id,
                          type: toolCall.type || 'function',
                          index: index,
                          function: {
                            name: '',
                            arguments: ''
                          }
                        });
                        console.log(`创建新的工具调用: ${key}, id: ${toolCall.id}`);
                      }
                      
                      const existingCall = toolCallsMap.get(key);
                      if (toolCall.function?.name) {
                        existingCall.function.name = toolCall.function.name;
                        console.log(`工具名称: ${toolCall.function.name}`);
                      }
                      if (toolCall.function?.arguments) {
                        existingCall.function.arguments += toolCall.function.arguments;
                        console.log(`工具参数片段: ${toolCall.function.arguments}`);
                      }
                    }
                  }
                  
                  // 也检查 choices[0] 中是否有 tool_calls（非流式格式）
                  if (choice.message?.tool_calls) {
                    console.log('检测到消息中的工具调用:', JSON.stringify(choice.message.tool_calls, null, 2));
                    for (const toolCall of choice.message.tool_calls) {
                      const index = toolCall.index ?? 0;
                      const key = `${index}_${toolCall.id || 'unknown'}`;
                      
                      if (!toolCallsMap.has(key)) {
                        toolCallsMap.set(key, {
                          id: toolCall.id,
                          type: toolCall.type || 'function',
                          index: index,
                          function: {
                            name: toolCall.function?.name || '',
                            arguments: toolCall.function?.arguments || ''
                          }
                        });
                        console.log(`从消息中创建工具调用: ${key}`);
                      }
                    }
                  }
                }
              } catch (e) {
                // 忽略解析错误
                console.warn('解析JSON错误:', e.message, '原始数据:', data.substring(0, 100));
              }
            }
          }
        });
        
        maasRes.on('end', () => {
          // 转换 Map 为数组并按 index 排序
          const toolCallsArray = Array.from(toolCallsMap.values())
            .sort((a, b) => a.index - b.index);
          
          console.log(`\n=== 流式响应结束 ===`);
          console.log(`收集到的内容长度: ${fullContent.length}`);
          console.log(`检测到的工具调用数量: ${toolCallsArray.length}`);

          if (toolCallsArray.length > 0) {
            console.log('工具调用详情:', JSON.stringify(toolCallsArray, null, 2));
          } else {
            // 如果没有检测到工具调用，尝试从内容中分析是否需要调用工具
            // 只在本次请求的第一次迭代做一次智能分析，避免在同一条用户消息上重复触发工具
            if (iteration === 1) {
              console.log(`\n=== 尝试从内容中分析是否需要工具调用（迭代 ${iteration}）===`);
              const detectedTools = analyzeContentForTools(fullContent, conversationMessages);
              if (detectedTools.length > 0) {
                console.log('✅ 检测到可能需要调用工具:', detectedTools);
                // 将检测到的工具调用添加到数组中
                toolCallsArray.push(...detectedTools);
              } else {
                console.log('ℹ️ 未检测到需要调用工具');
              }
            } else {
              // 非首次迭代，只让模型基于已有对话继续回答，不再本地智能分析
              console.log(`\n=== 跳过智能分析（非首次迭代，迭代 ${iteration}）===`);
            }
          }
          
          // 如果有工具调用，返回工具调用信息（不发送 LLM 内容，因为后续会由工具结果直出）
          if (toolCallsArray.length > 0) {
            console.log('\n=== 准备执行工具调用 ===');
            resolve({ toolCalls: toolCallsArray, content: fullContent });
          } else {
            // 没有工具调用：将之前缓存的 LLM 片段一次性回放给前端
            console.log('\n=== 无工具调用，对话结束，回放 LLM 原始输出 ===');
            for (const chunk of llmChunks) {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            if (!streamEnded) {
              res.write('data: [DONE]\n\n');
            }
            resolve(null);
          }
        });
        
        maasRes.on('error', (error) => {
          reject(error);
        });
      });
      
      maasReq.on('error', (error) => {
        console.error('\n=== 请求错误 ===');
        console.error('错误:', error);
        reject(error);
      });
      
      maasReq.on('timeout', () => {
        console.error('\n=== 请求超时 ===');
        maasReq.destroy();
        reject(new Error('请求超时'));
      });
      
      // 发送请求体
      maasReq.write(JSON.stringify(requestBody));
      maasReq.end();
    });
    
    // 处理错误情况
    if (!toolCalls) {
      console.log('\n=== Agent 对话结束（无工具调用）===');
      res.end();
      return;
    }
    
    // 如果没有工具调用，对话结束
    if (!toolCalls.toolCalls || toolCalls.toolCalls.length === 0) {
      console.log('\n=== Agent 对话结束 ===');
      res.end();
      return;
    }
    
    // 执行工具调用
    console.log('\n=== 检测到工具调用 ===');
    console.log('工具调用详情:', JSON.stringify(toolCalls.toolCalls, null, 2));
    const toolResults = [];
    
    // 去重：使用 Map 按 ID 去重，避免重复执行相同的工具调用
    const uniqueToolCalls = new Map();
    for (const toolCall of toolCalls.toolCalls) {
      if (!uniqueToolCalls.has(toolCall.id)) {
        uniqueToolCalls.set(toolCall.id, toolCall);
      } else {
        console.log(`⚠️ 发现重复的工具调用 ID: ${toolCall.id}，已跳过`);
      }
    }
    
    console.log(`去重后工具调用数量: ${uniqueToolCalls.size} (原始: ${toolCalls.toolCalls.length})`);
    
    for (const toolCall of uniqueToolCalls.values()) {
      try {
        const functionName = toolCall.function.name;
        let functionArgs;
        
        // 尝试解析参数
        try {
          if (typeof toolCall.function.arguments === 'string') {
            functionArgs = JSON.parse(toolCall.function.arguments);
          } else if (typeof toolCall.function.arguments === 'object') {
            functionArgs = toolCall.function.arguments;
          } else {
            throw new Error('工具参数格式不正确');
          }
        } catch (parseError) {
          console.error('解析工具参数失败:', parseError);
          console.error('原始参数:', toolCall.function.arguments);
          throw new Error(`参数解析失败: ${parseError.message}`);
        }
        
        console.log(`执行工具: ${functionName}`);
        console.log('工具参数:', JSON.stringify(functionArgs, null, 2));
        
        // 执行工具
        const toolResult = await executeTool(functionName, functionArgs);
        
        console.log('工具执行结果:', JSON.stringify(toolResult, null, 2));
        
        // 仅在后台记录工具调用日志
        console.log(`工具 ${functionName} 执行完成`);
        
        // 添加工具结果到对话历史
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: functionName,
          content: JSON.stringify(toolResult)
        });
      } catch (error) {
        console.error('工具执行错误:', error);
        console.error('错误堆栈:', error.stack);
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function?.name || 'unknown',
          content: JSON.stringify({ error: error.message })
        });
      }
    }
    
    // 直接用工具结果构造助手回复，并返回给前端（不再进入下一轮 LLM 调用）
    const assistantContent = buildContentFromToolResults(toolResults);
    console.log('\n=== 使用工具结果直接构造助手回复 ===');
    console.log('助手回复内容:', assistantContent);

    // 构造一个与 MaaS 流式格式兼容的单次回复 chunk
    const toolResponseChunk = {
      id: 'tool_response',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: requestBody.model,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: assistantContent
          },
          finish_reason: 'stop'
        }
      ]
    };

    // 发送给前端
    res.write(`data: ${JSON.stringify(toolResponseChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    console.log('\n=== Agent 对话结束（工具直出模式）===');
    return;
  }
}

// 启动服务器
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
