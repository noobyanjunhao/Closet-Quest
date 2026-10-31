"""Frozen generation protocol; every attempted example remains in raw results."""
import argparse,json,time,re,statistics
from pathlib import Path
from common import ROOT,rows,messages,configure,sha,validate_records,FIELDS,CATEGORIES
configure()

def parse(text):
    value=text.strip()
    if value.startswith('```'):
        value=re.sub(r'^```(?:json)?\s*','',value);value=re.sub(r'\s*```$','',value)
    return json.loads(value)

def rules(source):
    # A deliberately simple general parser: vocabulary/field regex, no dataset IDs.
    types={'tee':'Top','shirt':'Top','cardigan':'Top','trousers':'Bottom','jeans':'Bottom','skirt':'Bottom','dress':'Dress','sneakers':'Shoes','loafers':'Shoes','boots':'Shoes','coat':'Outerwear','jacket':'Outerwear','cap':'Accessory','scarf':'Accessory'}
    items=[];excluded=[]
    for n,line in enumerate(source.split('\n'),1):
        lid=f'L{n}';lower=line.lower()
        reason=next((r for k,r in [('ignore','instruction'),('shipping','shipping'),('tax','tax'),('discount','discount'),('gift card','non_clothing'),('mug','non_clothing'),('merchant','header')] if k in lower),None)
        if reason:excluded.append({'line_id':lid,'reason':reason});continue
        match=next(((k,v) for k,v in types.items() if re.search(r'\b'+k+r'\b',lower)),None)
        if not match:excluded.append({'line_id':lid,'reason':'ambiguous'});continue
        name=line.split(',')[0].split('|')[0].strip()
        fields={'description':name,'category':match[1]}
        for field in ['color','size','brand','quantity']:
            m=re.search(r'\b'+field+r'\s*:\s*([\w-]+)',line,re.I)
            fields[field]=(int(m[1]) if field=='quantity' and m[1].isdigit() else m[1]) if m else None
        evidence=[{'field':'description','line_id':lid,'quote':name},{'field':'category','line_id':lid,'quote':line[lower.index(match[0]):lower.index(match[0])+len(match[0])]}]+[{'field':k,'line_id':lid,'quote':str(fields[k])} for k in ['color','size','brand','quantity'] if fields[k] is not None]
        items.append({**fields,'source_line_ids':[lid],'review_reasons':['Confirm return ownership'] if 'return' in lower else [],'evidence':evidence})
    return {'schema_version':'1','items':items,'excluded_lines':excluded,'warnings':[]}

