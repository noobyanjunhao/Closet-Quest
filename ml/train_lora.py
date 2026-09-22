"""Offline PEFT/TRL adapter training. Validation runs without ML dependencies; training is explicit."""
import argparse
import hashlib
import json
import os
from pathlib import Path


def quantization_settings(mode, compute_dtype):
    if mode == "none":
        return None
    if mode != "nf4":
        raise ValueError("Quantization must be nf4 or none")
    return {"load_in_4bit": True, "bnb_4bit_quant_type": "nf4", "bnb_4bit_use_double_quant": True, "bnb_4bit_compute_dtype": compute_dtype}


def validate_dataset(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    splits = {}
    fingerprints, groups, prompts = set(), set(), set()
    for split in ("train", "validation", "test"):
        path = directory / f"{split}.jsonl"
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != manifest["files"][split]["sha256"]:
            raise ValueError(f"{split} dataset hash differs from the prepared manifest")
        rows = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
        local_fingerprints, local_groups, local_prompts = set(), set(), set()
        for row in rows:
            if [message["role"] for message in row["prompt"]] != ["system", "user"] or [message["role"] for message in row["completion"]] != ["assistant"]:
                raise ValueError("Expected a conversational prompt/completion example")
            prompt = json.dumps(row["prompt"], sort_keys=True)
            if row["fingerprint"] in fingerprints or row["group"] in groups or prompt in prompts:
                raise ValueError("Train/validation/test leakage detected")
            if row["fingerprint"] in local_fingerprints:
                raise ValueError("Duplicate example detected")
            local_fingerprints.add(row["fingerprint"])
            local_groups.add(row["group"])
            local_prompts.add(prompt)
        fingerprints.update(local_fingerprints)
        groups.update(local_groups)
        prompts.update(local_prompts)
        splits[split] = rows
    counts = {split: len(rows) for split, rows in splits.items()}
    ready = manifest.get("ready") is True and sum(counts.values()) >= 60 and len(groups) >= 12 and counts["train"] >= 30 and counts["validation"] >= 5 and counts["test"] >= 5
    return manifest, splits, {"ready": ready, "counts": counts, "groups": len(groups), "task": manifest["task"], "trainingStarted": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="vision/private/learning/lora-outfit-selection")
    parser.add_argument("--model-dir", help="Previously downloaded local causal language model directory with a chat template")
    parser.add_argument("--output-dir", default="vision/private/learning/adapters/outfit-selection")
    parser.add_argument("--quantization", choices=("nf4", "none"), default="nf4", help="4-bit NF4 QLoRA by default; none requires substantially more GPU memory")
    parser.add_argument("--train", action="store_true", help="Explicitly run LoRA after readiness and CUDA checks")
    args = parser.parse_args()
    manifest, splits, report = validate_dataset(args.data_dir)
    report["quantization"] = args.quantization
    print(json.dumps(report, indent=2))
    if not args.train:
        return
    if not report["ready"]:
        raise SystemExit("Not training: collect enough distinct reviewed real examples and re-prepare the grouped splits.")
    if not args.model_dir or not Path(args.model_dir).is_dir():
        raise SystemExit("Not training: supply an existing local --model-dir. This script never downloads models.")
    output = Path(args.output_dir)
    if output.exists() and any(output.iterdir()):
        raise SystemExit("Output directory is not empty. Choose a new adapter directory.")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    import torch
    from datasets import Dataset
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from trl import SFTConfig, SFTTrainer
    if not torch.cuda.is_available():
        raise SystemExit("Not training: a CUDA-enabled PyTorch runtime is required by this local configuration.")
    tokenizer = AutoTokenizer.from_pretrained(args.model_dir, local_files_only=True, trust_remote_code=False)
    if not tokenizer.chat_template:
        raise SystemExit("The selected local model has no chat template.")
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    # Reject overlength examples rather than silently truncate the approved answer.
    for rows in splits.values():
        for row in rows:
            if len(tokenizer.apply_chat_template(row["prompt"] + row["completion"], tokenize=True)) > 1536:
                raise SystemExit("An example exceeds 1,536 tokens; shorten the dataset explicitly and re-prepare it.")
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quantization = quantization_settings(args.quantization, dtype)
    load_kwargs = {"local_files_only": True, "trust_remote_code": False, "torch_dtype": dtype}
    if quantization:
        load_kwargs.update(quantization_config=BitsAndBytesConfig(**quantization), device_map={"": torch.cuda.current_device()})
    model = AutoModelForCausalLM.from_pretrained(args.model_dir, **load_kwargs)
    model.config.use_cache = False
    if quantization:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False})
    model = get_peft_model(model, LoraConfig(r=8, lora_alpha=16, lora_dropout=0.05, target_modules="all-linear", task_type="CAUSAL_LM"))
    data = {split: Dataset.from_list([{key: row[key] for key in ("prompt", "completion")} for row in rows]) for split, rows in splits.items()}
    trainer = SFTTrainer(model=model, processing_class=tokenizer, train_dataset=data["train"], eval_dataset=data["validation"], args=SFTConfig(output_dir=str(output), max_length=1536, per_device_train_batch_size=1, per_device_eval_batch_size=1, gradient_accumulation_steps=8, learning_rate=1e-4, num_train_epochs=3, seed=42, data_seed=42, eval_strategy="epoch", save_strategy="epoch", save_total_limit=1, load_best_model_at_end=True, metric_for_best_model="eval_loss", greater_is_better=False, logging_steps=5, report_to="none", completion_only_loss=True, gradient_checkpointing=True, gradient_checkpointing_kwargs={"use_reentrant": False}, optim="paged_adamw_8bit" if quantization else "adamw_torch", bf16=dtype == torch.bfloat16, fp16=dtype == torch.float16))
    # Baseline and adapter loss use the same untouched test split; loss is not outfit quality.
    baseline = trainer.evaluate(data["test"], metric_key_prefix="baseline")
    trainer.train()
    final = trainer.evaluate(data["test"], metric_key_prefix="heldout")
    trainer.save_model(str(output / "adapter"))
    tokenizer.save_pretrained(str(output / "adapter"))
    (output / "evaluation.json").write_text(json.dumps({"datasetSha256": manifest["datasetSha256"], "quantization": args.quantization, "computeDtype": str(dtype), "baseline": baseline, "adapter": final, "automaticallyDeployed": False, "limitation": "Held-out token loss only. Run owned-item, constraint and preference evaluations before deployment."}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
