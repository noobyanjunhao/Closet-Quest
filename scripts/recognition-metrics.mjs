export const categories=['Top','Bottom','Shoes','Dress','Outerwear','Accessory'];
const ratio=(a,b)=>b?a/b:null;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
export function scoreRecognition(rows) {
  return Object.fromEntries([...new Set(rows.map(r=>r.mode))].map(mode=>{
    const selected=rows.filter(r=>r.mode===mode),perCategory={};
    let tp=0,fp=0,fn=0,exact=0;
    for(const category of categories){
      const count={tp:0,fp:0,fn:0,support:0};
      for(const row of selected){
        const expected=row.expected.includes(category),predicted=row.status==='completed'&&row.predicted.includes(category);
        if(expected)count.support++;
        if(expected&&predicted)count.tp++;else if(expected)count.fn++;else if(predicted)count.fp++;
      }
      tp+=count.tp;fp+=count.fp;fn+=count.fn;
      perCategory[category]={...count,precision:ratio(count.tp,count.tp+count.fp),recall:ratio(count.tp,count.support),f1:ratio(2*count.tp,2*count.tp+count.fp+count.fn)};
    }
    for(const row of selected){
      if(row.status==='completed'&&JSON.stringify([...new Set(row.expected)].sort())===JSON.stringify([...new Set(row.predicted)].sort()))exact++;
    }
    const hatRows=selected.filter(r=>r.annotatedHat),failed=selected.filter(r=>r.status!=='completed').length;
    return [mode,{images:selected.length,completed:selected.length-failed,failed,failureRate:ratio(failed,selected.length),
      exactSetMatches:exact,exactSetAccuracy:ratio(exact,selected.length),tp,fp,fn,
      microPrecision:ratio(tp,tp+fp),microRecall:ratio(tp,tp+fn),microF1:ratio(2*tp,2*tp+fp+fn),
      perCategory,hat:{positiveImages:hatRows.length,detected:hatRows.filter(r=>r.status==='completed'&&r.hatDetected).length,recall:ratio(hatRows.filter(r=>r.status==='completed'&&r.hatDetected).length,hatRows.length)},
      latencyMs:{p50:percentile(selected.map(r=>r.latencyMs),0.5),p95:percentile(selected.map(r=>r.latencyMs),0.95)}}];
  }));
}
