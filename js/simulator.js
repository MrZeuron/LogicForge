
'use strict';

const TYPES = {
  IN:{name:'Вход',ins:[],outs:['Q']},
  CLOCK:{name:'Такт',ins:[],outs:['CLK']},
  OUT:{name:'Выход',ins:['A'],outs:[]},
  LED:{name:'Индикатор',ins:['A'],outs:[]},
  BUF:{name:'BUF',ins:['A'],outs:['Q']},
  NOT:{name:'NOT',ins:['A'],outs:['Q']},
  AND:{name:'AND',ins:['A','B'],outs:['Q']},
  OR:{name:'OR',ins:['A','B'],outs:['Q']},
  XOR:{name:'XOR',ins:['A','B'],outs:['Q']},
  NAND:{name:'NAND',ins:['A','B'],outs:['Q']},
  NOR:{name:'NOR',ins:['A','B'],outs:['Q']},
  XNOR:{name:'XNOR',ins:['A','B'],outs:['Q']},
  MUX:{name:'MUX 2:1',ins:['A','B','S'],outs:['Q']},
  HA:{name:'Полусумматор',ins:['A','B'],outs:['S','C']},
  FA:{name:'Полный сумматор',ins:['A','B','Cin'],outs:['S','Cout']},
  DFF:{name:'D-триггер ↑',ins:['D','CLK'],outs:['Q']}
};

const stage = document.getElementById('stage');
const nodesLayer = document.getElementById('nodes');
const svg = document.getElementById('wires');
const statusEl = document.getElementById('status');
const selectedInfo = document.getElementById('selected-info');
const viewport = document.getElementById('viewport');
let zoom=1,panMode=false,spaceHeld=false,pan=null;
const history=[];
let historyIndex=-1,historyPaused=false;
const nodes = [];
const wires = [];
const selectionBox = document.createElement('div');
selectionBox.id = 'selection-box';
selectionBox.hidden = true;
stage.append(selectionBox);
let nextId = 1;
let selected = null;
let pending = null;
let marquee = null;
let placement = 0;
let values = new Map();

function report(message){statusEl.textContent=message}
function getNode(id){return nodes.find(n=>n.id===id)}
function clamp(x,min,max){return Math.max(min,Math.min(max,x))}
function heightOf(n){return Math.max(92,53+26*Math.max(TYPES[n.type].ins.length,TYPES[n.type].outs.length))}
function portY(n,kind,index){
  const count=TYPES[n.type][kind==='in'?'ins':'outs'].length;
  return heightOf(n)/2+(index-(count-1)/2)*26;
}
function pos(n,kind,index){return {x:n.x+(kind==='out'?154:0),y:n.y+portY(n,kind,index)}}
function key(nodeId,port){return `${nodeId}:${port}`}
function selectedNodeIds(){
  if(selected?.kind==='node')return new Set([selected.id]);
  if(selected?.kind==='nodes')return new Set(selected.ids);
  return new Set();
}
function isNodeSelected(id){return selectedNodeIds().has(id)}

function svgElement(name,attributes={}){
  const element=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [attribute,value] of Object.entries(attributes))
    element.setAttribute(attribute,String(value));
  return element;
}

function addSymbolShape(svg,name,attributes){
  const shape=svgElement(name,attributes);
  shape.classList.add('gate-body');
  svg.append(shape);
}

function addSymbolLine(svg,x1,y1,x2,y2){
  svg.append(svgElement('path',{class:'gate-wire',d:`M ${x1} ${y1} L ${x2} ${y2}`}));
}

function addSymbolText(svg,text,x,y,className='gate-mark'){
  const label=svgElement('text',{class:className,x,y});
  label.textContent=text;
  svg.append(label);
}

const MARKS={AND:'&',NAND:'&',OR:'≥1',NOR:'≥1',XOR:'=1',XNOR:'=1',NOT:'1',BUF:'1',MUX:'MS',HA:'SM',FA:'SM',DFF:'T'};

