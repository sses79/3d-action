export class WatchState {
  constructor({now=()=>Date.now(), tick=()=>performance.now(), offset=0, format24=true}={}) {
    this.now=now; this.tick=tick; this.offset=Number.isFinite(offset)?offset:0; this.format24=format24;
    this.mode='clock'; this.edit=null; this.field='hours'; this.lit=false; this.elapsed=0; this.started=null;
  }
  date(){return this.edit ? new Date(this.edit) : new Date(this.now()+this.offset);}
  modeButton(){if(this.edit!==null)this.field=this.field==='hours'?'minutes':'hours';else this.mode=this.mode==='clock'?'stopwatch':'clock';}
  adjust(){
    if(this.mode==='stopwatch'){if(this.started===null)this.started=this.tick();else{this.elapsed+=this.tick()-this.started;this.started=null;}return;}
    if(this.edit===null){this.edit=this.now()+this.offset;this.field='hours';return;}
    const d=this.date(); if(this.field==='hours')d.setHours((d.getHours()+1)%24);else d.setMinutes((d.getMinutes()+1)%60);this.edit=d.getTime();
  }
  save(){if(this.edit===null)return;const d=this.date();d.setSeconds(0,0);this.offset=d.getTime()-this.now();this.edit=null;}
  sync(){this.offset=0;this.edit=null;this.mode='clock';}
  resetStopwatch(){this.elapsed=0;this.started=null;}
  stopwatch(){return this.elapsed+(this.started===null?0:this.tick()-this.started);}
  light(){this.lit=!this.lit;}
  snapshot(){return {offset:this.offset,format24:this.format24};}
}
