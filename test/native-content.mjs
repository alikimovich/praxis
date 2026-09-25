import assert from 'node:assert/strict'
import { NativeContentController } from '../src/native/content-controller.ts'
const states=[], calls=[]
let drift=false
const document={panel:{id:'content',file:'content.json',recipe:{version:1,id:'content',title:'Content',sections:[{id:'main',title:'Main',fields:[{key:'title',label:'Title',type:'text',required:true},{key:'count',label:'Count',type:'number',min:0}]},{id:'items',title:'Items',collection:{key:'items',itemLabelKey:'name',defaults:{name:'New'},fields:[{key:'name',label:'Name',type:'text'}]}}]}},value:{title:'Original',count:2,items:[{id:'first',name:'First',untouched:true}],untouched:'keep'},revision:'1'}
const controller=new NativeContentController(async(channel,...args)=>{calls.push([channel,...args]);if(channel==='content-controls:get')return structuredClone(document); if(channel==='content-controls:save'){if(drift)throw new Error('File changed on disk');return {...structuredClone(document),value:args[3],revision:'2'}}},(key,state)=>states.push({key,...structuredClone(state)}))
await controller.open('/a','content')
const key='/a\ncontent', session=controller.sessions.get(key)
const action=(action,extra={})=>controller.action(key,{root:'/a',generation:session.generation,action,...extra})
await action('draft',{field:'main:title',value:'Draft'});assert.equal(session.draft.title,'Draft')
await action('items:add');assert.equal(session.draft.items.length,2)
await action('items:1:up');assert.equal(session.draft.items[0].name,'New')
await action('save');assert.equal(calls.at(-1)[0],'content-controls:save');assert.equal(calls.at(-1)[3],'1');assert.equal(calls.at(-1)[4].untouched,'keep');assert.equal(session.document.revision,'2')
await action('draft',{field:'main:count',value:'bad'});const saves=calls.filter(c=>c[0]==='content-controls:save').length;await action('save');assert.equal(calls.filter(c=>c[0]==='content-controls:save').length,saves);assert.ok(session.error)
await action('draft',{field:'main:count',value:'3'});drift=true;await action('save');assert.match(session.error,/changed/);assert.equal(session.draft.title,'Draft')
await action('close');await controller.open('/a','content');assert.equal(controller.sessions.get(key).draft.title,'Draft')
console.log('Native content: recipe validation, preserved extra fields, collection ordering, revision conflicts and draft retention passed')
