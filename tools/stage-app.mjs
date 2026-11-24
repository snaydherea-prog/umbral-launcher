import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'build', 'app');
const npmCli = process.env.npm_execpath;
if (!npmCli || !fs.existsSync(npmCli)) throw Error('Ejecuta la preparación mediante npm run stage:app.');
fs.rmSync(stage, {recursive: true, force: true});
fs.mkdirSync(stage, {recursive: true});
fs.cpSync(path.join(root, 'src'), path.join(stage, 'src'), {recursive: true});
for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, name), path.join(stage, name));

// A clean production install prevents build tools' nested ZIP dependencies
// from being mistaken for the application's runtime modules by the packager.
const installed = spawnSync(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: stage, stdio: 'inherit'});
if (installed.status !== 0) throw Error('No se pudieron preparar las dependencias de producción.');
const metadata = JSON.parse(fs.readFileSync(path.join(stage, 'package.json'), 'utf8'));
delete metadata.build;
delete metadata.devDependencies;
delete metadata.scripts;
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(metadata, null, 2) + '\n');
fs.rmSync(path.join(stage, 'package-lock.json'));
const requireApp = createRequire(path.join(stage, 'package.json'));
for (const name of ['pack-import', 'pack-sync', 'pack-publish', 'curseforge']) requireApp('./src/' + name);
console.log('Aplicación y dependencias de producción preparadas.');
