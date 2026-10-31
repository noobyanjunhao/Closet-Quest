import {readFileSync,writeFileSync} from 'node:fs';
const root='output/purchase-ml/';
const names={'runtime-parser-test':'Deployed JavaScript parser','base-test':'Untuned Qwen2.5 0.5B','ollama-test':'Existing Qwen3-VL 4B application adapter','adapter-test':'LoRA checkpoint 40'};
const methods=Object.entries(names).map(([directory,name])=>{const m=JSON.parse(readFileSync(`${root}${directory}/metrics.json`,'utf8'));return {name,directory,documents:m.documents,contractValid:m.contractValid,exactGarmentDocuments:m.exactGarmentDocuments,clothingLines:m.clothingLines,fieldExact:m.fieldExact,categoryMacroF1:m.categoryMacroF1,unknownPreservation:m.unknownPreservation,returnWarnings:m.returnWarnings,latencyMs:m.latencyMs};});
const result={datasetSha256:JSON.parse(readFileSync('data/evaluation/purchase-v1/manifest.json','utf8')).files.test.sha256,synthetic:true,methods,notes:['Invalid contract outputs count as empty for usable-item metrics.','Whole-document exactness excludes warnings and exclusion-reason correctness.','Quality-run latency was collected under overlapping GPU load; use serial-latency.json for the small controlled follow-up.','The adapter is not promoted: it still misses garments and the training run stopped on OOM.']};
writeFileSync(`${root}comparison.json`,JSON.stringify(result,null,2));
console.log('Wrote comparison from the four completed metric files.');
