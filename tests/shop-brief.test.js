import test from 'node:test';
import assert from 'node:assert/strict';
import {parseShopBrief,matchesShopProduct,retailerSearch} from '../src/shop-brief.js';
import {createShoppingLibrary} from '../server/shopping-library.js';
import {normalizeFinds,shoppingQuery} from '../server/shopping.js';

test('direct shopping extracts public product terms and leaves out the private brief',()=>{
 const q=parseShopBrief("Find me women's black loafers under $150 for my interview with Jessie");
 assert.deepEqual(q,{mode:'shop',category:'Shoes',kind:'loafers',color:'black',maxPrice:150,presentation:'womenswear',occasion:'everyday'});
 assert.doesNotMatch(retailerSearch(q),/Jessie|interview/i);
 assert.equal(parseShopBrief('Find shoes to go with this outfit').mode,'shop');
 assert.equal(parseShopBrief('What shoes can I buy online?').category,'Shoes');
 assert.equal(parseShopBrief('Show me new clothes online').category,'All');
 assert.equal(parseShopBrief('find me shoes under $60').presentation,'any');
});
test('shop along with a closet look even when the owned outfit already has shoes',()=>{
 const q=parseShopBrief('Style my black jeans for dinner and find white sneakers under $150');
 assert.equal(q.mode,'mixed');assert.equal(q.kind,'sneakers');assert.equal(q.color,'white');
 assert.equal(parseShopBrief('Create an outfit and recommend shoes').mode,'mixed');
 for(const brief of ['style my jeans for dinner','I need an outfit with shoes','Find my sneakers','recommend shoes from my closet','I want to wear my jeans','new shoes? no shopping'])assert.equal(parseShopBrief(brief),null,brief);
});
test('footwear library obeys exact budgets, product type, presentation and freshness without a provider',async()=>{
 let clock=Date.parse('2026-11-17T21:00:00Z');
 const library=createShoppingLibrary({now:()=>clock,search:()=>assert.fail('provider call')});
 const browse=brief=>library.browse({...parseShopBrief(brief),mode:'library'});
 const cheap=await browse('find shoes under $60');
 assert.deepEqual(cheap.products.map(p=>p.price),[50,50]);
 assert.ok(cheap.products.every(p=>p.category==='Shoes'&&p.image&&p.owned===false));
 const loafers=await browse('find black loafers under $150');
 assert.equal(loafers.products.length,1);assert.equal(loafers.products[0].price,148);
 assert.equal((await browse("find men's black loafers under $150")).products.length,0);
 assert.equal((await browse('find green boots under $80')).products.length,0);
 clock+=15*86400000;
 assert.equal((await browse('find shoes under $60')).products.length,0);
});
test('a shirt with a sourced price and shoe-care products cannot pass a footwear search',()=>{
 const q=shoppingQuery({category:'Shoes',occasion:'everyday'});
 const url='https://www.jcrew.com/p/shirt/ABC',product={url,title:'Denim shirt',price:20,currency:'USD'};
 const evidence={output:[{type:'web_search_call',action:{sources:[{url}]},results:[{type:'text_result',url,snippet:'$20'}]}]};
 assert.deepEqual(normalizeFinds({products:[product]},evidence,q),[]);
 assert.equal(matchesShopProduct({title:'Leather shoe polish'},q),false);
 assert.throws(()=>shoppingQuery({...q,kind:'shirt'}));
});
