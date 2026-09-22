export const MODEL_DEFAULTS = Object.freeze({recognition:'qwen3-vl:4b-instruct-q4_K_M',stylist:'gemma3:4b',embedding:'qwen3-embedding:0.6b'});
export function modelFor(role) {
  if(role==='recognition')return process.env.CLOSET_RECOGNITION_MODEL||process.env.CLOSET_MODEL||MODEL_DEFAULTS.recognition;
  if(role==='stylist')return process.env.CLOSET_STYLIST_MODEL||process.env.CLOSET_MODEL||MODEL_DEFAULTS.stylist;
  if(role==='embedding')return process.env.CLOSET_EMBED_MODEL||MODEL_DEFAULTS.embedding;
  throw new Error('Unknown model role.');
}
