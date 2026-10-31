"""Bounded local training with exact chunked loss and generation-based selection."""
import json,time,random,math,platform,faulthandler
faulthandler.enable();faulthandler.dump_traceback_later(60,repeat=True)
print('Loading local training libraries',flush=True)
from common import ROOT,configure,sha
configure()
import torch
from transformers import AutoTokenizer,AutoModelForCausalLM,set_seed
from peft import LoraConfig,get_peft_model
from v2_protocol import messages,gold_decisions
from v2_loss import model_loss,chunked_loss
from v2_infer import load_data,Extractor,evaluate

def parity():
    torch.manual_seed(17)
    h=torch.randn(2,13,8,requires_grad=True);head=torch.nn.Linear(8,19,bias=False);labels=torch.randint(0,19,(2,13));labels[:,:7]=-100
    dense=torch.nn.functional.cross_entropy(head(h[:,:-1]).reshape(-1,19),labels[:,1:].reshape(-1))
    grads=torch.autograd.grad(dense,[h,head.weight],retain_graph=True)
    chunked=chunked_loss(h,labels,head,3);other=torch.autograd.grad(chunked,[h,head.weight])
    errors=[float((a-b).abs().max()) for a,b in zip(grads,other)]
    assert abs(float(dense-chunked))<1e-6 and max(errors)<1e-6
    return {'denseLoss':float(dense.detach()),'chunkedLoss':float(chunked.detach()),'gradientMaxAbsoluteErrors':errors}

