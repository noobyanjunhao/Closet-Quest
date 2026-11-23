// Versioned manifest for the Pixel Passport renderer "cq-pixel-v2".
// Every ID a character specification may contain is listed here. All art is
// first-party and drawn from code (see figure.js / scenes.js), so the
// event needs no image files, fonts or third-party assets.
const sw = (id, label, hex) => Object.freeze({ id, label, hex });

// Face and body settings every starter look begins from; a few starters vary them.
const FACE_DEFAULTS = Object.freeze({ faceId: 'oval', buildId: 'regular', eyeId: 'round', eyeColor: '#6B4226', browId: 'soft', noseId: 'medium', mouthId: 'smile', facialHairId: 'none', headWidth: 0, jaw: 0, eyeGap: 0 });
const PRESET_FACES = Object.freeze({ 'lavender-skirt': { faceId: 'heart', eyeId: 'lashes', buildId: 'slim' }, 'sunny-hoodie': { faceId: 'round', browId: 'thick' }, 'coral-dress': { faceId: 'long', browId: 'arched', buildId: 'slim' }, 'navy-knit': { faceId: 'square', buildId: 'broad', eyeColor: '#4F7FC2' }, 'sky-scarf': { eyeId: 'wide', eyeColor: '#2E1F1A' } });

export const manifest = Object.freeze({
  schemaVersion: 1,
  rendererVersion: 'cq-pixel-v2',
  eventIds: Object.freeze(['campus-demo']),
  sprite: Object.freeze({ width: 96, height: 144 }),
  card: Object.freeze({ width: 1080, height: 1350 }),
  tops: Object.freeze([
    { id: 'shirt', label: 'T-shirt' },
    { id: 'knit', label: 'Knit' },
    { id: 'hoodie', label: 'Hoodie' },
    { id: 'jacket', label: 'Jacket' },
    { id: 'dress', label: 'Dress', onePiece: true }
  ].map(Object.freeze)),
  bottoms: Object.freeze([
    { id: 'trousers', label: 'Trousers' },
    { id: 'shorts', label: 'Shorts' },
    { id: 'skirt', label: 'Skirt' }
  ].map(Object.freeze)),
  shoes: Object.freeze([
    { id: 'sneakers', label: 'Sneakers' },
    { id: 'boots', label: 'Boots' },
    { id: 'loafers', label: 'Loafers' }
  ].map(Object.freeze)),
  hair: Object.freeze([{ id: 'short', label: 'Short' }, { id: 'quiff', label: 'Quiff' }, { id: 'buzz', label: 'Buzz' }, { id: 'pixie', label: 'Pixie' }, { id: 'curly', label: 'Curly' }, { id: 'afro', label: 'Afro' }, { id: 'bob', label: 'Bob' }, { id: 'bangs', label: 'Fringe' }, { id: 'long', label: 'Long' }, { id: 'wavy', label: 'Wavy' }, { id: 'ponytail', label: 'Ponytail' }, { id: 'bun', label: 'Bun' }, { id: 'none', label: 'None' }].map(Object.freeze)),
  faces: Object.freeze([{ id: 'oval', label: 'Oval' }, { id: 'round', label: 'Round' }, { id: 'square', label: 'Square' }, { id: 'heart', label: 'Heart' }, { id: 'long', label: 'Long' }].map(Object.freeze)),
  builds: Object.freeze([{ id: 'slim', label: 'Slim' }, { id: 'regular', label: 'Regular' }, { id: 'broad', label: 'Broad' }].map(Object.freeze)),
  eyes: Object.freeze([{ id: 'round', label: 'Round' }, { id: 'wide', label: 'Wide' }, { id: 'narrow', label: 'Narrow' }, { id: 'lashes', label: 'Lashes' }].map(Object.freeze)),
  brows: Object.freeze([{ id: 'soft', label: 'Soft' }, { id: 'straight', label: 'Straight' }, { id: 'thick', label: 'Thick' }, { id: 'arched', label: 'Arched' }].map(Object.freeze)),
  noses: Object.freeze([{ id: 'small', label: 'Small' }, { id: 'medium', label: 'Medium' }, { id: 'wide', label: 'Wide' }].map(Object.freeze)),
  mouths: Object.freeze([{ id: 'smile', label: 'Smile' }, { id: 'small', label: 'Small' }, { id: 'wide', label: 'Wide' }, { id: 'neutral', label: 'Neutral' }].map(Object.freeze)),
  facialHair: Object.freeze([{ id: 'none', label: 'None' }, { id: 'stubble', label: 'Stubble' }, { id: 'mustache', label: 'Moustache' }, { id: 'goatee', label: 'Goatee' }, { id: 'beard', label: 'Beard' }].map(Object.freeze)),
  sliders: Object.freeze({ headWidth: Object.freeze([-2, 2]), jaw: Object.freeze([-2, 2]), eyeGap: Object.freeze([-1, 2]) }),
  headwear: Object.freeze([
    { id: 'none', label: 'None' },
    { id: 'cap', label: 'Cap' },
    { id: 'beanie', label: 'Beanie' },
    { id: 'headscarf', label: 'Headscarf' }
  ].map(Object.freeze)),
  clothingSwatches: Object.freeze([
    sw('sage', 'Sage green', '#627F62'), sw('forest', 'Forest green', '#2F5D46'),
    sw('navy', 'Navy', '#2F3E5C'), sw('denim', 'Denim blue', '#5B7FA6'),
    sw('sky', 'Sky blue', '#8FB8DE'), sw('lavender', 'Lavender', '#A79BD0'),
    sw('plum', 'Plum', '#6B3F69'), sw('pink', 'Pink', '#EFA5B8'),
    sw('coral', 'Coral', '#E0705A'), sw('brick', 'Brick red', '#B4533C'),
    sw('mustard', 'Mustard', '#E0B84C'), sw('khaki', 'Khaki', '#B9A77C'),
    sw('cream', 'Cream', '#EDE9D9'), sw('white', 'White', '#FAFAF5'),
    sw('slate', 'Slate', '#3D4D5A'), sw('charcoal', 'Charcoal', '#3A3A40'),
    sw('black', 'Black', '#1E1E22'), sw('brown', 'Brown', '#7A5238')
  ]),
  skinSwatches: Object.freeze([
    sw('skin-1', 'Skin tone 1', '#F6D7BD'), sw('skin-2', 'Skin tone 2', '#EDBE98'),
    sw('skin-3', 'Skin tone 3', '#DDA273'), sw('skin-4', 'Skin tone 4', '#C88962'),
    sw('skin-5', 'Skin tone 5', '#A66B46'), sw('skin-6', 'Skin tone 6', '#85533A'),
    sw('skin-7', 'Skin tone 7', '#62392A'), sw('skin-8', 'Skin tone 8', '#45281F')
  ]),
  eyeSwatches: Object.freeze([
    sw('eye-brown', 'Brown', '#6B4226'), sw('eye-dark', 'Dark brown', '#2E1F1A'), sw('eye-hazel', 'Hazel', '#8A6A3A'),
    sw('eye-green', 'Green', '#4F7A55'), sw('eye-blue', 'Blue', '#4F7FC2'), sw('eye-gray', 'Grey', '#7C8794')
  ]),
  hairSwatches: Object.freeze([
    sw('hair-black', 'Black', '#1F1B1E'), sw('hair-espresso', 'Dark brown', '#3A2C27'),
    sw('hair-brown', 'Brown', '#6A452E'), sw('hair-auburn', 'Auburn', '#9A4A2A'),
    sw('hair-blonde', 'Blonde', '#D9B36A'), sw('hair-silver', 'Silver', '#B9B8B4'),
    sw('hair-pink', 'Pink', '#E58FB0'), sw('hair-blue', 'Blue', '#4F7FC2')
  ]),
  scenes: Object.freeze([
    { id: 'coffee-break', label: 'Coffee break', caption: 'One more question. Then coffee.', reveal: 'wave', stamp: 'COFFEE BREAK' },
    { id: 'campus-walk', label: 'Campus walk', caption: 'Taking the scenic route to the next demo.', reveal: 'shuffle', stamp: 'CAMPUS WALK' },
    { id: 'after-talks', label: 'After the talks', caption: 'Presentation complete. Snack quest unlocked.', reveal: 'bounce', stamp: 'AFTER THE TALKS' }
  ].map(Object.freeze)),
  // Presets are complete starting configurations, not fixed people.
  presets: Object.freeze([
    { id: 'green-jacket', label: 'Green jacket',
      outfit: { topId: 'jacket', topColor: '#627F62', bottomId: 'trousers', bottomColor: '#3D4D5A', shoeId: 'sneakers', shoeColor: '#EDE9D9' },
      appearance: { skinColor: '#C88962', hairId: 'short', hairColor: '#3A2C27', headwearId: 'none', headwearColor: '#2F5D46', glasses: true } },
    { id: 'lavender-skirt', label: 'Lavender tee',
      outfit: { topId: 'shirt', topColor: '#A79BD0', bottomId: 'skirt', bottomColor: '#3A3A40', shoeId: 'loafers', shoeColor: '#7A5238' },
      appearance: { skinColor: '#85533A', hairId: 'long', hairColor: '#1F1B1E', headwearId: 'none', headwearColor: '#A79BD0', glasses: false } },
    { id: 'sunny-hoodie', label: 'Sunny hoodie',
      outfit: { topId: 'hoodie', topColor: '#E0B84C', bottomId: 'shorts', bottomColor: '#5B7FA6', shoeId: 'sneakers', shoeColor: '#FAFAF5' },
      appearance: { skinColor: '#EDBE98', hairId: 'curly', hairColor: '#9A4A2A', headwearId: 'none', headwearColor: '#2F3E5C', glasses: false } },
    { id: 'coral-dress', label: 'Coral dress',
      outfit: { topId: 'dress', topColor: '#E0705A', bottomId: 'trousers', bottomColor: '#3D4D5A', shoeId: 'boots', shoeColor: '#1E1E22' },
      appearance: { skinColor: '#DDA273', hairId: 'bun', hairColor: '#6A452E', headwearId: 'none', headwearColor: '#E0705A', glasses: true } },
    { id: 'navy-knit', label: 'Navy knit',
      outfit: { topId: 'knit', topColor: '#2F3E5C', bottomId: 'trousers', bottomColor: '#B9A77C', shoeId: 'loafers', shoeColor: '#3A3A40' },
      appearance: { skinColor: '#F6D7BD', hairId: 'bob', hairColor: '#D9B36A', headwearId: 'beanie', headwearColor: '#B4533C', glasses: false } },
    { id: 'sky-scarf', label: 'Sky and scarf',
      outfit: { topId: 'shirt', topColor: '#8FB8DE', bottomId: 'trousers', bottomColor: '#EDE9D9', shoeId: 'sneakers', shoeColor: '#2F3E5C' },
      appearance: { skinColor: '#A66B46', hairId: 'none', hairColor: '#1F1B1E', headwearId: 'headscarf', headwearColor: '#6B3F69', glasses: false } }
  ].map(p => Object.freeze({ ...p, outfit: Object.freeze(p.outfit), appearance: Object.freeze({ ...p.appearance, ...FACE_DEFAULTS, ...(PRESET_FACES[p.id] || {}) }) }))),
  nicknameWords: Object.freeze({
    first: Object.freeze(['Pixel', 'Cozy', 'Sunny', 'Mossy', 'Velvet', 'Denim', 'Maple', 'Lucky', 'Breezy', 'Minty']),
    second: Object.freeze(['Fern', 'Comet', 'Pebble', 'Sprout', 'Biscuit', 'Button', 'Clover', 'Sparrow', 'Acorn', 'Marble'])
  }),
  motions: Object.freeze(['system', 'reduced', 'full'])
});

const index = list => new Map(list.map(entry => [entry.id, entry]));
const tables = { faces: index(manifest.faces), builds: index(manifest.builds), eyes: index(manifest.eyes), brows: index(manifest.brows), noses: index(manifest.noses), mouths: index(manifest.mouths), facialHair: index(manifest.facialHair), tops: index(manifest.tops), bottoms: index(manifest.bottoms), shoes: index(manifest.shoes), hair: index(manifest.hair), headwear: index(manifest.headwear), scenes: index(manifest.scenes), presets: index(manifest.presets) };
export const has = (table, id) => typeof id === 'string' && tables[table].has(id);
export const lookup = (table, id) => (typeof id === 'string' ? tables[table].get(id) : undefined) || null;
