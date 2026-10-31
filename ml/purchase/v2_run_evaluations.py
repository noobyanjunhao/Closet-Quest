"""Sequential GPU evaluation. Run only after v2 training and validation selection finish."""
import json,subprocess,sys,os
from common import ROOT

def main():
    result=json.loads((ROOT/'output/purchase-ml-v2/training/result.json').read_text())
    assert result['stepsCompleted']==300 and not result['testUsedForSelection']
    adapter=f'ml/checkpoints/purchase-lora-v2/checkpoint-{result["selectedStep"]}'
    jobs=[['ml/purchase/v2_infer.py','--adapter',adapter,'--split','test','--out','output/purchase-ml-v2/adapter-test'],['ml/purchase/v2_infer.py','--adapter',adapter,'--split','regression','--out','output/purchase-ml-v2/adapter-regression'],['ml/purchase/evaluate.py','--mode','adapter','--split','test','--out','output/purchase-ml-v2/v1-on-new-test']]
    jobs.insert(2,['ml/purchase/v2_infer.py','--base','--split','test','--out','output/purchase-ml-v2/base-line-test'])
    jobs.append(['ml/purchase/v2_probe.py'])
    for args in jobs:
        env=os.environ.copy()
        if args[0].endswith('/evaluate.py'):env['PURCHASE_EVAL_DATASET']='purchase-v2'
        subprocess.run([sys.executable,'-u',*args],cwd=ROOT,env=env,check=True)
    print('Paired evaluation complete',flush=True)
if __name__=='__main__':main()
