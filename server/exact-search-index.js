import {normalizeVector} from './embeddings.js';

const stopWords=new Set(['the','and','with','for','that','this','from','your','what','wear','outfit','look','please','would','have','are','can','want']);
export function searchTokens(text) {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(token=>token.length>1&&!stopWords.has(token)))];
}

// Exact cosine search: prepare each source row once, then use a dot product on
// normalized Float64 vectors. No quantization, reduced dimensions, or ANN recall loss.
// The SQLite snapshot remains authoritative; raw vector/identity/text comparisons
// invalidate even edits made by another process.
export function createExactSearchIndex({maxEntries=1024}={}) {
  if(!Number.isInteger(maxEntries)||maxEntries<0||maxEntries>4096)throw new RangeError('Invalid search index size.');
  const entries=new Map();
  return {
    prepare(rows,namespace) {
      const live=new Set(rows.map(row=>JSON.stringify([namespace,row.document_id,row.ordinal])));
      for(const [key,entry] of entries)if(entry.namespace===namespace&&!live.has(key))entries.delete(key);
      const stats={hits:0,misses:0,entries:0};
      const records=rows.map(row=>{
        const key=JSON.stringify([namespace,row.document_id,row.ordinal]);
        let entry=entries.get(key);
        if(entry&&entry.text===row.text&&entry.title===row.title&&entry.rawVector===row.vector&&entry.rawIdentity===row.identity) {
          stats.hits++;entries.delete(key);
        } else {
          stats.misses++;
          entry={namespace,text:row.text,title:row.title,rawVector:row.vector,rawIdentity:row.identity,
            textTokens:new Set(searchTokens(row.text)),titleTokens:new Set(searchTokens(row.title)),
            vector:null,identityKey:null,corrupt:false};
          if(row.vector)try {
            const identity=JSON.parse(row.identity);
            entry.identityKey=JSON.stringify(identity);
            entry.vector=Float64Array.from(normalizeVector(JSON.parse(row.vector),identity.dimensions));
          }catch{entry.corrupt=true;}
        }
        if(maxEntries>0) {
          entries.set(key,entry);
          while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
        }
        return {row,prepared:entry};
      });
      stats.entries=entries.size;
      return {records,stats};
    },
    invalidate(namespace,documentId) {
      for(const [key,entry] of entries) {
        if(entry.namespace!==namespace)continue;
        if(documentId===undefined||JSON.parse(key)[1]===documentId)entries.delete(key);
      }
    },
    clear(){entries.clear();},
  };
}

export function preparedLexicalScore(queryTokens,entry) {
  return queryTokens.length?queryTokens.reduce((sum,token)=>sum+(entry.titleTokens.has(token)?1:entry.textTokens.has(token)?0.75:0),0)/queryTokens.length:0;
}

// Both inputs have already been validated and L2-normalized.
export function normalizedDot(left,right) {
  if(left.length!==right.length||!left.length)throw new RangeError('Embedding dimensions do not match.');
  let dot=0;
  for(let i=0;i<left.length;i++)dot+=left[i]*right[i];
  return Math.max(-1,Math.min(1,dot));
}