function gateSymbol(n){
  const spec=TYPES[n.type],h=heightOf(n),center=h/2;
  const complex=['MUX','HA','FA','DFF'].includes(n.type);
  const top=10,bottom=h-10;
  const symbol=svgElement('svg',{class:'node-symbol',viewBox:`0 0 154 ${h}`,role:'img','aria-label':spec.name});
  const inverted=['NAND','NOR','XNOR','NOT'].includes(n.type);
  spec.ins.forEach((_,i)=>addSymbolLine(symbol,0,portY(n,'in',i),27,portY(n,'in',i)));
  spec.outs.forEach((_,i)=>{
    const y=portY(n,'out',i);
    addSymbolLine(symbol,inverted?135:127,y,154,y);
  });
  addSymbolShape(symbol,'rect',{x:27,y:top,width:100,height:bottom-top});
  if(inverted)symbol.append(svgElement('circle',{class:'gate-bubble',cx:131,cy:center,r:4}));
  addSymbolText(symbol,MARKS[n.type],77,complex?top+17:center);
  if(complex){
    addSymbolLine(symbol,51,top,51,bottom);
    addSymbolLine(symbol,103,top,103,bottom);
    spec.ins.forEach((label,i)=>addSymbolText(symbol,n.type==='MUX'?['0','1','S'][i]:label==='CLK'?'C':label==='Cin'?'CI':label,39,portY(n,'in',i),'gate-submark'));
    spec.outs.forEach((label,i)=>addSymbolText(symbol,label==='Cout'?'CO':label,115,portY(n,'out',i),'gate-submark'));
    if(n.type==='DFF')symbol.append(svgElement('path',{class:'gate-wire',d:`M 27 ${portY(n,'in',1)-5} l 6 5 l -6 5`}));
  }
  return symbol;
}

function endpointSymbol(n){
  const center=heightOf(n)/2;
  const svg=svgElement('svg',{
    class:'node-symbol',
    viewBox:`0 0 154 ${heightOf(n)}`,
    role:'img',
    'aria-label':`${TYPES[n.type].name}, условное обозначение`
  });

  if(n.type==='CLOCK'){
    addSymbolShape(svg,'rect',{x:53,y:center-28,width:50,height:56});
    addSymbolLine(svg,103,center,154,center);
    svg.append(svgElement('path',{class:'gate-wire',d:`M 62 ${center-13} v -7 h 8 v 7 h 8 v -7 h 8 v 7 h 8`}));
  }else if(n.type==='IN'){
    addSymbolShape(svg,'circle',{cx:78,cy:center,r:25});
    addSymbolLine(svg,103,center,154,center);
  }else{
    addSymbolLine(svg,0,center,53,center);
    addSymbolShape(svg,'circle',{cx:78,cy:center,r:25});
    if(n.type==='LED'){

      svg.append(svgElement('path',{class:'gate-wire',d:`M 98 ${center-23} l 8 -8 M 102 ${center-16} l 8 -8`}));
    }
  }
  return svg;
}

function addNode(type,x,y){
  if(!TYPES[type])return null;
  const id=nextId++;
  const offset=placement++%7;
  const n={id,type,x:clamp(x??((viewport.scrollLeft+viewport.clientWidth*.35)/zoom+offset*24),0,stage.clientWidth-154),
    y:clamp(y??((viewport.scrollTop+100)/zoom+offset*24),24,stage.clientHeight-150),state:0,clockPrev:0};
  nodes.push(n);
  update(false);
  select({kind:'node',id});
  report(`Добавлен элемент «${TYPES[type].name}».`);
  return n;
}

function getSignals(){
  const memo=new Map();
  const active=new Set();
  let hasCycle=false;

  function output(id,port){
    const k=key(id,port);
    if(memo.has(k))return memo.get(k);
    if(active.has(k)){hasCycle=true;return 0}

    const n=getNode(id);
    if(!n)return 0;
    active.add(k);

    const input=p=>{
      const w=wires.find(w=>w.to===id&&w.input===p);
      return w?output(w.from,w.output):0;
    };

    const a=input(0),b=input(1),c=input(2);
    let v=0;

    switch(n.type){
      case 'IN':case 'CLOCK':case 'DFF':v=n.state;break;
      case 'BUF':v=a;break;
      case 'NOT':v=1-a;break;
      case 'AND':v=a&b;break;
      case 'OR':v=a|b;break;
      case 'XOR':v=a^b;break;
      case 'NAND':v=1-(a&b);break;
      case 'NOR':v=1-(a|b);break;
      case 'XNOR':v=1-(a^b);break;
      case 'MUX':v=c?b:a;break;
      case 'HA':v=port===0?(a^b):(a&b);break;
      case 'FA':v=port===0?(a^b^c):((a&b)|(a&c)|(b&c));break;
    }

    active.delete(k);
    memo.set(k,v);
    return v;
  }

  for(const n of nodes)
    for(let p=0;p<TYPES[n.type].outs.length;p++)
      output(n.id,p);

  const input=(id,p)=>{
    const w=wires.find(w=>w.to===id&&w.input===p);
    return w?output(w.from,w.output):0;
  };

  return {output,input,hasCycle};
}

