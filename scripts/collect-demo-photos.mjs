// Small, attributed development collection. These are not held-out test images.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const selections = [
  ['tee', 'Tshirt-userpage-tobefree-front.jpg', 'Top'],
  ['denim', 'Jeans.jpg', 'Bottom'],
  ['sneakers', 'Converse Jack Purcell sneakers on white canvas.jpg', 'Shoes'],
  ['knit', 'Green Aran Sweater.JPG', 'Top'],
  ['trousers', 'Trousers-colourisolated.jpg', 'Bottom'],
  ['blazer', 'Navy blazer jacket.jpg', 'Outerwear'],
  ['tote', '04-QWSTION-FLAP-TOTE-SMALL-SAND-FRONT.jpg', 'Accessory'],
];
const directory = new URL('../public/photos/', import.meta.url);
await fs.mkdir(directory, { recursive: true });
const manifest = [];
for (const [id, title, category] of selections) {
  const params = new URLSearchParams({ action: 'query', titles: `File:${title}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960', format: 'json' });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': 'ClosetQuest/0.2 (educational wardrobe demo)' } });
  if (!response.ok) throw new Error(`Metadata: ${response.status}`);
  const info = Object.values((await response.json()).query.pages)[0].imageinfo?.[0];
  if (!info) throw new Error(`Missing file: ${title}`);
  const meta = info.extmetadata;
  const plain = text => (text || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
  const license = plain(meta.LicenseShortName?.value);
  if (!/^(CC BY|CC0|Public domain)/.test(license)) throw new Error(`Review license: ${title}: ${license}`);
  const photo = await fetch(info.thumburl || info.url);
  if (!photo.ok) throw new Error(`Photo ${title}: ${photo.status}`);
  const image = await sharp(Buffer.from(await photo.arrayBuffer())).rotate().resize({ width: 900, height: 1100, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  await fs.writeFile(new URL(`${id}.jpg`, directory), image);
  manifest.push({ id, file: `${id}.jpg`, title, category, source: info.descriptionurl, download: info.url, author: plain(meta.Artist?.value), license, licenseUrl: meta.LicenseUrl?.value || 'https://creativecommons.org/publicdomain/mark/1.0/', changes: 'Orientation normalized, resized and JPEG compressed. No background removal.', sha256: crypto.createHash('sha256').update(image).digest('hex'), split: 'development-demo', retrievedAt: new Date().toISOString() });
  console.log(id, license, image.length, 'bytes');
}
await fs.writeFile(new URL('sources.json', directory), JSON.stringify(manifest, null, 2));
