"""Verify the selected safetensors artifact without loading optimizer pickle state."""
import json
from common import ROOT,sha
import torch
from safetensors.torch import load_file

def main():
    torch.set_num_threads(4)
    result=json.loads((ROOT/'output/purchase-ml-v2/training/result.json').read_text())
    folder=ROOT/f'ml/checkpoints/purchase-lora-v2/checkpoint-{result["selectedStep"]}'
    path=folder/'adapter_model.safetensors';weights=load_file(path,device='cpu')
    assert weights and all(torch.isfinite(v).all() for v in weights.values())
    assert sum(v.numel() for v in weights.values())==result['trainableParameters']
    assert sha(path)==result['adapterSha256']
    assert all(torch.count_nonzero(v)>0 for k,v in weights.items() if 'lora_B' in k)
    report={'selectedStep':result['selectedStep'],'relativePath':path.relative_to(ROOT).as_posix(),'bytes':path.stat().st_size,'sha256':sha(path),'tensorCount':len(weights),'parameters':sum(v.numel() for v in weights.values()),'allFinite':True,'allBProjectionsNonzero':True,'configSha256':sha(folder/'adapter_config.json'),'base':json.loads((ROOT/'ml/purchase/base-manifest.json').read_text()),'weightsUploaded':False,'optimizerPickleLoaded':False}
    (ROOT/'output/purchase-ml-v2/adapter-artifact.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({k:v for k,v in report.items() if k!='base'},indent=2))
if __name__=='__main__':main()
