#!/usr/bin/env node
// Herramienta administrativa: genera un manifiesto HTTPS con hashes de archivos locales.
// No distribuye archivos del juego ni sube mods sin permiso de sus autores.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [folder,baseUrl,version='1.0.0']=process.argv.slice(2);
if(!folder||!baseUrl){console.error('Uso: node tools/generar-manifiesto.mjs <carpeta-modpack> <URL-HTTPS-base> [version]');process.exit(1)}
const base=new URL(baseUrl);
if(base.protocol!=='https:'){console.error('La URL base debe usar HTTPS');process.exit(1)}
const root=path.resolve(folder);
const allowed=['mods','config','defaultconfigs','resourcepacks','shaderpacks','kubejs'];
if(!fs.statSync(root).isDirectory())throw Error('Carpeta no válida');
const files=[];
function walk(dir){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const abs=path.join(dir,entry.name);
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory()){walk(abs);continue}
  if(!entry.isFile())continue;
  const relative=path.relative(root,abs).split(path.sep).join('/');
  const bytes=fs.readFileSync(abs);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const url=base.toString().replace(/\\/$/,'')+'/'+relative.split('/').map(encodeURIComponent).join('/');
  files.push({path:relative,url,sha256});
 }
}
for(const folderName of allowed)if(fs.existsSync(path.join(root,folderName)))walk(path.join(root,folderName));
files.sort((a,b)=>a.path.localeCompare(b.path));
const output={version,files};
const dest=path.join(process.cwd(),'manifest.json');
fs.writeFileSync(dest,JSON.stringify(output,null,2)+'\n');
console.log('Manifiesto creado: '+dest+' ('+files.length+' archivos).');
console.log('IMPORTANTE: los archivos deben estar alojados en las URLs indicadas, con permiso de distribución.');
