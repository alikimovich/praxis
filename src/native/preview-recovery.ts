import type { NativeSheetController } from './sheets-runtime'
import { findPreviewProcesses, stopPreviewProcess, type PreviewProcess } from './preview-processes'

export class NativePreviewRecovery {
  constructor(readonly sheets: NativeSheetController, readonly find = findPreviewProcesses, readonly stop = stopPreviewProcess) {}
  open(key: string) {
    const entry = this.sheets.workspace.state.projects.find(p => p.key === key)
    if (!entry || this.sheets.current?.state.busy) return
    const present = (servers: PreviewProcess[], message: string) => {
      this.sheets.present({ title: 'Running servers', detail: `${entry.root}\n\n${message}`,
        fields: servers.length ? [{ id: 'server', label: 'Server', kind: 'choice', value: String(servers[0].pid), choices: servers.map(s => ({ value: String(s.pid), label: `PID ${s.pid} · ${s.addresses.join(', ')}` })) },
          { id: 'processes', label: 'Process details', kind: 'readonly', value: servers.map(s => `PID ${s.pid} · ${s.addresses.join(', ')}\n${s.command}\nStarted ${s.started}`).join('\n\n') }] : [],
        actions: [{ id: 'cancel', label: 'Close' }, { id: 'refresh', label: 'Refresh' }, { id: 'retry', label: 'Retry preview' }, ...(servers.length ? [{ id: 'stop', label: 'Stop & Retry…', primary: true }] : [])]
      }, async action => {
        if (!this.sheets.workspace.state.projects.includes(entry) || this.sheets.workspace.state.activeKey !== key) throw new Error('Select this project again before recovering its preview.')
        if (action.action === 'refresh') {
          const found = await this.find(entry.root)
          if (this.sheets.current?.state.id === action.id) present(found, found.length ? 'These processes are listening from this project folder. Stopping one also disconnects any other windows using it.' : 'No running servers found for this project. Retry the preview or use Diagnose and Activity to investigate other startup errors.')
        } else if (action.action === 'retry') await retry(action.id)
        else if (action.action === 'stop') {
          const server = servers.find(s => String(s.pid) === action.values.server)
          if (!server) throw new Error('Select a server from the current list.')
          this.sheets.present({ title: 'Stop this server?', detail: `Stop PID ${server.pid} serving ${server.addresses.join(', ')}?\n\n${entry.root}\n${server.command}\n\nOther windows using this server will disconnect. Praxis will then start a fresh preview.`, fields: [], actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'confirm', label: 'Stop & Retry', primary: true }] }, async confirmation => {
            if (!this.sheets.workspace.state.projects.includes(entry) || this.sheets.workspace.state.activeKey !== key) throw new Error('The active project changed. Reopen Running Servers for the current project.')
            await this.stop(server)
            if (this.sheets.current?.state.id === confirmation.id) await retry(confirmation.id)
          })
        }
      })
    }
    const retry = async (id: string) => {
      await this.sheets.workspace.command({ type: 'restart', key })
      if (this.sheets.current?.state.id === id) this.sheets.close()
    }
    present([], 'Inspect listening processes for this project without using an AI provider.')
    void this.sheets.action({ id: this.sheets.current!.state.id, action: 'refresh', values: {} })
  }
}