function update(clockEvent=false){
  let signals=getSignals();

  if(clockEvent){
    const changes=[];
    for(const n of nodes.filter(n=>n.type==='DFF')){
      const clk=signals.input(n.id,1);
      if(n.clockPrev===0&&clk===1)
        changes.push([n,signals.input(n.id,0)]);
      n.clockPrev=clk;
    }
    for(const [n,v] of changes)n.state=v;
    signals=getSignals();
  }else{
    for(const n of nodes.filter(n=>n.type==='DFF'))
      n.clockPrev=signals.input(n.id,1);
  }

  values=new Map();
  for(const n of nodes){
    const spec=TYPES[n.type];
    for(let p=0;p<spec.outs.length;p++)
      values.set(key(n.id,p),signals.output(n.id,p));
  }

  drawNodes(signals);
  drawWires();
  document.getElementById('node-count').textContent=nodes.length;
  document.getElementById('wire-count').textContent=wires.length;

  if(signals.hasCycle)
    report('Внимание: обнаружена комбинационная петля. Для обратной связи используйте триггер.');

  showSelection();
  remember();
}

function drawNodes(signals){
  nodesLayer.replaceChildren();

  for(const n of nodes){
    const spec=TYPES[n.type];
    const el=document.createElement('div');
    const isEndpoint=['IN','CLOCK','OUT','LED'].includes(n.type);
    el.className=`node ${isEndpoint?'endpoint-node':'gate-node'}${n.type==='CLOCK'?' clock-node':''}${isNodeSelected(n.id)?' selected':''}`;
    el.style.cssText=`left:${n.x}px;top:${n.y}px;height:${heightOf(n)}px`;
    el.dataset.id=n.id;
    el.append(isEndpoint?endpointSymbol(n):gateSymbol(n));

    const title=document.createElement('div');
    title.className='node-title';

    const name=document.createElement('span');
    name.textContent=spec.name;

    const num=document.createElement('span');
    num.className='node-id';
    num.textContent=`#${n.id}`;

    title.append(name,num);
    el.append(title);

    el.addEventListener('pointerdown',e=>{
      if(e.target.closest('.port,.toggle-input')||panMode||spaceHeld)return;
      startMove(e,n,el);
    });

    const body=document.createElement('div');
    body.className='node-body';

    if(n.type==='IN'||n.type==='CLOCK'){
      const btn=document.createElement('button');
      btn.className='toggle-input'+(n.state?' on':'');
      btn.type='button';
      btn.textContent=n.state?'1':'0';
      btn.setAttribute('aria-pressed',String(Boolean(n.state)));
      btn.setAttribute('aria-label',`${spec.name} #${n.id}: ${n.state}`);
      btn.title='Изменить входной сигнал';
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        n.state=1-n.state;
        update(true);
      });
      body.append(btn);

    }else if(n.type==='OUT'||n.type==='LED'){
      const bit=signals.input(n.id,0);
      const v=document.createElement('span');
      v.className='node-value'+(bit?' on':'');
      v.textContent=n.type==='LED'?(bit?'●':'○'):String(bit);
      body.append(v);

    }else if(n.type==='DFF'){
      const v=document.createElement('span');
      v.className='node-value'+(n.state?' on':'');
      v.textContent=`Q=${n.state}`;
      body.append(v);

    }

    if(isEndpoint)el.append(body);

    for(const [kind,ports] of [['in',spec.ins],['out',spec.outs]]){
      ports.forEach((label,i)=>{
        const p=document.createElement('button');
        p.type='button';
        p.className=`port ${kind==='in'?'input':'output'}`;

        const bit=kind==='out'?signals.output(n.id,i):signals.input(n.id,i);
        if(bit)p.classList.add('on');

        if(pending?.id===n.id&&pending.kind===kind&&pending.index===i)
          p.classList.add('pending');

        p.style.top=`${portY(n,kind,i)}px`;
        p.title=`${kind==='in'?'Вход':'Выход'} ${label}: ${bit}`;
        p.setAttribute('aria-label',p.title);
        p.addEventListener('click',e=>{
          e.stopPropagation();
          portClick(n.id,kind,i);
        });

        const tag=document.createElement('span');
        tag.className=`port-label ${kind==='in'?'input':'output'}`;
        tag.style.top=`${portY(n,kind,i)}px`;
        tag.textContent=label;

        el.append(p,tag);
      });
    }

    nodesLayer.append(el);
  }
}

function drawWires(){
  svg.setAttribute('viewBox',`0 0 ${stage.clientWidth} ${stage.clientHeight}`);
  svg.replaceChildren();

  for(const w of wires){
    const a=getNode(w.from),b=getNode(w.to);
    if(!a||!b)continue;

    const start=pos(a,'out',w.output);
    const end=pos(b,'in',w.input);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',wireRoute(start,end));
    path.setAttribute('class','wire'+(values.get(key(w.from,w.output))?' on':'')+(selected?.kind==='wire'&&selected.id===w.id?' selected':''));
    path.style.pointerEvents='stroke';

    path.addEventListener('click',e=>{
      e.stopPropagation();
      select({kind:'wire',id:w.id});
    });

    svg.append(path);
  }
}

