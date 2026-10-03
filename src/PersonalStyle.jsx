import React, { useEffect, useRef, useState } from 'react';
import { api } from './photos.js';
import { normalizePreferences, PREFERENCE_OPTIONS, setRecommendationFeedback } from './preferences.js';
import './personal-style.css';

const TABS = ['My style', 'Knowledge', 'History'];
const MAX_DOCUMENT = 20000;

function dateLabel(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable';
}

function ChoiceChips({ label, options, selected, onChange, hint, limit }) {
  return <fieldset className="memory-choices"><legend>{label}</legend>{hint && <p>{hint}</p>}<div className="memory-chips">{options.map(option => {
    const active = selected.includes(option);
    return <label key={option} className={active ? 'memory-chip selected' : 'memory-chip'}><input type="checkbox" checked={active} disabled={!active && selected.length >= limit} onChange={() => onChange(active ? selected.filter(value => value !== option) : [...selected, option])}/><span>{option}</span></label>;
  })}</div></fieldset>;
}

function StylePreferences({ state, onSave, ai, notify }) {
  const [draft, setDraft] = useState(() => normalizePreferences(state.preferences));
  const [message, setMessage] = useState('');
  const previousWardrobe = useRef(state.wardrobeId);
  useEffect(() => {
    if (previousWardrobe.current !== state.wardrobeId) { previousWardrobe.current = state.wardrobeId; setDraft(normalizePreferences(state.preferences)); setMessage(''); }
  }, [state.wardrobeId, state.preferences]);
  useEffect(() => { setDraft(current => ({ ...current, embeddingProvider: normalizePreferences(state.preferences).embeddingProvider })); }, [state.preferences?.embeddingProvider]);
  const update = (field, value) => { setDraft(current => ({ ...current, [field]: value })); setMessage(''); };
  const configured = Boolean(ai?.openai?.configured);
  const dirty = JSON.stringify(normalizePreferences(state.preferences)) !== JSON.stringify(normalizePreferences(draft));
  function save(event) {
    event.preventDefault();
    const preferences = normalizePreferences(draft);
    if (!onSave(previous => ({ ...previous, preferences }))) { setMessage('Your preferences could not be saved. Try again.'); return; }
    setDraft(preferences); setMessage('Saved. Your next recommendation will use these preferences.'); notify?.('Personal style saved');
  }
  return <form onSubmit={save} className="memory-preferences"><div className="memory-form-grid"><section className="memory-card"><p className="eyebrow">THE THINGS YOU REACH FOR</p><h2>Make it feel like you.</h2><ChoiceChips label="Your style" options={PREFERENCE_OPTIONS.styles} selected={draft.styles} onChange={value => update('styles', value)} hint="Choose up to six. You can leave these open." limit={6}/><ChoiceChips label="Colors you enjoy" options={PREFERENCE_OPTIONS.colors} selected={draft.colors} onChange={value => { update('colors', value); setDraft(current => ({ ...current, avoidColors: current.avoidColors.filter(color => !value.includes(color)) })); }} limit={8}/><label>Preferred fit<select value={draft.fit} onChange={event => update('fit', event.target.value)}>{PREFERENCE_OPTIONS.fit.map(value => <option key={value}>{value}</option>)}</select></label></section>
    <section className="memory-card"><p className="eyebrow">WHAT MATTERS TODAY</p><h2>A little more context.</h2><ChoiceChips label="Your priorities" options={PREFERENCE_OPTIONS.priorities} selected={draft.priorities} onChange={value => update('priorities', value)} hint="Choose up to four." limit={4}/><ChoiceChips label="Avoid in recommendations" options={PREFERENCE_OPTIONS.colors} selected={draft.avoidColors} onChange={value => { update('avoidColors', value); setDraft(current => ({ ...current, colors: current.colors.filter(color => !value.includes(color)) })); }} hint="Uses reviewed color labels. Check multicolor pieces and unreviewed shades yourself." limit={8}/><label>Anything else?<textarea rows="4" maxLength="500" value={draft.notes} onChange={event => update('notes', event.target.value)} placeholder="I walk to campus, prefer layers, and like a relaxed silhouette."/></label><p className="memory-caption">{draft.notes.length}/500 · Shared with the selected styling model when you request an outfit.</p></section></div>
    <details className="memory-models"><summary><span>AI preferences</span><small>{draft.recognitionProvider === 'openai' ? 'OpenAI photos' : 'Local photos'} · {draft.modelProfile} profile</small></summary><div className="memory-model-grid"><label>Photo recognition<select value={draft.recognitionProvider} onChange={event => update('recognitionProvider', event.target.value)}><option value="local">Local · stays on this computer</option><option value="openai" disabled={!configured}>OpenAI{configured ? '' : ' · not configured'}</option></select></label><label>Outfit recommendations<select value={draft.recommendationProvider} onChange={event => update('recommendationProvider', event.target.value)}><option value="auto">Automatic · available provider</option><option value="local">Local model</option><option value="openai" disabled={!configured}>OpenAI{configured ? '' : ' · not configured'}</option><option value="quick">Quick · local ranking, no model</option></select></label><label>OpenAI model profile<select value={draft.modelProfile} onChange={event => update('modelProfile', event.target.value)}><option value="fast">Fast · everyday requests</option><option value="balanced">Balanced · more detail</option><option value="deep">Deep · complex requests</option></select></label></div><p>Photos are sent to OpenAI only when you select OpenAI recognition. Styling uses your reviewed garment details and retrieved style notes. Keys stay on the server.</p><p className="memory-caption">Profiles select the server’s configured OpenAI models; local models use the server’s local configuration. Actual latency varies. {configured ? 'An OpenAI key is configured; each request can still fail if access or billing is unavailable.' : <>To enable OpenAI, configure the server’s <code>.env.local</code> and restart. Signing in to the platform alone does not connect the API.</>}</p></details>
    <div className="memory-save"><button className="primary" type="submit" disabled={!dirty}>Save my style</button><p role="status">{message || (dirty ? 'You have unsaved changes.' : 'Saved on this device. Update these whenever your style changes.')}</p></div></form>;
}

