import {resolve} from 'node:path';
export const config={
 mode:process.env.APP_MODE||'production',
 preview:process.env.HUB_PREVIEW==='1',
 port:Number(process.env.PORT||4310),origin:process.env.APP_ORIGIN||'http://127.0.0.1:4310',
 database:resolve(process.env.DATA_DIR||'data','hub.sqlite'),backupDir:resolve(process.env.BACKUP_DIR||'backups'),
 secondaryBackupDir:process.env.SECONDARY_BACKUP_DIR?resolve(process.env.SECONDARY_BACKUP_DIR):'',
 staticDir:resolve(process.env.STATIC_DIR||'dist'),
 clientId:process.env.GOOGLE_CLIENT_ID||'',clientSecret:process.env.GOOGLE_CLIENT_SECRET||'',
 businessEmail:process.env.ALLOWED_EMAIL||'info@jonathanfolk.ca',calendarEmail:process.env.CALENDAR_EMAIL||'jcwfolk@gmail.com',
 encryptionKey:process.env.TOKEN_ENCRYPTION_KEY||'',calendarId:process.env.CALENDAR_ID||'primary',
 invoicingSpreadsheetId:process.env.INVOICING_SPREADSHEET_ID||'1qr_Ip4sOVwRnpZQPysFqzgFopPVrrtOX9C5W_WZ7VW8'
};
export function validEncryptionKey(value=config.encryptionKey){
 return /^[A-Za-z0-9+/]{43}=$/.test(value)&&Buffer.from(value,'base64').length===32;
}
export function validateConfig(){
 if(!['local','production'].includes(config.mode))throw new Error('APP_MODE must be local or production.');
 if(config.preview&&config.mode!=='local')throw new Error('Preview must run in local mode.');
 if(!Number.isInteger(config.port)||config.port<1||config.port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
 let origin:URL;try{origin=new URL(config.origin);}catch{throw new Error('APP_ORIGIN must be an absolute URL.');}
 if(origin.origin!==config.origin||origin.username||origin.password)throw new Error('APP_ORIGIN must contain only the scheme and host, with no path, credentials, query or trailing slash.');
 if(config.mode==='production'&&(origin.protocol!=='https:'||!validEncryptionKey()))throw new Error('Production needs an HTTPS origin and a valid 32-byte base64 encryption key. See SETUP.md.');
 if(config.mode==='production'&&Boolean(config.clientId)!==Boolean(config.clientSecret))throw new Error('Configure both Google OAuth credentials together. See SETUP.md.');
 if(config.mode==='local'&&(origin.protocol!=='http:'||!['127.0.0.1','localhost'].includes(origin.hostname)))throw new Error('Local mode must use an HTTP loopback origin.');
 if(config.secondaryBackupDir&&config.secondaryBackupDir===config.backupDir)throw new Error('SECONDARY_BACKUP_DIR must be independent from BACKUP_DIR.');
}
