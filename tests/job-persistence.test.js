import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { setImmediate as tick } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import { createJobQueue } from '../server/jobs.js';

const image = 'data:image/jpeg;base64,YQ==';
const secondImage = 'data:image/png;base64,Yg==';
function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'closet-jobs-test-'));
  t.after(() => {
    const root = resolve(directory);
    assert.equal(dirname(root), resolve(tmpdir()));
    if (!existsSync(root)) return;
    if (lstatSync(root).isFile()) { unlinkSync(root); return; }
    for (const name of readdirSync(root)) {
      const target = resolve(root, name);
      assert.equal(dirname(target), root);
      assert.ok(lstatSync(target).isFile() || lstatSync(target).isSymbolicLink(), 'Tests clean only explicit files, never nested directories.');
      unlinkSync(target);
    }
    rmdirSync(root);
  });
  return directory;
}
function queue(t, directory, worker, options = {}) {
  const result = createJobQueue(worker, { storageDir:directory, onDiagnostic:()=>{}, ...options });
  t.after(() => result.close());
  return result;
}
const diskRecord = (directory, id) => JSON.parse(readFileSync(join(directory, `${id}.json`), 'utf8'));

test('acknowledged jobs commit metadata and a separate photo before processing; crop survives restart', async t => {
  const directory = workspace(t), seen = [];
  let release;
  const original = queue(t, directory, () => new Promise(resolve => { release = resolve; }));
  const crop = { x:.1, y:.2, width:.5, height:.6 };
  const first = original.enqueue(image, { crop }), second = original.enqueue(secondImage);
  crop.x = .8;
  assert.equal(diskRecord(directory, first.id).status, 'queued');
  assert.deepEqual(diskRecord(directory, first.id).crop, { x:.1, y:.2, width:.5, height:.6 });
  assert.equal(readFileSync(join(directory, `${first.id}.photo`), 'utf8'), image);
  assert.equal(JSON.stringify(diskRecord(directory, first.id)).includes(image), false);
  await tick();
  assert.equal(diskRecord(directory, first.id).status, 'processing');
  original.close();
  const restarted = queue(t, directory, async (photo, options) => { seen.push({ photo, crop:options.crop }); return { data:{ name:'Recovered' } }; });
  await tick();
  assert.equal(restarted.get(first.id).status, 'ready');
  assert.equal(restarted.get(second.id).status, 'ready');
  assert.equal(seen.length, 2);
  assert.deepEqual(seen.find(value => value.photo === image).crop, { x:.1, y:.2, width:.5, height:.6 });
  release({ data:{ name:'Late old worker result' } }); await tick();
  assert.equal(diskRecord(directory, first.id).result.data.name, 'Recovered');
  assert.equal(readdirSync(directory).some(name => name.endsWith('.photo') || name.endsWith('.tmp')), false);
});

test('ready results and typed failures survive restart without replaying work or retaining photos', async t => {
  const directory = workspace(t);
  const original = queue(t, directory, async photo => {
    if (photo === secondImage) throw Object.assign(new Error('No clothing found'), { code:'NOT_FASHION' });
    return { data:{ name:'Tee', image:photo, nested:{ photo, note:'Safe metadata' } } };
  });
  const ready = original.enqueue(image), failed = original.enqueue(secondImage); await tick();
  assert.equal(original.get(ready.id).status, 'ready');
  assert.equal(original.get(failed.id).status, 'failed');
  original.close();
  let calls = 0;
  const restarted = queue(t, directory, async () => { calls++; }); await tick();
  assert.equal(calls, 0);
  assert.equal(restarted.get(ready.id).result.data.name, 'Tee');
  assert.equal(restarted.get(failed.id).errorCode, 'NOT_FASHION');
  assert.equal(restarted.get(failed.id).error, 'No clothing found');
  assert.equal(JSON.stringify(restarted.get(ready.id)).includes(image), false);
  assert.equal(JSON.stringify(diskRecord(directory, ready.id)).includes(image), false);
  assert.equal('image' in restarted.get(ready.id).result.data, false);
  assert.equal(readdirSync(directory).some(name => name.endsWith('.photo')), false);
});

test('cancellation is durable for queued and active jobs, and late completion cannot overwrite it', async t => {
  const directory = workspace(t);
  let release;
  const original = queue(t, directory, () => new Promise(resolve => { release = resolve; }));
  const active = original.enqueue(image), waiting = original.enqueue(image); await tick();
  assert.equal(original.cancel(active.id), true);
  assert.equal(original.cancel(waiting.id), true);
  release({ data:{ name:'Too late' } }); await tick(); original.close();
  let calls = 0;
  const restarted = queue(t, directory, async () => { calls++; }); await tick();
  assert.equal(calls, 0);
  for (const job of [active, waiting]) { assert.equal(restarted.get(job.id).status, 'cancelled'); assert.equal(restarted.get(job.id).result, undefined); }
  assert.equal(readdirSync(directory).some(name => name.endsWith('.photo')), false);
});