function KnowledgeLibrary({ wardrobeId, preferences, onSave, ai }) {
  const [documents, setDocuments] = useState([]), [loaded, setLoaded] = useState(false), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''), [content, setContent] = useState(''), [source, setSource] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false), [searchResult, setSearchResult] = useState(null);
  const embeddingProvider = normalizePreferences(preferences).embeddingProvider;
  const listRequest = useRef(null), mutation = useRef(null), searchRequest = useRef(null), fileRef = useRef(null), generation = useRef(0);
  function setEmbeddingProvider(value) {
    if (onSave(previous => ({ ...previous, preferences: normalizePreferences({ ...previous.preferences, embeddingProvider: value }) }))) { setSearchResult(null); setMessage('Search provider saved. Future outfit requests will use this provider for wardrobe and document retrieval.'); }
    else setError('The search provider could not be saved. Try again.');
  }
  async function refresh() {
    listRequest.current?.abort(); const controller = new AbortController(); listRequest.current = controller; setLoading(true);
    try { const result = await api('knowledge/list', { wardrobeId }, 'POST', { signal: controller.signal, timeoutMs: 15000 }); if (!controller.signal.aborted) { setDocuments(Array.isArray(result.documents) ? result.documents : []); setLoaded(true); setError(''); } }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    setDocuments([]); setLoaded(false); setTitle(''); setContent(''); setSource(''); setQuery(''); setSearchResult(null); setMessage(''); setError(''); setBusy(false); setSearching(false); generation.current++;
    if (wardrobeId) refresh();
    return () => { generation.current++; listRequest.current?.abort(); mutation.current?.abort(); searchRequest.current?.abort(); };
  }, [wardrobeId]);
  async function importText(file) {
    if (!file) return; setError(''); setMessage(''); const id = generation.current;
    if (!/\.(txt|md)$/i.test(file.name) || file.size > MAX_DOCUMENT * 4) { setError('Choose a .txt or .md file with no more than 20,000 characters.'); return; }
    try { const text = await file.text(); if (id !== generation.current) return; if (!text.trim() || text.length > MAX_DOCUMENT || text.includes('\u0000')) throw new Error('Use a nonempty text document with no more than 20,000 characters.'); setContent(text); setTitle(file.name.replace(/\.(txt|md)$/i, '').slice(0, 120)); setSource(file.name.slice(0, 200)); setMessage('Document loaded for review. Choose Add to library to index it.'); }
    catch (failure) { if (id === generation.current) setError(failure.message || 'This file could not be read.'); }
  }
  async function addDocument(event) {
    event.preventDefault(); if (busy || !wardrobeId) return; searchRequest.current?.abort(); setSearching(false); setBusy(true); setError(''); setMessage('Indexing your document…'); const controller = new AbortController(); mutation.current = controller;
    try { const result = await api('knowledge/documents', { wardrobeId, title: title.trim(), content: content.trim(), source: source.trim() || undefined, embeddingProvider }, 'POST', { signal: controller.signal, timeoutMs: 65000 }); if (controller.signal.aborted) return; setTitle(''); setContent(''); setSource(''); setSearchResult(null); setMessage(result.indexing?.message || result.warning || 'Document added. Relevant excerpts can now support your recommendations.'); await refresh(); }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function removeDocument(document) {
    if (busy) return; searchRequest.current?.abort(); setSearching(false); setBusy(true); setError(''); setMessage(''); const controller = new AbortController(); mutation.current = controller;
    try { await api('knowledge/delete', { wardrobeId, id: document.id }, 'POST', { signal: controller.signal, timeoutMs: 15000 }); if (controller.signal.aborted) return; setDocuments(current => current.filter(value => value.id !== document.id)); setSearchResult(null); setMessage(`Removed “${document.title}” from your library.`); }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function search(event) {
    event.preventDefault(); if (!query.trim() || searching || busy) return; searchRequest.current?.abort(); const controller = new AbortController(); searchRequest.current = controller; setSearching(true); setError(''); setSearchResult(null);
    try { const result = await api('knowledge/search', { wardrobeId, query: query.trim(), lexicalOnly: false, embeddingProvider }, 'POST', { signal: controller.signal, timeoutMs: 30000 }); if (!controller.signal.aborted) setSearchResult(result); }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }
  async function reindex() {
    if (busy || !wardrobeId) return; searchRequest.current?.abort(); setSearching(false); setBusy(true); setError(''); setMessage('Rebuilding your document index…'); const controller = new AbortController(); mutation.current = controller;
    try { const result = await api('knowledge/reindex', { wardrobeId, embeddingProvider }, 'POST', { signal: controller.signal, timeoutMs: 65000 }); if (controller.signal.aborted) return; setSearchResult(null); setMessage(result.mode === 'semantic' ? 'Vector index rebuilt. Semantic search is ready.' : `Indexed ${Number(result.indexedChunks) || 0} of ${Number(result.totalChunks) || 0} excerpts. Keyword search remains available for the rest.`); await refresh(); }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const results = Array.isArray(searchResult?.sources) ? searchResult.sources : Array.isArray(searchResult?.results) ? searchResult.results : [];
  return <div className="memory-knowledge"><div className="memory-library-intro"><div><p className="eyebrow">A SMALL LIBRARY, A PERSONAL STYLIST</p><h2>Bring the context you trust.</h2><p>Add your dress code, packing notes, or style advice. Relevant excerpts are retrieved for each request, alongside your reviewed wardrobe.</p></div><span className="memory-count">{documents.length}<small>documents</small></span></div><p className="memory-caption">Documents are stored on this app’s server under this wardrobe. Four starter guides are project-authored; keyword search works before a vector index is built. Notes provide context; they cannot authorize actions or override wardrobe constraints.</p>
    <details className="memory-models memory-index-settings"><summary><span>Semantic search settings</span><small>{embeddingProvider === 'openai' ? 'OpenAI embeddings' : 'Local embeddings'}</small></summary><div className="memory-index-controls"><label>Embedding provider<select value={embeddingProvider} disabled={busy || searching} onChange={event => { setEmbeddingProvider(event.target.value); setSearchResult(null); }}><option value="local">Local · stays on this computer</option><option value="openai" disabled={!ai?.openai?.configured}>OpenAI{ai?.openai?.configured ? '' : ' · not configured'}</option></select></label><button type="button" disabled={busy || searching || !wardrobeId || !documents.length} onClick={reindex}>{busy ? 'Updating index…' : 'Build semantic index'}</button></div><p>{embeddingProvider === 'openai' ? 'OpenAI embeddings process your document text, search queries and reviewed garment descriptions. Choose this only for text you want processed there.' : 'Documents, search queries and garment descriptions are processed by the local embedding service. If it is unavailable, keyword retrieval still works.'}</p><p className="memory-caption">Use the same provider for indexing and search. Switching providers may require rebuilding the index. Up to 24 documents, including the four starter guides.</p></details>
    <div className="memory-form-grid"><form className="memory-card" onSubmit={addDocument}><h3>Add a reference</h3><label>Document title<input value={title} onChange={event => setTitle(event.target.value)} maxLength="120" required disabled={busy} placeholder="My office dress code"/></label><label>Text<textarea value={content} onChange={event => setContent(event.target.value)} rows="8" maxLength={MAX_DOCUMENT} required disabled={busy} placeholder="Paste the relevant style notes here…"/></label><div className="memory-import"><input type="file" ref={fileRef} accept=".txt,.md,text/plain,text/markdown" hidden onChange={event => { importText(event.target.files?.[0]); event.target.value = ''; }}/><button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>Import .txt or .md</button><small>{content.length.toLocaleString()}/20,000 characters</small></div><label>Source label <span className="memory-optional">optional</span><input value={source} onChange={event => setSource(event.target.value)} maxLength="200" disabled={busy} placeholder="Personal notes or source name"/></label><button type="submit" className="primary" disabled={busy || !wardrobeId || !title.trim() || !content.trim()}>{busy ? 'Updating library…' : 'Add to library'}</button></form>
    <section className="memory-card memory-document-list"><div className="memory-section-title"><h3>Your library</h3><button type="button" className="memory-text-button" disabled={loading || busy || !wardrobeId} onClick={refresh}>{loading ? 'Loading…' : 'Refresh'}</button></div>{!wardrobeId && <p role="status">Save your wardrobe first to create its library.</p>}{loaded && !documents.length && <div className="memory-empty"><span aria-hidden="true">◇</span><h3>A place for your style notes.</h3><p>Add one short document to make the next outfit more personal.</p></div>}{documents.map(document => <article key={document.id}><div><h4>{document.title || 'Untitled reference'}</h4><p>{document.source || 'Personal reference'} · {Number(document.chunkCount) || 0} excerpts</p><small>{document.indexing === 'semantic' ? 'Vector index ready' : document.indexing === 'partial' ? `${Number(document.indexedChunks) || 0}/${Number(document.chunkCount) || 0} vector-indexed · keyword search ready` : 'Keyword search ready'} · {dateLabel(document.updatedAt)}</small></div>{document.origin !== 'builtin' && <button type="button" disabled={busy} onClick={() => removeDocument(document)} aria-label={`Remove ${document.title || 'reference'}`}>Remove</button>}</article>)}</section></div>
    <section className="memory-search"><h3>See what your stylist can retrieve</h3><p>Test a question before asking for an outfit.</p><form onSubmit={search}><label className="memory-search-label">Search your library<input value={query} disabled={searching || busy} onChange={event => setQuery(event.target.value)} maxLength="500" placeholder="What should I wear for an office presentation?"/></label><button type="submit" disabled={!wardrobeId || !query.trim() || searching || busy}>{searching ? 'Searching…' : 'Find context'}</button></form>{searchResult && <div className="memory-search-results"><p className="memory-caption">Retrieval: {String(searchResult.metadata?.mode || searchResult.mode || 'document search')}{results.length ? ` · ${results.length} excerpts` : ' · no matching excerpts'}</p>{results.map((result, index) => <article key={`${result.id || result.documentId || 'excerpt'}-${index}`}><h4>{result.title || result.documentTitle || result.source || 'Library excerpt'}</h4><blockquote>{result.excerpt || result.text || result.content || 'No excerpt returned.'}</blockquote></article>)}</div>}</section>{error && <p className="memory-error" role="alert">{error}</p>}<p className="memory-status" role="status">{message}</p></div>;
}

function RecommendationHistory({ state, onSave, notify }) {
  const [message, setMessage] = useState('');
  const history = (Array.isArray(state.recommendationHistory) ? state.recommendationHistory : []).filter(run => run && typeof run === 'object').slice().reverse();
  function feedback(run, value) { const choice = run.feedback === value ? null : value; if (onSave(previous => ({ ...previous, recommendationHistory: setRecommendationFeedback(previous.recommendationHistory, run.runId, choice) }))) { setMessage(choice ? 'Feedback saved for this recommendation.' : 'Feedback removed.'); notify?.('Style feedback saved'); } else setMessage('Feedback could not be saved. Try again.'); }
  return <section className="memory-history"><div className="memory-section-title"><div><p className="eyebrow">YOUR STYLE, OVER TIME</p><h2>The looks you tried.</h2><p>See the source, timing, and your response to each recommendation.</p></div><span className="memory-count">{history.length}<small>sessions</small></span></div>{!history.length && <div className="memory-empty"><span aria-hidden="true">↗</span><h3>Your next outfit starts the story.</h3><p>Ask for a recommendation, then return here to see what worked.</p></div>}<div className="memory-history-list">{history.map((run, index) => {
    const outfits = Array.isArray(run.outfits) ? run.outfits : [];
    const context = typeof run.context === 'string' ? run.context : run.context?.occasion || run.context?.prompt || 'Personal outfit request';
    const seconds = Number.isFinite(Number(run.latencyMs)) && Number(run.latencyMs) >= 0 ? `${(Number(run.latencyMs) / 1000).toFixed(1)} s` : null;
    return <article key={run.runId || index} className="memory-history-card"><div className="memory-history-heading"><div><p>{dateLabel(run.createdAt)}{seconds && ` · ${seconds}`}</p><h3>{context || 'Personal outfit request'}</h3></div><span className="memory-provider">{run.provider || 'Source not recorded'}{run.cached && ' · cached'}</span></div>{run.model && <p className="memory-caption">Model: {run.model}</p>}<div className="memory-history-looks">{outfits.map((outfit, outfitIndex) => <div key={outfit.id || outfitIndex}><strong>{outfit.title || `Look ${outfitIndex + 1}`}</strong><p>{(Array.isArray(outfit.itemIds) ? outfit.itemIds : []).map(id => state.items?.find(item => item.id === id)?.name || 'Removed piece').join(' · ') || 'No garment details recorded'}</p></div>)}</div><div className="memory-history-footer"><div className="memory-history-tags">{run.chosenItemIds?.length > 0 && <span>Chosen</span>}{run.savedAt && <span>Saved</span>}{run.wornAt && <span>Worn</span>}</div><div className="memory-feedback" aria-label="Recommendation feedback"><button disabled={!run.runId} aria-pressed={run.feedback === 'helpful'} onClick={() => feedback(run, 'helpful')}>Works for me</button><button disabled={!run.runId} aria-pressed={run.feedback === 'not-for-me'} onClick={() => feedback(run, 'not-for-me')}>Not my style</button></div></div></article>;
  })}</div><p className="memory-caption">History and feedback stay with this browser’s wardrobe. Feedback can guide future ranking; it does not fine-tune a model.</p><p className="memory-status" role="status">{message}</p></section>;
}

export default function StyleMemory({ state, onSave, ai, notify }) {
  const [tab, setTab] = useState('My style');
  const [knowledgeOpened, setKnowledgeOpened] = useState(false);
  const buttons = useRef([]);
  function activateTab(label) { if (label === 'Knowledge') setKnowledgeOpened(true); setTab(label); }
  function handleTabKey(event, index) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault(); activateTab(TABS[next]); buttons.current[next]?.focus();
  }
  return <div className="style-memory"><div className="memory-tabs" role="tablist" aria-label="Personal style workspace">{TABS.map((label, index) => <button type="button" key={label} ref={node => { buttons.current[index] = node; }} id={`memory-tab-${index}`} role="tab" aria-selected={tab === label} aria-controls={`memory-panel-${index}`} tabIndex={tab === label ? 0 : -1} onKeyDown={event => handleTabKey(event, index)} onClick={() => activateTab(label)}>{label}</button>)}</div><div id="memory-panel-0" role="tabpanel" aria-labelledby="memory-tab-0" hidden={tab !== 'My style'}><StylePreferences state={state} onSave={onSave} ai={ai} notify={notify}/></div><div id="memory-panel-1" role="tabpanel" aria-labelledby="memory-tab-1" hidden={tab !== 'Knowledge'}>{knowledgeOpened && <KnowledgeLibrary wardrobeId={state.wardrobeId} preferences={state.preferences} onSave={onSave} ai={ai}/>}</div><div id="memory-panel-2" role="tabpanel" aria-labelledby="memory-tab-2" hidden={tab !== 'History'}>{tab === 'History' && <RecommendationHistory state={state} onSave={onSave} notify={notify}/>}</div></div>;
}