def main():
    faulthandler.cancel_dump_traceback_later();print('Training libraries loaded',flush=True)
    out=ROOT/'ml/checkpoints/purchase-lora-v2';evidence=ROOT/'output/purchase-ml-v2/training'
    if out.exists():raise ValueError('Do not overwrite an existing training run')
    out.mkdir(parents=True);evidence.mkdir(parents=True,exist_ok=True);set_seed(29);torch.set_num_threads(4)
    result={'seed':29,'stepsPlanned':300,'gradientAccumulation':8,'batchSize':1,'maxSequenceTokens':768,'selection':'Max validation clothing recall, then precision, then field accuracy, then exact documents; no test access','parity':parity(),'gpu':torch.cuda.get_device_name(),'torch':torch.__version__,'platform':platform.platform(),'datasetManifestSha256':sha(ROOT/'data/evaluation/purchase-v2/manifest.json'),'protocolSha256':sha(ROOT/'ml/purchase/v2_protocol.py'),'history':[]}
    tokenizer=AutoTokenizer.from_pretrained(ROOT/'.model-cache/purchase-base',local_files_only=True,trust_remote_code=False);tokenizer.pad_token=tokenizer.eos_token
    positive=[];negative=[]
    for row in load_data('train'):
        for line,decision in gold_decisions(row):
            prompt=tokenizer.apply_chat_template(messages(line),tokenize=True,add_generation_prompt=True)
            full=tokenizer.apply_chat_template(messages(line)+[{'role':'assistant','content':json.dumps(decision,separators=(',',':'),ensure_ascii=False)}],tokenize=True)
            assert full[:len(prompt)]==prompt
            if len(full)>768:raise ValueError('Training context exceeds bound')
            record=(full,[-100]*len(prompt)+full[len(prompt):])
            (positive if decision['category'] else negative).append(record)
    result['examples']={'positive':len(positive),'negative':len(negative),'sampling':'50% positive / 50% negative with replacement','maxTokens':max(len(x[0]) for x in positive+negative)}
    result['rngNote']='Python sampling uses seed 29; parity() sets torch seed 17 before adapter initialization and training.'
    result['torchSeedAfterParity']=17
    model=AutoModelForCausalLM.from_pretrained(ROOT/'.model-cache/purchase-base',torch_dtype=torch.bfloat16,local_files_only=True,trust_remote_code=False,attn_implementation='sdpa').to('cuda')
    model=get_peft_model(model,LoraConfig(r=16,lora_alpha=32,lora_dropout=.05,target_modules=['q_proj','k_proj','v_proj','o_proj','gate_proj','up_proj','down_proj'],task_type='CAUSAL_LM'))
    model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False});model.enable_input_require_grads();model.config.use_cache=False
    optimizer=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],lr=2e-4)
    result['trainableParameters']=sum(p.numel() for p in model.parameters() if p.requires_grad)
    # Real-model numerical parity and memory comparison, same batch, no optimizer state yet.
    ids,labels=positive[0];ids=torch.tensor([ids],device='cuda');labels=torch.tensor([labels],device='cuda');model.eval()
    memory=[]
    for mode in ['dense','chunked']:
        model.zero_grad(set_to_none=True);torch.cuda.empty_cache();torch.cuda.reset_peak_memory_stats();started=time.perf_counter()
        loss=model(input_ids=ids,labels=labels,use_cache=False).loss if mode=='dense' else model_loss(model,ids,labels)
        loss.backward();torch.cuda.synchronize()
        memory.append({'mode':mode,'tokens':ids.shape[1],'loss':loss.item(),'peakAllocatedBytes':torch.cuda.max_memory_allocated(),'peakReservedBytes':torch.cuda.max_memory_reserved(),'seconds':time.perf_counter()-started});del loss
    assert abs(memory[0]['loss']-memory[1]['loss'])<.02
    result['sameBatchMemoryComparison']=memory
    model.zero_grad(set_to_none=True);torch.cuda.empty_cache();torch.cuda.reset_peak_memory_stats();model.train();rng=random.Random(29);started=time.perf_counter();best=None
    (evidence/'preflight.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    for step in range(1,301):
        optimizer.zero_grad(set_to_none=True);total=0
        lr=2e-4*min(step/15,1)*(.1+.9*.5*(1+math.cos(math.pi*max(0,step-15)/285)))
        for group in optimizer.param_groups:group['lr']=lr
        for micro in range(8):
            full,mask=rng.choice(positive if micro%2==0 else negative)
            loss=model_loss(model,torch.tensor([full],device='cuda'),torch.tensor([mask],device='cuda'))/8
            if not torch.isfinite(loss):raise ValueError('Non-finite training loss')
            loss.backward();total+=loss.item();del loss
        torch.nn.utils.clip_grad_norm_(model.parameters(),1);optimizer.step()
        if step%10==0:
            event={'step':step,'loss':total,'lr':lr,'seconds':time.perf_counter()-started,'peakAllocatedBytes':torch.cuda.max_memory_allocated(),'peakReservedBytes':torch.cuda.max_memory_reserved()};result['history'].append(event);print(json.dumps(event),flush=True)
            (evidence/'progress.json').write_text(json.dumps(result,indent=2),encoding='utf8')
        if step%100==0:
            checkpoint=out/f'checkpoint-{step}';model.save_pretrained(checkpoint);tokenizer.save_pretrained(checkpoint)
            model.gradient_checkpointing_disable();ex=Extractor(model=model,tokenizer=tokenizer)
            metrics=evaluate(ex,load_data('validation'),ROOT/f'output/purchase-ml-v2/validation-{step}')
            rank=(metrics['clothingLines']['recall'],metrics['clothingLines']['precision'],metrics['fieldExact']['rate'],metrics['exactGarmentDocuments'])
            if best is None or rank>best[0]:best=(rank,step)
            result.setdefault('validation',[]).append({'step':step,'rank':rank})
            model.train();model.config.use_cache=False;model.gradient_checkpointing_enable(gradient_checkpointing_kwargs={'use_reentrant':False})
    # Bound test after optimizer state exists: train/backprop on exactly 768 tokens.
    optimizer.zero_grad(set_to_none=True);full,mask=max(positive+negative,key=lambda x:len(x[0]));padding=768-len(full)
    stress_ids=torch.tensor([[tokenizer.eos_token_id]*padding+full],device='cuda');stress_labels=torch.tensor([[-100]*padding+mask],device='cuda')
    stress=model_loss(model,stress_ids,stress_labels);stress.backward();torch.cuda.synchronize()
    result.update(stepsCompleted=300,selectedStep=best[1],seconds=time.perf_counter()-started,peakAllocatedBytes=torch.cuda.max_memory_allocated(),peakReservedBytes=torch.cuda.max_memory_reserved(),stressTokens=768,stressLoss=stress.item(),outOfMemory=False,automaticallyPromoted=False,testUsedForSelection=False)
    result['adapterSha256']=sha(out/f'checkpoint-{best[1]}/adapter_model.safetensors')
    (evidence/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result,indent=2),flush=True)
if __name__=='__main__':main()
