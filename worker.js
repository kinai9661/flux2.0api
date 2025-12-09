/**
 * =================================================================================
 * 项目: Typli API Ultimate - Enhanced Image Generation
 * 版本: 5.1.0-enhanced-image
 * 作者: kinai9661
 * 新增: 图像尺寸 + 高级参数 + 风格预设 + 批量生成 + 成人内容 + 历史记录
 * =================================================================================
 */

const CONFIG = {
  PROJECT_NAME: "Typli API 终极版",
  VERSION: "5.1.0",
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
  
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${CONFIG.PROJECT_NAME}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/11.1.1/marked.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
--chat:#667eea;--image:#f5576c;--api:#10b981;
--bg:#0f172a;--surface:#1e293b;--card:#334155;
--text:#f1f5f9;--text2:#94a3b8;--border:rgba(255,255,255,.1);
--success:#10b981;--warning:#f59e0b;--error:#ef4444;
--font-base:15px;--font-sm:13px;--font-xs:12px;--font-xxs:11px;
--font-lg:16px;--font-xl:18px;--font-2xl:22px;--font-3xl:28px;
--center-width:800px;
}
[data-theme=light]{--bg:#fff;--surface:#f8fafc;--card:#e2e8f0;--text:#1e293b;--text2:#64748b;--border:rgba(0,0,0,.1)}
body{
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei','微软雅黑',sans-serif;
background:var(--bg);color:var(--text);height:100vh;
display:flex;flex-direction:column;overflow:hidden;
transition:all .3s;font-size:var(--font-base);
}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:60px;box-shadow:0 2px 8px rgba(0,0,0,.1);flex-shrink:0}
.logo{font-size:var(--font-xl);font-weight:800;background:linear-gradient(135deg,var(--chat),var(--image));-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:flex;align-items:center;gap:8px}
.tabs{display:flex;gap:8px}
.tab{padding:8px 18px;border:none;background:transparent;color:var(--text2);font-weight:600;border-radius:8px;cursor:pointer;transition:all .3s;font-size:var(--font-sm)}
.tab.active{background:linear-gradient(135deg,var(--chat),var(--image));color:#fff;box-shadow:0 4px 12px rgba(102,126,234,.4)}
.tab:not(.active):hover{background:rgba(102,126,234,.1)}
.controls{display:flex;gap:12px;align-items:center}
.btn-icon{width:36px;height:36px;border:none;border-radius:8px;background:rgba(255,255,255,.05);color:var(--text);cursor:pointer;font-size:var(--font-base);transition:all .2s}
.btn-icon:hover{background:rgba(255,255,255,.1);transform:scale(1.1)}
.container{flex:1;display:flex;overflow:hidden;position:relative;min-height:0}
.panel{width:100%;height:100%;position:absolute;top:0;left:0;display:none;opacity:0;transition:opacity .3s}
.panel.active{display:flex;opacity:1}
.chat-panel{display:flex;height:100%;overflow:hidden}
.left-sidebar{background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;min-width:280px;max-width:400px;flex:1}
.chat-main{display:flex;flex-direction:column;background:var(--bg);overflow:hidden;width:var(--center-width);flex-shrink:0}
.right-sidebar{background:var(--surface);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;min-width:280px;max-width:400px;flex:1}
.sidebar-header{padding:16px;border-bottom:1px solid var(--border);flex-shrink:0}
.sidebar-title{font-size:var(--font-sm);font-weight:700;color:var(--text);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.new-chat-btn{width:100%;padding:12px;background:var(--chat);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;font-size:var(--font-sm)}
.new-chat-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(102,126,234,.4)}
.sidebar-content{flex:1;overflow-y:auto;padding:12px;min-height:0}
.info-card{background:linear-gradient(135deg,rgba(102,126,234,.1),rgba(245,87,108,.1));padding:14px;border-radius:10px;margin-bottom:14px;border:1px solid var(--border)}
.info-card-header{font-size:var(--font-xs);font-weight:700;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px}
.info-card-text{font-size:var(--font-xxs);color:var(--text2);line-height:1.6;margin-bottom:6px}
.info-badge{background:var(--card);color:var(--text);padding:3px 7px;border-radius:5px;font-size:10px;font-weight:600;display:inline-block;margin:2px}
.history-list{margin-top:10px}
.history-item{background:var(--card);padding:11px;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all .2s;border:1px solid var(--border)}
.history-item:hover{background:var(--surface);border-color:var(--chat);transform:translateX(4px)}
.history-item.active{border-color:var(--chat);background:var(--surface);box-shadow:0 0 0 2px rgba(102,126,234,.2)}
.history-title{font-size:var(--font-xs);font-weight:600;color:var(--text);margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4}
.history-meta{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--text2);margin-top:6px}
.history-count{background:var(--chat);color:#fff;padding:2px 7px;border-radius:10px;font-weight:700;font-size:10px}
.chat-messages{flex:1;padding:20px;overflow-y:auto;scroll-behavior:smooth;min-height:0}
.chat-input-box{padding:18px 20px;background:var(--surface);border-top:1px solid var(--border);flex-shrink:0}
.input-wrapper{background:var(--card);border:2px solid var(--border);border-radius:10px;padding:10px;transition:all .3s}
.input-wrapper:focus-within{border-color:var(--chat);box-shadow:0 0 0 3px rgba(102,126,234,.1)}
.chat-input{width:100%;background:transparent;border:none;color:var(--text);font:inherit;resize:none;min-height:70px;max-height:180px;line-height:1.6;font-size:var(--font-sm)}
.chat-input:focus{outline:none}
.input-footer{display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:10px}
.input-tools{display:flex;gap:6px}
.tool-btn{width:30px;height:30px;border:1px solid var(--border);background:transparent;color:var(--text2);border-radius:6px;cursor:pointer;font-size:var(--font-xs);transition:all .2s;display:flex;align-items:center;justify-content:center}
.tool-btn:hover{background:var(--card);color:var(--text)}
.tool-btn.active{background:var(--chat);color:#fff;border-color:var(--chat)}
.input-status{font-size:var(--font-xxs);color:var(--text2);display:flex;align-items:center;gap:6px}
.status-dot{width:7px;height:7px;border-radius:50%;background:var(--success);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.send-btn{padding:9px 20px;background:linear-gradient(135deg,var(--chat),#764ba2);border:none;border-radius:8px;color:#fff;font-weight:700;cursor:pointer;transition:all .3s;display:flex;align-items:center;gap:6px;font-size:var(--font-xs)}
.send-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 6px 20px rgba(102,126,234,.4)}
.send-btn:disabled{opacity:.5;cursor:not-allowed}
.message{display:flex;gap:10px;margin-bottom:18px;animation:slideIn .4s;position:relative}
@keyframes slideIn{from{opacity:0;transform:translateY(20px)}}
.message.user{flex-direction:row-reverse}
.avatar{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:var(--font-lg);flex-shrink:0;box-shadow:0 4px 12px rgba(0,0,0,.3)}
.message.user .avatar{background:linear-gradient(135deg,var(--chat),#764ba2)}
.message.ai .avatar{background:linear-gradient(135deg,#f093fb,var(--image))}
.message-wrapper{flex:1;max-width:88%;min-width:0}
.message-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;opacity:0;transition:opacity .3s}
.message:hover .message-header{opacity:1}
.message-role{font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;display:flex;align-items:center;gap:5px}
.model-badge{background:var(--chat);color:#fff;padding:2px 7px;border-radius:9px;font-size:9px;font-weight:700}
.message-time{font-size:10px;color:var(--text2)}
.message-content{background:var(--surface);padding:12px 15px;border-radius:12px;line-height:1.7;border:1px solid var(--border);word-wrap:break-word;overflow-wrap:break-word;font-size:var(--font-sm)}
.message.user .message-content{background:linear-gradient(135deg,var(--chat),#764ba2);color:#fff;border:none}
.message-content img{max-width:100%;border-radius:8px;margin:10px 0;cursor:pointer;transition:transform .3s}
.message-content img:hover{transform:scale(1.02)}
.message-content pre{background:rgba(0,0,0,.5);padding:10px;border-radius:7px;overflow-x:auto;margin:8px 0}
.message-content code{font-family:'Fira Code',Monaco,monospace;font-size:var(--font-xs)}
.message-content :not(pre)>code{background:rgba(102,126,234,.2);padding:2px 6px;border-radius:4px;font-size:var(--font-xxs)}
.message-actions{display:flex;gap:5px;margin-top:7px;opacity:0;transition:opacity .3s;flex-wrap:wrap}
.message:hover .message-actions{opacity:1}
.msg-btn{padding:4px 9px;border:1px solid var(--border);background:var(--card);color:var(--text2);border-radius:5px;cursor:pointer;font-size:10px;font-weight:600;transition:all .2s}
.msg-btn:hover{background:var(--surface);color:var(--text);transform:translateY(-1px)}
.image-panel{padding:20px;gap:20px;overflow:hidden}
.image-sidebar{width:420px;background:var(--surface);border-radius:14px;padding:20px;height:fit-content;max-height:calc(100vh - 100px);overflow-y:auto;border:1px solid var(--border);flex-shrink:0}
.image-gallery{flex:1;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;align-content:start;overflow-y:auto;padding:4px}
.image-card{background:var(--surface);border-radius:14px;overflow:hidden;border:1px solid var(--border);transition:all .3s;cursor:pointer;position:relative;animation:fadeIn .5s}
@keyframes fadeIn{from{opacity:0;transform:scale(.95)}}
.image-card:hover{transform:translateY(-4px);box-shadow:0 12px 36px rgba(245,87,108,.3);border-color:var(--image)}
.image-card img{width:100%;aspect-ratio:1;object-fit:cover;background:var(--card)}
.image-info{padding:14px}
.image-prompt{font-size:var(--font-xs);color:var(--text);line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:9px}
.image-meta{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--text2)}
.image-model{background:var(--card);padding:4px 9px;border-radius:6px;font-weight:600}
.image-actions{position:absolute;top:10px;right:10px;display:flex;gap:7px;opacity:0;transition:opacity .3s}
.image-card:hover .image-actions{opacity:1}
.img-btn{width:34px;height:34px;border-radius:9px;border:none;background:rgba(0,0,0,.8);backdrop-filter:blur(10px);color:#fff;cursor:pointer;font-size:var(--font-sm);transition:all .2s}
.img-btn:hover{background:var(--image);transform:scale(1.1)}
.studio-header{margin-bottom:20px}
.studio-title{font-size:var(--font-2xl);font-weight:800;background:linear-gradient(135deg,#f093fb,var(--image));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:7px}
.card{background:var(--card);padding:14px;border-radius:10px;margin-bottom:14px;border:1px solid var(--border);transition:all .3s}
.card:hover{box-shadow:0 4px 12px rgba(0,0,0,.1)}
.label{font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:1px;margin-bottom:7px;display:block}
select,textarea{width:100%;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font:inherit;font-size:var(--font-xs);transition:all .3s}
select:focus,textarea:focus{outline:none;border-color:var(--chat);box-shadow:0 0 0 3px rgba(102,126,234,.1)}
textarea{min-height:90px;resize:vertical;line-height:1.6}
.btn-primary{width:100%;padding:11px;border:none;border-radius:9px;font-weight:700;cursor:pointer;color:#fff;font-size:var(--font-xs);transition:all .3s;position:relative;overflow:hidden}
.btn-chat{background:linear-gradient(135deg,var(--chat),#764ba2)}
.btn-image{background:linear-gradient(135deg,#f093fb,var(--image))}
.btn-primary:hover:not(:disabled){transform:translateY(-2px)}
.btn-primary:disabled{opacity:.6;cursor:not-allowed}
.btn-primary.loading::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent);animation:shimmer 1.5s infinite}
@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.empty{text-align:center;padding:50px 18px;color:var(--text2)}
.empty-icon{font-size:42px;margin-bottom:14px;opacity:.6;animation:float 3s infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-15px)}}
.toast{position:fixed;bottom:22px;right:22px;background:var(--surface);border:1px solid var(--border);padding:14px 18px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.3);z-index:9999;animation:toastIn .3s;display:flex;align-items:center;gap:10px;max-width:300px;font-size:var(--font-xs)}
@keyframes toastIn{from{opacity:0;transform:translateY(20px)}}
.toast.success{border-left:4px solid var(--success)}
.toast.error{border-left:4px solid var(--error)}
.lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:9999;justify-content:center;align-items:center;cursor:pointer}
.lightbox.active{display:flex}
.lightbox img{max-width:90%;max-height:85%;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.file-upload-area{margin-top:8px;padding:8px;background:var(--surface);border:2px dashed var(--border);border-radius:7px;display:none;flex-wrap:wrap;gap:8px;align-items:center;transition:all .3s}
.file-upload-area.active{display:flex}
.file-upload-area.dragover{border-color:var(--chat);background:rgba(102,126,234,.05)}
.file-item{position:relative;display:inline-flex;align-items:center;gap:6px;background:var(--card);padding:6px 10px;border-radius:6px;border:1px solid var(--border);font-size:var(--font-xxs);max-width:200px}
.file-item-icon{font-size:var(--font-sm)}
.file-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.file-item-size{color:var(--text2);font-size:10px}
.file-item-remove{width:18px;height:18px;border:none;background:var(--error);color:#fff;border-radius:50%;cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;transition:all .2s;margin-left:4px}
.file-item-remove:hover{transform:scale(1.1)}
.file-preview-img{max-width:100px;max-height:100px;border-radius:6px;border:1px solid var(--border);object-fit:cover}
input[type=file]{display:none}

/* 图像生成增强样式 */
.style-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.style-btn{padding:8px 4px;border:2px solid var(--border);background:var(--card);color:var(--text);border-radius:7px;cursor:pointer;font-size:10px;font-weight:600;transition:all .2s;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px}
.style-btn:hover{background:var(--surface);border-color:var(--image)}
.style-btn.active{background:var(--image);color:#fff;border-color:var(--image);box-shadow:0 0 0 2px rgba(245,87,108,.2)}
.style-icon{font-size:20px}
.style-name{font-size:10px}
.aspect-ratios{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.aspect-btn{flex:1;min-width:60px;padding:8px 4px;border:2px solid var(--border);background:var(--card);color:var(--text);border-radius:7px;cursor:pointer;font-size:10px;font-weight:600;transition:all .2s;text-align:center}
.aspect-btn:hover{background:var(--surface);border-color:var(--image)}
.aspect-btn.active{background:var(--image);color:#fff;border-color:var(--image);box-shadow:0 0 0 2px rgba(245,87,108,.2)}
.slider-container{margin-top:8px}
.slider-label{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text2);margin-bottom:6px}
.slider-value{color:var(--text);font-weight:700;background:var(--card);padding:2px 8px;border-radius:5px}
.slider{width:100%;height:6px;border-radius:3px;background:var(--surface);outline:none;-webkit-appearance:none}
.slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:var(--image);cursor:pointer;box-shadow:0 2px 6px rgba(245,87,108,.4)}
.slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--image);cursor:pointer;border:none;box-shadow:0 2px 6px rgba(245,87,108,.4)}
.batch-selector{display:flex;gap:8px;margin-top:8px}
.batch-btn{flex:1;padding:8px;border:2px solid var(--border);background:var(--card);color:var(--text);border-radius:7px;cursor:pointer;font-size:11px;font-weight:600;transition:all .2s}
.batch-btn:hover{background:var(--surface);border-color:var(--image)}
.batch-btn.active{background:var(--image);color:#fff;border-color:var(--image)}
.nsfw-warning{background:linear-gradient(135deg,rgba(239,68,68,.1),rgba(245,87,108,.1));border:1px solid var(--error);padding:12px;border-radius:8px;margin-top:10px;font-size:11px;color:var(--text2);line-height:1.6}
.nsfw-toggle{display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--surface);border-radius:7px;margin-top:8px;cursor:pointer;transition:all .2s}
.nsfw-toggle:hover{background:var(--card)}
.toggle-switch{position:relative;width:44px;height:24px;background:var(--border);border-radius:12px;transition:all .3s}
.toggle-switch.active{background:var(--error)}
.toggle-slider{position:absolute;top:2px;left:2px;width:20px;height:20px;background:#fff;border-radius:50%;transition:all .3s;box-shadow:0 2px 4px rgba(0,0,0,.2)}
.toggle-switch.active .toggle-slider{transform:translateX(20px)}
.history-images{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}
.history-img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;border:2px solid var(--border);cursor:pointer;transition:all .2s}
.history-img:hover{border-color:var(--image);transform:scale(1.05)}

@media(max-width:1400px){
:root{--center-width:700px}
.left-sidebar,.right-sidebar{min-width:250px;max-width:350px}
}
@media(max-width:1200px){
:root{--center-width:600px}
.left-sidebar,.right-sidebar{min-width:220px;max-width:300px}
}
@media(max-width:1024px){
:root{--center-width:500px}
.left-sidebar,.right-sidebar{min-width:200px;max-width:250px}
}
@media(max-width:768px){
.chat-panel{flex-direction:column}
.chat-main{width:100%}
.left-sidebar,.right-sidebar{position:fixed;top:60px;height:calc(100vh - 60px);z-index:100;transform:translateX(-100%);transition:transform .3s;width:85%;max-width:350px;min-width:auto}
.right-sidebar{right:0;left:auto;transform:translateX(100%)}
.left-sidebar.show{transform:translateX(0)}
.right-sidebar.show{transform:translateX(0)}
.controls .btn-icon{display:block}
.image-sidebar{width:100%}
.style-presets{grid-template-columns:repeat(2,1fr)}
}
::-webkit-scrollbar{width:7px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(102,126,234,.3);border-radius:4px}
</style>
</head>
<body data-theme="dark">
<nav class="topbar">
<div class="logo"><span>⚡</span><span>${CONFIG.PROJECT_NAME}</span></div>
<div class="tabs">
<button class="tab active" onclick="switchMode('chat')">💬 聊天</button>
<button class="tab" onclick="switchMode('image')">🎨 图像</button>
<button class="tab" onclick="switchMode('api')">📡 接口</button>
</div>
<div class="controls">
<button class="btn-icon" id="theme-btn" onclick="toggleTheme()" title="主题">🌙</button>
<button class="btn-icon" onclick="togglePanel('left')" title="历史记录" style="display:none">📚</button>
<button class="btn-icon" onclick="togglePanel('right')" title="设置" style="display:none">⚙️</button>
</div>
</nav>

<div class="container">
<div class="panel chat-panel active" id="chat-panel">
<aside class="left-sidebar" id="left-sidebar">
<div class="sidebar-header">
<div class="sidebar-title">📚 聊天历史</div>
<button class="new-chat-btn" onclick="newChat()"><span>➕</span><span>新建对话</span></button>
</div>
<div class="sidebar-content">
<div class="info-card">
<div class="info-card-header">💡 布局说明</div>
<div class="info-card-text">
<strong>固定中间布局：</strong><br>
<span class="info-badge">左侧弹性</span>
<span class="info-badge">中间 800px</span>
<span class="info-badge">右侧弹性</span>
</div>
<div class="info-card-text">
<strong>功能特点：</strong> 固定宽度 • 自动保存 • 文件上传 • 流式输出
</div>
</div>
<div class="history-list" id="history-list">
<div class="empty" style="padding:18px"><div style="font-size:26px;margin-bottom:7px">📝</div><p style="font-size:var(--font-xxs)">暂无历史记录</p></div>
</div>
</div>
</aside>

<main class="chat-main">
<div class="chat-messages" id="chat-messages">
<div class="empty">
<div class="empty-icon">💬</div>
<h3 style="font-size:var(--font-lg)">欢迎使用 AI 聊天</h3>
<p style="margin-top:7px;font-size:var(--font-xs)">固定 800px 宽度 • 支持文件上传 • 流式输出模式</p>
</div>
</div>
<div class="chat-input-box">
<div class="input-wrapper">
<textarea class="chat-input" id="chat-input" placeholder="输入您的消息... (Ctrl+Enter 发送)"></textarea>
<div class="file-upload-area" id="file-area"></div>
<div class="input-footer">
<div class="input-tools">
<button class="tool-btn" id="upload-btn" onclick="triggerFileUpload()" title="上传文件">📎</button>
<button class="tool-btn active" id="stream-btn" onclick="toggleStream()" title="流式输出">🌊</button>
<button class="tool-btn" onclick="clearInput()" title="清空">🗑️</button>
<button class="tool-btn" onclick="scrollToBottom()" title="滚动到底部">⬇️</button>
</div>
<div class="input-status"><span class="status-dot"></span><span id="char-count">0</span> 字符</div>
<button class="send-btn" id="send-btn" onclick="sendChat()"><span>发送</span><span>→</span></button>
</div>
</div>
<input type="file" id="file-input" multiple accept="image/*,.pdf,.txt,.doc,.docx,.js,.py,.json,.html,.css,.md" onchange="handleFileSelect(event)">
</div>
</main>

<aside class="right-sidebar" id="right-sidebar">
<div class="sidebar-header">
<div class="sidebar-title">⚙️ 设置中心</div>
</div>
<div class="sidebar-content">
<div class="info-card">
<div class="info-card-header">🎯 固定中间布局</div>
<div class="info-card-text">
聊天区域保持 <strong>800px</strong> 固定宽度，提供最佳阅读体验
</div>
</div>
<div class="card">
<span class="label">🤖 AI 模型</span>
<select id="chat-model" onchange="updateModelInfo()">
<option value="xai/grok-4-fast">Grok 4 Fast (超快推理)</option>
<option value="xai/grok-4-fast-reasoning">Grok 4 Fast Reasoning (高级逻辑)</option>
<option value="anthropic/claude-haiku-4-5">Claude Haiku 4.5 (快速精准)</option>
<option value="openai/gpt-5">GPT-5 (旗舰模型)</option>
<option value="openai/gpt-5-mini">GPT-5 Mini (轻量版)</option>
<option value="openai/gpt-4o">GPT-4o (优化版)</option>
<option value="openai/gpt-4o-mini">GPT-4o Mini (迷你版)</option>
<option value="google/gemini-2.5-flash">Gemini 2.5 Flash (快速多模态)</option>
<option value="deepseek/deepseek-reasoner">DeepSeek Reasoner (深度分析)</option>
<option value="deepseek/deepseek-chat">DeepSeek Chat (自然对话)</option>
</select>
<div style="margin-top:7px;font-size:var(--font-xxs);color:var(--text2);line-height:1.5" id="model-info">超快推理模型</div>
</div>
<div class="card">
<span class="label">📎 文件上传支持</span>
<div style="padding:8px;background:var(--surface);border-radius:7px;font-size:10px;color:var(--text2);line-height:1.6">
<div>✅ 图片格式 (JPG, PNG, GIF)</div>
<div>✅ 文档格式 (PDF, TXT, DOC)</div>
<div>✅ 代码文件 (JS, PY, JSON, HTML)</div>
<div style="margin-top:6px;color:var(--warning)">单个文件最大 10MB</div>
</div>
</div>
<div class="card">
<span class="label">🔧 流式输出模式</span>
<div style="padding:10px;background:var(--surface);border-radius:7px;font-size:var(--font-xs);color:var(--text);text-align:center;font-weight:600">
<span id="stream-status">✅ 已启用</span>
</div>
</div>
<div class="card">
<span class="label">🎯 快捷操作</span>
<div style="display:grid;gap:7px">
<button class="btn-primary btn-chat" onclick="exportChat()">💾 导出对话</button>
<button class="btn-primary btn-chat" onclick="clearChat()" style="background:var(--error)">🗑️ 清空全部</button>
</div>
</div>
</div>
</aside>
</div>

<div class="panel image-panel" id="image-panel">
<aside class="image-sidebar">
<div class="studio-header"><h2 class="studio-title">🎨 图像工作室 Pro</h2></div>

<div class="card">
<span class="label">🎯 图像模型</span>
<select id="image-model">
<option value="fal-ai/flux-2">FLUX 2 (标准版)</option>
<option value="fal-ai/flux-2-pro">FLUX 2 Pro (专业版)</option>
<option value="fal-ai/nano-banana">Nano Banana (基础版)</option>
<option value="fal-ai/nano-banana-pro">Nano Banana Pro (增强版)</option>
<option value="fal-ai/stable-diffusion-v35-large">Stable Diffusion v3.5 (大型版)</option>
</select>
</div>

<div class="card">
<span class="label">✍️ 提示词</span>
<textarea id="image-prompt" placeholder="描述您想要生成的图像..." style="min-height:80px"></textarea>
</div>

<div class="card">
<span class="label">🚫 负面提示词 (可选)</span>
<textarea id="negative-prompt" placeholder="不想出现的元素..." style="min-height:60px"></textarea>
</div>

<div class="card">
<span class="label">🎨 风格预设</span>
<div class="style-presets">
<div class="style-btn" onclick="setStyle('realistic')">
<div class="style-icon">📸</div>
<div class="style-name">真实照片</div>
</div>
<div class="style-btn" onclick="setStyle('anime')">
<div class="style-icon">🎌</div>
<div class="style-name">动漫风格</div>
</div>
<div class="style-btn" onclick="setStyle('oil')">
<div class="style-icon">🖼️</div>
<div class="style-name">油画艺术</div>
</div>
<div class="style-btn" onclick="setStyle('3d')">
<div class="style-icon">🎮</div>
<div class="style-name">3D渲染</div>
</div>
<div class="style-btn" onclick="setStyle('cyberpunk')">
<div class="style-icon">🌆</div>
<div class="style-name">赛博朋克</div>
</div>
<div class="style-btn" onclick="setStyle('watercolor')">
<div class="style-icon">🎨</div>
<div class="style-name">水彩画</div>
</div>
</div>
</div>

<div class="card">
<span class="label">📐 图像比例</span>
<div class="aspect-ratios">
<div class="aspect-btn active" data-ratio="1:1" onclick="setAspect('1:1')">1:1</div>
<div class="aspect-btn" data-ratio="16:9" onclick="setAspect('16:9')">16:9</div>
<div class="aspect-btn" data-ratio="4:3" onclick="setAspect('4:3')">4:3</div>
<div class="aspect-btn" data-ratio="3:4" onclick="setAspect('3:4')">3:4</div>
<div class="aspect-btn" data-ratio="21:9" onclick="setAspect('21:9')">21:9</div>
</div>
</div>

<div class="card">
<span class="label">⚙️ 生成参数</span>
<div class="slider-container">
<div class="slider-label">
<span>Steps (步数)</span>
<span class="slider-value" id="steps-value">30</span>
</div>
<input type="range" class="slider" id="steps-slider" min="20" max="100" value="30" oninput="updateSlider('steps',this.value)">
</div>
<div class="slider-container">
<div class="slider-label">
<span>CFG Scale (提示词强度)</span>
<span class="slider-value" id="cfg-value">7.5</span>
</div>
<input type="range" class="slider" id="cfg-slider" min="1" max="20" step="0.5" value="7.5" oninput="updateSlider('cfg',this.value)">
</div>
<div class="slider-container">
<div class="slider-label">
<span>Seed (随机种子)</span>
<span class="slider-value" id="seed-value">随机</span>
</div>
<input type="number" style="width:100%;margin-top:6px;padding:6px" id="seed-input" placeholder="留空为随机" oninput="updateSeed(this.value)">
</div>
</div>

<div class="card">
<span class="label">🔢 批量生成</span>
<div class="batch-selector">
<div class="batch-btn active" onclick="setBatch(1)">1 张</div>
<div class="batch-btn" onclick="setBatch(2)">2 张</div>
<div class="batch-btn" onclick="setBatch(4)">4 张</div>
</div>
</div>

<div class="card">
<span class="label">🔞 成人内容</span>
<div class="nsfw-toggle" onclick="toggleNSFW()">
<div>
<div style="font-weight:600;font-size:12px;color:var(--text)">允许成人内容</div>
<div style="font-size:10px;color:var(--text2);margin-top:2px">生成不受限制的图像</div>
</div>
<div class="toggle-switch" id="nsfw-toggle">
<div class="toggle-slider"></div>
</div>
</div>
<div class="nsfw-warning" id="nsfw-warning" style="display:none">
⚠️ <strong>注意：</strong>启用后可生成包含成人、暴力等敏感内容的图像。请遵守当地法律法规，不得用于非法用途。
</div>
</div>

<button class="btn-primary btn-image" id="gen-btn" onclick="generateImage()">✨ 生成图像</button>
</aside>

<div class="image-gallery" id="image-gallery">
<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🖼️</div><h3 style="font-size:var(--font-lg)">暂无图像</h3><p style="margin-top:8px;font-size:var(--font-xs)">开始创作您的第一张 AI 图像</p></div>
</div>
</div>

<div class="panel api-panel" id="api-panel">
<div style="max-width:900px;margin:0 auto;padding:20px">
<div style="text-align:center;margin-bottom:40px">
<h1 style="font-size:var(--font-3xl);font-weight:900;background:linear-gradient(135deg,var(--api),var(--chat));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px">📡 API 接口文档</h1>
<p style="color:var(--text2)">OpenAI 兼容接口</p>
</div>
<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:24px">
<h3 style="font-size:var(--font-lg);margin-bottom:16px">🔗 基础地址</h3>
<div style="background:var(--card);padding:16px;border-radius:10px;font-family:monospace;font-size:var(--font-xs)">${origin}/v1</div>
</div>
<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:24px">
<h3 style="font-size:var(--font-lg);margin-bottom:16px">🔑 API 密钥</h3>
<div style="background:var(--card);padding:16px;border-radius:10px;font-family:monospace;font-size:var(--font-xs)">${key}</div>
</div>
<div style="text-align:center;padding:40px 20px;color:var(--text2)">
<p style="font-size:var(--font-sm)">由 kinai9661 用 ❤️ 制作</p>
<p style="font-size:var(--font-xs);margin-top:8px">版本 ${CONFIG.VERSION}</p>
</div>
</div>
</div>
</div>

<div class="lightbox" id="lightbox" onclick="this.classList.remove('active')">
<img id="lightbox-img" src="">
</div>

<script>
const API='${origin}/v1/chat/completions',KEY='${key}';
let chatHistory=[],allChats=[],currentChatId=null,isGenerating=false,currentReader=null,streamMode=true,uploadedFiles=[];
let imageSettings={style:'',aspect:'1:1',steps:30,cfg:7.5,seed:null,batch:1,nsfw:false};
let imageHistory=[];
marked.setOptions({highlight:(c,l)=>l&&hljs.getLanguage(l)?hljs.highlight(c,{language:l}).value:hljs.highlightAuto(c).value,breaks:true});

// 加载保存的图像历史
try{
const saved=localStorage.getItem('typli_chats');
if(saved){allChats=JSON.parse(saved);if(allChats.length>0){loadChat(allChats[0].id);renderHistory()}}
const savedImages=localStorage.getItem('typli_images');
if(savedImages){imageHistory=JSON.parse(savedImages)}
}catch(e){}

if(window.innerWidth<=768){document.querySelectorAll('.controls .btn-icon').forEach(btn=>{if(btn.title!=='主题')btn.style.display='block'})}

document.getElementById('chat-input').addEventListener('input',e=>{document.getElementById('char-count').textContent=e.target.value.length});
document.getElementById('chat-input').addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();sendChat()}});

const fileArea=document.getElementById('file-area');
const chatInput=document.getElementById('chat-input');
['dragenter','dragover','dragleave','drop'].forEach(evt=>{
  chatInput.addEventListener(evt,e=>{e.preventDefault();e.stopPropagation()});
  fileArea.addEventListener(evt,e=>{e.preventDefault();e.stopPropagation()});
});
['dragenter','dragover'].forEach(evt=>{chatInput.addEventListener(evt,()=>fileArea.classList.add('dragover'))});
['dragleave','drop'].forEach(evt=>{chatInput.addEventListener(evt,()=>fileArea.classList.remove('dragover'))});
chatInput.addEventListener('drop',e=>{const files=e.dataTransfer.files;if(files.length>0)handleFiles(files)});

function triggerFileUpload(){document.getElementById('file-input').click()}
function handleFileSelect(e){handleFiles(e.target.files);e.target.value=''}
function handleFiles(files){
  const fileArea=document.getElementById('file-area');
  Array.from(files).forEach(file=>{
    if(file.size>10*1024*1024){showToast('文件过大：'+file.name,'error');return}
    const reader=new FileReader();
    reader.onload=e=>{
      const fileData={name:file.name,size:file.size,type:file.type,data:e.target.result};
      uploadedFiles.push(fileData);
      renderFileItem(fileData);
      fileArea.classList.add('active');
    };
    if(file.type.startsWith('image/')){reader.readAsDataURL(file)}
    else{reader.readAsText(file)}
  });
}
function renderFileItem(file){
  const fileArea=document.getElementById('file-area');
  const item=document.createElement('div');
  item.className='file-item';
  const icon=file.type.startsWith('image/')?'🖼️':file.type.includes('pdf')?'📄':file.type.includes('text')?'📝':'📎';
  const size=(file.size/1024).toFixed(1)+'KB';
  let preview='';
  if(file.type.startsWith('image/')){preview='<img src="'+file.data+'" class="file-preview-img">'}
  item.innerHTML='<span class="file-item-icon">'+icon+'</span><span class="file-item-name" title="'+file.name+'">'+file.name+'</span><span class="file-item-size">'+size+'</span><button class="file-item-remove" onclick="removeFile(\\''+file.name+'\\')">×</button>'+preview;
  fileArea.appendChild(item);
}
function removeFile(name){
  uploadedFiles=uploadedFiles.filter(f=>f.name!==name);
  const fileArea=document.getElementById('file-area');
  Array.from(fileArea.children).forEach(item=>{if(item.querySelector('.file-item-name')?.textContent===name){item.remove()}});
  if(uploadedFiles.length===0)fileArea.classList.remove('active');
  showToast('文件已移除','success');
}

// 图像生成功能
function setStyle(style){
  document.querySelectorAll('.style-btn').forEach(btn=>btn.classList.remove('active'));
  event.currentTarget.classList.add('active');
  const styles={
    realistic:'photorealistic, high quality, detailed, professional photography',
    anime:'anime style, manga, japanese animation, vibrant colors',
    oil:'oil painting, artistic, classical art style, detailed brushstrokes',
    '3d':'3D render, CGI, unreal engine, octane render, high detail',
    cyberpunk:'cyberpunk style, neon lights, futuristic, sci-fi',
    watercolor:'watercolor painting, soft colors, artistic, traditional art'
  };
  imageSettings.style=styles[style]||'';
  showToast('风格已选择：'+event.currentTarget.querySelector('.style-name').textContent,'success');
}
function setAspect(ratio){
  document.querySelectorAll('.aspect-btn').forEach(btn=>btn.classList.remove('active'));
  event.currentTarget.classList.add('active');
  imageSettings.aspect=ratio;
  showToast('比例已设置：'+ratio,'success');
}
function updateSlider(type,value){
  if(type==='steps'){
    imageSettings.steps=parseInt(value);
    document.getElementById('steps-value').textContent=value;
  }else if(type==='cfg'){
    imageSettings.cfg=parseFloat(value);
    document.getElementById('cfg-value').textContent=value;
  }
}
function updateSeed(value){
  imageSettings.seed=value?parseInt(value):null;
  document.getElementById('seed-value').textContent=value||'随机';
}
function setBatch(count){
  document.querySelectorAll('.batch-btn').forEach(btn=>btn.classList.remove('active'));
  event.currentTarget.classList.add('active');
  imageSettings.batch=count;
  showToast('批量设置：'+count+' 张','success');
}
function toggleNSFW(){
  imageSettings.nsfw=!imageSettings.nsfw;
  const toggle=document.getElementById('nsfw-toggle');
  const warning=document.getElementById('nsfw-warning');
  toggle.classList.toggle('active');
  warning.style.display=imageSettings.nsfw?'block':'none';
  showToast('成人内容：'+(imageSettings.nsfw?'已启用':'已禁用'),imageSettings.nsfw?'error':'success');
}

async function generateImage(){
  let prompt=document.getElementById('image-prompt').value.trim();
  const negPrompt=document.getElementById('negative-prompt').value.trim();
  if(!prompt)return showToast('请输入提示词','warning');
  
  // 添加风格关键词
  if(imageSettings.style){prompt+=', '+imageSettings.style}
  
  // 添加负面提示词
  if(negPrompt){prompt+=' [negative: '+negPrompt+']'}
  
  // 添加 NSFW 标记
  if(imageSettings.nsfw){prompt=' [NSFW allowed] '+prompt}
  
  // 添加参数
  prompt+=' --ar '+imageSettings.aspect+' --steps '+imageSettings.steps+' --cfg '+imageSettings.cfg;
  if(imageSettings.seed){prompt+=' --seed '+imageSettings.seed}
  
  const btn=document.getElementById('gen-btn');
  const originalText=btn.innerHTML;
  btn.disabled=true;
  btn.classList.add('loading');
  btn.innerHTML='<span>⏳ 生成中 ('+imageSettings.batch+' 张)...</span>';
  
  try{
    const model=document.getElementById('image-model').value;
    
    for(let i=0;i<imageSettings.batch;i++){
      const res=await fetch(API,{
        method:'POST',
        headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
        body:JSON.stringify({model,messages:[{role:'user',content:prompt}],stream:true})
      });
      
      const reader=res.body.getReader();
      const decoder=new TextDecoder();
      let buffer='';
      
      while(true){
        const{done,value}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value);
      }
      
      const match=buffer.match(/!\\[.*?\\]\\((https?:\\/\\/[^)]+)\\)/);
      if(match&&match[1]){
        addImageCard(document.getElementById('image-prompt').value,match[1],model,{
          aspect:imageSettings.aspect,
          steps:imageSettings.steps,
          cfg:imageSettings.cfg,
          seed:imageSettings.seed,
          nsfw:imageSettings.nsfw
        });
      }
      
      if(i<imageSettings.batch-1){
        btn.innerHTML='<span>⏳ 生成中 ('+(i+2)+'/'+imageSettings.batch+')...</span>';
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
    }
    
    document.getElementById('image-prompt').value='';
    showToast('生成完成！共 '+imageSettings.batch+' 张','success');
  }catch(e){
    showToast('生成失败：'+e.message,'error');
  }finally{
    btn.disabled=false;
    btn.classList.remove('loading');
    btn.innerHTML=originalText;
  }
}

function addImageCard(prompt,url,model,settings){
  document.querySelector('.image-gallery .empty')?.remove();
  const card=document.createElement('div');
  card.className='image-card';
  const shortModel=model.split('/').pop();
  const imageData={prompt,url,model,settings,timestamp:Date.now()};
  imageHistory.unshift(imageData);
  if(imageHistory.length>50)imageHistory=imageHistory.slice(0,50);
  localStorage.setItem('typli_images',JSON.stringify(imageHistory));
  
  card.innerHTML='<img src="'+url+'" alt="'+prompt+'"><div class="image-actions"><button class="img-btn" onclick="downloadImg(\\''+url+'\\',\\''+prompt+'\\')">💾</button><button class="img-btn" onclick="viewImg(\\''+url+'\\')">🔍</button><button class="img-btn" onclick="regenImage(\\''+prompt+'\\')">🔄</button></div><div class="image-info"><div class="image-prompt">'+prompt+'</div><div class="image-meta"><span class="image-model">'+shortModel+'</span><span>'+settings.aspect+' • '+settings.steps+' steps</span></div></div>';
  document.getElementById('image-gallery').prepend(card);
}

function regenImage(prompt){
  document.getElementById('image-prompt').value=prompt;
  showToast('提示词已填入，可调整参数后重新生成','success');
}

function switchMode(mode){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(mode+'-panel').classList.add('active');
}

function toggleTheme(){
  const body=document.body;
  const theme=body.getAttribute('data-theme')==='dark'?'light':'dark';
  body.setAttribute('data-theme',theme);
  document.getElementById('theme-btn').textContent=theme==='dark'?'🌙':'☀️';
  showToast('主题：'+theme,'success');
}

function togglePanel(side){document.getElementById(side+'-sidebar').classList.toggle('show')}

function updateModelInfo(){
  const model=document.getElementById('chat-model').value;
  const infos={
    'xai/grok-4-fast':'超快推理模型',
    'xai/grok-4-fast-reasoning':'高级逻辑推理',
    'anthropic/claude-haiku-4-5':'快速精准对话',
    'openai/gpt-5':'最新旗舰模型',
    'openai/gpt-4o':'优化版 GPT',
    'google/gemini-2.5-flash':'快速多模态',
    'deepseek/deepseek-reasoner':'深度分析模型',
    'deepseek/deepseek-chat':'自然对话模型'
  };
  document.getElementById('model-info').textContent=infos[model]||'高级 AI 模型';
}

function showToast(msg,type='success'){
  const toast=document.createElement('div');
  toast.className='toast '+type;
  toast.innerHTML='<span style="font-size:18px">'+(type==='success'?'✓':'✕')+'</span><span>'+msg+'</span>';
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(),3000);
}

function getCurrentTime(){return new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}

function newChat(){
  if(isGenerating)return showToast('请稍候...','warning');
  saveCurrentChat();
  currentChatId=Date.now();
  chatHistory=[];
  uploadedFiles=[];
  document.getElementById('file-area').classList.remove('active');
  document.getElementById('file-area').innerHTML='';
  document.getElementById('chat-messages').innerHTML='<div class="empty"><div class="empty-icon">💬</div><h3 style="font-size:var(--font-lg)">新建对话</h3></div>';
  renderHistory();
  showToast('已创建新对话','success');
}

function saveCurrentChat(){
  if(chatHistory.length===0)return;
  const existing=allChats.findIndex(c=>c.id===currentChatId);
  const chatData={id:currentChatId||Date.now(),title:chatHistory[0]?.content.slice(0,50)||'新对话',messages:chatHistory,timestamp:Date.now(),count:chatHistory.length};
  if(existing>=0){allChats[existing]=chatData}else{allChats.unshift(chatData)}
  if(allChats.length>50)allChats=allChats.slice(0,50);
  localStorage.setItem('typli_chats',JSON.stringify(allChats));
}

function loadChat(id){
  const chat=allChats.find(c=>c.id===id);
  if(!chat)return;
  saveCurrentChat();
  currentChatId=id;
  chatHistory=chat.messages;
  document.getElementById('chat-messages').innerHTML='';
  chatHistory.forEach(m=>addChatMsg(m.role,m.content,m.time,false));
  renderHistory();
}

function renderHistory(){
  const list=document.getElementById('history-list');
  if(allChats.length===0){
    list.innerHTML='<div class="empty" style="padding:18px"><div style="font-size:26px;margin-bottom:7px">📝</div><p style="font-size:var(--font-xxs)">暂无历史记录</p></div>';
    return;
  }
  list.innerHTML=allChats.map(c=>'<div class="history-item '+(c.id===currentChatId?'active':'')+'" onclick="loadChat('+c.id+')"><div class="history-title">'+c.title+'</div><div class="history-meta"><span>'+new Date(c.timestamp).toLocaleDateString()+'</span><span class="history-count">'+c.count+'</span></div></div>').join('');
}

function toggleStream(){
  streamMode=!streamMode;
  document.getElementById('stream-btn').classList.toggle('active');
  document.getElementById('stream-status').textContent=streamMode?'✅ 已启用':'❌ 已禁用';
  showToast('流式输出：'+(streamMode?'开启':'关闭'),'success');
}

function clearInput(){
  document.getElementById('chat-input').value='';
  document.getElementById('char-count').textContent='0';
  uploadedFiles=[];
  document.getElementById('file-area').innerHTML='';
  document.getElementById('file-area').classList.remove('active');
}

function scrollToBottom(){document.getElementById('chat-messages').scrollTo({top:999999,behavior:'smooth'})}

function addChatMsg(role,text,time=null,save=true){
  document.querySelector('.empty')?.remove();
  const msgTime=time||getCurrentTime();
  const d=document.createElement('div');
  d.className='message '+role;
  const avatar=role==='user'?'👤':'🤖';
  const msgId='msg-'+Date.now();
  const model=document.getElementById('chat-model').value.split('/')[1];
  const badge=role==='ai'?'<span class="model-badge">'+model.toUpperCase()+'</span>':'';
  d.innerHTML='<div class="avatar">'+avatar+'</div><div class="message-wrapper"><div class="message-header"><span class="message-role">'+(role==='user'?'用户':'AI')+' '+badge+'</span><span class="message-time">'+msgTime+'</span></div><div class="message-content" id="'+msgId+'">'+marked.parse(text)+'</div><div class="message-actions"><button class="msg-btn" onclick="copyMsg(\\''+msgId+'\\')">📋 复制</button><button class="msg-btn" onclick="deleteMsg(this)">🗑️ 删除</button></div></div>';
  document.getElementById('chat-messages').appendChild(d);
  d.scrollIntoView({behavior:'smooth',block:'end'});
  d.querySelectorAll('img').forEach(img=>img.onclick=()=>{document.getElementById('lightbox-img').src=img.src;document.getElementById('lightbox').classList.add('active')});
  if(save)chatHistory.push({role:role==='user'?'user':'assistant',content:text,time:msgTime});
  if(save)saveCurrentChat();
  return document.getElementById(msgId);
}

function copyMsg(id){navigator.clipboard.writeText(document.getElementById(id).innerText);showToast('已复制！','success')}
function copyText(text){navigator.clipboard.writeText(text);showToast('已复制！','success')}
function deleteMsg(btn){if(confirm('确定删除这条消息？')){btn.closest('.message').remove();showToast('已删除','success')}}
function clearChat(){if(confirm('确定清空所有消息？')){document.getElementById('chat-messages').innerHTML='<div class="empty"><div class="empty-icon">💬</div><h3 style="font-size:var(--font-lg)">已清空</h3></div>';chatHistory=[];saveCurrentChat();showToast('已清空','success')}}
function exportChat(){if(chatHistory.length===0)return showToast('暂无消息','warning');const data=chatHistory.map(m=>'['+m.time+'] '+(m.role==='user'?'用户':'AI')+': '+m.content).join('\\n\\n');const blob=new Blob([data],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='对话记录-'+Date.now()+'.txt';a.click();showToast('已导出！','success')}

async function sendChat(){
  if(isGenerating)return showToast('请稍候...','warning');
  let prompt=document.getElementById('chat-input').value.trim();
  if(!prompt&&uploadedFiles.length===0)return showToast('请输入消息或上传文件','warning');
  
  if(uploadedFiles.length>0){
    let fileContent='\\n\\n**已上传文件：**\\n';
    uploadedFiles.forEach(f=>{
      fileContent+='\\n**'+f.name+'** ('+f.type+'):';
      if(f.type.startsWith('image/')){
        fileContent+='\\n!['+f.name+']('+f.data+')\\n';
      }else{
        fileContent+='\\n\`\`\`\\n'+f.data.substring(0,2000)+'\\n\`\`\`\\n';
      }
    });
    prompt+=fileContent;
  }
  
  const btn=document.getElementById('send-btn');
  btn.disabled=true;
  btn.querySelector('span:first-child').textContent='发送中...';
  isGenerating=true;
  if(!currentChatId)currentChatId=Date.now();
  addChatMsg('user',prompt);
  uploadedFiles=[];
  document.getElementById('file-area').innerHTML='';
  document.getElementById('file-area').classList.remove('active');
  const aiMsg=addChatMsg('ai','',null,false);
  let full='';
  
  try{
    const res=await fetch(API,{
      method:'POST',
      headers:{'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},
      body:JSON.stringify({model:document.getElementById('chat-model').value,messages:[{role:'user',content:prompt}],stream:streamMode})
    });
    const reader=res.body.getReader();
    currentReader=reader;
    const decoder=new TextDecoder();
    
    while(true){
      const{done,value}=await reader.read();
      if(done)break;
      const chunk=decoder.decode(value,{stream:true});
      const lines=chunk.split('\\n');
      for(const line of lines){
        if(line.startsWith('data: ')){
          const data=line.slice(6);
          if(data==='[DONE]')continue;
          try{
            const parsed=JSON.parse(data);
            const content=parsed.choices[0]?.delta?.content||'';
            full+=content;
            aiMsg.innerHTML=marked.parse(full);
            aiMsg.scrollIntoView({behavior:'smooth',block:'end'});
          }catch(e){}
        }
      }
    }
    chatHistory.push({role:'assistant',content:full,time:getCurrentTime()});
    saveCurrentChat();
    renderHistory();
  }catch(e){
    aiMsg.innerHTML='<span style="color:var(--error)">❌ 错误：'+e.message+'</span>';
    showToast('发生错误','error');
  }finally{
    isGenerating=false;
    currentReader=null;
    btn.disabled=false;
    btn.querySelector('span:first-child').textContent='发送';
    document.getElementById('chat-input').value='';
    document.getElementById('char-count').textContent='0';
  }
}

function downloadImg(url,prompt){
  fetch(url).then(r=>r.blob()).then(blob=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(prompt.slice(0,30).replace(/[^a-z0-9]/gi,'_'))+'.png';
    a.click();
    showToast('已下载！','success');
  });
}

function viewImg(url){
  document.getElementById('lightbox-img').src=url;
  document.getElementById('lightbox').classList.add('active');
}

updateModelInfo();
<\/script>
</body>
</html>`;
  
  return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8'}});
}

function randomId(len){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';let r='';for(let i=0;i<len;i++)r+=chars[Math.floor(Math.random()*chars.length)];return r}
function makeChunk(id,model,content,finish=null){return {id:`chatcmpl-${id}`,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model,choices:[{index:0,delta:content?{content}:{},finish_reason:finish}]}}
function jsonError(msg,status){return new Response(JSON.stringify({error:{message:msg,type:'api_error'}}),{status,headers:corsHeaders({'Content-Type':'application/json'})})}
function corsHeaders(h={}){return {...h,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}}

