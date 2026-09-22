import React, { useEffect, useRef, useState } from 'react';
import { Garment } from './components.jsx';
import { contexts } from './logic.js';

function RetrievalPanel({ retrieval, items, onEdit, loading, error }) {
  return <div className="retrieval-panel" aria-label="Wardrobe matches">
    {error && <div className="studio-notice" role="status">{error}</div>}
    {loading && <p role="status">Finding pieces that fit your brief…</p>}
    {retrieval && <>
      <p>{retrieval.retrievedCount} pieces shortlisted from {retrieval.eligibleCount} reviewed pieces, using your brief and the categories needed for an outfit.</p>
      <div className="retrieval-items">{[...retrieval.items].sort((a, b) => (b.id === retrieval.anchorId) - (a.id === retrieval.anchorId) || b.score - a.score).map(match => {
        const item = items.find(i => i.id === match.id);
        return item && <button key={item.id} className="retrieval-item" onClick={() => onEdit(item)} aria-label={`Inspect ${item.name}`}>
          <div className="retrieval-thumb"><Garment item={item}/></div>
          <span><strong>{item.name}</strong><small>{retrieval.anchorId === item.id ? 'Your starting piece' : match.reasons?.[0] || item.category}</small></span>
          <span aria-hidden="true">↗</span>
        </button>;
      })}</div>
      {retrieval.guidance?.length > 0 && <details className="retrieval-guidance"><summary>Styling notes</summary>{retrieval.guidance.map(guide => <article key={guide.id}><h3>{guide.title}</h3><p>{guide.text}</p></article>)}<p className="retrieval-method">App-authored styling ideas supplied to the AI.</p></details>}
      <p className="retrieval-method">{retrieval.embedding?.available?'Matches combine meaning and keywords in your saved descriptions, with the pieces needed for a complete outfit.':'Matches use keywords in your saved descriptions, with the pieces needed for a complete outfit.'} {retrieval.fallback?.active&&'Semantic search is unavailable for this request; keyword search is still working.'} Relevance scores are not confidence ratings.</p>
    </>}
  </div>;
}

