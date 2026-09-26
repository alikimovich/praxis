import { spawn } from 'node:child_process'
import { checkForUpdate } from '../main/update'
import type { NativeSheetController } from './sheets-runtime'
/** Update the current tracked checkout; never discard work or switch branches. */
export class NativeUpdateController {
  constructor(readonly sheets: NativeSheetController, readonly root: string, readonly restart: () => void | Promise<void>, readonly run: (command: string, args: string[]) => Promise<string> = (command,args) => new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});let output=''
    const data=(chunk: Buffer)=>{output=(output+chunk.toString()).slice(-16000);const current=this.sheets.current;if(current?.state.title==='Updating Praxis'){current.state.message=output.split('\n').filter(Boolean).slice(-4).join('\n');this.sheets.host.send('sheetState', { state: current.state })}}
    child.stdout.on('data',data);child.stderr.on('data',data);child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(output||`Update exited with ${code}`)))
  }), readonly check = checkForUpdate, readonly canRestart: () => string | null = () => null) {}
  async open() {
    this.sheets.present({title:'Praxis updates',detail:'Check for updates to this installation of Praxis.',fields:[],actions:[{id:'cancel',label:'Close'},{id:'check',label:'Check for updates',primary:true}]},async()=>{
      const generation=this.sheets.generation
      const status=await this.check(this.root)
      if(generation!==this.sheets.generation)return
      this.sheets.present({title:'Praxis updates',detail:status.status==='available'?`${status.behind} new ${status.behind === 1 ? 'change' : 'changes'} available. Praxis will restart after updating.${status.subject ? '\n\nLatest change: ' + status.subject : ''}`:'No updates found. If you are offline, reconnect and check again.',fields:[],actions:[{id:'cancel',label:'Close'},...(status.status==='available'?[{id:'apply',label:'Update and restart',primary:true}]:[])]},async()=>this.apply())
    })
  }
  async apply() {
    const blocked = this.canRestart(); if (blocked) throw new Error(blocked)
    const generation = this.sheets.generation
    const dirty=await this.run('git',['status','--porcelain'])
    if (generation !== this.sheets.generation) return
    if(dirty.trim())throw new Error('Your Praxis installation has local changes. Commit or stash them before updating.')
    this.sheets.present({title:'Updating Praxis',detail:'Downloading changes and rebuilding Praxis. The app will restart when ready.',fields:[],actions:[]},async()=>{})
    const current=this.sheets.current!
    current.state.busy=true;this.sheets.host.send('sheetState', { state: current.state })
    try {
      await this.run('git',['pull','--ff-only'])
      await this.run(process.execPath,['install','--frozen-lockfile'])
      await this.run(process.execPath,['run','build:native'])
      const restartBlocked = this.canRestart()
      if (restartBlocked) throw new Error(restartBlocked)
      await this.restart()
    } catch(error) {
      this.sheets.present({title:'Update could not finish',detail:error instanceof Error ? error.message : String(error),fields:[],actions:[{id:'cancel',label:'Close'},{id:'retry',label:'Retry'}]},async()=>this.apply())
    }
  }
}
