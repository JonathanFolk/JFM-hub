import {resolve} from 'node:path';
export const config={
 mode:process.env.APP_MODE||'production',
 port:Number(process.env.PORT||4310),origin:process.env.APP_ORIGIN||'http://127.0.0.1:4310',
 database:resolve(process.env.DATA_DIR||'data','hub.sqlite'),backupDir:resolve(process.env.BACKUP_DIR||'backups'),
 clientId:process.env.GOOGLE_CLIENT_ID||'',clientSecret:process.env.GOOGLE_CLIENT_SECRET||'',
 businessEmail:process.env.ALLOWED_EMAIL||'info@jonathanfolk.ca',calendarEmail:process.env.CALENDAR_EMAIL||'jcwfolk@gmail.com',
 encryptionKey:process.env.TOKEN_ENCRYPTION_KEY||'',calendarId:process.env.CALENDAR_ID||'primary'
};
export function validateConfig(){
 if(config.mode!=='local'&&(!config.origin.startsWith('https://')||Buffer.from(config.encryptionKey,'base64').length!==32))throw new Error('Production needs an HTTPS origin and a 32-byte encryption key. See SETUP.md.');
 if(config.mode!=='local'&&Boolean(config.clientId)!==Boolean(config.clientSecret))throw new Error('Configure both Google OAuth credentials together. See SETUP.md.');
 if(config.mode==='local'&&!['127.0.0.1','localhost'].includes(new URL(config.origin).hostname))throw new Error('Local mode must use a loopback origin');
}
