const pages=new Set(['Closet','Outfits','Lookbook','Memory','Validation','Quests','Inspiration','Resale','Lab']);
const point = value => Number.isFinite(value) ? Math.max(0, Math.min(value,100000)) : 0;
// Store only route names and scroll positions, never wardrobe content or briefs.
export function readNavigationSnapshot(storage,key){
  try{const value=JSON.parse(storage.getItem(key));return value?.version===1?value:null;}catch{return null;}
}
export function writeNavigationSnapshot(storage,key,memory){
  try{storage.setItem(key,JSON.stringify(memory.snapshot()));return true;}catch{return false;}
}
// Keep a tab's place in the journey. Apply only when navigation actually commits.
export function createNavigationMemory(initial = 'Closet', snapshot=null) {
  let current = pages.has(snapshot?.current)?snapshot.current:initial;
  const visited = new Set([current]), positions = new Map();
  for(const [page,position] of Object.entries(snapshot?.positions||{}))if(pages.has(page)&&position&&typeof position==='object'){
    visited.add(page);positions.set(page,{x:point(position.x),y:point(position.y)});
  }
  return {
    get current() { return current; },
    get position() { return positions.get(current)||{x:0,y:0}; },
    checkpoint(position={}){positions.set(current,{x:point(position.x),y:point(position.y)});},
    snapshot(){return {version:1,current,positions:Object.fromEntries(positions)};},
    move(destination, position = {}) {
      if (!pages.has(destination)||destination === current) return { changed: false };
      positions.set(current, { x: point(position.x), y: point(position.y) });
      const returning = visited.has(destination);
      current = destination;
      visited.add(destination);
      return { changed: true, returning, position: positions.get(destination) || { x: 0, y: 0 } };
    },
  };
}
