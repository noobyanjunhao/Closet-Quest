import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fail} from './purchase-contract.js';

// A separate import ledger: the existing photo job store is image-specific.
// A single transaction owns the draft, item revisions, garment units and receipt.
export function createPurchaseStore(path=':memory:',{beforeUnit}={}){
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS purchase_imports(id TEXT PRIMARY KEY,owner TEXT NOT NULL,create_key TEXT NOT NULL,source_hash TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,UNIQUE(owner,create_key));
 CREATE TABLE IF NOT EXISTS purchase_import_commits(owner TEXT NOT NULL,commit_key TEXT NOT NULL,import_id TEXT NOT NULL REFERENCES purchase_imports(id) ON DELETE CASCADE,request_hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(owner,commit_key),UNIQUE(import_id));
 CREATE TABLE IF NOT EXISTS purchase_import_garments(import_id TEXT NOT NULL REFERENCES purchase_imports(id) ON DELETE CASCADE,item_id TEXT NOT NULL,unit INTEGER NOT NULL,garment_id TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,PRIMARY KEY(import_id,item_id,unit));
 CREATE TABLE IF NOT EXISTS purchase_import_audit(import_id TEXT NOT NULL REFERENCES purchase_imports(id) ON DELETE CASCADE,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(import_id,revision));`);
 const parse=row=>row?JSON.parse(row.payload):null;
 const get=(owner,id)=>parse(db.prepare('SELECT payload FROM purchase_imports WHERE owner=? AND id=?').get(owner,id));
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 return {
  get,
  list(owner){return db.prepare('SELECT payload FROM purchase_imports WHERE owner=? ORDER BY rowid DESC LIMIT 100').all(owner).map(parse);},
  create(draft){return transaction(()=>{const old=parse(db.prepare('SELECT payload FROM purchase_imports WHERE owner=? AND create_key=?').get(draft.owner,draft.createKey));if(old){if(old.source.hash!==draft.source.hash||old.provider!==draft.provider)throw fail('This key belongs to different purchase text.','IMPORT_KEY_CONFLICT',409);return old;}if(db.prepare('SELECT count(*) AS n FROM purchase_imports WHERE owner=?').get(draft.owner).n>=100)throw fail('Remove old drafts before adding more.','IMPORT_LIMIT_EXCEEDED',429);db.prepare('INSERT INTO purchase_imports VALUES(?,?,?,?,?,?)').run(draft.id,draft.owner,draft.createKey,draft.source.hash,draft.revision,JSON.stringify(draft));return draft;});},
  save(draft,expected,{commit}={}){return transaction(()=>{
   const old=get(draft.owner,draft.id);if(!old)throw fail('Import not found.','IMPORT_NOT_FOUND',404);if(old.revision!==expected)throw fail('Reload the latest review before saving.','IMPORT_REVISION_CONFLICT',409);
   if(commit){
    for(const [i,g]of commit.garments.entries()){beforeUnit?.(g,i);db.prepare('INSERT INTO purchase_import_garments VALUES(?,?,?,?,?)').run(draft.id,g.purchaseImport.itemId,g.purchaseImport.unit,g.id,JSON.stringify(g));}
    db.prepare('INSERT INTO purchase_import_commits VALUES(?,?,?,?,?)').run(draft.owner,commit.key,draft.id,commit.hash,JSON.stringify(commit.result));
   }
   db.prepare('UPDATE purchase_imports SET revision=?,payload=? WHERE id=? AND owner=?').run(draft.revision,JSON.stringify(draft),draft.id,draft.owner);
   db.prepare('INSERT INTO purchase_import_audit VALUES(?,?,?)').run(draft.id,draft.revision,JSON.stringify(draft.audit.at(-1)));return draft;
  });},
  committed(owner,key){const row=db.prepare('SELECT * FROM purchase_import_commits WHERE owner=? AND commit_key=?').get(owner,key);return row?{hash:row.request_hash,importId:row.import_id,result:JSON.parse(row.result)}:null;},
  recover(){return transaction(()=>{for(const row of db.prepare('SELECT payload FROM purchase_imports').all()){const d=parse(row);if(['queued','extracting'].includes(d.status)){d.status='failed';d.error={code:'IMPORT_INTERRUPTED',message:'Local service restarted. Retry extraction.'};d.revision++;db.prepare('UPDATE purchase_imports SET revision=?,payload=? WHERE id=?').run(d.revision,JSON.stringify(d),d.id);}}});},
  remove(owner,id){const d=get(owner,id);if(!d)throw fail('Import not found.','IMPORT_NOT_FOUND',404);if(['queued','extracting'].includes(d.status))throw fail('Cancel extraction before removing its source.','IMPORT_INVALID_STATE',409);
   if(d.status==='committed'){d.source={hash:d.source.hash,text:'',lines:[]};d.items=[];d.audit=[];delete d.extraction;d.sourceRemoved=true;db.prepare('UPDATE purchase_imports SET payload=? WHERE id=? AND owner=?').run(JSON.stringify(d),id,owner);db.prepare('DELETE FROM purchase_import_audit WHERE import_id=?').run(id);}
   else db.prepare('DELETE FROM purchase_imports WHERE owner=? AND id=?').run(owner,id);return {removed:true};},
  counts(){return {drafts:db.prepare('SELECT count(*) n FROM purchase_imports').get().n,units:db.prepare('SELECT count(*) n FROM purchase_import_garments').get().n};},
  close(){db.close();}
 };
}