function portClick(id,kind,index){
  if(!pending){
    pending={id,kind,index};
    report('Выберите контакт на другой стороне соединения.');
    update(false);
    return;
  }

  const first=pending;
  pending=null;

  if(first.kind===kind){
    pending={id,kind,index};
    report('Для соединения нужен вход и выход. Выберите противоположный контакт.');
    update(false);
    return;
  }

  const from=kind==='out'?{id,index}:first;
  const to=kind==='in'?{id,index}:first;

  if(from.id===to.id){
    report('Нельзя соединить элемент с самим собой.');
    update(false);
    return;
  }

  if(wires.some(w=>w.from===from.id&&w.output===from.index&&w.to===to.id&&w.input===to.index)){
    report('Такое соединение уже существует.');
    update(false);
    return;
  }

  const old=wires.findIndex(w=>w.to===to.id&&w.input===to.index);
  if(old!==-1)wires.splice(old,1);

  wires.push({
    id:nextId++,
    from:from.id,
    output:from.index,
    to:to.id,
    input:to.index
  });

  selected=null;
  update(false);
  report('Контакты соединены.');
}

function startMove(e,n,el){
  if(e.button!==0)return;
  e.preventDefault();
  const ids=selectedNodeIds();
  if(e.shiftKey){
    if(ids.has(n.id)){
      ids.delete(n.id);
      select(ids.size?{kind:'nodes',ids}:null);
      return;
    }
    ids.add(n.id);
    select({kind:'nodes',ids});
  }else if(!ids.has(n.id)){
    select({kind:'node',id:n.id});
  }

  const moving=[...selectedNodeIds()].map(id=>{
    const node=getNode(id);
    return {node,x:node.x,y:node.y};
  });
  const startX=e.clientX,startY=e.clientY;
  const minX=Math.min(...moving.map(({x})=>x)),minY=Math.min(...moving.map(({y})=>y));
  const maxX=Math.max(...moving.map(({x})=>x+154)),maxY=Math.max(...moving.map(({node,y})=>y+heightOf(node)));
  let moved=false;
  const pointer=e.pointerId;
  el.setPointerCapture(pointer);

  const move=ev=>{
    if(!moved&&Math.hypot(ev.clientX-startX,ev.clientY-startY)<3)return;
    moved=true;
    const dx=clamp((ev.clientX-startX)/zoom,-minX,stage.clientWidth-maxX);
    const dy=clamp((ev.clientY-startY)/zoom,-minY,stage.clientHeight-maxY);
    moving.forEach(({node,x,y})=>{
      node.x=x+dx;
      node.y=y+dy;
      const element=nodesLayer.querySelector(`[data-id="${node.id}"]`);
      if(element){
        element.style.left=node.x+'px';
        element.style.top=node.y+'px';
      }
    });
    drawWires();
  };

  const stop=()=>{
    if(moved){
      const snapX=Math.round(n.x/12)*12-n.x,snapY=Math.round(n.y/12)*12-n.y;
      const dx=clamp(snapX,-Math.min(...moving.map(({node})=>node.x)),stage.clientWidth-Math.max(...moving.map(({node})=>node.x+154)));
      const dy=clamp(snapY,-Math.min(...moving.map(({node})=>node.y)),stage.clientHeight-Math.max(...moving.map(({node})=>node.y+heightOf(node))));
      moving.forEach(({node})=>{node.x+=dx;node.y+=dy;});
    }
    if(el.hasPointerCapture(pointer))el.releasePointerCapture(pointer);
    el.removeEventListener('pointermove',move);
    el.removeEventListener('pointerup',stop);
    el.removeEventListener('pointercancel',stop);
    update(false);
  };

  el.addEventListener('pointermove',move);
  el.addEventListener('pointerup',stop);
  el.addEventListener('pointercancel',stop);
}

function select(item){
  selected=item;
  drawWires();
  document.querySelectorAll('.node').forEach(el=>
    el.classList.toggle('selected',isNodeSelected(Number(el.dataset.id)))
  );
  showSelection();
}

function showSelection(){
  selectedInfo.replaceChildren();

  if(!selected){
    selectedInfo.textContent='Ничего не выбрано.';
    return;
  }

  const info=document.createElement('p');

  const ids=selectedNodeIds();
  if(ids.size){
    const selectedNodes=nodes.filter(n=>ids.has(n.id));
    if(selectedNodes.length===1){
      const n=selectedNodes[0];
      info.textContent=`${TYPES[n.type].name} #${n.id}. Входы: ${TYPES[n.type].ins.length}; выходы: ${TYPES[n.type].outs.length}.`;
    }else{
      info.textContent=`Выделено элементов: ${selectedNodes.length}. Их можно перемещать вместе.`;
    }
  }else{
    info.textContent='Выделено соединение между контактами.';
  }

  const btn=document.createElement('button');
  btn.type='button';
  btn.className='mini-btn';
  btn.textContent='Удалить выбранное';
  btn.addEventListener('click',removeSelected);
  selectedInfo.append(info,btn);
}

