/**
 * =================================================================================
 * 项目: Typli API Ultimate - Enhanced Image Generation
 * 版本: 5.2.1-bugfix
 * 作者: kinai9661
 * 更新: 修复风格预设生图问题
 * =================================================================================
 */

const CONFIG = {
  PROJECT_NAME: "Typli API 终极版",
  VERSION: "5.2.1",
  API_MASTER_KEY: "1",
  UPSTREAM_CHAT_URL: "https://typli.ai/api/generators/chat",
  UPSTREAM_IMAGE_URL: "https://typli.ai/api/generators/images",
  REFERER_CHAT_URL: "https://typli.ai/free-no-sign-up-chatgpt",
  REFERER_IMAGE_URL: "https://typli.ai/ai-image-generator",
  CHAT_MODELS: [
    "xai/grok-4-fast",
    "xai/grok-4-fast-reasoning",
    "anthropic/claude-haiku-4-5",
    "openai/gpt-5",
    "openai/gpt-5-mini",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "google/gemini-2.5-flash",
    "deepseek/deepseek-reasoner",
    "deepseek/deepseek-chat"
  ],
  IMAGE_MODELS: [
    "fal-ai/flux-2",
    "fal-ai/flux-2-pro",
    "fal-ai/nano-banana",
    "fal-ai/nano-banana-pro",
    "fal-ai/stable-diffusion-v35-large"
  ],
  BASE_HEADERS: {
    "accept": "*/*",
    "content-type": "application/json",
    "origin": "https://typli.ai",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin"
  }
};

export default {
  async fetch(request, env, ctx) {
    const apiKey = env.API_MASTER_KEY || CONFIG.API_MASTER_KEY;
    request.ctx = { apiKey };
    const url = new URL(request.url);
    
    if (request.method === 'OPTIONS') {
      return new Response(null, {status: 204, headers: corsHeaders()});
    }
    
    if (url.pathname === '/') {
      return handleUI(request);
    }
    
    if (url.pathname.startsWith('/v1/')) {
      return handleApi(request);
    }
    
    return jsonError('未找到', 404);
  }
};

async function handleApi(request) {
  const auth = request.headers.get('Authorization');
  const key = request.ctx.apiKey;
  
  if (key !== "1" && auth !== `Bearer ${key}`) {
    return jsonError('未授权', 401);
  }
  
  const url = new URL(request.url);
  const path = url.pathname;
  
  if (path === '/v1/models') {
    const models = [...CONFIG.CHAT_MODELS, ...CONFIG.IMAGE_MODELS].map(id => ({
      id, object: 'model', created: Date.now(), owned_by: 'typli'
    }));
    return new Response(JSON.stringify({object: 'list', data: models}), {
      headers: corsHeaders({'Content-Type': 'application/json'})
    });
  }
  
  if (path === '/v1/chat/completions' || path === '/v1/images/generations') {
    return handleChatCompletions(request);
  }
  
  return jsonError('未找到', 404);
}

async function handleChatCompletions(request) {
  try {
    const body = await request.json();
    const model = body.model || CONFIG.CHAT_MODELS[0];
    const isImage = CONFIG.IMAGE_MODELS.includes(model);
    let prompt = body.prompt || body.messages?.filter(m => m.role === 'user').pop()?.content;
    
    if (!prompt) return jsonError('未找到提示词', 400);
    
    const {readable, writable} = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const requestId = crypto.randomUUID();
    
    (async () => {
      try {
        if (isImage) {
          const res = await fetch(CONFIG.UPSTREAM_IMAGE_URL, {
            method: 'POST',
            headers: {...CONFIG.BASE_HEADERS, referer: CONFIG.REFERER_IMAGE_URL},
            body: JSON.stringify({prompt, model})
          });
          const result = await res.json();
          if (result.url) {
            const chunk = makeChunk(requestId, model, `![${prompt}](${result.url})`);
            await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
        } else {
          const sessionId = randomId(16);
          const messages = (body.messages || []).map(m => ({
            parts: [{type: 'text', text: m.content}], id: randomId(16), role: m.role
          }));
          
          const res = await fetch(CONFIG.UPSTREAM_CHAT_URL, {
            method: 'POST',
            headers: {...CONFIG.BASE_HEADERS, referer: CONFIG.REFERER_CHAT_URL},
            body: JSON.stringify({
              slug: 'free-no-sign-up-chatgpt',
              modelId: model,
              id: sessionId,
              messages,
              trigger: 'submit-message'
            })
          });
          
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          
          while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, {stream: true});
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'text-delta' && parsed.delta) {
                    const chunk = makeChunk(requestId, model, parsed.delta);
                    await writer.write(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                  }
                } catch (e) {}
              }
            }
          }
        }
        
        await writer.write(encoder.encode(`data: ${JSON.stringify(makeChunk(requestId, model, null, 'stop'))}\n\n`));
        await writer.write(encoder.encode('data: [DONE]\n\n'));
      } catch (e) {
        await writer.write(encoder.encode(`data: ${JSON.stringify(makeChunk(requestId, model, `[错误: ${e.message}]`, 'stop'))}\n\n`));
      } finally {
        await writer.close();
      }
    })();
    
    return new Response(readable, {
      headers: corsHeaders({'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache'})
    });
  } catch (e) {
    return jsonError(e.message, 500);
  }
}

function handleUI(request) {
  const origin = new URL(request.url).origin;
  const key = request.ctx.apiKey;
  
  const html = `