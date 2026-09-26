import {resolve} from 'node:path';
import {Store} from '../server/store.ts';
import {importReferenceZip} from '../server/reference-import.ts';

const [zipFile,databaseFile,option]=process.argv.slice(2);
if(!zipFile||!databaseFile||option&&option!=='--replace')throw new Error('Usage: pnpm import:reference <archive.zip> <hub.sqlite> [--replace]');
const store=new Store(resolve(databaseFile));
try{console.log(JSON.stringify(importReferenceZip(store,resolve(zipFile),option==='--replace')));}
finally{store.close();}