function removeSelected(){
  if(!selected)return;

  const ids=selectedNodeIds();
  if(ids.size){
    for(let i=nodes.length-1;i>=0;i--)
      if(ids.has(nodes[i].id))nodes.splice(i,1);
    for(let i=wires.length-1;i>=0;i--)
      if(ids.has(wires[i].from)||ids.has(wires[i].to))
        wires.splice(i,1);
  }else{
    const idx=wires.findIndex(w=>w.id===selected.id);
    if(idx!==-1)wires.splice(idx,1);
  }

  selected=null;
  pending=null;
  update(false);
  report(ids.size?`Удалено элементов: ${ids.size}.`:'Выбранное соединение удалено.');
}

function duplicateSelectedNodes(){
  const ids=selectedNodeIds();
  if(!ids.size){
    report('Для дублирования выберите один или несколько элементов.');
    return;
  }

  const originals=nodes.filter(n=>ids.has(n.id));
  const copies=originals.map(n=>({
    ...n,
    id:nextId++,
    x:clamp(n.x+32,0,stage.clientWidth-154),
    y:clamp(n.y+32,0,stage.clientHeight-heightOf(n)),
    clockPrev:0
  }));
  const idMap=new Map(originals.map((n,index)=>[n.id,copies[index].id]));
  const copiedWires=wires
    .filter(w=>idMap.has(w.from)&&idMap.has(w.to))
    .map(w=>({...w,id:nextId++,from:idMap.get(w.from),to:idMap.get(w.to)}));

  nodes.push(...copies);
  wires.push(...copiedWires);
  const copiedIds=new Set(copies.map(n=>n.id));
  selected=copiedIds.size===1
    ?{kind:'node',id:copies[0].id}
    :{kind:'nodes',ids:copiedIds};
  update(false);
  report(`Создано копий элементов: ${copies.length}.`);
}

function stagePoint(event){
  const bounds=stage.getBoundingClientRect();
  return {
    x:clamp((event.clientX-bounds.left)/zoom,0,stage.clientWidth),
    y:clamp((event.clientY-bounds.top)/zoom,0,stage.clientHeight)
  };
}

function updateMarquee(point){
  const left=Math.min(marquee.start.x,point.x);
  const top=Math.min(marquee.start.y,point.y);
  const width=Math.abs(point.x-marquee.start.x);
  const height=Math.abs(point.y-marquee.start.y);
  selectionBox.style.left=`${left}px`;
  selectionBox.style.top=`${top}px`;
  selectionBox.style.width=`${width}px`;
  selectionBox.style.height=`${height}px`;
}

function startMarquee(event){
  if(event.button!==0||panMode||spaceHeld||!['stage','nodes','wires'].includes(event.target.id))return;
  const start=stagePoint(event);
  marquee={
    start,
    startX:event.clientX,
    startY:event.clientY,
    additive:event.shiftKey,
    initialIds:event.shiftKey?selectedNodeIds():new Set()
  };
  selectionBox.hidden=false;
  updateMarquee(start);
  if(pending){
    pending=null;
    update(false);
  }
  if(!marquee.additive)select(null);
  stage.setPointerCapture(event.pointerId);
  event.preventDefault();
}

stage.addEventListener('pointerdown',startMarquee);
stage.addEventListener('pointermove',event=>{
  if(!marquee)return;
  updateMarquee(stagePoint(event));
});
stage.addEventListener('pointerup',event=>{
  if(!marquee)return;
  const bounds={
    left:Math.min(marquee.start.x,stagePoint(event).x),
    right:Math.max(marquee.start.x,stagePoint(event).x),
    top:Math.min(marquee.start.y,stagePoint(event).y),
    bottom:Math.max(marquee.start.y,stagePoint(event).y)
  };
  const dragged=Math.abs(event.clientX-marquee.startX)>3||Math.abs(event.clientY-marquee.startY)>3;
  const ids=new Set(marquee.initialIds);
  if(dragged){
    nodes.forEach(n=>{
      const endpoint=['IN','OUT','LED'].includes(n.type);
      const center={x:n.x+78,y:n.y+heightOf(n)/2};
      const nearest={x:clamp(center.x,bounds.left,bounds.right),y:clamp(center.y,bounds.top,bounds.bottom)};
      const intersects=endpoint?Math.hypot(center.x-nearest.x,center.y-nearest.y)<=25
        :n.type==='CLOCK'?n.x+53<bounds.right&&n.x+103>bounds.left&&center.y-28<bounds.bottom&&center.y+28>bounds.top
        :n.x+27<bounds.right&&n.x+127>bounds.left&&n.y+10<bounds.bottom&&n.y+heightOf(n)-10>bounds.top;
      if(intersects)ids.add(n.id);
    });
  }
  selectionBox.hidden=true;
  marquee=null;
  select(ids.size?{kind:'nodes',ids}:null);
  if(dragged)report(`Выделено элементов: ${ids.size}.`);
});
stage.addEventListener('pointercancel',()=>{
  if(!marquee)return;
  selectionBox.hidden=true;
  const ids=marquee.initialIds;
  marquee=null;
  select(ids.size?{kind:'nodes',ids}:null);
});

