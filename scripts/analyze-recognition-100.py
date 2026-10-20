"""Audit the complete paired run, preserving every failed attempt in denominators."""
import csv
import hashlib
import json
import math
import random
import statistics
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'output/recognition-100'
raw=(D/'both-100.json').read_bytes()
run=json.loads(raw)
manifest_bytes=(ROOT/'data/evaluation/recognition-100/manifest.json').read_bytes()
manifest=json.loads(manifest_bytes)
assert run['complete'] and run['completedTasks']==run['plannedTasks']==200
assert hashlib.sha256(manifest_bytes).hexdigest()==run['manifestSha256']
images={im['id']:im for im in manifest['images']}
rows=run['rows']
assert len(rows)==200 and len({(r['imageId'],r['mode']) for r in rows})==200
assert {r['imageId'] for r in rows}==set(images)
CATEGORIES=['Top','Bottom','Shoes','Dress','Outerwear','Accessory']
prepared=[]
for row in rows:
    assert row['expected']==images[row['imageId']]['expected']
    assert row['mode'] in ['single','multiple']
    if row['status']=='completed': assert row['actualModel']==run['model']
    expected=set(row['expected'])
    predicted=set(row['predicted']) if row['status']=='completed' else set()
    assert predicted<=set(CATEGORIES)
    prepared.append({**row,'tp':len(expected&predicted),'fp':len(predicted-expected),'fn':len(expected-predicted),
        'missing':sorted(expected-predicted),'extra':sorted(predicted-expected),
        'exact':row['status']=='completed' and expected==predicted,
        'successfulWithin20s':row['status']=='completed' and row['latencyMs']<20000})

def frac(a,b): return {'numerator':a,'denominator':b,'value':a/b if b else None}
def percentile(values,p): return sorted(values)[max(0,math.ceil(len(values)*p)-1)]
summary={}
for mode in ['single','multiple']:
    selected=[r for r in prepared if r['mode']==mode]
    assert len(selected)==100
    tp=sum(r['tp'] for r in selected);fp=sum(r['fp'] for r in selected);fn=sum(r['fn'] for r in selected)
    completed=[r for r in selected if r['status']=='completed']
    failure_codes=dict(Counter(r.get('code','UNKNOWN') for r in selected if r['status']!='completed'))
    cats={}
    for c in CATEGORIES:
        support=sum(c in r['expected'] for r in selected)
        found=sum(c in r['expected'] and r['status']=='completed' and c in r['predicted'] for r in selected)
        predicted=sum(r['status']=='completed' and c in r['predicted'] for r in selected)
        cats[c]={'precision':frac(found,predicted),'recall':frac(found,support),'falsePositives':predicted-found,'falseNegatives':support-found}
    hats=[r for r in selected if r['annotatedHat']]
    summary[mode]={'attempts':100,'completion':frac(len(completed),100),'failureRate':frac(100-len(completed),100),
        'precision':frac(tp,tp+fp),'recall':frac(tp,tp+fn),'microF1':2*tp/(2*tp+fp+fn),
        'exactSet':frac(sum(r['exact'] for r in selected),100),'within20s':frac(sum(r['successfulWithin20s'] for r in selected),100),
        'hatRecall':frac(sum(r['status']=='completed' and r.get('hatDetected',False) for r in hats),len(hats)),
        'medianLatencyMs':statistics.median(r['latencyMs'] for r in selected),'p95LatencyMs':percentile([r['latencyMs'] for r in selected],.95),
        'completedMedianLatencyMs':statistics.median(r['latencyMs'] for r in completed) if completed else None,
        'failureCodes':failure_codes,'missedByCategory':dict(Counter(c for r in selected for c in r['missing'])),
        'extraByCategory':dict(Counter(c for r in selected for c in r['extra'])),
        'missingFromFailedRequests':sum(len(r['expected']) for r in selected if r['status']!='completed'),
        'extraAccessoryWithOnlyJewelryPredicted':sum('Accessory' in r['extra'] and all(p['itemType']=='Jewelry' for p in r.get('pieces',[]) if p['category']=='Accessory') for r in completed),
        'missingTopWithExtraDress':sum('Top' in r['missing'] and 'Dress' in r['extra'] for r in completed),
        'missingDressWithExtraTop':sum('Dress' in r['missing'] and 'Top' in r['extra'] for r in completed),
        'responsesAtSixPieceCap':sum(len(r.get('pieces',[]))==6 for r in completed),
        'missingFromCompletedRequests':sum(r['fn'] for r in completed),'perCategory':cats}
    assert abs(summary[mode]['recall']['value']-run['summary'][mode]['microRecall'])<1e-12
    assert abs(summary[mode]['microF1']-run['summary'][mode]['microF1'])<1e-12
    assert abs(summary[mode]['precision']['value']-run['summary'][mode]['microPrecision'])<1e-12
    assert summary[mode]['exactSet']['numerator']==run['summary'][mode]['exactSetMatches']
    assert summary[mode]['completion']['numerator']==run['summary'][mode]['completed']

