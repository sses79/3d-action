#!/usr/bin/env node
import {readJson,request,runPlan,output} from './cli-lib.mjs';
const tokens=process.argv.slice(2),command=tokens.shift();
const help=`Animation Studio CLI — uses the existing running service; MCP remains available.
  node authoring/cli.mjs tools
  node authoring/cli.mjs call TOOL [--args args.json|-] [--out result.json] [--full]
  node authoring/cli.mjs batch plan.json|- [--out report.json] [--full]
Batch plans: {prompt, actionId?, finish?, steps:[{name, arguments, as}]}.
References: {"$ref":"alias.revision"}. Steps execute sequentially and stop on error.
Set finish:false to keep the run open for visual review, then finish_action_run.
Earlier writes remain saved on failure; batches are not transactions.
Outputs omit large motion arrays by default; --full preserves full results.
STUDIO_URL defaults to http://127.0.0.1:5174. No independent project loading.`;
let out,full=false;
try{
 if(!command||['help','--help','-h'].includes(command)){console.log(help);process.exit(0);}
 const positional=[];let argsFile;while(tokens.length){const token=tokens.shift();if(token==='--out'){out=tokens.shift();if(!out)throw Error('Missing output path');}else if(token==='--args'){argsFile=tokens.shift();if(!argsFile)throw Error('Missing arguments path');}else if(token==='--full')full=true;else if(token.startsWith('--'))throw Error('Unknown option '+token);else positional.push(token);}
 const base=process.env.STUDIO_URL||'http://127.0.0.1:5174';const call=(name,args)=>request(base,name,args);
 let result;
 if(command==='tools'){if(positional.length||argsFile)throw Error('Unexpected arguments');result=(await call('get_capabilities',{})).result.tools;}
 else if(command==='call'){if(positional.length!==1)throw Error('Specify one tool name');result=await call(positional[0],argsFile?await readJson(argsFile):{});}
 else if(command==='batch'){if(positional.length!==1||argsFile)throw Error('Specify one batch plan');result=await runPlan(await readJson(positional[0]),call);}
 else throw Error('Unknown command '+command);
 await output(result,out,full);
}catch(error){const report=error.report||{status:'failed',error:error.message};try{await output(report,out,full);}catch(e){console.error(e.message);}console.error(error.message);process.exitCode=1;}