function reset(){
  nodes.length=0;
  wires.length=0;
  nextId=1;
  selected=null;
  pending=null;
  placement=0;
  update(false);
}

function demo(){
  historyPaused=true;
  reset();

  const a=addNode('IN',60,120);
  const b=addNode('IN',60,288);
  const gate=addNode('AND',300,204);
  const out=addNode('LED',540,204);

  wires.push({id:nextId++,from:a.id,output:0,to:gate.id,input:0});
  wires.push({id:nextId++,from:b.id,output:0,to:gate.id,input:1});
  wires.push({id:nextId++,from:gate.id,output:0,to:out.id,input:0});

  selected=null;
  update(false);
  historyPaused=false;
  remember();
  fitView();
  report('Пример: два входа → AND → индикатор. Нажмите на входы, чтобы изменить сигнал.');
}

/* Сохранение и загрузка схем */

function exportData(){
  const data={
    version:1,
    nodes:nodes.map(n=>({...n})),
    wires:wires.map(w=>({...w}))
  };

  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');

  a.href=url;
  a.download='logicforest-scheme.json';
  a.click();

  setTimeout(()=>URL.revokeObjectURL(url),1000);
  report('Схема сохранена в JSON.');
}

function importData(raw){
  const data=JSON.parse(raw);

  if(!data||!Array.isArray(data.nodes)||!Array.isArray(data.wires)||data.nodes.length>500||data.wires.length>2000)
    throw Error('Некорректный формат схемы.');

  const imported=[];
  const ids=new Set();

  for(const n of data.nodes){
    if(!Number.isSafeInteger(n.id)||n.id<1||ids.has(n.id)||!TYPES[n.type]||!Number.isFinite(n.x)||!Number.isFinite(n.y))
      throw Error('Некорректный элемент.');

    ids.add(n.id);
    imported.push({
      id:n.id,
      type:n.type,
      x:clamp(n.x,0,stage.clientWidth-154),
      y:clamp(n.y,0,stage.clientHeight-150),
      state:n.state===1?1:0,
      clockPrev:0
    });
  }

  const importedWires=[];
  const usedInputs=new Set();
  const wireIds=new Set();

  for(const w of data.wires){
    const from=imported.find(n=>n.id===w.from);
    const to=imported.find(n=>n.id===w.to);

    if(!Number.isSafeInteger(w.id)||w.id<1||ids.has(w.id)||wireIds.has(w.id)||!from||!to||from.id===to.id||!Number.isInteger(w.output)||!Number.isInteger(w.input)||w.output<0||w.input<0||w.output>=TYPES[from.type].outs.length||w.input>=TYPES[to.type].ins.length||usedInputs.has(key(to.id,w.input)))
      throw Error('Некорректное соединение.');

    wireIds.add(w.id);
    usedInputs.add(key(to.id,w.input));

    importedWires.push({
      id:w.id,
      from:w.from,
      output:w.output,
      to:w.to,
      input:w.input
    });
  }

  historyPaused=true;
  reset();
  nodes.push(...imported);
  wires.push(...importedWires);
  nextId=Math.max(0,...ids,...wireIds)+1;
  historyPaused=false;
  update(false);
  fitView();
  report('Схема успешно загружена.');
}

/* Обработчики кнопок */

document.querySelectorAll('[data-type]').forEach(btn=>
  btn.addEventListener('click',()=>addNode(btn.dataset.type))
);

document.getElementById('demo-btn').addEventListener('click',demo);
document.getElementById('save-btn').addEventListener('click',exportData);

document.getElementById('load-btn').addEventListener('click',()=>
  document.getElementById('file-input').click()
);

document.getElementById('file-input').addEventListener('change',async e=>{
  const file=e.target.files[0];
  if(!file)return;

  try{
    importData(await file.text());
  }catch(err){
    report(`Ошибка загрузки: ${err.message}`);
  }

  e.target.value='';
});

