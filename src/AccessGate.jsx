import React,{useEffect,useState} from 'react';
import App from './App.jsx';
import {api,downloadJson} from './photos.js';
import {newPhotoState,migrateState} from './wardrobe.js';
import './mobile-app.css';
function CloudCloset({account,onSignOut}){
 const [loaded,setLoaded]=useState(null),[error,setError]=useState(''),[conflict,setConflict]=useState(null);
 const pendingKey=`cq-cloud-pending-${account.id}`;
 async function load(){try{
  setError('');const remote=await api('cloud/closet',null,'GET');let pending;
  try{pending=JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{}
  if(pending&&pending.revision!==remote.revision){setConflict({pending,remote});return;}
  const state=pending?.state||remote.state||{...newPhotoState(),items:[],profile:'',onboardingComplete:false,wardrobeId:account.id,learningEnabled:false,preferences:{recognitionProvider:'openai',recommendationProvider:'auto',embeddingProvider:'openai'}};
  setLoaded({state:migrateState(state),revision:remote.revision,resume:Boolean(pending)});
 }catch(e){setError(e.message);}}
 useEffect(()=>{void load();},[account.id]);
 if(conflict)return <div className="app access-screen"><section className="panel access-card"><span className="auth-kicker">YOUR CHANGES ARE SAFE</span><h1>Two versions of your closet.</h1><p>This device has unsynced changes, and your cloud closet has changed too. Export this device’s version before opening the latest cloud copy.</p><button onClick={()=>downloadJson(conflict.pending.state,'closet-local-changes.json')}>Export this device’s changes</button><button className="primary" onClick={()=>{localStorage.removeItem(pendingKey);setConflict(null);void load();}}>Use latest cloud version</button></section></div>;
 if(!loaded)return <div className="app access-screen"><section className="panel access-card"><span className="brand-icon">cq</span><h1>Your closet is coming with you.</h1><p role="status">{error||'Opening your private wardrobe…'}</p>{error&&<button onClick={load}>Try again</button>}</section></div>;
 return <App account={account} initialState={loaded.state} cloudRevision={loaded.revision} resumeSync={loaded.resume} onSignOut={onSignOut}/>;
}
export default function AccessGate(){
 const [session,setSession]=useState(null),[mode,setMode]=useState('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[callback,setCallback]=useState(null);
 const check=()=>api('session',null,'GET').then(setSession).catch(e=>setError(e.message));
 useEffect(()=>{
  const hash=new URLSearchParams(location.hash.slice(1));
  if(hash.has('access_token')){setCallback({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),recovery:hash.get('type')==='recovery'});history.replaceState(null,'',location.pathname+location.search);}
  else if(hash.has('error_description')){setError('That email link has expired. Request a new one.');history.replaceState(null,'',location.pathname);}
  void check();
 },[]);
 const signOut=async()=>{await api('session/logout',{});if(session.user?.cloud){localStorage.removeItem(`closet-quest-demo-v1-${session.user.id}`);localStorage.removeItem(`cq-cloud-pending-${session.user.id}`);}setSession({...session,user:null});setPassword('');};
 if(session&&(!session.hosted||session.user)&&!callback&&mode!=='password')return session.user?.cloud?<CloudCloset account={session.user} onSignOut={signOut}/>:<App account={session.user} onSignOut={signOut}/>;
 const accounts=session?.authMode==='account',title=callback?'A fresh start.':mode==='signup'?'A closet that knows you.':mode==='recover'?'Let’s get you back in.':mode==='password'?'Your new password.':'Good to see you.';
 async function submit(event){event.preventDefault();setBusy(true);setError('');setMessage('');try{
  if(callback){const result=await api('session/exchange',callback);setSession(result);setMode(callback.recovery?'password':'login');setCallback(null);return;}
  const result=await api(`session/${accounts?mode:'login'}`,accounts?{email,password}:{code});
  setPassword('');setCode('');if(result.user)setSession(result);else setMessage(result.message||'Password updated. Your closet is ready.');
  if(mode==='password')setMode('login');
 }catch(e){setError(e.code==='EMAIL_NOT_CONFIRMED'?'Confirm your email before signing in. Check your inbox for the welcome link.':e.message);}finally{setBusy(false);}}
 return <div className="app access-screen"><div className="auth-editorial" aria-hidden="true"><span className="auth-wordmark">closet quest</span><div className="auth-photo-stack"><img src="/photos/knit.jpg" alt=""/><img src="/photos/trousers.jpg" alt=""/><span>less new.<br/>more you.</span></div><p>Your favorite pieces.<br/>A different point of view.</p></div><section className="panel access-card"><span className="brand-icon">cq</span><span className="auth-kicker">YOUR EVERYDAY STYLE COMPANION</span><h1>{session?accounts?title:'Your closet, your space.':'A little more you.'}</h1><p>{!session?'Connecting to your closet…':callback?'Continue securely from your email.':!accounts?'Enter your private pilot code.':mode==='signup'?'Your clothes, saved looks and style notes. Together, wherever you go.':mode==='recover'?'We’ll email a link to reset your password.':'Open your wardrobe. Find something that feels like you.'}</p>
 {session&&<form onSubmit={submit}>
  {!callback&&(accounts?<>{mode!=='password'&&<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={254}/></label>}{mode!=='recover'&&<label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:10} maxLength={256} required/>{mode!=='login'&&<small>At least 10 characters.</small>}</label>}</>:<label>Participant code<input type="password" value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" required maxLength={200}/></label>)}
  {error&&<p className="auth-error" role="alert">{error}</p>}{message&&<p className="auth-success" role="status">{message}</p>}
  <button className="primary" disabled={busy}>{busy?'One moment…':callback?'Continue securely':mode==='signup'?'Create my account':mode==='recover'?'Send reset link':mode==='password'?'Save new password':'Open my closet'}<span aria-hidden="true">↗</span></button>
 </form>}
 {accounts&&!callback&&mode!=='password'&&<div className="auth-switch"><button onClick={()=>{setMode(mode==='signup'?'login':'signup');setError('');setMessage('');}}>{mode==='signup'?'Already have an account? Sign in':'New here? Create an account'}</button>{mode==='login'?<button onClick={()=>{setMode('recover');setError('');}}>Forgot password?</button>:mode==='recover'&&<button onClick={()=>setMode('login')}>Back to sign in</button>}</div>}
 {!session&&error&&<p role="alert">{error}<button onClick={check}>Retry connection</button></p>}
 <p className="auth-privacy">{!session?'Securely checking your session…':accounts?'Private by default. Your photos and wardrobe are saved in your account. AI analysis uses the provider you choose.':'Your pilot wardrobe stays in this browser. Export a backup before changing devices.'}</p></section></div>;
}
