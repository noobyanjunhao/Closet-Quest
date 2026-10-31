"""Exact token-mean CE, omitting masked prompt logits and checkpointing vocab chunks."""
import torch
from torch.utils.checkpoint import checkpoint

def chunked_loss(hidden,labels,head,chunk=32):
    # hidden[t] predicts labels[t+1], exactly as causal LM cross entropy.
    shifted=labels[:,1:].reshape(-1);states=hidden[:,:-1].reshape(-1,hidden.shape[-1])
    keep=shifted!=-100;targets=shifted[keep];states=states[keep]
    if not targets.numel():raise ValueError('No supervised tokens')
    def part(h,y):return torch.nn.functional.cross_entropy(head(h).float(),y,reduction='sum')
    total=states.sum()*0
    for start in range(0,len(targets),chunk):
        total=total+checkpoint(part,states[start:start+chunk],targets[start:start+chunk],use_reentrant=False)
    return total/len(targets)

def model_loss(model,ids,labels):
    base=model.get_base_model()
    hidden=base.model(input_ids=ids,attention_mask=torch.ones_like(ids),use_cache=False).last_hidden_state
    return chunked_loss(hidden,labels,base.lm_head)