document.getElementById('clear-btn').addEventListener('click',()=>{
  if(nodes.length&&!confirm('Удалить все элементы и соединения?'))return;
  reset();
  report('Поле очищено.');
});

document.addEventListener('keydown',e=>{
  const activeTag=document.activeElement?.tagName;
  const editing=activeTag==='INPUT'||activeTag==='TEXTAREA'||activeTag==='SELECT'
    ||document.activeElement?.isContentEditable;
  if(editing||e.repeat)return;
  if(e.code==='Space'){e.preventDefault();spaceHeld=true;viewport.classList.add('pan-mode');return;}
  if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();restoreHistory(e.shiftKey||e.key.toLowerCase()==='y'?1:-1);return;}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.key.toLowerCase()==='v')setPanMode(false);
    if(e.key.toLowerCase()==='h')setPanMode(true);
    if(e.key.toLowerCase()==='f'){e.preventDefault();fitView();}
  }

  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){
    e.preventDefault();
    const ids=new Set(nodes.map(n=>n.id));
    select(ids.size?{kind:'nodes',ids}:null);
    report(`Выделено элементов: ${ids.size}.`);
    return;
  }

  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){
    e.preventDefault();
    duplicateSelectedNodes();
    return;
  }

  if(e.key==='Escape'){
    pending=null;
    select(null);
    update(false);
    report('Выделение и текущее соединение отменены.');
    return;
  }

  if((e.key==='Delete'||e.key==='Backspace')&&selected){
    e.preventDefault();
    removeSelected();
  }
});

function wireRoute(a,b){
  if(b.x>=a.x+36){
    const middle=Math.round((a.x+b.x)/24)*12;
    return `M ${a.x} ${a.y} H ${middle} V ${b.y} H ${b.x}`;
  }
  const lane=Math.max(a.y,b.y)+48;
  return `M ${a.x} ${a.y} H ${a.x+24} V ${lane} H ${b.x-24} V ${b.y} H ${b.x}`;
}

function remember(){
  if(historyPaused)return;
  const snapshot=JSON.stringify({nodes,wires,nextId});
  if(history[historyIndex]!==snapshot){
    history.splice(historyIndex+1);
    history.push(snapshot);
    if(history.length>80)history.shift();
    historyIndex=history.length-1;
  }
  document.getElementById('undo-btn').disabled=historyIndex<=0;
  document.getElementById('redo-btn').disabled=historyIndex>=history.length-1;
}

function restoreHistory(direction){
  const index=historyIndex+direction;
  if(index<0||index>=history.length)return;
  const snapshot=JSON.parse(history[index]);
  historyIndex=index;
  historyPaused=true;
  nodes.splice(0,nodes.length,...snapshot.nodes);
  wires.splice(0,wires.length,...snapshot.wires);
  nextId=snapshot.nextId;
  selected=null;pending=null;
  update(false);
  historyPaused=false;
  remember();
  report(direction<0?'Действие отменено.':'Действие повторено.');
}

function setZoom(value,anchor){
  const rect=viewport.getBoundingClientRect();
  const px=anchor?anchor.clientX-rect.left:viewport.clientWidth/2;
  const py=anchor?anchor.clientY-rect.top:viewport.clientHeight/2;
  const x=(viewport.scrollLeft+px)/zoom,y=(viewport.scrollTop+py)/zoom;
  zoom=clamp(value,.35,2);
  stage.style.zoom=zoom;
  viewport.scrollLeft=x*zoom-px;
  viewport.scrollTop=y*zoom-py;
  document.getElementById('zoom-reset').textContent=`${Math.round(zoom*100)}%`;
  document.getElementById('zoom-out').disabled=zoom<=.35;
  document.getElementById('zoom-in').disabled=zoom>=2;
}

function fitView(){
  if(!nodes.length){setZoom(1);viewport.scrollTo(0,0);return;}
  const left=Math.min(...nodes.map(n=>n.x)),top=Math.min(...nodes.map(n=>n.y))-24;
  const right=Math.max(...nodes.map(n=>n.x+154)),bottom=Math.max(...nodes.map(n=>n.y+heightOf(n)));
  setZoom(Math.min(1,(viewport.clientWidth-64)/(right-left),(viewport.clientHeight-64)/(bottom-top)));
  viewport.scrollLeft=Math.max(0,left*zoom-(viewport.clientWidth-(right-left)*zoom)/2);
  viewport.scrollTop=Math.max(0,top*zoom-(viewport.clientHeight-(bottom-top)*zoom)/2);
}

