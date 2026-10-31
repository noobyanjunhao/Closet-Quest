"""Reproducible paired counts and receipt-cluster bootstrap, no discarded failures."""
import json,random,statistics
from common import ROOT,sha
from v2_infer import load_data

OUT=ROOT/'output/purchase-ml-v2'
def read(path):return json.loads(path.read_text(encoding='utf8'))
def summarize():
    methods={name:read(OUT/f'{name}/metrics.json') for name in ['runtime-parser-test','base-line-test','v1-on-new-test','adapter-test','adapter-regression']}
    data=load_data('test');before=methods['v1-on-new-test'];after=methods['adapter-test']
    def per_document(name):
        records={r['id']:r for r in read(OUT/f'{name}/raw.json')}
        checks={r['id']:r['valid'] for r in read(OUT/f'{name}/validation-input.validation.json')}
        values=[]
        for row in data:
            expected={i['source_line_ids'][0] for i in row['target']['items']};r=records[row['id']]
            predicted={i['source_line_ids'][0] for i in r['prediction']['items']} if checks[row['id']] else set()
            values.append((len(expected&predicted),len(expected)))
        return values
    old,new=per_document('v1-on-new-test'),per_document('adapter-test');rng=random.Random(31029);draws=[]
    for _ in range(10000):
        ix=[rng.randrange(len(data)) for _ in data];den=sum(new[i][1] for i in ix)
        if den:draws.append(sum(new[i][0]-old[i][0] for i in ix)/den)
    draws.sort()
    result={'methods':methods,'pairedRecallDifference':{'point':after['clothingLines']['recall']-before['clothingLines']['recall'],'bootstrap95Percentile':[draws[int(.025*len(draws))],draws[int(.975*len(draws))]],'resamplingUnit':'receipt','resamples':10000,'seed':31029,'scope':'Uncertainty within this synthetic benchmark only; not a population or human-user confidence interval'},'training':read(OUT/'training/result.json'),'robustness':read(OUT/'robustness/result.json'),'files':{name:{'metricsSha256':sha(OUT/f'{name}/metrics.json')} for name in methods}}
    (OUT/'comparison.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf8')
    print(json.dumps({name:{k:m[k] for k in ['documents','contractValid','exactGarmentDocuments','clothingLines','fieldExact','latencyMs']} for name,m in methods.items()},indent=2))
if __name__=='__main__':summarize()
