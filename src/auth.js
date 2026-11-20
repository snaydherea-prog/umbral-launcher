'use strict';
// Flujo OAuth de código de dispositivo para cuentas Microsoft personales.
// No solicita ni almacena contraseñas. Minecraft Services requiere aprobación del client ID.
const {shell,safeStorage,app}=require('electron');
const fs=require('node:fs');const path=require('node:path');
const LOGIN='https://login.microsoftonline.com/consumers/oauth2/v2.0';
let inProgress=false;
const sessionFile=()=>path.join(app.getPath('userData'),'microsoft-session.bin');
const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function formRequest(url,form){
 const body=new URLSearchParams(form);
 const r=await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(30000)});
 const json=await r.json();if(!r.ok)throw Error(json.error_description||json.error||'Microsoft HTTP '+r.status);
 return json;
}
async function jsonPost(url,data,headers={}){
 const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});
 const json=await r.json();if(!r.ok)throw Error(json.errorMessage||json.error||json.message||'Error HTTP '+r.status);
 return json;
}
async function minecraftProfile(msToken){
 const xbl=await jsonPost('https://user.auth.xboxlive.com/user/authenticate',{Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+msToken},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'});
 const xsts=await jsonPost('https://xsts.auth.xboxlive.com/xsts/authorize',{Properties:{SandboxId:'RETAIL',UserTokens:[xbl.Token]},RelyingParty:'rp://api.minecraftservices.com/',TokenType:'JWT'});
 const uhs=xsts.DisplayClaims?.xui?.[0]?.uhs;
 if(!uhs)throw Error('Xbox Live no devolvió identidad de usuario');
 const mc=await jsonPost('https://api.minecraftservices.com/authentication/login_with_xbox',{identityToken:'XBL3.0 x='+uhs+';'+xsts.Token});
 const response=await fetch('https://api.minecraftservices.com/minecraft/profile',{headers:{authorization:'Bearer '+mc.access_token},signal:AbortSignal.timeout(30000)});
 if(response.status===403)throw Error('Minecraft Services rechazó esta aplicación (403). Se necesita autorización del Client ID.');
 if(response.status===404)throw Error('La cuenta Microsoft no tiene un perfil activo de Minecraft Java.');
 if(!response.ok)throw Error('Error consultando el perfil de Minecraft: '+response.status);
 const profile=await response.json();
 if(!/^[0-9a-f-]{32,36}$/i.test(profile.id)||!profile.name)throw Error('Minecraft devolvió un perfil inválido');
 return {uuid:profile.id.replace(/-/g,''),username:profile.name};
}
function saveSession(clientId,refreshToken,profile){
 if(!safeStorage.isEncryptionAvailable())return false;
 const payload=JSON.stringify({clientId,refreshToken,profile});
 fs.mkdirSync(path.dirname(sessionFile()),{recursive:true});
 fs.writeFileSync(sessionFile(),safeStorage.encryptString(payload),{mode:0o600});
 return true;
}
function stored(){
 try{
  if(!safeStorage.isEncryptionAvailable())return null;
  return JSON.parse(safeStorage.decryptString(fs.readFileSync(sessionFile())));
 }catch{return null}
}
async function renew(){
 const prev=stored();if(!prev?.clientId||!prev.refreshToken)return null;
 try{
  const token=await formRequest(LOGIN+'/token',{client_id:prev.clientId,scope:'XboxLive.signin offline_access',grant_type:'refresh_token',refresh_token:prev.refreshToken});
  const profile=await minecraftProfile(token.access_token);
  saveSession(prev.clientId,token.refresh_token||prev.refreshToken,profile);
  return profile;
 }catch{return null}
}
async function login(clientId,emit){
 if(inProgress)throw Error('Ya hay un inicio de sesión en curso');
 if(!/^[a-f0-9-]{36}$/i.test(clientId))throw Error('Introduce un Client ID válido de Microsoft (UUID).');
 inProgress=true;
 try{
  const challenge=await formRequest(LOGIN+'/devicecode',{client_id:clientId,scope:'XboxLive.signin offline_access'});
  emit({type:'code',code:challenge.user_code,url:challenge.verification_uri});
  await shell.openExternal(challenge.verification_uri);
  const expiry=Date.now()+challenge.expires_in*1000;let interval=Math.max(5,challenge.interval||5);
  while(Date.now()<expiry){
   await pause(interval*1000);
   const r=await fetch(LOGIN+'/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:device_code',client_id:clientId,device_code:challenge.device_code}),signal:AbortSignal.timeout(30000)});
   const response=await r.json();
   if(response.error==='authorization_pending')continue;
   if(response.error==='slow_down'){interval+=5;continue}
   if(!r.ok)throw Error(response.error_description||response.error||'Error de autenticación');
   emit({type:'status',message:'Cuenta Microsoft autorizada. Verificando Minecraft Java...'});
   const profile=await minecraftProfile(response.access_token);
   const persisted=saveSession(clientId,response.refresh_token,profile);
   emit({type:'status',message:persisted?'Minecraft conectado':'Minecraft conectado (la sesión no se conservará tras cerrar)'});
   return profile;
  }
  throw Error('El código de Microsoft ha caducado. Vuelve a intentarlo.');
 }finally{inProgress=false}
}
function logout(){try{fs.unlinkSync(sessionFile())}catch{}}
module.exports={login,renew,logout,stored};
