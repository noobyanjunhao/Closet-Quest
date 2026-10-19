import React, { useLayoutEffect, useRef, useState } from 'react';

function NavIcon({ name }) {
  const paths = {
    Closet: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    Outfits: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z"/></>,
    Lookbook: <><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 3v8l3-2 3 2V3M9 16h6"/></>,
    More: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function FluidNavigation({ page, onNavigate, moreOpen, onMore, moreTrigger, closeMore, onModal }) {
  const nav = useRef(null);
  const [indicator, setIndicator] = useState(null);
  const primary = ['Closet', 'Outfits', 'Lookbook'];
  const active = primary.includes(page) ? page : 'More';
  useLayoutEffect(() => {
    const measure = () => {
      const selected = nav.current?.querySelector(`[data-destination="${active}"]`);
      if (!selected) return;
      const outer = nav.current.getBoundingClientRect(), inner = selected.getBoundingClientRect();
      setIndicator({ x: inner.left - outer.left - nav.current.clientLeft, y: inner.top - outer.top - nav.current.clientTop, width: inner.width, height: inner.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav.current);
    return () => observer.disconnect();
  }, [active, moreOpen]);
  return <nav ref={nav} className="fluid-navigation" aria-label="Main navigation">
    {indicator && <span className="nav-indicator" aria-hidden="true" style={{ transform: `translate3d(${indicator.x}px,${indicator.y}px,0)`, width: indicator.width, height: indicator.height }}/>} 
    {[['Closet','Closet'],['Outfits','Stylist'],['Lookbook','Saved looks']].map(([name,label]) => <button key={name} data-destination={name} aria-current={page === name ? 'page' : undefined} className={`nav ${page === name ? 'active' : ''}`} onClick={() => onNavigate(name)}><NavIcon name={name}/><span className="nav-caption">{label}</span></button>)}
    <details className="nav-more" open={moreOpen}>
      <summary ref={moreTrigger} data-destination="More" className={`nav ${active === 'More' ? 'active' : ''}`} aria-label="More navigation" onClick={event => {event.preventDefault();onMore(!moreOpen);}}><NavIcon name="More"/><span className="nav-caption">More</span></summary>
      <div className="nav-more-menu">
        {[['Memory','My style & memory'],['Validation','User study'],['Quests','Style quests'],['Inspiration','Inspiration'],['Resale','Closet check & resale'],['Lab','AI lab']].map(([name,label]) => <button key={name} aria-current={page === name ? 'page' : undefined} onClick={() => {closeMore();onNavigate(name);}}>{label}</button>)}
        <button onClick={() => {closeMore();onModal('profile');}}>Settings & backup</button>
        <button onClick={() => {closeMore();onModal('credits');}}>Photo credits</button>
      </div>
    </details>
  </nav>;
}
