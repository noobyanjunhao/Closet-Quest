"""Loopback-only serialized inference for the saved adapter; no network fallback."""
import argparse,json,time,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from common import ROOT,messages,configure,sha
configure()
import torch
from transformers import AutoTokenizer,AutoModelForCausalLM
from peft import PeftModel
from evaluate import parse

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--adapter',default='ml/checkpoints/purchase-lora-v1/adapter');ap.add_argument('--port',type=int,default=4182);a=ap.parse_args()
    torch.set_num_threads(4);base=ROOT/'.model-cache/purchase-base'
    tokenizer=AutoTokenizer.from_pretrained(base,local_files_only=True,trust_remote_code=False)
    model=AutoModelForCausalLM.from_pretrained(base,torch_dtype=torch.bfloat16,local_files_only=True,trust_remote_code=False,attn_implementation='sdpa').to('cuda')
    model=PeftModel.from_pretrained(model,ROOT/a.adapter,local_files_only=True).merge_and_unload();model.eval();model.config.use_cache=True
    metadata={'provider':'tuned-local','model':'Qwen2.5-0.5B-Instruct + purchase-lora-v1','baseRevision':json.loads((ROOT/'ml/purchase/base-manifest.json').read_text())['revision'],'adapterSha256':sha(ROOT/a.adapter/'adapter_model.safetensors'),'promptVersion':'purchase-v1','schemaVersion':'1','training':False}
    lock=threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def reply(self,status,value):
            data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        def do_GET(self):self.reply(200 if self.path=='/healthz' else 404,{'ready':True,'metadata':metadata} if self.path=='/healthz' else {})
        def do_POST(self):
            if self.path!='/extract':return self.reply(404,{})
            if self.headers.get('Origin'):return self.reply(403,{'error':'Browser access is not supported'})
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=52000:return self.reply(413,{'error':'Input limit'})
            if not lock.acquire(blocking=False):return self.reply(429,{'error':'Inference busy'})
            try:
                text=json.loads(self.rfile.read(length))['text']
                if not isinstance(text,str) or len(text)>12000 or len(text.split('\n'))>200:raise ValueError('Input limit')
                inputs=tokenizer.apply_chat_template(messages({'source':text}),tokenize=True,add_generation_prompt=True,return_tensors='pt').to('cuda')
                if inputs.shape[1]+1400>4096:raise ValueError('Context limit')
                start=time.perf_counter()
                with torch.inference_mode():out=model.generate(inputs,attention_mask=torch.ones_like(inputs),max_new_tokens=1400,max_time=110,do_sample=False,pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id)
                tokens=out[0,inputs.shape[1]:]
                if len(tokens)>=1400:raise ValueError('Output truncated')
                self.reply(200,{'data':parse(tokenizer.decode(tokens,skip_special_tokens=True)),'metadata':{**metadata,'latencyMs':round((time.perf_counter()-start)*1000),'tokens':len(tokens)}})
            except Exception as e:self.reply(422,{'error':type(e).__name__})
            finally:lock.release()
    print(f'Adapter serving on loopback port {a.port}',flush=True);ThreadingHTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
if __name__=='__main__':main()
