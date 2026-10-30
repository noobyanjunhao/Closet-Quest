# Local model baseline — 2026-10-30

This is an audit of the working repository and machine, not a training result. The implementation checkpoint is M0–M1 of the supplied Applied ML Upgrade Plan. The user's request to publish on GitHub overrides the plan's generic no-publication instruction. The later training and public-serving phases remain separate review milestones.

## What exists

| Responsibility | Actual path / behavior |
|---|---|
| Frontend | React 19, Vite; `src/App.jsx`, existing modal and wardrobe components |
| API | Node 24.19.0 HTTP middleware in `server/api.js`; loopback-only local mode or authenticated Supabase account mode |
| Existing local inference | `server/agents.js::chat`, fixed `http://127.0.0.1:11434/api/chat`; JSON schema, timeouts, no user-selected endpoint |
| Task model selection | `server/model-config.js`; purchase extraction uses the installed Qwen instruct model by default |
| Photo jobs | `server/jobs.js` + `server/job-store.js`; image-specific durable file queue |
| Local knowledge | `server/knowledge.js`; SQLite and owner-scoped retrieval |
| Cloud | `server/cloud.js`; Supabase Auth, user JWTs, Postgres RLS, private photo storage, snapshot CAS |
| Existing inventory | Local browser state or `public.closets.state` JSON snapshot; no existing normalized SQL garment table |
| New import ledger | `server/purchase-store.js` (Node SQLite), `server/purchase-cloud-store.js` (Supabase adapter), migration 003 |
| New workflow | `server/purchase-imports.js`; dedicated text queue because photo queue validation/persistence is image-specific |

No AGENTS.md was found in the repository or checked parent folders. The local checkout contains earlier work already published remotely; it was not reset or bulk staged. Published base: `a14d0d07efb54ba212efd6118139ff3bed4e064b`. Local checkout HEAD remained `e66d0c6875a23982caf78239953e17a1986edc75`; local smoke manifests identify this distinction explicitly.

## Verified runtime and hardware

- Windows, Node v24.19.0, Ollama 0.34.0.
- AMD Ryzen 9 8945HS; 16,413,151,232 bytes system memory (about 15.3 GiB).
- NVIDIA GeForce RTX 4060 Laptop GPU, 8,188 MiB VRAM according to `nvidia-smi`. Windows AdapterRAM alone reported a misleading ~4 GiB value, so it was not used as the VRAM capacity.
- `qwen3-vl:4b-instruct-q4_K_M`, GGUF, Q4_K_M, 4.4B; digest `ee4b975b58c17ce268cd19d40db35d5edc64603035d2ffc1fee1968eb0947f7b`; installed size 3,295,636,231 bytes.
- `gemma3:4b`, GGUF, Q4_K_M, 4.3B; digest `a2af6cc3eb7fa8be8504abaf9b04e88f17a119ec3f04a3addf55f92841195f5a`; installed size 3,338,801,804 bytes.
- Existing embedding model: `qwen3-embedding:0.6b`, Q8_0, digest `ac6da0dfba84a81fdbfbaf330198c33cd77c4cdfc53e8bc50eb581914a15621d`.

The existing launcher started Ollama successfully. No weights were downloaded. No paid inference, training or GPU rental occurred. No Python environment was provisioned: evaluation/training tooling is M2 onward.

## Baseline and real inference observations

Before implementation, `npm test` passed **219/219 tests**. The input for all new real-model probes was the same fictional Harbor Demo Store purchase, not a real receipt or a held-out test set.

| Probe | Actual result | Interpretation |
|---|---|---|
| Gemma probe 1 | Rejected: quote absent from source line | Evidence validation prevented acceptance |
| Gemma diagnostic probe 2 | Rejected: missing description evidence; provider reported 4,038 ms / 117 output tokens | Schema-shaped JSON alone was insufficient |
| Qwen probe 1 | Accepted; 17,356 ms generation / 346 tokens | Grounded description, category, color, size and quantity; fee lines excluded |
| Documented Qwen smoke command | Accepted; 6,916.93 ms total | Repeat with existing model residency; not a comparable cold/warm performance experiment |

The Qwen result used the entire clothing line as its name, including size and quantity. It is source-grounded but verbose; the editable review is necessary. These probes motivated a purchase-specific default, **not** a general accuracy/speed claim. Actual outputs are under `output/smart-import/`. A successful contract check does not establish semantic accuracy on unseen receipts.

The adapter uses the existing 8,192-token runtime context, a 2,048-token output cap and a conservative UTF-8 byte bound including prompt and schema. The installed integration exposes no tokenizer endpoint. This is a conservative bound, not an exact tokenizer measurement; short receipts work, and larger inputs can fail below the general 12,000-character product limit. No silent truncation is allowed.

## Reproduce

```powershell
npm ci
npm test
npm run ai:start
npm run imports:smoke
# Optional diagnostic, not CI and not a fallback:
npm run imports:smoke -- --model=gemma3:4b
```

The smoke command exits nonzero for unavailable or invalid inference and records the outcome. It never substitutes fixtures. A full accuracy dataset, acceptance study, fine-tuned artifact and fair latency comparison remain unfinished.
