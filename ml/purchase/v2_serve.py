"""Opt-in loopback candidate. Serialized GPU work, bounded input, no automatic writes."""
import argparse,json,time,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from common import ROOT,sha
from v2_protocol import normalize

def make_handler(extractor,metadata):
    lock=threading.Lock()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def reply(self,status,value):
            data=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers()
            try:self.wfile.write(data)
            except (BrokenPipeError,ConnectionResetError):pass
        def do_GET(self):self.reply(200 if self.path=='/healthz' else 404,{'ready':True,'metadata':metadata} if self.path=='/healthz' else {})
        def do_POST(self):
            if self.path!='/extract':return self.reply(404,{})
            if self.headers.get('Origin'):return self.reply(403,{'error':'Browser access is not supported'})
            try:length=int(self.headers.get('Content-Length','0'))
            except ValueError:return self.reply(400,{'error':'Invalid length'})
            if not 0<length<=52000:return self.reply(413,{'error':'Input limit'})
            if not lock.acquire(blocking=False):return self.reply(429,{'error':'Inference busy'})
            try:
                self.connection.settimeout(5)
                body=json.loads(self.rfile.read(length));text=normalize(body['text']);start=time.perf_counter()
                data,decisions=extractor.extract(text,deadline_seconds=100)
                self.reply(200,{'data':data,'metadata':{**metadata,'latencyMs':round((time.perf_counter()-start)*1000),'sourceLines':len(decisions)}})
            except (ValueError,KeyError,TypeError):self.reply(422,{'error':'Invalid input or ungrounded model output'})
            except TimeoutError:self.reply(504,{'error':'Inference deadline exceeded'})
            except Exception:self.reply(503,{'error':'Local model unavailable'})
            finally:lock.release()
    return Handler

def main():
    from v2_infer import Extractor
    ap=argparse.ArgumentParser();ap.add_argument('--adapter',required=True);ap.add_argument('--port',type=int,default=4182);a=ap.parse_args()
    ex=Extractor(a.adapter)
    metadata={'provider':'tuned-local','model':'Qwen2.5-0.5B-Instruct + purchase-lora-v2','adapterSha256':sha(ROOT/a.adapter/'adapter_model.safetensors'),'promptVersion':'purchase-line-v2','schemaVersion':'1','training':False,'candidate':True}
    print(f'Candidate ready on loopback port {a.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',a.port),make_handler(ex,metadata)).serve_forever()
if __name__=='__main__':main()
