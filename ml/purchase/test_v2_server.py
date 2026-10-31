import unittest,threading,json,urllib.request,urllib.error
from http.server import ThreadingHTTPServer
from v2_serve import make_handler

class FakeExtractor:
    started=threading.Event()
    release=threading.Event()
    def extract(self,text,deadline_seconds):
        if text=='ungrounded':raise ValueError('private model output')
        if text=='deadline':raise TimeoutError('provider detail')
        if text=='oom':raise RuntimeError('provider detail')
        if text=='block':self.started.set();self.release.wait(3)
        return {'schema_version':'1','items':[],'excluded_lines':[],'warnings':[]},['test']

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(FakeExtractor(),{'candidate':True}))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.url=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.thread.join()
    def post(self,value,headers=None):
        req=urllib.request.Request(self.url+'/extract',json.dumps(value).encode(),headers or {'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def test_health(self):
        with urllib.request.urlopen(self.url+'/healthz') as r:self.assertTrue(json.load(r)['ready'])
    def test_valid_transport(self):
        status,result=self.post({'text':'Tax 2.00'});self.assertEqual(status,200);self.assertTrue(result['metadata']['candidate'])
    def test_browser_is_rejected(self):self.assertEqual(self.post({'text':'tee'},{'Origin':'https://example.com'})[0],403)
    def test_bad_input_rejected(self):
        for body in [{'text':123},{'text':'\0'},{'text':'x'*12001},{'unknown':'tee'},[]]:self.assertEqual(self.post(body)[0],422)
    def test_failed_model_is_not_successful_empty(self):
        status,result=self.post({'text':'ungrounded'});self.assertEqual(status,422);self.assertNotIn('private model output',json.dumps(result))
    def test_deadline_and_provider_failure_are_explicit(self):
        for text,expected in [('deadline',504),('oom',503)]:
            status,result=self.post({'text':text});self.assertEqual(status,expected);self.assertNotIn('provider detail',json.dumps(result))
    def test_gpu_work_is_serialized(self):
        FakeExtractor.started.clear();FakeExtractor.release.clear()
        first=threading.Thread(target=lambda:self.post({'text':'block'}));first.start()
        try:
            self.assertTrue(FakeExtractor.started.wait(2));self.assertEqual(self.post({'text':'second'})[0],429)
        finally:FakeExtractor.release.set();first.join()
        self.assertEqual(self.post({'text':'after release'})[0],200)

if __name__=='__main__':unittest.main()
