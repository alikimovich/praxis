import { spawn } from 'node:child_process'
import { checkForUpdate } from '../main/update'
import type { NativeSheetController } from './sheets-runtime'
/** Update the current tracked checkout; never discard work or switch branches. */
export class NativeUpdateController {
  constructor(readonly sheets: NativeSheetController, readonly root: string, readonly restart: () => void | Promise<void>, readonly run: (command: string, args: string[]) => Promise<string> = (command,args) => new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});let output=''
    const data=(chunk: Buffer)=>{output=(output+chunk.toString()).slice(-16000);const current=this.sheets.current;if(current?.state.title==='Updating Praxis Native'){current.state.message=output.split('\n').filter(Boolean).slice(-4).join('\n');this.sheets.host.send('sheetState', { state: current.state })}}
    child.stdout.on('data',data);child.stderr.on('data',data);child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(output||`Update exited with ${code}`)))
  }), readonly check = checkForUpdate, readonly canRestart: () => string | null = () => null) {}
  async open() {
    this.sheets.present({title:'Praxis Native updates',detail:'Check the current checkout’s tracked branch for updates.',fields:[],actions:[{id:'cancel',label:'Close'},{id:'check',label:'Check for updates',primary:true}]},async()=>{
      const generation=this.sheets.generation
      const status=await this.check(this.root)
      if(generation!==this.sheets.generation)return
      this.sheets.present({title:'Praxis Native updates',detail:status.status==='available'?`${status.behind} new commit(s) available. ${status.subject??''}`:'No update was found. If you are offline, try again when connected.',fields:[],actions:[{id:'cancel',label:'Close'},...(status.status==='available'?[{id:'apply',label:'Update and restart',primary:true}]:[])]},async()=>this.apply())
    })
  }
  async apply() {
    const blocked = this.canRestart(); if (blocked) throw new Error(blocked)
    const generation = this.sheets.generation
    const dirty=await this.run('git',['status','--porcelain'])
    if (generation !== this.sheets.generation) return
    if(dirty.trim())throw new Error('This checkout has local changes. Commit or stash them before updating; nothing was changed.')
    this.sheets.present({title:'Updating Praxis Native',detail:'Updating this branch, installing dependencies and rebuilding the native app.',fields:[],actions:[]},async()=>{})
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
      this.sheets.present({title:'Update could not finish',detail:String(error),fields:[],actions:[{id:'cancel',label:'Close'},{id:'retry',label:'Retry'}]},async()=>this.apply())
    }
  }
}
