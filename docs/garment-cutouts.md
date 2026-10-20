# Wardrobe images and saved outfit rail

The wardrobe places saved looks in a separately scrollable side rail. Opening a look does not navigate away from the wardrobe; category filters, search and the rail position remain in place. The rail narrows on phones. Opening a piece provides Photo, Cutout and Pixel icon appearances and a viewer for its original uploaded photo.

An appearance change does not replace the recognition input, invalidate reviewed attributes or reset wear history. `image` remains the per-piece photo, `originalImage` preserves the source of multi-piece imports, and `cutoutImage` stores a user-approved transparent PNG. Existing photo-only records continue working. The account photo service now preserves alpha and validates owner-scoped PNG paths as well as JPEG paths. Backup export preserves PNG bytes. No database migration or broader storage permission is required.

## Local AI extraction

The on-demand worker runs U²-Net-p through Transformers.js and ONNX Runtime WASM on the user's device. Model weights are downloaded from [BritishWerewolf/U-2-Netp](https://huggingface.co/BritishWerewolf/U-2-Netp), pinned to revision `7112208`, approximately 4.58 MB, Apache-2.0. The [original U²-Net project](https://github.com/xuebinqin/U-2-Net) provides the model architecture; input normalization and mask scaling follow the [rembg U2netp implementation](https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py). The runtime is a separate, lazily downloaded asset. Photos are read locally or from the existing authenticated photo endpoint; they are not sent to Hugging Face for inference.

The worker resizes the model input, produces a foreground alpha mask, applies it to the original image pixels, trims transparent margins and limits the resulting PNG to 700 pixels on its longest edge. It never generates replacement garment pixels. Users must review a preview before applying it, then save the piece. Cancel or closing the editor terminates the worker; a timeout and a plain-background cleanup option provide recovery. A pixel icon is a category/color representation, not a prediction of unseen garment details.

This is foreground extraction, not semantic clothing segmentation. A worn garment can retain a hand, skin or other foreground objects; split outfit photos into detected garment crops first. Flat-lay and hanger photos are the preferred input. Hidden clothing cannot be recovered. Small accessories, similar foreground/background colors and fine edges can fail, so the original photo remains accessible.

## Verification

Regression coverage checks original-image preservation, independent display selection, transparent cloud upload, owner-scoped image paths, shared-source upload deduplication, multi-piece source retention, empty-mask rejection and foreground framing. Browser checks exercise AI preview/apply/save/reopen on a public sweater photograph, pixel selection, original viewing, saved outfit opening, and rail scroll restoration. These are engineering checks, not a garment segmentation accuracy benchmark or human usability study.

The initial BEN2 trial failed on this browser's WebGPU driver, and its CPU attempt was too slow for the intended interaction. It is not shipped. The smaller U²-Net-p worker successfully produced the sweater cutout in the production preview.
