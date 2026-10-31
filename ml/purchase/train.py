"""Bounded completion-only LoRA; validation selects the checkpoint, never test."""
import argparse,json,time,math,platform,importlib.metadata,faulthandler
faulthandler.enable()
faulthandler.dump_traceback_later(90)
print('Loading training libraries',flush=True)
from pathlib import Path
from common import ROOT,rows,messages,configure,sha,validate_records
configure()
import torch
from datasets import Dataset
from transformers import AutoTokenizer,AutoModelForCausalLM,TrainerCallback,set_seed
from peft import LoraConfig,get_peft_model
from trl import SFTConfig,SFTTrainer

class StopInvalid(TrainerCallback):
    def on_log(self,args,state,control,logs=None,**kwargs):
        if any(isinstance(v,(int,float)) and not math.isfinite(v) for v in (logs or {}).values()):raise RuntimeError('Non-finite training metric')

def main():
    faulthandler.cancel_dump_traceback_later()
    print('Training libraries ready',flush=True)
    parser=argparse.ArgumentParser();parser.add_argument('--steps',type=int,default=120);parser.add_argument('--output',default='ml/checkpoints/purchase-lora-v1');args=parser.parse_args()
    if not 1<=args.steps<=120:raise ValueError('Maximum approved steps: 120')
    if not torch.cuda.is_available():raise RuntimeError('CUDA is required for this bounded run')
    out=ROOT/args.output
    if out.exists() and any(out.iterdir()):raise ValueError('Use a new empty output directory')
    out.mkdir(parents=True,exist_ok=True);set_seed(17);torch.set_num_threads(4)
    train,dev=rows('train'),rows('validation')
    assert not {r['family'] for r in train}&{r['family'] for r in dev}
    checks=validate_records(train+dev,out/'label-check.jsonl');assert all(x['valid'] for x in checks)
    base=ROOT/'.model-cache/purchase-base'
    tokenizer=AutoTokenizer.from_pretrained(base,local_files_only=True,trust_remote_code=False)
    if tokenizer.pad_token_id is None:tokenizer.pad_token=tokenizer.eos_token
    tokenizer.padding_side='right'
    dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    model=AutoModelForCausalLM.from_pretrained(base,local_files_only=True,trust_remote_code=False,torch_dtype=dtype,attn_implementation='sdpa').to('cuda')
    model.config.use_cache=False
    model=get_peft_model(model,LoraConfig(r=16,lora_alpha=32,lora_dropout=0.05,target_modules=['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj'],task_type='CAUSAL_LM'))
    def convert(rs):
        converted=[]
        for r in rs:
            prompt=messages(r);completion=[{'role':'assistant','content':json.dumps(r['target'],ensure_ascii=False,separators=(',',':'))}]
            tokens=tokenizer.apply_chat_template(prompt+completion,tokenize=True)
            if len(tokens)>3072:raise ValueError(f'No truncation permitted: {r["id"]}, {len(tokens)} tokens')
            converted.append({'prompt':prompt,'completion':completion})
        return Dataset.from_list(converted)
    train_data,dev_data=convert(train),convert(dev)
    config=SFTConfig(output_dir=str(out),max_length=3072,max_steps=args.steps,per_device_train_batch_size=1,per_device_eval_batch_size=1,gradient_accumulation_steps=4,learning_rate=2e-4,warmup_ratio=0.05,lr_scheduler_type='cosine',seed=17,data_seed=17,eval_strategy='steps',eval_steps=40,save_strategy='steps',save_steps=40,save_total_limit=1,load_best_model_at_end=args.steps>=40,metric_for_best_model='eval_loss',greater_is_better=False,logging_steps=5,report_to='none',completion_only_loss=True,gradient_checkpointing=True,gradient_checkpointing_kwargs={'use_reentrant':False},optim='adamw_torch',bf16=dtype==torch.bfloat16,fp16=dtype==torch.float16,dataloader_num_workers=0,dataloader_pin_memory=False)
    trainer=SFTTrainer(model=model,processing_class=tokenizer,train_dataset=train_data,eval_dataset=dev_data,args=config,callbacks=[StopInvalid()])
    # Verify actual masking before any optimization; the loss excludes prompt tokens.
    example=trainer.train_dataset[0];batch=trainer.data_collator([example]);labels=batch['labels'][0]
    assert (labels==-100).any() and (labels!=-100).any()
    first=int((labels!=-100).nonzero()[0]);assert first>0
    masking={'maskedTokens':int((labels==-100).sum()),'targetTokens':int((labels!=-100).sum()),'firstSupervisedText':tokenizer.decode(labels[labels!=-100][:30])}
    (out/'masking.json').write_text(json.dumps(masking,indent=2),encoding='utf8')
    torch.cuda.reset_peak_memory_stats();started=time.time();baseline=trainer.evaluate(metric_key_prefix='baseline_validation')
    (out/'baseline-validation.json').write_text(json.dumps(baseline,indent=2),encoding='utf8')
    training=trainer.train();final=trainer.evaluate(metric_key_prefix='selected_validation')
    adapter=out/'adapter';trainer.save_model(str(adapter));tokenizer.save_pretrained(adapter)
    result={'base':json.loads((ROOT/'ml/purchase/base-manifest.json').read_text()),'datasetManifestSha256':sha(ROOT/'data/evaluation/purchase-v1/manifest.json'),'promptSha256':sha(ROOT/'ml/purchase/prompt.json'),'steps':trainer.state.global_step,'seed':17,'dtype':str(dtype),'lora':{'r':16,'alpha':32,'dropout':0.05,'targets':['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj']},'trainableParameters':sum(p.numel() for p in model.parameters() if p.requires_grad),'allParameters':sum(p.numel() for p in model.parameters()),'masking':masking,'baselineValidation':baseline,'selectedValidation':final,'trainMetrics':training.metrics,'history':trainer.state.log_history,'bestCheckpoint':Path(trainer.state.best_model_checkpoint).name if trainer.state.best_model_checkpoint else None,'seconds':time.time()-started,'peakAllocatedBytes':torch.cuda.max_memory_allocated(),'gpu':torch.cuda.get_device_name(),'platform':platform.platform(),'versions':{p:importlib.metadata.version(p) for p in ['torch','transformers','peft','trl','datasets','accelerate']},'adapterSha256':sha(adapter/'adapter_model.safetensors'),'testUsedForSelection':False,'automaticallyPromoted':False}
    (out/'training-result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    # Reload the serialized adapter, checking all learned tensors match exactly.
    from safetensors.torch import load_file
    saved=load_file(adapter/'adapter_model.safetensors');assert saved and all(torch.isfinite(v).all() for v in saved.values())
    print(json.dumps({k:result[k] for k in ['steps','seconds','peakAllocatedBytes','adapterSha256','masking']},indent=2),flush=True)
if __name__=='__main__':main()
