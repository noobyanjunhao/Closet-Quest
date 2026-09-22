import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const idPattern = new RegExp(`^${ID}$`, 'i');
const recordPattern = new RegExp(`^(${ID})\\.json$`, 'i');
const photoPattern = new RegExp(`^(${ID})\\.photo$`, 'i');
const temporaryPattern = new RegExp(`^\\.${ID}\\.${ID}\\.tmp$`, 'i');
const statuses = new Set(['queued', 'processing', 'ready', 'failed', 'cancelled']);
const stages = new Set(['queued','processing','preparing','recognizing','validating','retrying','ready','failed','cancelled']);
export const isTerminalJob = job => ['ready', 'failed', 'cancelled'].includes(job.status);
export const validJobImage = image => typeof image === 'string' && image.length <= 8000000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image);

export function normalizedCrop(crop) {
  if (crop === undefined || crop === null) return undefined;
  const bad = () => Object.assign(new Error('Choose a crop within the photo, using normalized coordinates between 0 and 1.'), { status:400, code:'INVALID_CROP' });
  if (!crop || typeof crop !== 'object' || Array.isArray(crop) || Object.keys(crop).some(key => !['x','y','width','height'].includes(key))) throw bad();
  const { x, y, width, height } = crop;
  if (![x,y,width,height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) throw bad();
  return { x, y, width, height };
}

// Results and diagnostics must never turn the private photo back into API metadata.
export function publicJobResult(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return /data:image\/[^;]+;base64,/i.test(value) ? undefined : value;
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) return value.map(entry => publicJobResult(entry, seen)).filter(entry => entry !== undefined);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(image|images|photo|photos|imageData|photoData|imageBase64|base64)$/i.test(key)).map(([key, entry]) => [key, publicJobResult(entry, seen)]).filter(([, entry]) => entry !== undefined));
}
export const publicJobError = message => String(message || 'Photo analysis failed.').replace(/data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+/gi, '[photo omitted]').slice(0, 500);
export function jobStorageError(cause) {
  return Object.assign(new Error('The photo job could not be saved on this device. Check available disk space and folder permissions, then retry.', { cause }), { code:'JOB_STORAGE_FAILURE', status:503, retryable:false });
}

