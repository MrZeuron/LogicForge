// Run: node tests/simulator.test.cjs. Lightweight DOM for editor behavior tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Element {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.attributes={};this.listeners={};
    this.className='';this.scrollLeft=0;this.scrollTop=0;this.clientWidth=900;this.clientHeight=600;
    this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(' '),...names])].join(' ');},
      toggle:(name,on)=>{const names=new Set(this.className.split(' '));if(on??!names.has(name))names.add(name);else names.delete(name);this.className=[...names].join(' ');},
      remove:(name)=>{this.className=this.className.split(' ').filter(n=>n!==name).join(' ');}};
  }
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='class')this.className=v;}
  append(...items){items.forEach(item=>{item.parent=this;this.children.push(item);});}
  prepend(item){item.parent=this;this.children.unshift(item);}
  replaceChildren(...items){this.children=[];this.append(...items);}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]||[]).filter(f=>f!==fn);}
  getBoundingClientRect(){return {left:0,top:0};}
  setPointerCapture(id){this.captured=id;}
  hasPointerCapture(id){return this.captured===id;}
  releasePointerCapture(){this.captured=null;}
  scrollTo(x,y){this.scrollLeft=typeof x==='object'?x.left:x;this.scrollTop=typeof x==='object'?x.top:y;}
  querySelectorAll(selector){
    const all=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);
    if(selector==='*')return all;
    if(selector==='[data-type]')return all.filter(e=>e.dataset.type);
    if(selector.startsWith('[data-id='))return all.filter(e=>String(e.dataset.id)===selector.match(/"(.*?)"/)[1]);
    return all.filter(e=>e.className.split(' ').includes(selector.slice(1)));
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  remove(){this.parent.children=this.parent.children.filter(e=>e!==this);}
}
const root=new Element(),elements={};
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const match of html.matchAll(/id="([^"]+)"/g)){const e=new Element();elements[match[1]]=e;root.append(e);}
elements.stage.clientWidth=2400;elements.stage.clientHeight=1600;
for(const match of html.matchAll(/data-type="([^"]+)"/g)){const e=new Element('button');e.dataset.type=match[1];root.append(e);}
const document={getElementById:id=>elements[id],createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),
  querySelectorAll:selector=>root.querySelectorAll(selector),addEventListener(){},activeElement:null};