test('retention and terminal TTL remove only job files, including after restart', async t => {
  const directory = workspace(t); let time = 0;
  writeFileSync(join(directory, 'keep.txt'), 'unrelated file');
  const original = queue(t, directory, async () => ({ data:{} }), { now:()=>time, ttl:100, maxRetained:2 });
  const first = original.enqueue(image); await tick(); time++;
  const second = original.enqueue(image); await tick(); time++;
  const third = original.enqueue(image); await tick();
  assert.equal(original.get(first.id), undefined);
  assert.equal(existsSync(join(directory, `${first.id}.json`)), false);
  assert.equal(readdirSync(directory).filter(name => name.endsWith('.json')).length, 2);
  original.close(); time = 103;
  const restarted = queue(t, directory, async () => {}, { now:()=>time, ttl:100, maxRetained:2 });
  assert.equal(restarted.get(second.id), undefined); assert.equal(restarted.get(third.id), undefined);
  assert.deepEqual(readdirSync(directory).filter(name => name !== '.queue-owner.lock'), ['keep.txt']);
  assert.equal(readFileSync(join(directory, 'keep.txt'), 'utf8'), 'unrelated file');
});

test('corrupt records are diagnosed; orphan photos and interrupted temporary files are cleaned', async t => {
  const directory = workspace(t), corrupt = randomUUID(), orphan = randomUUID(), invalid = randomUUID(), notes = [];
  writeFileSync(join(directory, `${corrupt}.json`), '{broken');
  writeFileSync(join(directory, `${corrupt}.photo`), image);
  writeFileSync(join(directory, `${orphan}.photo`), image);
  writeFileSync(join(directory, `.${orphan}.${randomUUID()}.tmp`), image);
  writeFileSync(join(directory, `${invalid}.json`), JSON.stringify({ version:1, id:'../outside', status:'queued', stage:'queued', attempt:0, createdAt:0, updatedAt:0 }));
  writeFileSync(join(directory, 'unrelated.json'), 'leave me alone');
  const restored = queue(t, directory, async () => {}, { onDiagnostic:entry => notes.push(entry) });
  assert.equal(restored.get(corrupt), undefined);
  assert.equal(notes.filter(note => note.code === 'CORRUPT_JOB_SKIPPED').length, 2);
  assert.equal(JSON.stringify(notes).includes(image), false);
  assert.equal(readdirSync(directory).some(name => name.endsWith('.photo') || name.endsWith('.tmp')), false);
  assert.equal(readFileSync(join(directory, 'unrelated.json'), 'utf8'), 'leave me alone');
  assert.equal(existsSync(join(directory, `${corrupt}.json`)), true, 'Corrupt metadata remains available for inspection.');
});

test('a failed disk commit rejects enqueue before acknowledgment or worker invocation', async t => {
  const directory = workspace(t); let calls = 0;
  const original = queue(t, directory, async () => { calls++; });
  unlinkSync(join(directory, '.queue-owner.lock')); rmdirSync(directory); writeFileSync(directory, 'block writes');
  assert.throws(() => original.enqueue(image), error => error.code === 'JOB_STORAGE_FAILURE' && error.status === 503);
  await tick(); assert.equal(calls, 0); assert.equal(original.busy, false);
});

test('normalized crops reject invalid coordinates and queued snapshots cannot mutate worker input', async t => {
  const directory = workspace(t); let received;
  const original = queue(t, directory, async (_, options) => { received = options.crop; return {}; });
  for (const crop of [{x:-.1,y:0,width:1,height:1},{x:0,y:0,width:0,height:1},{x:.5,y:0,width:.6,height:1},{x:0,y:NaN,width:1,height:1},{x:0,y:0,width:1,height:Infinity},{x:0,y:0,width:1,height:1,extra:'no'}]) assert.throws(() => original.enqueue(image, {crop}), error => error.code === 'INVALID_CROP');
  const job = original.enqueue(image, {crop:{x:0,y:0,width:1,height:1}});
  job.crop.width = .3;
  await tick(); assert.equal(received.width, 1);
  assert.equal(JSON.stringify(original.get(job.id)).includes(image), false);
});

test('queue close rejects new work and leaves interrupted jobs resumable on disk', async t => {
  const directory = workspace(t);
  const original = queue(t, directory, async () => { throw new Error('Closed jobs must not run'); });
  const pending = original.enqueue(image); original.close(); await tick();
  assert.throws(() => original.enqueue(image), error => error.code === 'QUEUE_CLOSED');
  assert.equal(diskRecord(directory, pending.id).status, 'queued');
  assert.equal(existsSync(join(directory, `${pending.id}.photo`)), true);
  assert.equal(original.busy, false);
});

test('one queue owns a storage directory; close releases ownership without letting old callers write', t => {
  const directory = workspace(t);
  const original = queue(t, directory, async () => ({}));
  const job = original.enqueue(image);
  assert.throws(() => createJobQueue(async () => ({}), {storageDir:directory}), error => error.code === 'JOB_STORE_IN_USE');
  original.close();
  const replacement = queue(t, directory, async () => ({}));
  assert.throws(() => original.cancel(job.id), error => error.code === 'QUEUE_CLOSED');
  assert.equal(replacement.get(job.id).status, 'queued');
  original.close();
  assert.equal(existsSync(join(directory, '.queue-owner.lock')), true, 'A second close cannot remove the replacement owner lock.');
});

test('a lock left by a terminated process is recovered on restart', t => {
  const directory = workspace(t), child = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  assert.equal(child.status, 0);
  writeFileSync(join(directory, '.queue-owner.lock'), JSON.stringify({version:1,pid:child.pid,token:randomUUID()}));
  const replacement = queue(t, directory, async () => ({}));
  assert.equal(replacement.diagnostics.some(entry => entry.code === 'STALE_OWNER_RECOVERED'), true);
  assert.equal(JSON.parse(readFileSync(join(directory, '.queue-owner.lock'), 'utf8')).pid, process.pid);
});
