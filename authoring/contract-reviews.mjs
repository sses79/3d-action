import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import reviewSchema from './schemas/contract-reviews.schema.json' with {type:'json'};
import {validateSchema} from './contracts.mjs';
export function validateReviewData(data){const errors=[];validateSchema(data,reviewSchema,'',errors);if(errors.length)throw Error('Invalid contract review data: '+JSON.stringify(errors));for(const group of ['contacts','seams']){const key=group==='contacts'?'movementId':'contractId';if(new Set(data[group].map(r=>r[key])).size!==data[group].length)throw Error('Duplicate contract review IDs');}for(const group of ['contacts','contactHistory'])for(const record of data[group])if(record.intervals.some(c=>c.end<=c.start))throw Error('Invalid contact review interval');return data;}
export class ContractReviews{
 constructor(path){this.path=path;this.data={schemaVersion:1,contacts:[],seams:[],contactHistory:[],seamHistory:[]};try{this.data=validateReviewData(JSON.parse(readFileSync(path,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}
 current(group,id){const key=group==='contacts'?'movementId':'contractId';return this.data[group].find(r=>r[key]===id);}
 check(group,id,expected){if(!Number.isInteger(expected)||expected<0||(this.current(group,id)?.reviewRevision??0)!==expected)throw Error('Stale contract review revision');}
 save(){mkdirSync(dirname(this.path),{recursive:true});const tmp=this.path+'.tmp';writeFileSync(tmp,JSON.stringify(this.data,null,2));renameSync(tmp,this.path);}
 put(group,id,expected,value){this.check(group,id,expected);const key=group==='contacts'?'movementId':'contractId',previous=this.current(group,id),next=structuredClone(this.data);next[group]=next[group].filter(r=>r[key]!==id);const record={...value,reviewRevision:expected+1};next[group].push(record);if(previous)next[group==='contacts'?'contactHistory':'seamHistory']=[...next[group==='contacts'?'contactHistory':'seamHistory'],previous].slice(-100);validateReviewData(next);const old=this.data;this.data=next;try{this.save();}catch(error){this.data=old;throw error;}return structuredClone(record);}
 import(data){this.data=structuredClone(validateReviewData(data));this.save();}
}
