import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
for (const dir of ['src', 'test']) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', `${dir}/${name}`], {stdio: 'inherit'});
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('Sintaxis verificada.');
