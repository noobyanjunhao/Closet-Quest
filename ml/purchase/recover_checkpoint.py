"""Preserve a real saved checkpoint after the bounded run's OOM; never hide failure."""
import json,shutil,hashlib
from pathlib import Path
from common import ROOT,sha
from safetensors.torch import load_file
import torch
run=ROOT/'ml/checkpoints/purchase-lora-v1';checkpoint=run/'checkpoint-40';adapter=run/'adapter'
state=json.loads((checkpoint/'trainer_state.json').read_text())
assert state['global_step']==40 and state['best_global_step']==40
adapter.mkdir(exist_ok=True)
for name in ['adapter_model.safetensors','adapter_config.json','README.md']:
    shutil.copy2(checkpoint/name,adapter/name)
tensors=load_file(adapter/'adapter_model.safetensors');assert all(torch.isfinite(x).all() for x in tensors.values())
out=ROOT/'output/purchase-ml/training';out.mkdir(parents=True,exist_ok=True)
shutil.copy2(ROOT/'.local-data/purchase-train.log',out/'training-log.txt')
record={'status':'stopped_on_cuda_out_of_memory','plannedSteps':120,'lastProgressStep':71,'selectedSavedCheckpointStep':40,'selection':'Only completed validation checkpoint; no test feedback used','validationLoss':state['best_metric'],'epochAtCheckpoint':state['epoch'],'history':state['log_history'],'base':json.loads((ROOT/'ml/purchase/base-manifest.json').read_text()),'datasetManifestSha256':sha(ROOT/'data/evaluation/purchase-v1/manifest.json'),'promptSha256':sha(ROOT/'ml/purchase/prompt.json'),'adapterSha256':sha(adapter/'adapter_model.safetensors'),'adapterBytes':(adapter/'adapter_model.safetensors').stat().st_size,'trainableParameters':sum(t.numel() for t in tensors.values()),'configuration':{'seed':17,'rank':16,'alpha':32,'dropout':0.05,'learningRate':0.0002,'batchSize':1,'gradientAccumulation':4,'maxLength':3072,'completionOnlyLoss':True,'gradientCheckpointing':True,'precision':'bfloat16'},'gpu':'RTX 4060 Laptop 8188 MiB','observedNvidiaSmiMemoryMiB':7939,'memoryNote':'One observed total device-memory sample, not measured peak allocated memory; process failed before final statistics','recovery':'Finite safetensors copied from checkpoint-40; optimizer/RNG pickle files are not loaded for inference','automaticallyPromoted':False}
(out/'result.json').write_text(json.dumps(record,indent=2),encoding='utf8');(run/'training-result.json').write_text(json.dumps(record,indent=2),encoding='utf8')
print(json.dumps({k:record[k] for k in ['status','selectedSavedCheckpointStep','validationLoss','adapterSha256','adapterBytes']},indent=2))