const context=vm.createContext({document,window:{addEventListener(){}},console,assert,Blob,URL,setTimeout,confirm:()=>true});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/simulator.js'),'utf8'),context);
vm.runInContext(`
assert.equal(nodes.length,4);assert.equal(wires.length,3);assert.equal(history.length,1);
const initial=JSON.stringify({nodes,wires});
const node=addNode('NAND',900,300);
assert.equal(nodes.length,5);
restoreHistory(-1);assert.equal(nodes.length,4);assert.equal(JSON.stringify({nodes,wires}),initial);
restoreHistory(1);assert.equal(nodes.length,5);
select({kind:'nodes',ids:new Set(nodes.slice(0,4).map(n=>n.id))});
duplicateSelectedNodes();assert.equal(nodes.length,9);assert.equal(wires.length,6);
removeSelected();assert.equal(nodes.length,5);assert.equal(wires.length,3);
restoreHistory(-1);assert.equal(nodes.length,9);assert.equal(wires.length,6);
const saved=JSON.stringify({nodes,wires});
importData(saved);assert.equal(nodes.length,9);assert.equal(wires.length,6);
assert.throws(()=>importData('{"nodes":[],"wires":[{}]}'));
assert.equal(nodes.length,9);
// All basic gates, multiplexer and adders over every input combination.
const expected={AND:(a,b)=>a&b,OR:(a,b)=>a|b,XOR:(a,b)=>a^b,NAND:(a,b)=>1-(a&b),NOR:(a,b)=>1-(a|b),XNOR:(a,b)=>1-(a^b),NOT:a=>1-a,BUF:a=>a,MUX:(a,b,c)=>c?b:a,HA:(a,b)=>a^b,FA:(a,b,c)=>a^b^c};
historyPaused=true;
for(const [type,fn] of Object.entries(expected)){
  reset();const inputNodes=[addNode('IN'),addNode('IN'),addNode('IN')];const gate=addNode(type);
  TYPES[type].ins.forEach((_,i)=>wires.push({id:nextId++,from:inputNodes[i].id,output:0,to:gate.id,input:i}));
  for(let bits=0;bits<8;bits++){
    inputNodes.forEach((n,i)=>n.state=(bits>>i)&1);
    const [a,b,c]=inputNodes.map(n=>n.state),signals=getSignals();
    assert.equal(signals.output(gate.id,0),fn(a,b,c),type+' '+bits);
    if(type==='HA')assert.equal(signals.output(gate.id,1),a&b);
    if(type==='FA')assert.equal(signals.output(gate.id,1),(a&b)|(a&c)|(b&c));
  }
  const symbol=gateSymbol(gate);
  assert.equal(symbol.querySelector('.gate-body').tagName,'RECT');
  assert.equal(symbol.querySelectorAll('.gate-bubble').length,['NAND','NOR','XNOR','NOT'].includes(type)?1:0);
}
// D flip-flop only updates at rising clock edges.
reset();const d=addNode('IN'),clock=addNode('CLOCK'),ff=addNode('DFF');
wires.push({id:nextId++,from:d.id,output:0,to:ff.id,input:0},{id:nextId++,from:clock.id,output:0,to:ff.id,input:1});
d.state=1;update(true);assert.equal(ff.state,0);
clock.state=1;update(true);assert.equal(ff.state,1);
d.state=0;update(true);assert.equal(ff.state,1);
clock.state=0;update(true);assert.equal(ff.state,1);
clock.state=1;update(true);assert.equal(ff.state,0);
// Movement and selection use world coordinates at reduced zoom.
setZoom(.5);assert.equal(stagePoint({clientX:100,clientY:150}).x,200);
assert.equal(stagePoint({clientX:100,clientY:150}).y,300);
select({kind:'node',id:ff.id});
const el=nodesLayer.querySelector('[data-id="'+ff.id+'"]');
const oldX=ff.x,oldY=ff.y;
startMove({button:0,shiftKey:false,clientX:0,clientY:0,pointerId:1,preventDefault(){}},ff,el);
el.listeners.pointermove[0]({clientX:24,clientY:12});
assert.equal(ff.x,oldX+48);assert.equal(ff.y,oldY+24);
el.listeners.pointerup[0]();assert.equal(ff.x%12,0);assert.equal(ff.y%12,0);
// Clicking imported coordinates must not move the element; groups keep spacing at edges.
ff.x=111;ff.y=123;
const clickEl=nodesLayer.querySelector('[data-id="'+ff.id+'"]');
startMove({button:0,shiftKey:false,clientX:0,clientY:0,pointerId:3,preventDefault(){}},ff,clickEl);
clickEl.listeners.pointerup[0]();assert.equal(ff.x,111);assert.equal(ff.y,123);
select({kind:'nodes',ids:new Set([ff.id,d.id])});
const groupEl=nodesLayer.querySelector('[data-id="'+ff.id+'"]');
const spacing=ff.x-d.x;
startMove({button:0,shiftKey:false,clientX:0,clientY:0,pointerId:4,preventDefault(){}},ff,groupEl);
groupEl.listeners.pointermove[0]({clientX:-2000,clientY:0});
groupEl.listeners.pointerup[0]();assert.equal(ff.x-d.x,spacing);
// A marquee in an endpoint's invisible corner must not select it.
reset();const endpoint=addNode('IN',120,120);
const down=stage.listeners.pointerdown[0],up=stage.listeners.pointerup[0];
setZoom(1);
down({button:0,target:{id:'stage'},clientX:121,clientY:121,pointerId:2,preventDefault(){}});
up({clientX:130,clientY:130});assert.equal(selectedNodeIds().size,0);
down({button:0,target:{id:'stage'},clientX:180,clientY:150,pointerId:2,preventDefault(){}});
up({clientX:210,clientY:180});assert.equal(selectedNodeIds().size,1);
`,context);
console.log('PASS: gate truth tables, DFF edges, symbol geometry, JSON validation, undo/redo, group duplication/deletion, zoom, dragging and shape selection.');