by_id={image_id:{r['mode']:r for r in prepared if r['imageId']==image_id} for image_id in images}
pair_counts=Counter()
for pair in by_id.values():
    a,b=pair['single'],pair['multiple']
    pair_counts['multi_more_categories' if b['tp']>a['tp'] else 'single_more_categories' if a['tp']>b['tp'] else 'same_category_coverage']+=1
    pair_counts['both_exact' if a['exact'] and b['exact'] else 'multiple_only_exact' if b['exact'] else 'single_only_exact' if a['exact'] else 'neither_exact']+=1

rng=random.Random(20261020)
pairs=list(by_id.values());recall_deltas=[];f1_deltas=[]
for _ in range(10000):
    chosen=rng.choices(pairs,k=100)
    metrics={}
    for mode in ['single','multiple']:
        tp=sum(p[mode]['tp'] for p in chosen);fp=sum(p[mode]['fp'] for p in chosen);fn=sum(p[mode]['fn'] for p in chosen)
        metrics[mode]=(tp/(tp+fn),2*tp/(2*tp+fp+fn))
    recall_deltas.append(metrics['multiple'][0]-metrics['single'][0])
    f1_deltas.append(metrics['multiple'][1]-metrics['single'][1])
interval=lambda values:[percentile(values,.025),percentile(values,.975)]

failures=[{k:r.get(k) for k in ['imageId','mode','code','latencyMs','expected','stratum']} for r in prepared if r['status']!='completed']
error_cases=sorted([r for r in prepared if r['mode']=='multiple' and r['status']=='completed' and (r['fn'] or r['fp'])],key=lambda r:(-(r['fn']+r['fp']),r['imageId']))
sensitivity={}
for mode in ['single','multiple']:
    tp=fp=fn=exact=0
    for row in prepared:
        if row['mode']!=mode:continue
        predicted={p['category'] for p in row.get('pieces',[]) if p['itemType']!='Jewelry'} if row['status']=='completed' else set()
        expected=set(row['expected'])
        tp+=len(predicted&expected);fp+=len(predicted-expected);fn+=len(expected-predicted)
        exact+=row['status']=='completed' and predicted==expected
    sensitivity[mode]={'precision':frac(tp,tp+fp),'recall':frac(tp,tp+fn),'microF1':2*tp/(2*tp+fp+fn),'exactSet':frac(exact,100)}
