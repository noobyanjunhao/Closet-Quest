import React from 'react';
import { Garment } from './components.jsx';

function featuredPieces(items) {
  const photos = items.filter(item => item.image).sort((a, b) => Number(Boolean(a.needsReview)) - Number(Boolean(b.needsReview)) || (a.wears || 0) - (b.wears || 0));
  const distinct = [];
  for (const item of photos) {
    if (!distinct.some(selected => selected.category === item.category)) distinct.push(item);
    if (distinct.length === 3) break;
  }
  return [...distinct, ...photos.filter(item => !distinct.includes(item))].slice(0, 3);
}

export function ClosetHero({ items = [], onStyle, reviewCount = 0 }) {
  const pieces = featuredPieces(items);
  const ready = items.filter(item => !item.needsReview).length;
  const requiredReview = items.filter(item => item.needsReview).length;
  const reviewSummary = requiredReview > 0 ? `${requiredReview} awaiting details` : reviewCount > 0 ? `${reviewCount} suggestion${reviewCount === 1 ? '' : 's'} to review` : '';
  const photographed = items.filter(item => item.image).length;
  const palette = pieces.filter(item => /^#[\da-f]{6}$/i.test(item.color || '')).filter((item, index, colors) => colors.findIndex(other => other.color.toLowerCase() === item.color.toLowerCase()) === index);
  return <section className="closet-editorial editorial-lookbook" aria-labelledby="closet-editorial-title">
    <div className="editorial-copy">
      <p className="editorial-kicker">THE EVERYDAY EDIT</p>
      <h2 id="closet-editorial-title">A fresh eye.<br/><em>Your wardrobe.</em></h2>
      <p className="editorial-description">Familiar pieces. A different point of view. Find a combination that feels like you.</p>
      <div className="editorial-actions"><button className="editorial-primary" onClick={onStyle}>Style an outfit <span aria-hidden="true">↗</span></button></div>
      <div className="editorial-footnote"><span>{ready} {ready === 1 ? 'piece' : 'pieces'} ready to style{reviewSummary ? ` · ${reviewSummary}` : ''}</span></div>
    </div>
    <div className={`editorial-gallery editorial-gallery-${pieces.length}`}>
      <div className="editorial-gallery-label"><span>A FEW PIECES IN FOCUS</span><span>{photographed} PHOTOS</span></div>
      {pieces.length ? <div className="editorial-photos">{pieces.map((item, index) => <figure className={`editorial-piece editorial-piece-${index + 1}`} key={item.id}>
        <div className="editorial-photo"><Garment item={item} loading="eager"/></div>
        <figcaption><span>{item.category}</span><strong>{item.name}</strong></figcaption>
      </figure>)}</div> : <div className="editorial-photo-empty"><span aria-hidden="true">＋</span><h3>Your personal collection<br/>starts with a photo.</h3><p>Add the pieces you reach for.<br/>Discover the ones you’ve forgotten.</p></div>}
      <div className="editorial-gallery-footer"><span>{palette.length ? 'COLORS FROM YOUR CLOSET' : 'MAKE MORE OF WHAT YOU OWN'}</span>{palette.length > 0 && <div className="editorial-color-story" role="list" aria-label="Saved colors in this selection">{palette.map(item => <span key={item.id} role="listitem" style={{backgroundColor:item.color}} aria-label={item.colorName || item.name} title={item.colorName || item.name}/>)}</div>}</div>
    </div>
  </section>;
}
