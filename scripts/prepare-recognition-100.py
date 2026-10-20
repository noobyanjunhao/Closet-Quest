"""Freeze 100 original Fashionpedia validation photos, without model predictions."""
import argparse
import csv
import hashlib
import io
import json
import zipfile
from collections import Counter
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = "https://github.com/cvdfoundation/fashionpedia"
SEED = "closet-recognition-100-v1"
MAPPING = {0:"Top",1:"Top",2:"Top",3:"Outerwear",4:"Outerwear",5:"Outerwear",
           6:"Bottom",7:"Bottom",8:"Bottom",9:"Outerwear",10:"Dress",11:"Dress",
           12:"Outerwear",13:"Accessory",14:"Accessory",15:"Accessory",16:"Accessory",
           17:"Accessory",18:"Accessory",19:"Accessory",20:"Accessory",21:"Bottom",
           22:"Accessory",23:"Shoes",24:"Accessory",25:"Accessory",26:"Accessory"}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir",type=Path,default=ROOT/"vision/private/fashionpedia")
    args=parser.parse_args()
    raw=(args.source_dir/"annotations.json").read_bytes()
    data=json.loads(raw)
    previous=json.loads((ROOT/"output/sprint7/dataset-manifest.json").read_text())
    excluded={image["id"] for image in previous["images"]}
    annotations={}
    for annotation in data["annotations"]:
        if annotation["category_id"] in MAPPING:
            annotations.setdefault(annotation["image_id"],[]).append(annotation)
    eligible=[im for im in data["images"] if im["license"] in [0,6] and im["id"] not in excluded and annotations.get(im["id"])]
    rank=lambda im:hashlib.sha256(f"{SEED}:{im['id']}".encode()).hexdigest()
    ordered=sorted(eligible,key=rank)
    hats=[im for im in ordered if any(a["category_id"]==14 for a in annotations[im["id"]])]
    # Preserve the available independent hat challenge without cherry-picking predictions.
    hat_ids={im["id"] for im in hats[:10]}
    selected=hats[:10]+[im for im in ordered if im["id"] not in hat_ids][:100-len(hat_ids)]
    assert len(selected)==100 and len({im["id"] for im in selected})==100
    destination=ROOT/"vision/private/recognition-100"
    images_dir=destination/"images"
    images_dir.mkdir(parents=True,exist_ok=True)
    public=ROOT/"data/evaluation/recognition-100"
    public.mkdir(parents=True,exist_ok=True)
    categories={c["id"]:c["name"] for c in data["categories"]}
    licenses={l["id"]:l for l in data["licenses"]}
    records=[]
    with zipfile.ZipFile(args.source_dir/"images.zip") as archive:
        names={Path(name).name:name for name in archive.namelist() if not name.endswith("/")}
        for im in selected:
            image_bytes=archive.read(names[im["file_name"]])
            # Validate the original; do not crop, resize, or generate replacement pixels.
            with Image.open(io.BytesIO(image_bytes)) as image:
                assert image.size==(im["width"],im["height"])
                image.verify()
            (images_dir/im["file_name"]).write_bytes(image_bytes)
            anns=annotations[im["id"]]
            records.append({**im,"stratum":"hat-challenge" if im["id"] in hat_ids else "general",
                "sha256":hashlib.sha256(image_bytes).hexdigest(),"licenseDetails":licenses[im["license"]],
                "expected":sorted({MAPPING[a["category_id"]] for a in anns}),
                "annotatedHat":any(a["category_id"]==14 for a in anns),
                "instances":[{"annotationId":a["id"],"datasetCategory":categories[a["category_id"]],
                    "datasetCategoryId":a["category_id"],"appCategory":MAPPING[a["category_id"]],
                    "bboxXYWH":a["bbox"],"area":a["area"],"iscrowd":a["iscrowd"]} for a in anns]})
    selected_hashes={im["sha256"] for im in records}
    assert len(selected_hashes)==100, "Duplicate source pixels in selected set"
    assert not selected_hashes&{im["sha256"] for im in previous["images"]}, "Prior evaluation image overlap"
    manifest={"version":SEED,"dataset":"Fashionpedia validation 2020","source":SOURCE,
        "annotationsUrl":"https://s3.amazonaws.com/ifashionist-dataset/annotations/instances_attributes_val2020.json",
        "imagesArchiveUrl":"https://s3.amazonaws.com/ifashionist-dataset/images/val_test2020.zip",
        "annotationLicense":"CC BY 4.0","annotationSha256":hashlib.sha256(raw).hexdigest(),
        "sampling":"Original images with CC BY 2.0 or public-domain metadata; excludes all 18 prior Sprint 7 IDs. Up to 10 available hat images, then hash-ranked general images to reach exactly 100. Frozen before predictions.",
        "excludedPriorImageIds":sorted(excluded),"eligibleImages":len(eligible),"categoryMapping":MAPPING,
        "limitations":"100 outfit photos, not 100 isolated garment crops. Public data may be in foundation-model training. Images are not independent phone-photo user validation. Broad-category mapping has ambiguities, especially jumpsuits, tights and accessories.",
        "images":records}
    manifest_bytes=(json.dumps(manifest,indent=2)+"\n").encode()
    (public/"manifest.json").write_bytes(manifest_bytes)
    (destination/"manifest.json").write_bytes(manifest_bytes)
    output=io.StringIO()
    writer=csv.writer(output)
    writer.writerow(["image_id","file_name","expected_categories","annotated_hat","instance_count","source_url","license_url","sha256"])
    for im in records:
        writer.writerow([im["id"],im["file_name"],"|".join(im["expected"]),im["annotatedHat"],len(im["instances"]),im["original_url"],im["licenseDetails"]["url"],im["sha256"]])
    (public/"labels.csv").write_text(output.getvalue(),encoding="utf-8")
    (destination/"labels.csv").write_text(output.getvalue(),encoding="utf-8")
    summary={"images":len(records),"annotatedGarmentInstances":sum(len(im["instances"]) for im in records),
        "hatImages":sum(im["annotatedHat"] for im in records),
        "imageCategoryCounts":dict(Counter(c for im in records for c in im["expected"])),
        "priorEvaluationOverlap":len(excluded&{im["id"] for im in records}),
        "manifestSha256":hashlib.sha256(manifest_bytes).hexdigest()}
    (public/"summary.json").write_text(json.dumps(summary,indent=2)+"\n")
    notice=f"""Closet Quest recognition-100 — original dataset photos

Source: {SOURCE}
Fashionpedia: Jia et al., ECCV 2020. Annotations are CC BY 4.0:
https://fashionpedia.github.io/home/data_license.html
Image licenses are separate. Each image's original source URL and license are in
manifest.json and labels.csv; retain these records with the photos. No image
pixels have been changed. This is a local evaluation bundle, not an app asset pack.

100 original validation photos, {summary['annotatedGarmentInstances']} annotated
garment/accessory instances, {summary['hatImages']} hat images.
The earlier 18 Sprint 7 images are excluded. These photos have not been evaluated
by this preparation script. This is not a model-training holdout claim.

Test broad-category precision/recall/F1, per-category recall, exact category-set
match, hat recall, failure frequency, and latency. Use the separate single-item
and multiple-item modes as a baseline comparison. Score every failure as an empty
prediction and retain it in the denominator. Do not infer accuracy from selection.
"""
    (destination/"README.txt").write_text(notice,encoding="utf-8")
    with zipfile.ZipFile(destination/"Closet-Quest-Recognition-100.zip","w",zipfile.ZIP_DEFLATED) as package:
        for name in ["manifest.json","labels.csv","README.txt"]:
            package.write(destination/name,name)
        for im in records:
            package.write(images_dir/im["file_name"],"images/"+im["file_name"])
    print(json.dumps(summary,indent=2))

if __name__=="__main__":
    main()