export default function OutfitStudio({items,context,onContext,request,onRequest,engine,onEngine,anchorId,onAnchor,aiReady,styling,styleStage,previewing,retrieval,retrievalError,onPreview,onGenerate,onCancel,processingCount,quest,options,selected,onSelect,message,onEdit,children,allowResultFocus=true}) {
  const [briefOpen, setBriefOpen] = useState(true);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const resultsRef = useRef(null);
  const focusAllowed = useRef(allowResultFocus); focusAllowed.current = allowResultFocus;
  const working = styling || previewing;
  const chosen = options[selected];
  const outfit = chosen?.itemIds.map(id => items.find(i => i.id === id)).filter(Boolean) || [];
  const hasResults = outfit.length > 0;
  const resultKey = options[0]?.wearId || '';
  const anchor = engine === 'agent' && items.find(i => i.id === anchorId);
  useEffect(() => {
    setBriefOpen(!resultKey);
    setEvidenceOpen(false);
    setMatchesOpen(false);
    if (resultKey) {
      const frame = requestAnimationFrame(() => {
        if (!focusAllowed.current) return;
        resultsRef.current?.focus({ preventScroll: true });
        resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [resultKey]);

  function preview() {
    setMatchesOpen(true);
    if (hasResults) setEvidenceOpen(true);
    onPreview();
  }

  const brief = <section className="studio-brief" aria-label="Outfit brief">
    <div className="studio-title"><h2>What’s the plan?</h2><span className={`studio-status ${aiReady ? 'connected' : ''}`}><i/>{engine === 'baseline' ? 'Instant styling' : aiReady ? 'Local AI ready' : 'Local AI offline'}</span></div>
    <div className="studio-brief-fields">
      <label className="studio-label studio-occasion">Occasion<select disabled={working} value={context} onChange={e => onContext(e.target.value)}>{contexts.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
      <label className="studio-label studio-mood">What do you feel like wearing?<textarea maxLength="1800" disabled={working} value={request} onChange={e => onRequest(e.target.value)} rows="2" placeholder="Relaxed layers, earth tones, something comfortable…"/></label>
    </div>
    {anchor && <div className="studio-anchor-preview"><Garment item={anchor}/><div><strong>{anchor.name}</strong><span>Included in every suggested look.</span></div><button aria-label="Clear starting piece" disabled={working} onClick={() => onAnchor('')}>×</button></div>}
    <details className="studio-preferences"><summary>Preferences<span>{engine === 'baseline' ? 'Instant styling' : anchor ? 'Starting piece selected' : 'Optional'}</span></summary>
      <div className="studio-preference-fields">
        {engine === 'agent' && <label className="studio-label studio-anchor">Include a favorite piece<select value={anchorId} disabled={working} onChange={e => onAnchor(e.target.value)}><option value="">Let the stylist choose</option>{items.filter(i => !i.needsReview).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <label className="studio-label studio-engine">Styling method<select disabled={working} value={engine} onChange={e => onEngine(e.target.value)}><option value="agent">Local AI</option><option value="baseline">Instant · wardrobe rules</option></select></label>
      </div>
      {engine === 'baseline' ? <p className="studio-help">Uses your saved occasion tags. Your mood description is used with Local AI.</p> : <>
        <button className="studio-preview-button" disabled={working || !items.some(i => !i.needsReview)} onClick={preview}>Preview wardrobe matches</button>
        {!hasResults && (retrieval || retrievalError || previewing) && <details className="studio-matches" open={matchesOpen} onToggle={e => setMatchesOpen(e.currentTarget.open)}><summary>Wardrobe matches</summary><RetrievalPanel retrieval={retrieval} items={items} onEdit={onEdit} loading={previewing} error={retrievalError}/></details>}
      </>}
    </details>
    {engine === 'agent' && !aiReady && <p className="studio-help studio-offline">AI is offline. <button className="text-button" disabled={working} onClick={() => onEngine('baseline')}>Use instant styling</button></p>}
    {engine === 'agent' && processingCount > 0 && <p className="studio-help">Styling will be ready when your photo analysis finishes.</p>}
    {items.some(i => i.needsReview) && <p className="studio-help">Review new imports to include them in your looks.</p>}
    {quest && <div className="studio-quest"><strong>{quest.title}</strong><p>{quest.subtitle}</p></div>}
    <div className="studio-buttons"><button className="primary" disabled={working || engine === 'agent' && (!aiReady || processingCount > 0)} onClick={onGenerate}>{styling ? (styleStage === 'retrieving' ? 'Finding your pieces…' : 'Creating your looks…') : 'Create my looks'} <span aria-hidden="true">↗</span></button></div>
  </section>;

  return <div className={`studio studio-simple ${hasResults ? 'studio-has-results' : ''}`}>
    <div className="studio-workspace"><details className={`studio-brief-disclosure ${hasResults ? '' : 'studio-brief-initial'}`} open={!hasResults || briefOpen} onToggle={e => setBriefOpen(e.currentTarget.open)}><summary hidden={!hasResults}>Change the brief<span>{context}{anchor ? ` · ${anchor.name}` : ''}</span></summary>{brief}</details></div>
    {working && <div className="studio-progress" role="status"><span className="pulse-dot"/><div><strong>{previewing || styleStage === 'retrieving' ? 'Finding your pieces…' : 'Creating your looks…'}</strong></div><button onClick={onCancel}>{previewing ? 'Stop preview' : 'Stop styling'}</button></div>}
    {!styling && !hasResults && message && <div className="studio-message" role="status">{message}</div>}
    {hasResults && <section className="studio-results" aria-label="Suggested outfits">
      <div className="studio-results-heading"><h2 ref={resultsRef} tabIndex={-1}>{chosen.title}</h2><div className="studio-look-tabs" aria-label="Choose an outfit">{options.map((look, index) => <button key={look.wearId} aria-pressed={selected === index} className={selected === index ? 'chosen' : ''} onClick={() => onSelect(index)}>Look {index + 1}</button>)}</div></div>
      <div className="studio-look"><div className="studio-look-photos">{outfit.map(item => <button key={item.id} onClick={() => onEdit(item)} aria-label={`View ${item.name}`}><div className="studio-piece-image"><Garment item={item}/>{anchorId === item.id && <span>Your starting piece</span>}</div><span className="studio-piece-category">{item.category}</span><strong>{item.name}</strong></button>)}</div><div className="studio-look-story"><span className="studio-kicker">WHY IT WORKS</span><p>{chosen.explanation}</p>{chosen.stylingTip && <div className="studio-tip"><strong>Try this</strong><p>{chosen.stylingTip}</p></div>}<div className="studio-palette" aria-label="Outfit color palette">{outfit.map(item => <span key={item.id} style={{background:item.color}} title={item.colorName || item.name}/>)}</div><small>{chosen.engine === 'agent' ? 'Suggested by local AI' : 'Matched by wardrobe rules'}</small></div></div>
      {children}
      {(chosen.grounding?.length > 0 || engine === 'agent' && (retrieval || retrievalError || previewing)) && <details className="studio-grounding" open={evidenceOpen} onToggle={e => setEvidenceOpen(e.currentTarget.open)}><summary>How this look was made</summary>
        {chosen.grounding?.length > 0 && <><div className="studio-grounding-grid">{chosen.grounding.map(source => {const item = items.find(i => i.id === source.itemId);return item && <article key={source.itemId}><button onClick={() => onEdit(item)}>{item.name} ↗</button><ul>{source.facts.map((fact, index) => <li key={index}>{fact}</li>)}</ul><p>{source.reasons.join(' · ')}</p></article>;})}</div>{chosen.guideCitations?.length > 0 && <p className="studio-citations">Styling notes: {chosen.guideCitations.map(g => g.title).join(' · ')}.</p>}<p className="studio-citations">Based on saved garment details. Styling suggestions can still need a personal adjustment.</p></>}
        {engine === 'agent' && (retrieval || retrievalError || previewing) && <details className="studio-matches" open={matchesOpen} onToggle={e => setMatchesOpen(e.currentTarget.open)}><summary>Wardrobe matches</summary><RetrievalPanel retrieval={retrieval} items={items} onEdit={onEdit} loading={previewing} error={retrievalError}/></details>}
      </details>}
    </section>}
  </div>;
}
