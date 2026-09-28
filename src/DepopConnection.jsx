import React, { useEffect, useRef, useState } from 'react';
import { api } from './photos.js';

export default function DepopConnection({ status }) {
  const [shop, setShop] = useState(null), [products, setProducts] = useState([]), [cursor, setCursor] = useState(null), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function connect(loadMore = false) {
    request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      if (!loadMore) { setShop(null); setProducts([]); setLoaded(false); const result = await api('depop/shop', null, 'GET', { signal: controller.signal, timeoutMs: 12000 }); setShop(result); }
      const page = await api(`depop/products${loadMore && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, null, 'GET', { signal: controller.signal, timeoutMs: 12000 });
      if (!controller.signal.aborted) { setProducts(previous => loadMore ? [...previous, ...page.products] : page.products); setCursor(page.nextCursor); setLoaded(true); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="depop-connection">
    <div><p className="eyebrow">YOUR NEXT CHAPTER</p><h2>From your closet to Depop.</h2><p>{shop ? `Connected to @${shop.username} · ${shop.environment}` : status?.configured ? 'Your partner key is configured. Check it to view your shop.' : 'Prepare a resale draft now. Connect your shop when you have approved Depop partner access.'}</p></div>
    <details><summary>{shop ? 'Your Depop shop' : 'Connect Depop'}</summary>
      {!status?.configured && <p>Depop’s Selling API requires partner approval. Add your approved key to the server’s <code>.env.local</code> as <code>DEPOP_API_KEY</code> and select <code>DEPOP_ENVIRONMENT</code>, then restart. <a href="https://partnerapi.depop.com/api-docs/concepts/authentication/" target="_blank" rel="noreferrer">Access instructions ↗</a></p>}
      <button disabled={busy || !status?.configured} onClick={() => connect()}>{busy ? 'Checking Depop…' : 'Check connection & listings'}</button>
      {error && <p role="status" className="camera-error">{error}</p>}
      {loaded && !products.length && <p>Your shop has no listings yet.</p>}
      {products.length > 0 && <ul className="depop-products">{products.map((product, index) => <li key={`${product.id}-${index}`}><strong>{product.description.split('\n')[0] || product.sku || 'Untitled listing'}</strong><span>{product.currency} {product.price}</span></li>)}</ul>}
      {loaded && cursor && <button disabled={busy} onClick={() => connect(true)}>Load more listings</button>}
      <p className="muted">This connection reads your own shop. Drafts stay local until you publish them yourself on Depop.</p>
    </details>
  </section>;
}
