import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const shapes={
  Top:'M63 35 38 46 17 78 44 95 58 76 58 158 142 158 142 76 156 95 183 78 162 46 137 35Q100 60 63 35Z',
  Bottom:'M59 32H141L150 169H109L100 86 91 169H50Z',
  Shoes:'M43 77 75 87 93 63 112 83 125 116 165 128Q183 134 180 152H25V125Z',
  Outerwear:'M66 30 38 46 19 151 48 159 61 92 59 171H141L139 92 152 159 181 151 162 46 134 30 100 65Z',
  Dress:'M73 27H88Q100 43 112 27H127L133 72 119 87 162 174H38L81 87 67 72Z',
  Accessory:'M59 74V60A41 41 0 0 1 141 60V74H159L168 165H32L41 74ZM76 74H124V60A24 24 0 0 0 76 60Z',
};
const extras={Top:'M83 44Q100 75 117 44',Bottom:'M61 47H140M100 48V84',Shoes:'M27 141H176M90 86 113 91M97 99 118 104',Outerwear:'M66 30 88 100 100 65 112 100 134 30M100 100V170'};
mkdirSync('vision/data',{recursive:true});
const images=[];
for(const [category,path]of Object.entries(shapes))for(let variation=0;variation<3;variation++){
  const id=`image-${String(images.length+1).padStart(2,'0')}`,color=['#637c61','#597d9f','#b6856d'][variation],bg=['#ffffff','#efe9dd','#dce5eb'][variation];
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/><path d="${path}" fill="${color}" stroke="#283a31" stroke-width="1.5"/><path d="${extras[category]||''}" stroke="#e5e1d9" fill="none" stroke-width="2"/></svg>`;
  const bytes=await sharp(Buffer.from(svg)).png().toBuffer();writeFileSync(`vision/data/${id}.png`,bytes);
  images.push({id,path:`vision/data/${id}.png`,category,variation,sha256:createHash('sha256').update(bytes).digest('hex')});
}
writeFileSync('vision/data/manifest.json',JSON.stringify({provenance:'Original garment silhouettes derived from the project SVG illustrations; 6 shapes x 3 color/background variations. This is a synthetic inference smoke test, not real-photo recognition validation. Files are anonymous to prevent filename label leakage.',images},null,2)+'\n');
console.log(`Created ${images.length} original illustration fixtures.`);
