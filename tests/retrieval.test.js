import test from 'node:test';
import assert from 'node:assert/strict';
import {retrieveWardrobe, STYLE_GUIDES, itemGrounding} from '../server/retrieval.js';

const garment = (id, category, extra={}) => ({id, category, wears:5, ...extra});
const base = () => [garment('top','Top',{name:'Cotton tee'}), garment('bottom','Bottom',{name:'Black trousers'}), garment('shoes','Shoes',{name:'White sneakers'})];

test('retrieval recalls a relevant piece and essential slots among 180 distracting garments', () => {
  const distractors = Array.from({length:180}, (_, index) => garment(`distractor-${index}`, index < 100 ? 'Top' : 'Accessory', {name:index < 100 ? 'Pink cotton top' : 'Printed scarf', tags:'Campus casual'}));
  const relevant = garment('navy','Top',{name:'Indigo tailored shirt',colorName:'Navy',tags:'Presentation day'});
  const result = retrieveWardrobe([...distractors, ...base().slice(1), relevant], {request:'A blue polished look for the office'});
  assert.ok(result.items.some(item => item.id === 'navy'));
  assert.ok(result.items.some(item => item.category === 'Bottom'));
  assert.ok(result.items.some(item => item.category === 'Shoes'));
  assert.equal(result.items.length, 18);
  assert.equal(result.retrieval.eligibleCount, 183);
  assert.ok(result.retrieval.items.find(item => item.id === 'navy').reasons.join(' ').includes('indigo'));
  assert.ok(result.retrieval.guidance.some(guide => guide.id === 'CQ-G02'));
});

test('corrections are reindexed immediately and pending review pieces never reach retrieval', () => {
  const wardrobe = [...base(), garment('corrected','Top',{name:'Blue shirt'}), garment('private-pending','Top',{name:'Navy indigo tailored blouse',needsReview:true})];
  const before = retrieveWardrobe(wardrobe,{request:'blue'});
  assert.ok(before.retrieval.items.find(item => item.id === 'corrected').score > 0);
  wardrobe[3].name = 'Red shirt';
  const after = retrieveWardrobe(wardrobe,{request:'blue'});
  assert.equal(after.retrieval.items.find(item => item.id === 'corrected').score, 0);
  assert.equal(after.retrieval.excludedReviewCount, 1);
  assert.ok(!JSON.stringify(after).includes('private-pending'));
  assert.equal(after.items.find(item => item.id === 'corrected').name, 'Red shirt');
});

test('retrieval reserves an owned anchor and a feasible low-use piece even without lexical matches', () => {
  const wardrobe = [...base(), ...Array.from({length:80},(_,index)=>garment(`extra-${index}`,'Outerwear',{name:'Blue tailored jacket'})), garment('anchor','Top',{name:'Pink tee'}), garment('low','Bottom',{name:'Yellow skirt',wears:0})];
  const result = retrieveWardrobe(wardrobe,{request:'blue tailored jacket',anchorId:'anchor',requireLowUse:true});
  assert.ok(result.items.some(item => item.id === 'anchor'));
  assert.ok(result.items.some(item => item.id === 'low'));
  assert.ok(result.items.some(item => item.category === 'Shoes'));
  assert.equal(result.retrieval.anchorId,'anchor');
  assert.ok(result.retrieval.items.find(item => item.id === 'low').reasons.includes('One recorded wear or less; eligible for rediscovery'));
});

test('invalid anchors, missing slots and incompatible low-use requirements fail before generation', () => {
  assert.throws(()=>retrieveWardrobe(base(),{request:'',anchorId:'not-owned'}),{code:'ANCHOR_NOT_FOUND',status:400});
  assert.throws(()=>retrieveWardrobe(base().map(item=>({...item,needsReview:item.id==='top'})),{request:'',anchorId:'top'}),{code:'ANCHOR_NEEDS_REVIEW'});
  assert.throws(()=>retrieveWardrobe(base().slice(0,2),{request:''}),{code:'NO_COMPLETE_OUTFIT'});
  assert.throws(()=>retrieveWardrobe([...base(),garment('low-top','Top',{wears:0})],{request:'',anchorId:'top',requireLowUse:true}),{code:'NO_COMPLETE_OUTFIT'});
  assert.throws(()=>retrieveWardrobe([...base().slice(1),garment('dress','Dress'),garment('anchor','Top')],{request:'',anchorId:'anchor',requireLowUse:true}),{code:'NO_COMPLETE_OUTFIT'});
  const dress = retrieveWardrobe([garment('dress','Dress',{wears:0}),garment('shoes','Shoes')],{request:'',anchorId:'dress',requireLowUse:true});
  assert.equal(dress.items.length,2);
});

test('optional metadata is safe; mixed tag shapes and oversized input are rejected', () => {
  const minimal = retrieveWardrobe(base().map(({id,category,wears})=>({id,category,wears})),{request:''});
  assert.equal(minimal.items.length,3);
  assert.ok(itemGrounding(minimal.items[0],minimal.retrieval).facts.includes('Recorded wears: 5'));
  assert.throws(()=>retrieveWardrobe([garment('bad','Top',{tags:[null]}),...base().slice(1)],{request:''}),{code:'INVALID_STYLE_REQUEST'});
  assert.throws(()=>retrieveWardrobe([garment('bad','Top',{styleTags:{text:'blue'}}),...base().slice(1)],{request:''}),{code:'INVALID_STYLE_REQUEST'});
  assert.throws(()=>retrieveWardrobe(Array.from({length:201},(_,i)=>garment(String(i),'Top')),{request:''}),{code:'INVALID_STYLE_REQUEST'});
  assert.throws(()=>retrieveWardrobe(base(),{request:'',context:{occasion:'office'}}),{code:'INVALID_STYLE_REQUEST'});
  assert.throws(()=>retrieveWardrobe(base(),{request:'',requireLowUse:'false'}),{code:'INVALID_STYLE_REQUEST'});
});

test('retrieval strips photos and unknown fields, returns bounded authored guidance with stable citations', () => {
  const result = retrieveWardrobe(base().map(item=>({...item,image:'PRIVATE-PHOTO',recognition:{jobId:'PRIVATE-JOB'},unexpected:'PRIVATE-FIELD'})),{request:'blue casual outfit for coffee'});
  assert.ok(!JSON.stringify(result).includes('PRIVATE-'));
  assert.ok(result.retrieval.guidance.length > 0 && result.retrieval.guidance.length <= 3);
  for(const guide of result.retrieval.guidance) assert.ok(['id','title','text'].every(key=>typeof guide[key]==='string'));
  assert.ok(result.retrieval.guidance.every(guide=>STYLE_GUIDES.some(source=>source.id===guide.id&&source.text===guide.text)));
  assert.equal(result.retrieval.guidance[0].id,'CQ-G01');
});

test('specific style guidance carries source provenance without expanding every brief', () => {
  for(const [request,id] of [['tonal texture gradation','CQ-G09'],['structure ease tailoring','CQ-G10']]) {
    const result=retrieveWardrobe(base(),{request});
    const guide=result.retrieval.guidance.find(guide=>guide.id===id);
    assert.equal(guide?.source.type,'authored-interpretation');
    assert.equal(guide.source.url,'https://www.uniqlo.com/us/en/contents/lifewear-magazine/the-modern-layering-guide/');
    assert.ok(result.retrieval.guidance.length<=3);
  }
  assert.deepEqual(retrieveWardrobe(base(),{request:''}).retrieval.guidance.map(guide=>guide.id),['CQ-G01']);
});