def score(data,records,checks):
    checked={c['id']:c for c in checks};raw={r['id']:r for r in records}
    tp=fp=fn=correct=goldfields=unknown=unknown_ok=unsupported=nonnull=exact=valid=jsonvalid=return_ok=return_n=proof_ok=proof_n=0
    cats={c:{'tp':0,'fp':0,'fn':0} for c in CATEGORIES};failures=[];bycase={};lat=[]
    for row in data:
        r=raw[row['id']];p=r.get('prediction');jsonvalid+=isinstance(p,dict);ok=checked[row['id']]['valid'];valid+=ok;lat.append(r['elapsedMs'])
        pred_items=p.get('items',[]) if isinstance(p,dict) and isinstance(p.get('items'),list) else []
        source={f'L{i+1}':s for i,s in enumerate(row['source'].split('\n'))}
        for it in pred_items:
            if not isinstance(it,dict):continue
            for e in it.get('evidence',[]) if isinstance(it.get('evidence'),list) else []:
                proof_n+=1;proof_ok+=isinstance(e,dict) and isinstance(e.get('quote'),str) and bool(e['quote']) and e['quote'] in source.get(e.get('line_id'),'')
        gold={i['source_line_ids'][0]:i for i in row['target']['items']}
        # Invalid results are unusable in the application and count as empty.
        predicted={};duplicates=0
        for it in pred_items if ok else []:
            key=it['source_line_ids'][0]
            if key in predicted:duplicates+=1
            predicted[key]=it
        common=set(gold)&set(predicted);tp+=len(common);fp+=len(set(predicted)-set(gold))+duplicates;fn+=len(set(gold)-set(predicted))
        rowcorrect=0
        for lid,g in gold.items():
            pitem=predicted.get(lid,{})
            for f in FIELDS:
                goldfields+=1;hit=f in pitem and pitem[f]==g[f];correct+=hit;rowcorrect+=hit
                if g[f] is None:unknown+=1;unknown_ok+=hit
                if pitem.get(f) is not None and f!='category':nonnull+=1;unsupported+=str(pitem[f]).lower() not in source[lid].lower()
            predcat=pitem.get('category')
            if predcat==g['category']:cats[g['category']]['tp']+=1
            else:
                cats[g['category']]['fn']+=1
                if predcat in cats:cats[predcat]['fp']+=1
        for lid,i in predicted.items():
            if lid not in gold and i['category'] in cats:cats[i['category']]['fp']+=1
        exactrow=ok and rowcorrect==len(gold)*len(FIELDS) and set(predicted)==set(gold) and duplicates==0
        exact+=exactrow
        if row['case']=='returned':
            return_n+=1;return_ok+=ok and all(any('return' in str(t).lower() for t in predicted.get(lid,{}).get('review_reasons',[])) for lid in gold)
        bycase.setdefault(row['case'],{'n':0,'contractValid':0,'exact':0});bycase[row['case']]['n']+=1;bycase[row['case']]['contractValid']+=ok;bycase[row['case']]['exact']+=exactrow
        if not exactrow:failures.append({'id':row['id'],'case':row['case'],'contractValid':ok,'error':r.get('error') or checked[row['id']].get('error'),'correctFields':rowcorrect,'expectedFields':len(gold)*6,'missingLines':sorted(set(gold)-set(predicted)),'extraLines':sorted(set(predicted)-set(gold))})
    for c in cats.values():c['f1']=2*c['tp']/max(1,2*c['tp']+c['fp']+c['fn'])
    lat.sort()
    return {'documents':len(data),'jsonObjects':jsonvalid,'contractValid':valid,'exactGarmentDocuments':exact,'clothingLines':{'tp':tp,'fp':fp,'fn':fn,'precision':tp/max(1,tp+fp),'recall':tp/max(1,tp+fn)},'fieldExact':{'correct':correct,'total':goldfields,'rate':correct/max(1,goldfields)},'categoryMacroF1':sum(c['f1'] for c in cats.values())/len(cats),'perCategory':cats,'unknownPreservation':{'correct':unknown_ok,'total':unknown},'unsupportedFieldRate':{'unsupported':unsupported,'nonNullPredictedFieldsOnMatchedLines':nonnull},'evidenceQuotes':{'validSubstring':proof_ok,'total':proof_n},'returnWarnings':{'correct':return_ok,'total':return_n},'latencyMs':{'median':statistics.median(lat),'p95':lat[min(len(lat)-1,int(len(lat)*.95))],'total':sum(lat)},'byCase':bycase,'failures':failures,'metricNotes':'Invalid contract results count as empty for usable-item/field metrics. Quote substring validity is not semantic evidence correctness. Unsupported fields denominator excludes category and unmatched/invalid items; inspect failures too.'}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--mode',choices=['rules','base','adapter','records'],required=True);ap.add_argument('--split',choices=['validation','test'],default='test');ap.add_argument('--adapter',default='ml/checkpoints/purchase-lora-v1/adapter');ap.add_argument('--records');ap.add_argument('--out',required=True);ap.add_argument('--limit',type=int);a=ap.parse_args()
    data=rows(a.split);data=data[:a.limit] if a.limit else data;out=ROOT/a.out;out.mkdir(parents=True,exist_ok=True);records=[]
    manifest={'mode':a.mode,'split':a.split,'count':len(data),'datasetSha256':sha(ROOT/f'data/evaluation/purchase-v1/{a.split}.jsonl'),'promptSha256':sha(ROOT/'ml/purchase/prompt.json'),'generation':{'do_sample':False,'max_new_tokens':1400,'seed':17,'grammarConstrained':False},'coldWarm':'First request includes initial GPU kernels; model load timed separately; no result cache','synthetic':True}
    if a.mode in ['base','adapter']:
        import torch
        from transformers import AutoTokenizer,AutoModelForCausalLM,set_seed
        from peft import PeftModel
        set_seed(17);torch.set_num_threads(4);base=ROOT/'.model-cache/purchase-base';start=time.perf_counter()
        tokenizer=AutoTokenizer.from_pretrained(base,local_files_only=True,trust_remote_code=False)
        model=AutoModelForCausalLM.from_pretrained(base,torch_dtype=torch.bfloat16,local_files_only=True,trust_remote_code=False,attn_implementation='sdpa').to('cuda')
        if a.mode=='adapter':model=PeftModel.from_pretrained(model,ROOT/a.adapter,local_files_only=True).merge_and_unload();manifest['adapterSha256']=sha(ROOT/a.adapter/'adapter_model.safetensors')
        model.eval();model.config.use_cache=True;manifest['loadMs']=(time.perf_counter()-start)*1000;manifest['gpu']=torch.cuda.get_device_name();manifest['base']=json.loads((ROOT/'ml/purchase/base-manifest.json').read_text());torch.cuda.reset_peak_memory_stats()
    if a.mode=='records':records=json.loads(Path(a.records).read_text(encoding='utf8'))
    else:
        for row in data:
            start=time.perf_counter();record={'id':row['id'],'prediction':None}
            try:
                if a.mode=='rules':record['prediction']=rules(row['source'])
                else:
                    inputs=tokenizer.apply_chat_template(messages(row),tokenize=True,add_generation_prompt=True,return_tensors='pt').to('cuda')
                    if inputs.shape[1]+1400>4096:raise ValueError('No silent truncation')
                    with torch.inference_mode():output=model.generate(inputs,attention_mask=torch.ones_like(inputs),max_new_tokens=1400,do_sample=False,pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id)
                    tokens=output[0,inputs.shape[1]:];record['generatedTokens']=len(tokens);record['raw']=tokenizer.decode(tokens,skip_special_tokens=True)
                    if len(tokens)>=1400:raise ValueError('Output token cap reached')
                    record['prediction']=parse(record['raw'])
            except Exception as e:record['error']=str(e)
            record['elapsedMs']=(time.perf_counter()-start)*1000;records.append(record)
            (out/'raw.json').write_text(json.dumps(records,indent=2,ensure_ascii=False),encoding='utf8');print(row['id'],round(record['elapsedMs']),record.get('error','generated'),flush=True)
    paired=[{'id':r['id'],'source':r['source'],'prediction':next(x for x in records if x['id']==r['id']).get('prediction')} for r in data]
    checks=validate_records(paired,out/'validation-input.jsonl');result=score(data,records,checks)
    if a.mode in ['base','adapter']:manifest['peakAllocatedBytes']=torch.cuda.max_memory_allocated()
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8');(out/'metrics.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in result.items() if k not in ['failures','perCategory']},indent=2))
if __name__=='__main__':main()
