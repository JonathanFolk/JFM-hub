import {Store} from '../server/store.ts';
import {config} from '../server/config.ts';
import {dailyBackup} from '../server/sync.ts';
const store=new Store(config.database);try{await dailyBackup(store);console.log('Local backup created and integrity checked.');}finally{store.close();}
