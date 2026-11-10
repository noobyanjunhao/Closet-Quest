// Bounded FIFO admission. Work runs once; callers may independently stop waiting.
export function createWorkLimiter({concurrency=2,maxQueued=40,waitMs=4000,message='Shopping is catching up. Try again shortly; your outfit is safe.',code='SHOPPING_CAPACITY'}={}) {
  if(!Number.isInteger(concurrency)||concurrency<1||!Number.isInteger(maxQueued)||maxQueued<0||!Number.isFinite(waitMs)||waitMs<1)throw new RangeError('Invalid work limits.');
  let active=0,peak=0,admitted=0,rejected=0;const queue=[];
  const busy=()=>Object.assign(new Error(message),{status:503,code,retryable:true,retryAfter:5});
  function launch(job){clearTimeout(job.timer);active++;admitted++;peak=Math.max(peak,active);Promise.resolve().then(job.fn).then(job.resolve,job.reject).finally(()=>{active--;if(queue.length)launch(queue.shift());});}
  return {
    run(fn){return new Promise((resolve,reject)=>{
      const job={fn,resolve,reject};if(active<concurrency)return launch(job);
      if(queue.length>=maxQueued){rejected++;return reject(busy());}
      job.timer=setTimeout(()=>{const i=queue.indexOf(job);if(i>=0){queue.splice(i,1);rejected++;reject(busy());}},waitMs);
      queue.push(job);
    });},
    stats:()=>({active,queued:queue.length,peak,admitted,rejected,concurrency,maxQueued,waitMs}),
  };
}

