# CPU-only dependency installation

The November 17 Render build failed while `onnxruntime-node` tried to download optional GPU provider libraries from NuGet. The installed version is 1.30.0; its Linux x64 installer defaults to fetching CUDA 12 and TensorRT providers even on a CPU host.

Set **`ONNXRUNTIME_NODE_INSTALL=skip`** before `npm ci`. This is Microsoft's supported installer flag. It skips extra provider downloads; the CPU runtime bundled in the npm package remains available. Do not use `--ignore-scripts`, which would skip unrelated dependency setup too. This configuration is committed in `render.yaml`, both Docker stages, and GitHub CI. Existing Render services must have the environment value set in their dashboard before rebuilding; a Blueprint file alone does not update a manually managed service.

Run `node scripts/verify-onnx-cpu.mjs` after dependency installation. It creates a tiny ONNX Add graph locally, explicitly selects the CPU provider, and checks numerical output. CI and the Docker build run this check without model downloads or API credentials. The check proves CPU runtime functionality, not embedding quality or production AI availability. The production application’s OpenAI/Ollama provider configuration is unchanged.

For a deliberately GPU-equipped local environment, remove this override and follow the runtime's GPU setup requirements. Render Free uses the CPU-only setting; no instance or paid-plan change is required.

Sources: Microsoft's [1.30.0 installer](https://github.com/microsoft/onnxruntime/blob/v1.30.0/js/node/script/install.js) and [platform/provider manifest](https://github.com/microsoft/onnxruntime/blob/v1.30.0/js/node/script/install-metadata.js).
