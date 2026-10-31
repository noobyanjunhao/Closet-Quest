import json,time
from common import ROOT,configure,sha
from v2_protocol import messages,assemble,normalize
configure()

def load_data(split):
    path=ROOT/f'data/evaluation/purchase-v2/{split}.jsonl'
    manifest=json.loads((path.parent/'manifest.json').read_text())
    if sha(path)!=manifest['files'][split]['sha256']:raise ValueError('Frozen dataset changed')
    return [json.loads(x) for x in path.read_text(encoding='utf8').splitlines()]

class Extractor:
    def __init__(self,adapter=None,model=None,tokenizer=None):
        import torch
        from transformers import AutoModelForCausalLM,AutoTokenizer
        from peft import PeftModel
        torch.set_num_threads(4);started=time.perf_counter()
        self.tokenizer=tokenizer or AutoTokenizer.from_pretrained(ROOT/'.model-cache/purchase-base',local_files_only=True,trust_remote_code=False)
        self.tokenizer.padding_side='left';self.tokenizer.pad_token=self.tokenizer.eos_token
        if model is None:
            model=AutoModelForCausalLM.from_pretrained(ROOT/'.model-cache/purchase-base',torch_dtype=torch.bfloat16,local_files_only=True,trust_remote_code=False,attn_implementation='sdpa').to('cuda')
            if adapter:model=PeftModel.from_pretrained(model,ROOT/adapter,local_files_only=True).merge_and_unload()
        self.model=model;self.model.eval();self.model.config.use_cache=True
        self.load_ms=(time.perf_counter()-started)*1000

    def extract(self,source,deadline_seconds=100):
        import torch
        source=normalize(source);lines=source.split('\n');decisions=[];raw=[];started=time.perf_counter()
        for start in range(0,len(lines),8):
            remaining=deadline_seconds-(time.perf_counter()-started)
            if remaining<=0:raise TimeoutError('Extraction deadline')
            prompts=[self.tokenizer.apply_chat_template(messages(line),tokenize=False,add_generation_prompt=True) for line in lines[start:start+8]]
            inputs=self.tokenizer(prompts,return_tensors='pt',padding=True,add_special_tokens=False).to('cuda')
            if inputs.input_ids.shape[1]>512:raise ValueError('Line context limit; split long lines before retrying')
            with torch.inference_mode():
                output=self.model.generate(**inputs,max_new_tokens=192,max_time=remaining,do_sample=False,pad_token_id=self.tokenizer.pad_token_id)
            for value in output[:,inputs.input_ids.shape[1]:]:
                # Each completion must end with EOS; deadline/token-cap truncation is a failure.
                if self.tokenizer.eos_token_id not in value.tolist():raise ValueError('Decision output truncated')
                text=self.tokenizer.decode(value,skip_special_tokens=True);raw.append(text)
                try:decisions.append(json.loads(text))
                except ValueError as error:
                    error.decisions=raw;raise
        try:return assemble(source,decisions),raw
        except ValueError as error:
            error.decisions=raw;raise

def evaluate(extractor,data,out):
    from common import validate_records
    from evaluate import score
    out.mkdir(parents=True,exist_ok=True);records=[]
    for row in data:
        started=time.perf_counter();r={'id':row['id'],'prediction':None}
        try:r['prediction'],r['decisions']=extractor.extract(row['source'])
        except Exception as e:r['error']=str(e);r['decisions']=getattr(e,'decisions',[])
        r['elapsedMs']=(time.perf_counter()-started)*1000;records.append(r)
        (out/'raw.json').write_text(json.dumps(records,indent=2,ensure_ascii=False),encoding='utf8')
        print(row['id'],round(r['elapsedMs']),r.get('error','generated'),flush=True)
    checks=validate_records([{'id':r['id'],'source':r['source'],'prediction':p['prediction']} for r,p in zip(data,records)],out/'validation-input.jsonl')
    result=score(data,records,checks);(out/'metrics.json').write_text(json.dumps(result,indent=2),encoding='utf8');return result

if __name__=='__main__':
    import argparse,torch
    from common import rows
    ap=argparse.ArgumentParser();choice=ap.add_mutually_exclusive_group(required=True);choice.add_argument('--adapter');choice.add_argument('--base',action='store_true');ap.add_argument('--split',choices=['validation','test','regression'],required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
    ex=Extractor(a.adapter);torch.cuda.reset_peak_memory_stats();data=rows('test') if a.split=='regression' else load_data(a.split)
    result=evaluate(ex,data,ROOT/a.out)
    (ROOT/a.out/'manifest.json').write_text(json.dumps({'adapterSha256':sha(ROOT/a.adapter/'adapter_model.safetensors') if a.adapter else None,'protocolSha256':sha(ROOT/'ml/purchase/v2_protocol.py'),'split':a.split,'modelLoadMs':ex.load_ms,'peakAllocatedBytes':torch.cuda.max_memory_allocated(),'peakReservedBytes':torch.cuda.max_memory_reserved(),'batchLines':8,'maxNewTokens':192,'singleGpuNoConcurrentInference':True},indent=2),encoding='utf8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['failures','perCategory']},indent=2))
