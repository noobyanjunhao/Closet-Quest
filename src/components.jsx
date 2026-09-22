import React, { useEffect, useRef } from 'react';
import sources from '../public/photos/sources.json';

export function Garment({ item, loading = 'lazy' }) {
  if (item?.image) return <img className="garment-photo" src={item.image} alt={item.name} loading={loading} onError={e => { e.currentTarget.style.opacity = '.25'; e.currentTarget.alt = `Photo unavailable: ${item.name}`; }}/>;
  return <div className="photo-placeholder" role="img" aria-label={`${item?.name || 'Garment'}: no photo`}><span>＋</span><small>{item?.category || 'Add a photo'}</small></div>;
}
export function PhotoCredit({ item }) {
  const source = sources.find(s => s.id === item.sampleId);
  return source ? <p className="photo-credit">Photo: <a href={source.source} target="_blank" rel="noreferrer">{source.author}</a> · <a href={source.licenseUrl} target="_blank" rel="noreferrer">{source.license}</a>. {source.changes}</p> : null;
}
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current.focus();
    function keydown(e) {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const elements = [...ref.current.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')].filter(element => {
        if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert]') || !element.getClientRects().length) return false;
        if (['hidden','collapse'].includes(getComputedStyle(element).visibility)) return false;
        // Closed disclosures keep their summary in the tab order, but hide their other controls.
        for (let parent = element.parentElement; parent && parent !== ref.current; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS' && !parent.open) {
            const summary = [...parent.children].find(child => child.tagName === 'SUMMARY');
            if (!summary?.contains(element)) return false;
          }
        }
        return true;
      });
      if (!elements.length) { e.preventDefault(); ref.current.focus(); return; }
      const first = elements[0], last = elements.at(-1);
      const outsideOrder = !elements.includes(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || outsideOrder)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || outsideOrder)) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown',keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown',keydown); previous?.focus(); };
  },[]);
  return <div className="overlay" onClick={e => { if(e.target===e.currentTarget)onClose(); }}><section ref={ref} tabIndex={-1} className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title}><div className="section-heading"><h2>{title}</h2><button aria-label={`Close ${title}`} onClick={onClose}>×</button></div>{children}</section></div>;
}
export function GarmentCard({ item, onClick, children }) {
  const status = ({review:'Review suggestions',submitting:'Photo queued',queued:'Photo queued',processing:'Analyzing photo',failed:'Analysis needs retry'})[item.recognition?.status] || (item.needsReview ? 'Review details' : item.wears <= 1 ? 'Rediscover' : '');
  const wears = Number.isFinite(item.wears) ? item.wears : 0;
  const content = <><div className="item-visual"><Garment item={item}/><span className="item-tag">{item.category}</span>{status && <span className={`item-status ${item.needsReview || ['review','failed'].includes(item.recognition?.status) ? 'item-status-review' : ''}`}>{status}</span>}{onClick && <span className="edit-hint" aria-hidden="true">↗</span>}</div><div className="item-info"><h3>{item.name}</h3><p><span className="item-color"><span className="color-dot" style={{background:item.color}} aria-hidden="true"/>{item.colorName || item.category}</span><span className="item-wears">{wears === 0 ? 'Not worn yet' : `${wears} ${wears === 1 ? 'wear' : 'wears'}`}</span></p>{children}</div></>;
  return onClick ? <button className="item-card" onClick={onClick} aria-label={`View ${item.name}, ${item.category}, ${wears} recorded wears${status ? `, ${status}` : ''}`}>{content}</button> : <article className="item-card">{content}</article>;
}
export function Credits() {
  return <div className="credits-list">{sources.map(s => <div key={s.id}><img src={`photos/${s.id}.jpg`} alt={s.title}/><div><a href={s.source} target="_blank" rel="noreferrer">{s.title}</a><p>{s.author} · <a href={s.licenseUrl} target="_blank" rel="noreferrer">{s.license}</a></p><small>{s.changes}</small></div></div>)}</div>;
}
