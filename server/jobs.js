import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createJobStore, isTerminalJob, jobStorageError, normalizedCrop, publicJobError, publicJobResult, validJobImage } from './job-store.js';

// One queue owns a storageDir. In-memory operation remains the default for tests.
export function createJobQueue(worker, { maxJobs = 8, maxRetained = 100, ttl = 30 * 60 * 1000, now = Date.now, maxAttempts = 2, retryDelayMs = 1000, storageDir, onDiagnostic } = {}) {
  if (![maxJobs,maxRetained,maxAttempts].every(value => Number.isInteger(value) && value > 0) || !Number.isFinite(ttl) || ttl < 0) throw new RangeError('Job queue limits must be positive integers and TTL must be nonnegative.');
  const jobs = new Map(), diagnostics = [];
  let active = false, closed = false;
  function diagnose(entry) {
    diagnostics.push(entry); if (diagnostics.length > 50) diagnostics.shift();
    if (onDiagnostic) { try { onDiagnostic({ ...entry }); } catch { /* Diagnostics cannot interrupt persistence. */ } }
    else console.warn(`[photo-jobs] ${entry.code}: ${entry.message}`);
  }
  const store = storageDir ? createJobStore(storageDir, { now, onDiagnostic:diagnose }) : null;
  function diagnostic(code, job, message) { diagnose({ code, jobId:job?.id, message, at:now() }); }
  function persist(job) { store?.save(job); }
  function cleanPhoto(job) {
    delete job.image;
    try { store?.removePhoto(job.id); }
    catch { diagnostic('PHOTO_CLEANUP_FAILED', job, 'A finished job photo could not be removed; cleanup will retry after restart or expiry.'); }
  }
  function discard(id) { store?.remove(id); jobs.delete(id); }
  function prune(reserve = 0) {
    for (const [id, job] of jobs) if (isTerminalJob(job) && now() - job.updatedAt > ttl) discard(id);
    for (const [id, job] of jobs) if (jobs.size > maxRetained - reserve && isTerminalJob(job)) discard(id);
  }
  function snapshot(job) {
    return job && { id:job.id, status:job.status, stage:job.stage, attempt:job.attempt, maxAttempts, createdAt:job.createdAt, crop:job.crop && { ...job.crop }, result:publicJobResult(job.result), error:job.error, errorCode:job.errorCode, position:job.status === 'queued' ? [...jobs.values()].filter(j => j.status === 'queued').findIndex(j => j.id === job.id) + 1 : 0 };
  }
  function persistenceFailure(job, error) {
    job.status = 'failed'; job.stage = 'failed'; job.errorCode = 'JOB_STORAGE_FAILURE'; job.error = jobStorageError(error).message;
    delete job.result;
    diagnostic('JOB_STORAGE_FAILURE', job, 'Job persistence failed. Previously committed work and its photo remain available for restart recovery.');
  }
  async function drain() {
    if (active || closed) return;
    const job = [...jobs.values()].find(j => j.status === 'queued');
    if (!job) return;
    active = true; job.status = 'processing'; job.updatedAt = now();
    let committedTerminal = false;
    try {
      persist(job);
      let result;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        job.controller.signal.throwIfAborted(); job.attempt = attempt; persist(job);
        try {
          result = await worker(job.image, { signal:job.controller.signal, crop:job.crop && { ...job.crop }, onStage:stage => {
            if (!closed && job.status !== 'cancelled' && ['preparing','recognizing','validating'].includes(stage)) { job.stage = stage; job.updatedAt = now(); persist(job); }
          } });
          break;
        } catch (error) {
          if (closed || job.controller.signal.aborted || error.retryable !== true || attempt === maxAttempts) throw error;
          job.stage = 'retrying'; job.updatedAt = now(); persist(job);
          await delay(retryDelayMs * attempt, undefined, { signal:job.controller.signal });
        }
      }
      if (!closed && job.status !== 'cancelled') {
        job.result = publicJobResult(result); job.status = 'ready'; job.stage = 'ready'; job.updatedAt = now();
        persist(job); committedTerminal = true;
      }
    } catch (error) {
      if (!closed && job.status !== 'cancelled') {
        if (error.code === 'JOB_STORAGE_FAILURE') persistenceFailure(job, error);
        else {
          job.status = 'failed'; job.stage = 'failed'; job.errorCode = typeof error.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'ANALYSIS_FAILED'; job.error = publicJobError(error.message?.includes('fetch') ? 'Start the local AI service, then retry this photo.' : error.message); job.updatedAt = now();
          try { persist(job); committedTerminal = true; } catch (storageError) { persistenceFailure(job, storageError); }
        }
      }
    } finally {
      if (!closed && (committedTerminal || job.status === 'cancelled')) cleanPhoto(job);
      if (!closed) job.updatedAt = now();
      active = false; if (!closed) void drain();
    }
  }
  try {
    for (const record of store?.load() || []) {
      const job = { ...record, controller:new AbortController() };
      if (!isTerminalJob(job)) { job.status = 'queued'; job.stage = 'queued'; job.attempt = 0; job.updatedAt = now(); delete job.error; delete job.errorCode; persist(job); }
      jobs.set(job.id, job);
    }
    prune();
  } catch (error) { store?.release(); throw error; }
  if (jobs.size) queueMicrotask(drain);
  return {
    enqueue(image, { crop } = {}) {
      if (closed) throw Object.assign(new Error('The photo queue is stopping. Retry after the local service restarts.'), { status:503, code:'QUEUE_CLOSED' });
      if (!validJobImage(image)) throw Object.assign(new Error('Provide a valid JPG, PNG or WebP photo under 6 MB.'), { status:400 });
      crop = normalizedCrop(crop);
      prune(1);
      if ([...jobs.values()].filter(j => !isTerminalJob(j)).length >= maxJobs || jobs.size >= maxRetained) throw Object.assign(new Error('The photo queue is full. Retry after a few photos finish.'), { status:429 });
      const job = { id:randomUUID(), image, crop, status:'queued', stage:'queued', attempt:0, createdAt:now(), updatedAt:now(), controller:new AbortController() };
      store?.create(job);
      jobs.set(job.id, job); queueMicrotask(drain); return snapshot(job);
    },
    get(id) { if (!closed) prune(); return snapshot(jobs.get(id)); },
    cancel(id) {
      if (closed) throw Object.assign(new Error('The photo queue is stopping. Retry after the local service restarts.'), { status:503, code:'QUEUE_CLOSED' });
      const job = jobs.get(id); if (!job) return false;
      const cancelled = { ...job, status:'cancelled', stage:'cancelled', result:undefined, updatedAt:now() };
      persist(cancelled);
      Object.assign(job, cancelled); delete job.result; job.controller.abort(); cleanPhoto(job); return true;
    },
    close() {
      closed = true;
      for (const job of jobs.values()) if (!isTerminalJob(job)) { job.controller.abort(); delete job.image; }
      store?.release();
    },
    get diagnostics() { return diagnostics.map(entry => ({ ...entry })); },
    get busy() { return !closed && (active || [...jobs.values()].some(j => j.status === 'queued')); },
  };
}