function setPanMode(value){
  panMode=value;
  viewport.classList.toggle('pan-mode',value||spaceHeld);
  for(const [id,active] of [['select-tool',!value],['pan-tool',value]]){
    const button=document.getElementById(id);
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
}

document.getElementById('zoom-in').addEventListener('click',()=>setZoom(zoom+.1));
document.getElementById('zoom-out').addEventListener('click',()=>setZoom(zoom-.1));
document.getElementById('zoom-reset').addEventListener('click',()=>setZoom(1));
document.getElementById('fit-btn').addEventListener('click',fitView);
document.getElementById('pan-tool').addEventListener('click',()=>setPanMode(true));
document.getElementById('select-tool').addEventListener('click',()=>setPanMode(false));
document.getElementById('undo-btn').addEventListener('click',()=>restoreHistory(-1));
document.getElementById('redo-btn').addEventListener('click',()=>restoreHistory(1));
viewport.addEventListener('wheel',event=>{
  if(!event.ctrlKey&&!event.metaKey)return;
  event.preventDefault();
  setZoom(zoom*Math.exp(-event.deltaY*.002),event);
},{passive:false});

viewport.addEventListener('pointerdown',event=>{
  if(!(event.button===1||(event.button===0&&(panMode||spaceHeld))))return;
  event.preventDefault();event.stopPropagation();
  pan={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('panning');
},true);
viewport.addEventListener('pointermove',event=>{
  if(pan){
    viewport.scrollLeft=pan.left-(event.clientX-pan.x);
    viewport.scrollTop=pan.top-(event.clientY-pan.y);
    return;
  }
  svg.querySelector('.wire-preview')?.remove();
  if(!pending)return;
  const n=getNode(pending.id);
  if(!n)return;
  const anchor=pos(n,pending.kind,pending.index),point=stagePoint(event);
  const path=svgElement('path',{class:'wire-preview',d:pending.kind==='out'?wireRoute(anchor,point):wireRoute(point,anchor)});
  svg.append(path);
});
function stopPan(event){
  if(!pan)return;
  pan=null;viewport.classList.remove('panning');
  if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
}
viewport.addEventListener('pointerup',stopPan);
viewport.addEventListener('pointercancel',stopPan);
document.addEventListener('keyup',event=>{
  if(event.code==='Space'){spaceHeld=false;viewport.classList.toggle('pan-mode',panMode);}
});
window.addEventListener('blur',()=>{spaceHeld=false;pan=null;viewport.classList.remove('panning');viewport.classList.toggle('pan-mode',panMode);});

const searchAliases={AND:'И',OR:'ИЛИ',NOT:'НЕ инвертор',XOR:'исключающее ИЛИ',NAND:'И-НЕ',NOR:'ИЛИ-НЕ',XNOR:'равнозначность',BUF:'буфер повторитель',MUX:'мультиплексор',HA:'полусумматор',FA:'полный сумматор',DFF:'триггер',CLOCK:'генератор такт'};
document.querySelectorAll('[data-type]').forEach(button=>{
  const type=button.dataset.type;
  const icon=document.createElement('span');
  icon.className='tool-icon'+(['NAND','NOR','XNOR','NOT'].includes(type)?' inverted':'')+(['IN','OUT','LED'].includes(type)?' endpoint':'')+(['MUX','HA','FA'].includes(type)?' small':'');
  icon.setAttribute('aria-hidden','true');
  icon.textContent=MARKS[type]||{IN:'0',OUT:'Q',CLOCK:'∿',LED:'◉'}[type];
  button.prepend(icon);
  button.title=`${TYPES[type].name} — нажмите или перетащите на поле`;
  button.draggable=true;
  button.addEventListener('dragstart',event=>{
    event.dataTransfer.setData('application/x-logicforest-element',type);
    event.dataTransfer.effectAllowed='copy';
  });
});
document.getElementById('element-search').addEventListener('input',event=>{
  const query=event.target.value.trim().toLocaleLowerCase('ru');
  document.querySelectorAll('[data-type]').forEach(button=>{
    const type=button.dataset.type;
    button.hidden=!`${type} ${TYPES[type].name} ${searchAliases[type]||''}`.toLocaleLowerCase('ru').includes(query);
  });
  document.querySelectorAll('.side-group').forEach(group=>{
    group.hidden=![...group.querySelectorAll('[data-type]')].some(button=>!button.hidden);
  });
});
viewport.addEventListener('dragover',event=>{
  if([...event.dataTransfer.types].includes('application/x-logicforest-element')){
    event.preventDefault();event.dataTransfer.dropEffect='copy';
  }
});
viewport.addEventListener('drop',event=>{
  const type=event.dataTransfer.getData('application/x-logicforest-element');
  if(!TYPES[type])return;
  event.preventDefault();
  const point=stagePoint(event);
  addNode(type,Math.round((point.x-77)/12)*12,Math.round((point.y-46)/12)*12);
});

demo();