export function createJobStore(storageDir, { now = Date.now, onDiagnostic = () => {} } = {}) {
  const root = resolve(storageDir);
  try { mkdirSync(root, { recursive:true, mode:0o700 }); } catch (error) { throw jobStorageError(error); }
  const lockPath = join(root, '.queue-owner.lock'), ownerToken = randomUUID();
  const locked = () => Object.assign(new Error('Another local API owns this photo-job folder. Stop that server before starting a second one, or choose a separate CLOSET_JOB_DIR.'), { code:'JOB_STORE_IN_USE', status:503 });
  let ownsLock = false;
  for (let attempt = 0; attempt < 3 && !ownsLock; attempt++) {
    let descriptor;
    try {
      descriptor = openSync(lockPath, 'wx', 0o600);
      writeFileSync(descriptor, JSON.stringify({ version:1, pid:process.pid, token:ownerToken }), 'utf8');
      fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined; ownsLock = true;
    } catch (error) {
      if (descriptor !== undefined) { closeSync(descriptor); try { unlinkSync(lockPath); } catch {} throw jobStorageError(error); }
      if (error.code !== 'EEXIST') throw jobStorageError(error);
      let previous, owner;
      try { previous = readFileSync(lockPath, 'utf8'); owner = JSON.parse(previous); } catch { throw locked(); }
      if (!Number.isInteger(owner.pid) || owner.pid < 1 || !idPattern.test(owner.token)) throw locked();
      let alive = true;
      try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
      if (alive) throw locked();
      // Serialize stale-lock removal so two starting processes cannot unlink a
      // newly claimed owner after both observed the same dead predecessor.
      const recoveryPath=join(root,'.queue-recovery.lock');let recovery;
      try { recovery=openSync(recoveryPath,'wx',0o600); }
      catch(error) { if(error.code==='EEXIST')throw locked();throw jobStorageError(error); }
      try { if(readFileSync(lockPath,'utf8')===previous)unlinkSync(lockPath); }
      catch(error) { if(error.code!=='ENOENT')throw jobStorageError(error); }
      finally { closeSync(recovery);try{unlinkSync(recoveryPath);}catch{} }
      onDiagnostic({ code:'STALE_OWNER_RECOVERED', message:'Recovered the job folder from a process that is no longer running.', at:now() });
    }
  }
  if (!ownsLock) throw locked();
  function release() {
    if (!ownsLock) return;
    ownsLock = false;
    try { const owner = JSON.parse(readFileSync(lockPath, 'utf8')); if (owner.token === ownerToken) unlinkSync(lockPath); }
    catch { /* A removed/replaced lock is never treated as ours. */ }
  }
  function pathFor(id, extension) {
    if (!idPattern.test(id)) throw jobStorageError(new Error('Invalid job identifier.'));
    const path = join(root, `${id}.${extension}`);
    if (dirname(path) !== root) throw jobStorageError(new Error('Job path escaped its storage directory.'));
    return path;
  }
  function diagnostic(code, id, message) { onDiagnostic({ code, jobId:id, message, at:now() }); }
  function unlink(path) { try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  function atomicWrite(id, extension, content) {
    const destination = pathFor(id, extension);
    const temporary = join(root, `.${id}.${randomUUID()}.tmp`);
    let descriptor;
    try {
      descriptor = openSync(temporary, 'wx', 0o600);
      writeFileSync(descriptor, content, 'utf8');
      fsyncSync(descriptor);
      closeSync(descriptor); descriptor = undefined;
      renameSync(temporary, destination);
    } catch (error) { throw jobStorageError(error); }
    finally {
      if (descriptor !== undefined) closeSync(descriptor);
      try { unlink(temporary); } catch { diagnostic('TEMP_CLEANUP_FAILED', id, 'A temporary job file could not be removed.'); }
    }
  }
  function record(job) {
    return { version:1, id:job.id, status:job.status, stage:job.stage, attempt:job.attempt, createdAt:job.createdAt, updatedAt:job.updatedAt, crop:job.crop, result:publicJobResult(job.result), error:job.error && publicJobError(job.error), errorCode:typeof job.errorCode === 'string' && /^[A-Z0-9_]{1,80}$/.test(job.errorCode) ? job.errorCode : undefined };
  }
  function save(job) {
    let content;
    try { content = JSON.stringify(record(job)); if (Buffer.byteLength(content) > 2000000) throw new Error('Job metadata exceeded its size limit.'); }
    catch (error) { throw jobStorageError(error); }
    atomicWrite(job.id, 'json', content);
  }
  function removePhoto(id) { try { unlink(pathFor(id, 'photo')); } catch (error) { throw jobStorageError(error); } }
  function remove(id) {
    try { unlink(pathFor(id, 'photo')); unlink(pathFor(id, 'json')); }
    catch (error) { throw jobStorageError(error); }
  }
  return {
    root, release,
    create(job) {
      atomicWrite(job.id, 'photo', job.image);
      try { save(job); }
      catch (error) { try { removePhoto(job.id); } catch { diagnostic('PHOTO_CLEANUP_FAILED', job.id, 'An unacknowledged job photo could not be removed.'); } throw error; }
    },
    save, remove, removePhoto,
    load() {
      let names;
      try { names = readdirSync(root); } catch (error) { throw jobStorageError(error); }
      const restored = [], pendingPhotos = new Set();
      for (const name of names) {
        const match = recordPattern.exec(name);
        if (!match) continue;
        const id = match[1], path = pathFor(id, 'json');
        try {
          const stat = lstatSync(path);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2000000) throw new Error('Invalid job record file.');
          const value = JSON.parse(readFileSync(path, 'utf8'));
          if (value.version !== 1 || value.id !== id || !statuses.has(value.status) || !stages.has(value.stage) || !Number.isInteger(value.attempt) || value.attempt < 0 || !Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt)) throw new Error('Invalid job record.');
          const job = { ...record(value), crop:normalizedCrop(value.crop) };
          if (!isTerminalJob(job)) {
            const photoPath = pathFor(id, 'photo'), photoStat = lstatSync(photoPath);
            if (!photoStat.isFile() || photoStat.isSymbolicLink() || photoStat.size > 8000000) throw new Error('Invalid saved photo.');
            job.image = readFileSync(photoPath, 'utf8');
            if (!validJobImage(job.image)) throw new Error('Invalid saved photo.');
            pendingPhotos.add(id);
          } else if (existsSync(pathFor(id, 'photo'))) {
            try { removePhoto(id); } catch { diagnostic('PHOTO_CLEANUP_FAILED', id, 'A completed job photo could not be removed.'); }
          }
          restored.push(job);
        } catch { diagnostic('CORRUPT_JOB_SKIPPED', id, 'A corrupt or incomplete job record was skipped. Its photo cannot be resumed.'); }
      }
      for (const name of names) {
        const photo = photoPattern.exec(name);
        if (temporaryPattern.test(name) || photo && !pendingPhotos.has(photo[1])) {
          try { unlink(join(root, name)); }
          catch { diagnostic('ORPHAN_CLEANUP_FAILED', photo?.[1], 'An unused job file could not be removed.'); }
        }
      }
      return restored.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    },
  };
}
