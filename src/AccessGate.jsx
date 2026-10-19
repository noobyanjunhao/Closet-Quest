import React, {useEffect,useState} from 'react';
import App from './App.jsx';
import {api} from './photos.js';

export default function AccessGate() {
  const [session,setSession]=useState(null),[code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const check=()=>api('session',null,'GET').then(setSession).catch(error=>setError(error.message));
  useEffect(()=>{void check();},[]);
  if(session&&(!session.hosted||session.user))return <App key={session.user?.id||'local'} account={session.user} onSignOut={async()=>{await api('session/logout',{});setSession({hosted:true,user:null});}}/>;
  return <div className="app access-screen"><section className="panel access-card"><span className="brand-icon">cq</span><h1>Your closet, your space.</h1><p>{session?'Enter the private participant code supplied by the study organizer.':'Connecting to Closet Quest…'}</p>
    {session&&<form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{setSession(await api('session/login',{code}));setCode('');}catch(error){setError(error.message);}finally{setBusy(false);}}}><label>Participant access code<input type="password" value={code} onChange={event=>setCode(event.target.value)} required autoComplete="off" maxLength={200}/></label><button className="primary" disabled={busy}>{busy?'Signing in…':'Open my closet'}</button></form>}
    {error&&<p role="alert">{error} {!session&&<button onClick={check}>Retry connection</button>}</p>}<p className="muted">Your closet is saved in this browser. Uploaded photos are processed by our server and the selected AI provider. Export a backup before switching devices. Imported style documents on the free server may be lost when it restarts.</p></section></div>;
}