analysis={'measuredAt':run['measuredAt'],'resultSha256':hashlib.sha256(raw).hexdigest(),'manifestSha256':run['manifestSha256'],
    'model':run['model'],'images':100,'attempts':200,'annotatedGarmentInstances':sum(len(im['instances']) for im in images.values()),
    'annotatedCategoryOccurrences':sum(len(im['expected']) for im in images.values()),'humanParticipants':0,'summary':summary,
    'paired':dict(pair_counts),'pairedBootstrap':{'replicates':10000,'seed':20261020,'unit':'image; both modes resampled together','recallGain95CI':interval(recall_deltas),'microF1Gain95CI':interval(f1_deltas)},
    'postHocSensitivity':{'rule':'Exclude predictions whose itemType is Jewelry, which has no Fashionpedia main category. This was chosen after inspecting mismatches and is not the primary score; original labels and predictions remain unchanged.','summary':sensitivity},
    'failures':failures,'completedErrorCases':[{k:r.get(k) for k in ['imageId','expected','predicted','missing','extra','latencyMs','pieces']} for r in error_cases],
    'interpretationLimits':['Single mode is designed for one item; this is a workflow comparison, not a fair contest between equal-capacity detectors.','Multiple uses high image detail, 4096 output tokens and a six-detection cap; single uses low detail and 1200 tokens.','No manual ground-truth corrections were made after predictions.','Failure codes identify pipeline rejection classes, not necessarily a unique root cause; failed raw outputs were not retained.','Category-set recall is not per-garment detection accuracy or user acceptance.','Public data may have been seen during model training; only two hat images.','Jewelry is supported by the app but absent from the dataset main-category ontology; visible unlabeled bottoms were also found during diagnostic review. Extra labels are disagreements with annotations, not necessarily hallucinations.']}
(D/'analysis.json').write_text(json.dumps(analysis,indent=2)+'\n')
rate=lambda value:f"{value['numerator']}/{value['denominator']} ({100*value['value']:.1f}%)" if value['value'] is not None else 'Not estimable'
a,b=summary['single'],summary['multiple']
lines=['# Recognition on 100 photos: results and failure analysis','',
    f"Completed {run['measuredAt']}. Model: {run['model']}, Fast profile. All 200 first attempts are retained, including failures. The one-photo canary is separate and is not pooled into this run.",'',
    '## Primary comparison against the frozen annotations','',
    '| Metric | Single-piece baseline | Multi-piece workflow |','| --- | --- | --- |']
for title,key in [('Precision','precision'),('Recall','recall'),('Exact category-set match','exactSet'),('Completion','completion'),('Successful within 20 seconds','within20s'),('Hat recall','hatRecall')]:
    lines.append(f"| {title} | {rate(a[key])} | {rate(b[key])} |")
lines.extend([f"| Micro F1 | {a['microF1']:.4f} | {b['microF1']:.4f} |",
    f"| Median / p95 latency | {a['medianLatencyMs']/1000:.2f} / {a['p95LatencyMs']/1000:.2f} s | {b['medianLatencyMs']/1000:.2f} / {b['p95LatencyMs']/1000:.2f} s |",'',
    f"Recall gain: {100*(b['recall']['value']-a['recall']['value']):.1f} percentage points. Paired image-bootstrap 95% interval: {100*interval(recall_deltas)[0]:.1f} to {100*interval(recall_deltas)[1]:.1f} points (10,000 resamples, fixed seed). This interval describes uncertainty within this selected dataset, not a representative user population.",'',
    f"Multi-piece found more correct categories on {pair_counts['multi_more_categories']}/100 photos, single-piece on {pair_counts['single_more_categories']}/100, and coverage tied on {pair_counts['same_category_coverage']}/100.",'',
    '## Failed requests','',
    '| Image ID | Mode | Saved error code | Seconds |','| --- | --- | --- | --- |'])
for row in failures:lines.append(f"| {row['imageId']} | {row['mode']} | {row['code']} | {row['latencyMs']/1000:.2f} |")
if not failures:lines.append('| None | - | - | - |')
lines.extend(['','These are pipeline failures. AMBIGUOUS_ITEM means the validator could not accept an observation as a clear supported item. INVALID_SCENE_RESPONSE identifies invalid scene structure or box geometry, but the saved code alone cannot distinguish them. Other codes must be read literally; none should be relabeled as model hallucination without the rejected response. Failed raw responses were not retained. No failed request was silently retried.',
    f"In multi-piece mode, {b['missingFromFailedRequests']} missed category occurrences come from failed requests and {b['missingFromCompletedRequests']} from completed responses.",'',
    '## Completed responses and annotation disagreements','',
    '| Category | Single recall | Multi recall | Multi missing | Multi extra |','| --- | --- | --- | --- | --- |'])
for c in CATEGORIES:
    q=b['perCategory'][c]
    lines.append(f"| {c} | {rate(a['perCategory'][c]['recall'])} | {rate(q['recall'])} | {q['falseNegatives']} | {q['falsePositives']} |")
