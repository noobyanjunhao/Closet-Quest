import { PipelineError } from './recognition.js';

export const OPENAI_MODEL = 'gpt-4.1-mini-2025-04-14';
export function openAIStatus() {
  return { configured: Boolean(process.env.OPENAI_API_KEY?.trim()), model: process.env.CLOSET_OPENAI_MODEL || OPENAI_MODEL };
}

export function createOpenAIChat({ apiKey = process.env.OPENAI_API_KEY, model = openAIStatus().model, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  return async (schema, system, content, _image, { signal } = {}) => {
    if (!apiKey?.trim()) throw new PipelineError('OpenAI is not configured. Add OPENAI_API_KEY to .env.local and restart the server.', { code: 'OPENAI_NOT_CONFIGURED', status: 503 });
    signal?.throwIfAborted();
    const started = performance.now();
    const deadline = AbortSignal.timeout(timeoutMs);
    let response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        body: JSON.stringify({ model, store: false, instructions: system, input: content, max_output_tokens: 1200,
          text: { format: { type: 'json_schema', name: 'wardrobe_plans', strict: true, schema } } }),
      });
      if (!response.ok) throw new PipelineError(response.status === 401 ? 'OpenAI rejected the API key.' : response.status === 429 ? 'OpenAI is at its request or billing limit.' : 'OpenAI could not complete this request.', { code: `OPENAI_HTTP_${response.status}`, status: 503 });
      const result = await response.json();
      const parts = (result.output || []).flatMap(item => item.content || []);
      if (result.status !== 'completed' || parts.some(part => part.type === 'refusal')) throw new PipelineError('OpenAI did not complete a usable recommendation.', { code: 'OPENAI_INCOMPLETE', status: 503 });
      const data = JSON.parse(parts.filter(part => part.type === 'output_text').map(part => part.text).join(''));
      return { data, model, latencyMs: Math.round(performance.now() - started), tokens: result.usage?.output_tokens, usage: result.usage };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof PipelineError) throw error;
      throw new PipelineError(deadline.aborted ? 'OpenAI took too long to respond.' : 'OpenAI returned an unavailable or unreadable response.', { code: deadline.aborted ? 'OPENAI_TIMEOUT' : 'OPENAI_UNAVAILABLE', status: 503 });
    }
  };
}
