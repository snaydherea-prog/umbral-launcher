'use strict';
// OAuth 2.0 Authorization Code + PKCE with system browser and local loopback.
// Microsoft account passwords are NEVER handled by Umbral.
const {app,safeStorage,shell}=require('electron');
const crypto=require('node:crypto');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const LOGIN='https://login.microsoftonline.com/consumers/oauth2/v2.0';
const scopes='XboxLive.signin offline_access';
const sessionFile=()=>path.join(app.getPath('userData'),'microsoft-session.bin');
let inProgress=false;
const base64url=value=>Buffer.from(value).toString('base64url');
function registeredId(){
 const env=process.env.UMBRAL_MICROSOFT_CLIENT_ID||'';
 let configured='';
 try{configured=require('./microsoft-app.json').clientId||''}catch{}
 const clientId=(env||configured).trim();
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(clientId))
  throw Error('El administrador debe configurar la aplicación Microsoft de Umbral antes de distribuir el launcher.');
 return clientId;
}
async function postForm(url,body){
 const res=await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(30000)});
 const data=await res.json();
 if(!res.ok)throw Error(data.error_description||data.error||'Error Microsoft HTTP '+res.status);
 return data;
}
async function postJson(url,body){
 const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const data=await res.json();
 if(!res.ok)throw Error(data.errorMessage||data.message||data.error||'HTTP '+res.status);
 return data;
}
async function getMinecraftProfile(msToken){
 const xbox=await postJson('https://user.auth.xboxlive.com/user/authenticate',{Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+msToken},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'});
 const xsts=await postJson('https://xsts.auth.xboxlive.com/xsts/authorize',{Properties:{SandboxId:'RETAIL',UserTokens:[xbox.Token]},RelyingParty:'rp://api.minecraftservices.com/',TokenType:'JWT'});
 const uhs=xsts.DisplayClaims?.xui?.[0]?.uhs;
 if(!uhs)throw Error('No se pudo obtener el usuario Xbox.');
 const mc=await postJson('https://api.minecraftservices.com/authentication/login_with_xbox',{identityToken:'XBL3.0 x='+uhs+';'+xsts.Token});
 const response=await fetch('https://api.minecraftservices.com/minecraft/profile',{headers:{authorization:'Bearer '+mc.access_token},signal:AbortSignal.timeout(30000)});
 if(response.status===403)throw Error('Minecraft Services rechazó la aplicación (403). La aplicación debe estar autorizada.');
 if(response.status===404)throw Error('Esta cuenta no tiene un perfil de Minecraft Java.');
 if(!response.ok)throw Error('Minecraft devolvió HTTP '+response.status);
 const profile=await response.json();
 if(!/^[0-9a-f-]{32,36}$/i.test(profile.id)||typeof profile.name!=='string')throw Error('Perfil de Minecraft inválido');
 return {uuid:profile.id.replace(/-/g,''),username:profile.name};
}
function saveSession(clientId,refreshToken,profile){
 if(!safeStorage.isEncryptionAvailable()||!refreshToken)return false;
 fs.mkdirSync(path.dirname(sessionFile()),{recursive:true});
 fs.writeFileSync(sessionFile(),safeStorage.encryptString(JSON.stringify({clientId,refreshToken,profile})),{mode:0o600});
 return true;
}
function stored(){try{
 if(!safeStorage.isEncryptionAvailable())return null;
 const s=JSON.parse(safeStorage.decryptString(fs.readFileSync(sessionFile())));
 return s?.profile||null;
}catch{return null}}
async function login(emit){
 if(inProgress)throw Error('Ya hay un inicio de sesión en curso.');
 const clientId=registeredId();inProgress=true;
 let server;let timeout;
 try{
  const verifier=base64url(crypto.randomBytes(48));
  const challenge=base64url(crypto.createHash('sha256').update(verifier).digest());
  const state=base64url(crypto.randomBytes(24));
  let resolveCode,rejectCode;
  const codePromise=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject});
  server=http.createServer((req,res)=>{
   try{
    const incoming=new URL(req.url,'http://localhost');
    if(incoming.pathname!=='/'){res.writeHead(404).end();return}
    if(incoming.searchParams.get('state')!==state){
      res.writeHead(400,{'content-type':'text/plain; charset=utf-8'}).end('Estado OAuth inválido.');return;
    }
    const error=incoming.searchParams.get('error');
    const code=incoming.searchParams.get('code');
    if(error){res.writeHead(400,{'content-type':'text/plain; charset=utf-8'}).end('Autenticación cancelada.');rejectCode(Error('Microsoft canceló la autenticación.'));return}
    if(!code){res.writeHead(400).end('Falta el código de autorización.');return}
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end('<!doctype html><html lang="es"><meta charset="utf-8"><title>Umbral</title><body style="font-family:sans-serif;background:#0b1328;color:#fff;padding:3rem"><h2>Sesión recibida</h2><p>Ya puedes volver a Umbral Launcher.</p></body></html>');
    resolveCode(code);
   }catch(e){res.writeHead(400).end('Solicitud inválida.')}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const port=server.address().port;
  // Microsoft registers http://localhost for desktop public clients; the ephemeral port is dynamic.
  const redirectUri='http://localhost:'+port+'/';
  const url=new URL(LOGIN+'/authorize');
  for(const [k,v] of Object.entries({client_id:clientId,response_type:'code',redirect_uri:redirectUri,response_mode:'query',scope:scopes,state,code_challenge:challenge,code_challenge_method:'S256'}))url.searchParams.set(k,v);
  emit({type:'status',message:'Abriendo Microsoft en el navegador...'});
  timeout=setTimeout(()=>rejectCode(Error('Tiempo de inicio de sesión agotado.')),180000);
  await shell.openExternal(url.toString());
  const code=await codePromise;
  emit({type:'status',message:'Verificando la cuenta Microsoft y Minecraft Java...'});
  const token=await postForm(LOGIN+'/token',{client_id:clientId,grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier,scope:scopes});
  const profile=await getMinecraftProfile(token.access_token);
  saveSession(clientId,token.refresh_token,profile);
  return profile;
 }finally{
  if(timeout)clearTimeout(timeout);
  if(server)await new Promise(resolve=>server.close(()=>resolve()));
  inProgress=false;
 }
}
function logout(){try{fs.unlinkSync(sessionFile())}catch{}}
module.exports={login,logout,stored};
