import test from 'node:test';
import assert from 'node:assert/strict';
import { World, STRUCTURES } from '../src/world.js';
import { ItemConnections } from '../src/connections.js';
import { itemPorts } from '../src/ports.js';
import { nationColor, nationLabel, NATIONS } from '../src/nations.js';

test('conveyor ports follow all four rotations', () => {
  for (let rotation=0;rotation<4;rotation++) {
    const ports=itemPorts({type:'conveyor',x:8,y:8,rotation},STRUCTURES);
    assert.equal(ports.length,4);
    assert.equal(ports.filter(p=>p.mode==='out').length,1);
    assert.equal(ports.find(p=>p.mode==='out').side,(2+rotation)%4);
    assert.deepEqual(new Set(ports.map(p=>p.side)),new Set([0,1,2,3]));
  }
});

test('multi-tile smelter ports rotate across footprint',()=>{
  const rotated=itemPorts({type:'smelter',x:10,y:20,rotation:1},STRUCTURES);
  assert.deepEqual(rotated.filter(p=>p.mode==='in'),[
    {x:11,y:20,side:0,mode:'in'},{x:10,y:20,side:0,mode:'in'},
  ]);
  assert.deepEqual(rotated.filter(p=>p.mode==='out'),[
    {x:11,y:22,side:2,mode:'out'},{x:10,y:22,side:2,mode:'out'},
  ]);
});

test('drill -> conveyor -> conveyor follows direction, not mere adjacency',()=>{
  const w=new World(),g=new ItemConnections(w);
  const drill=w.place('drill',0,0).entity;
  const belt=w.place('conveyor',1,2).entity;
  const other=w.place('conveyor',1,3).entity;
  const smelter=w.place('smelter',0,4).entity;
  assert.ok(g.link(drill.id,belt.id));
  assert.ok(g.link(belt.id,other.id));
  assert.equal(g.link(other.id,smelter.id),null);
  assert.equal(g.link(smelter.id,other.id),null);
  assert.deepEqual([...g.downstream(drill.id)],[drill.id,belt.id,other.id]);
  assert.equal(g.linkCount,2);
});

test('opposing outputs do not connect',()=>{
  const w=new World(),g=new ItemConnections(w);
  const a=w.place('conveyor',0,0,0).entity;
  const b=w.place('conveyor',0,1,2).entity;
  assert.equal(g.linkCount,0);
  assert.equal(g.link(a.id,b.id),null);
  const c=w.place('conveyor',1,1,1).entity;
  assert.equal(g.linkCount,1);
  assert.ok(g.link(c.id,b.id));
});

test('splitting a conveyor chain never destroys unrelated links',()=>{
  const w=new World(),g=new ItemConnections(w);
  const a=w.place('conveyor',0,0).entity;
  const b=w.place('conveyor',0,1).entity;
  const c=w.place('conveyor',0,2).entity;
  assert.equal(g.linkCount,2);
  assert.deepEqual([...g.downstream(a.id)],[a.id,b.id,c.id]);
  w.remove(b.id);
  assert.equal(g.linkCount,0);
  assert.deepEqual([...g.downstream(a.id)],[a.id]);
  const d=w.place('conveyor',0,1).entity;
  assert.equal(g.linkCount,2);
  assert.deepEqual([...g.downstream(a.id)],[a.id,d.id,c.id]);
});

test('chunk boundaries connect; distant placements are locally updated',()=>{
  const w=new World(),g=new ItemConnections(w);
  const a=w.place('conveyor',-993,-993).entity;
  const b=w.place('conveyor',-993,-992).entity;
  assert.equal(g.link(a.id,b.id)?.contacts.length,1);
  for(let i=0;i<500;i++)w.place('conveyor',100+i,100,1);
  assert.ok(g.lastRebuilt<=3);
  assert.equal(g.link(a.id,b.id)?.contacts.length,1);
});

test('multiple physical ports share one directed link',()=>{
  const w=new World(),g=new ItemConnections(w);
  const drill=w.place('drill',0,0).entity;
  const smelter=w.place('smelter',2,0).entity;
  assert.equal(g.link(drill.id,smelter.id)?.contacts.length,2);
  assert.equal(g.linkCount,1);
});

test('nation metadata does not alter connectivity; new nation colors stay isolated',()=>{
  const w=new World(),g=new ItemConnections(w);
  const a=w.place('conveyor',0,0,0,'north').entity;
  const b=w.place('conveyor',0,1,0,'south').entity;
  const revision=g.revision;
  assert.ok(g.link(a.id,b.id));
  assert.equal(w.setOwner(a.id,'south'),true);
  assert.equal(g.revision,revision);
  assert.ok(g.link(a.id,b.id));
  assert.notEqual(nationColor('north'),nationColor('south'));
  assert.equal(nationColor('unknown'),nationColor(null));
  assert.equal(nationLabel('unknown'),'중립');
  assert.equal(Object.keys(NATIONS).length,2);
});

test('graph reattaches to an already populated world',()=>{
  const w=new World();
  const a=w.place('conveyor',0,0).entity,b=w.place('conveyor',0,1).entity;
  const g=new ItemConnections(w);
  assert.ok(g.link(a.id,b.id));
  assert.equal(g.linkCount,1);
  g.dispose();
  const before=g.revision;
  w.place('conveyor',0,2);
  assert.equal(g.revision,before);
});

test('incremental links equal an independent full re-scan after 250 random edits',()=>{
  let state=0x1234abcd;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
  const world=new World({width:128,height:128,chunkSize:16}),graph=new ItemConnections(world);
  const types=Object.keys(STRUCTURES);
  for(let n=0;n<250;n++){
    if(random()<.32&&world.structures.size){
      const entries=[...world.structures.values()];
      world.remove(entries[Math.floor(random()*entries.length)].id);
    }else{
      world.place(types[Math.floor(random()*types.length)],Math.floor(random()*30)-15,Math.floor(random()*30)-15,Math.floor(random()*4));
    }
    const expected=new Map();
    for(const a of world.structures.values()){
      for(const out of itemPorts(a,STRUCTURES).filter(p=>p.mode==='out')){
        const step=[[0,-1],[1,0],[0,1],[-1,0]][out.side];
        const x=out.x+step[0],y=out.y+step[1];
        const b=world.getAt(x,y);
        if(!b||b.id===a.id)continue;
        if(!itemPorts(b,STRUCTURES).some(p=>p.mode==='in'&&p.side===(out.side+2)%4&&p.x===x&&p.y===y))continue;
        const key=`${a.id}:${b.id}`;
        expected.set(key,(expected.get(key)||0)+1);
      }
    }
    const actual=new Map();
    for(const [from,row] of graph.outgoing){
      for(const [to,link] of row){
        assert.equal(graph.inputs(to).get(from),link);
        actual.set(`${from}:${to}`,link.contacts.length);
      }
    }
    assert.deepEqual([...actual].sort(),[...expected].sort(),`iteration ${n}`);
    assert.equal(graph.linkCount,actual.size);
  }
});
