# Durable local photo jobs

Pass `storageDir` to `createJobQueue` to retain local analysis work across process restarts. The standalone API should use an absolute project path to `.local-data/jobs`; the default queue remains in memory for callers that omit this option.

```js
const queue = createJobQueue(recognize, {
  storageDir: resolve('.local-data/jobs'),
  onDiagnostic: entry => console.warn(entry.code, entry.message),
});
const job = queue.enqueue(imageDataUrl, {
  crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 },
});
```

`enqueue`, `get`, and `cancel` keep their synchronous API. A photo file and an atomic metadata record are committed before `enqueue` acknowledges a job. A write error rejects the operation with `JOB_STORAGE_FAILURE` and HTTP status 503; no worker starts for an unacknowledged submission. Each write uses an exclusive temporary file, a file flush, and a rename within the chosen directory. This is process-restart durability, not a transactional database or a guarantee against every hardware/power-loss failure.

Each job owns `<uuid>.json` and, while work is pending, `<uuid>.photo`. The photo contains the original data URL; metadata never embeds it. Optional normalized crop metadata is validated, copied, persisted, and passed to the worker. `x` and `y` must be nonnegative, width/height positive, and the rectangle must stay within the unit square. Omitted or null crops use the full image.

On restart, queued and interrupted processing jobs return to the queue with a fresh per-run retry allowance. Ready results, typed errors, and cancellations remain readable. Cancelled and finished jobs release their photo files. Expired terminal records and the oldest terminal records beyond the retention bound are removed. Active accepted work is never discarded merely to trim retention. TTL applies to terminal jobs, as in the original queue; a long-stopped service can still resume pending work.

Corrupt records are skipped with diagnostics. Recognizable orphan photos and interrupted temporary writes are cleaned using exact file paths under the configured directory. Unrelated files and corrupt metadata are left for inspection. Cleanup uses file unlinking only, with no recursive directory deletion. Snapshots omit private image fields and data URLs, including any accidentally returned by a worker. Up to 50 recent diagnostics are available through `queue.diagnostics`; an optional `onDiagnostic` handler also receives them.

The queue has **one process owner per storage directory**, enforced with an exclusive `.queue-owner.lock` containing a PID and an owner token. A second live owner fails with `JOB_STORE_IN_USE`; an owner PID confirmed to be dead is reclaimed on restart. Stale-owner cleanup is serialized by a short-lived `.queue-recovery.lock` so competing starters cannot remove a replacement owner's lock. Malformed locks and PIDs that cannot be inspected fail closed. If a process was killed in the middle of creating or recovering a lock, stop all local API instances before removing an unreadable owner lock or abandoned recovery lock manually. This is a local-process ownership guard, not a distributed lock.

Call `queue.close()` when the API shuts down or is replaced. It aborts in-process work, prevents late worker/caller writes, and releases its own lock while preserving pending files for the next owner. Do not deliberately run two services against one job folder. A separate `CLOSET_JOB_DIR` can be supplied if independent services are needed.

If a later status/result write fails, the API job reports `JOB_STORAGE_FAILURE`, and the previously committed work/photo remains available for restart recovery. Failed photo cleanup is diagnosed and retried when the store is loaded or the record expires. These files are private local development data and should not be committed, statically served, or included in a public build.

Validation covers queue ordering, retries and cancellation plus disk acknowledgment, ready/error recovery, interrupted processing and queued recovery, crop preservation, image redaction, corrupt-record diagnostics, retention/TTL, safe orphan cleanup, and failed writes.

## Running the application with its API

`npm run dev` serves the development client with the shared API middleware. For a built local application, run:

```text
npm run build
npm run start
```

The standalone server binds to `127.0.0.1:4173` by default and serves the built client and `/api` from the same origin. `PORT` selects another loopback port. Stop the development API first because both use the same durable jobs directory by default. `npm run preview` is Vite's static asset preview only: it does not run the photo, styling, retrieval, or learning API.

The shared API exposes dependency injection for local HTTP tests through `createApi({ services, queueOptions, storageDir })`. Tests substitute model and learning services while exercising the real HTTP router, body limits, origin checks, cancellation and disk queue. `createLocalServer({ distDir, apiOptions })` returns an unbound Node server, so tests can listen on an ephemeral port without touching the app or Ollama ports. Its `shutdown()` method aborts API activity before closing connections.
