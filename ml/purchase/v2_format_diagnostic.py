"""Post-hoc diagnosis of retained base outputs, without changing primary scores."""
import json
from common import ROOT
from v2_infer import load_data
from v2_protocol import assemble
from evaluate import parse

def main():
    folder=ROOT/'output/purchase-ml-v2';records=json.loads((folder/'base-line-test/raw.json').read_text(encoding='utf8'));sources={r['id']:r['source'].split('\n') for r in load_data('test')};details=[]
    for r in records:
        observed=r.get('decisions',[]);errors=[];parsed=0
        for n,raw in enumerate(observed):
            try:
                decision=parse(raw);parsed+=1
                assemble(sources[r['id']][n],[decision])
            except (ValueError,TypeError) as e:errors.append({'observedLine':n+1,'error':str(e)})
        details.append({'id':r['id'],'observedDecisions':len(observed),'parsedAfterFenceRemoval':parsed,'stillInvalid':errors})
    result={'documents':len(records),'documentsWithObservedContractErrorAfterFenceRemoval':sum(bool(r['stillInvalid']) for r in details),'observedDecisions':sum(r['observedDecisions'] for r in details),'parsedAfterFenceRemoval':sum(r['parsedAfterFenceRemoval'] for r in details),'notes':'Diagnostic only. The strict extractor stops recording at its first malformed decision, so later line outputs are unavailable for these failures. This checks retained decisions, not a tolerant full-receipt accuracy score. It does not change the frozen primary scores or train the model.','details':details}
    (folder/'base-format-diagnostic.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in result.items() if k!='details'},indent=2))
if __name__=='__main__':main()