lines.extend(['','Diagnostic visual review found:',
    '- Image 9656: matching top/skirt were represented as Dress. This is a garment-boundary/label disagreement.',
    '- Image 17091: a long red top over trousers was called Dress. Long-top versus dress ambiguity needs expert adjudication.',
    '- Image 9914: jeans are visible but the supplied annotations contain only a shirt; the model also reports a visible necklace as Jewelry.',
    '- Image 10471: shorts are visible beneath the top but absent from the supplied annotations.',
    '',
    f"{b['extraAccessoryWithOnlyJewelryPredicted']} multi-piece photos have an extra Accessory label whose accessory predictions are all Jewelry. Jewelry is supported by the app but absent from the dataset main-category ontology. Scores remain agreement with the published labels; extra labels are not all verified model inventions.",
    '',
    'The observations above are assistant visual inspection, not independent expert relabeling. The original labels were not changed. All completed-response mismatches are listed in analysis.json and results.csv.',
    f"Across all 100 multi-piece attempts, {b['missingTopWithExtraDress']} completed responses combine a missing Top with an extra Dress, and {b['missingDressWithExtraTop']} show the reverse. These are category-set co-occurrences, not matched per-instance confusion counts. {b['responsesAtSixPieceCap']} completed responses return the six-piece maximum; reaching that cap does not itself prove an omission.",
    '',
    '## Exploratory taxonomy sensitivity (not the primary result)','',
    'After noticing the taxonomy mismatch, we recomputed scores with only Jewelry predictions excluded. This post-hoc analysis is diagnostic, not a replacement headline or a preregistered metric.',
    '',
    '| Mode | Precision without Jewelry | Recall without Jewelry | F1 |','| --- | --- | --- | --- |'])
for mode in ['single','multiple']:
    v=sensitivity[mode];lines.append(f"| {mode} | {rate(v['precision'])} | {rate(v['recall'])} | {v['microF1']:.4f} |")
lines.extend(['','## Improvement priorities','',
    '1. Extend the existing per-piece ambiguity handling to recover valid pieces from a scene containing a malformed entry, without accepting an invalid box. Record bounded diagnostic details for future failures, with appropriate retention controls. Test this behavior on a new set; this run cannot identify which validation check caused a saved scene-error code.',
    '2. Obtain expert-adjudicated labels aligned to the app taxonomy. Include jewelry and all visible pieces; add long-top/dress and coordinated-separates examples. Keep this completed test fixed, and validate changes on a new set.',
    '3. Evaluate more hats, crowded scenes and unseen phone photos. Two hat positives cannot establish reliable hat accuracy. The six-detection cap and category-set scoring can conceal missing instances.',
    '4. Measure user correction seconds, outfit acceptance and upload-to-result latency. Dataset recognition and synthetic preference recovery do not establish human, business or environmental benefit.',
    '',
    'The single-piece baseline is intentionally limited to one target and uses less image detail/output budget. The comparison evaluates the two application workflows. It does not isolate a prompt effect or prove superiority to another multi-object detector.',
    '',
    'Sources and reproducibility: data/evaluation/recognition-100/manifest.json retains official Fashionpedia source URLs, licenses and labels. provenance.json records the evaluated source and model settings. Raw outcomes: both-100.json. No dataset photographs or credentials are included in the submission-results archive.'])
(D/'failure-analysis.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
with (D/'results.csv').open('w',newline='',encoding='utf-8') as handle:
    fields=['imageId','mode','status','code','expected','predicted','tp','fp','fn','exact','missing','extra','latencyMs','successfulWithin20s','annotatedHat','hatDetected']
    writer=csv.DictWriter(handle,fieldnames=fields);writer.writeheader()
    for row in prepared:writer.writerow({k:'|'.join(row.get(k,[])) if k in ['expected','predicted','missing','extra'] else row.get(k,'') for k in fields})
print(json.dumps({k:analysis[k] for k in ['images','attempts','annotatedCategoryOccurrences','summary','paired','pairedBootstrap']},indent=2))
