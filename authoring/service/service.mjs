#!/usr/bin/env node
// The authoring service as a launchd user agent (docs/DEPTH_SERVICE_PLAN.md, step 1): it starts at login, restarts if it stops, and
// logs to .authoring/logs. One command builds, tests and restarts it, so a rebuilt bundle is never left unloaded.
//   node authoring/service/service.mjs install    write ~/Library/LaunchAgents/<label>.plist and start it (stops a service started by hand)
//   node authoring/service/service.mjs deploy     build core.js and the editor, run the tests, restart, wait for /api/health
//   node authoring/service/service.mjs status     launchd's view and /api/health
//   node authoring/service/service.mjs uninstall  stop it and remove the agent
// The OpenRouter key stays in its own file: the agent is given its path (OPENROUTER_ENV_FILE), never the key.
import {spawnSync} from 'node:child_process';
import {writeFileSync,existsSync,mkdirSync,unlinkSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir,userInfo} from 'node:os';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),label='com.sses79.codex3d.authoring',uid=userInfo().uid,domain=`gui/${uid}`;
const plist=resolve(homedir(),'Library/LaunchAgents',label+'.plist'),logs=resolve(root,'.authoring/logs');
const node=process.env.STUDIO_NODE||'/Users/tim/.nvm/versions/node/v26.7.0/bin/node',envFile=process.env.OPENROUTER_ENV_FILE||'/Users/tim/Yun/voice-helper/.env.local';
const base='http://127.0.0.1:'+(process.env.STUDIO_PORT||5174);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const sh=(cmd,args,opts={})=>spawnSync(cmd,args,{cwd:root,stdio:'inherit',...opts});
const loaded=()=>spawnSync('launchctl',['print',`${domain}/${label}`],{stdio:'ignore'}).status===0;
async function health(waitMs=20000){const t0=Date.now();for(;;){try{const r=await fetch(base+'/api/health');if(r.ok)return await r.json();}catch{}if(Date.now()-t0>waitMs)return null;await new Promise(r=>setTimeout(r,500));}}
function writePlist(){mkdirSync(logs,{recursive:true});mkdirSync(dirname(plist),{recursive:true});
 const env={PATH:`${dirname(node)}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin`,OPENROUTER_ENV_FILE:envFile,HOME:homedir(),STUDIO_INTAKE:process.env.STUDIO_INTAKE??'http://127.0.0.1:8787',SMOVIE_DATA_DIR:process.env.SMOVIE_DATA_DIR??resolve(homedir(),'Yun/s-movie/data')};  // STUDIO_INTAKE= (empty) at install turns the smovie intake off
 writeFileSync(plist,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
 <key>Label</key><string>${label}</string>
 <key>ProgramArguments</key><array><string>${esc(node)}</string><string>${esc(resolve(root,'authoring/server.mjs'))}</string></array>
 <key>WorkingDirectory</key><string>${esc(root)}</string>
 <key>EnvironmentVariables</key><dict>${Object.entries(env).map(([k,v])=>`<key>${k}</key><string>${esc(v)}</string>`).join('')}</dict>
 <key>RunAtLoad</key><true/>
 <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
 <key>ThrottleInterval</key><integer>10</integer>
 <key>StandardOutPath</key><string>${esc(resolve(logs,'service.log'))}</string>
 <key>StandardErrorPath</key><string>${esc(resolve(logs,'service.log'))}</string>
</dict></plist>
`);}
const cmd=process.argv[2];
if(cmd==='install'){if(!existsSync(node))throw Error('Node 26 not found at '+node+' (set STUDIO_NODE)');
 spawnSync('pkill',['-f','node authoring/server.mjs'],{stdio:'ignore'});spawnSync('pkill',['-f',resolve(root,'authoring/server.mjs')],{stdio:'ignore'});
 if(loaded())sh('launchctl',['bootout',`${domain}/${label}`]);writePlist();for(let i=0;i<6&&sh('launchctl',['bootstrap',domain,plist]).status;i++)spawnSync('sleep',['1']);  // straight after a bootout launchd can refuse (5: Input/output error) for a moment
 const h=await health();console.log(h?`Running: version ${h.version}, pid ${h.pid}. Logs: ${resolve(logs,'service.log')}`:'Started, but /api/health does not answer yet: see '+resolve(logs,'service.log'));}
else if(cmd==='deploy'){
 for(const [what,args] of [['build:authoring',['run','-s','build:authoring']],['build:editor',['run','-s','build:editor']]]){console.log('·',what);if(sh('npm',args).status)throw Error(what+' failed');}
 console.log('· tests');if(sh(node,['--test',...readdirSync(resolve(root,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>'tests/'+f)],{stdio:['ignore','ignore','inherit']}).status)throw Error('Tests failed: not restarted (node --test tests/*.test.mjs for the details)');
 if(loaded())sh('launchctl',['kickstart','-k',`${domain}/${label}`]);else{console.log('The agent is not installed: node authoring/service/service.mjs install');process.exit(1);}
 const h=await health(45000);if(!h)throw Error('Restarted, but /api/health does not answer: see '+resolve(logs,'service.log'));console.log(`Running: version ${h.version}, pid ${h.pid}${h.restartNeeded?' (still stale: '+h.restartNeeded.changed.join(', ')+')':''}`);}
else if(cmd==='status'){console.log(loaded()?'launchd: '+label+' is loaded':'launchd: not installed');const h=await health(2000);console.log(h?JSON.stringify(h,null,1):'/api/health does not answer');}
else if(cmd==='uninstall'){if(loaded())sh('launchctl',['bootout',`${domain}/${label}`]);if(existsSync(plist))unlinkSync(plist);console.log('Removed '+label);}
else{console.log('Usage: node authoring/service/service.mjs install|deploy|status|uninstall');process.exit(cmd?1:0);}
