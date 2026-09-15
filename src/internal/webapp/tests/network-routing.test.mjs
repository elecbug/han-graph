import test from 'node:test';
import assert from 'node:assert/strict';
import {routeNetwork,roundedPath,segmentHitsBox} from '../static/network-routing.mjs';

test('routing can leave a character surrounded by labels with 12px gaps',()=>{
  const nodes=[[0,0],[0,-92],[92,0],[0,92],[-92,0]].map(([x,y],i)=>({hanja:String(i),x,y,width:80,height:80}));
  const edge={word:{components:['0']},glyphs:['0'],x:250,y:0,width:92,height:44,current:true};
  routeNetwork(nodes,[edge]);
  assert.equal(edge.routes.length,1);
  const points=edge.routes[0].points;
  assert(points.length>2,'the right-hand obstacle must cause a detour');
  assert(Math.abs(Math.hypot(points[0].x,points[0].y)-38)<0.001,'start on the character boundary');
  assert(!/NaN|Infinity/.test(roundedPath(points)));
  // Check samples independently of the routing intersection helper.
  for(let i=1;i<points.length;i++)for(let step=0;step<=100;step++) {
    const t=step/100,x=points[i-1].x+(points[i].x-points[i-1].x)*t,y=points[i-1].y+(points[i].y-points[i-1].y)*t;
    for(const n of nodes.slice(1))assert(Math.abs(x-n.x)>=42||Math.abs(y-n.y)>=42,'route must clear unrelated items');
  }
});

test('obstacle detection handles vertical, horizontal, diagonal and boundary segments',()=>{
  const box={left:0,right:10,top:0,bottom:10};
  assert(segmentHitsBox({x:-5,y:5},{x:15,y:5},box));
  assert(segmentHitsBox({x:5,y:-5},{x:5,y:15},box));
  assert(segmentHitsBox({x:-5,y:-5},{x:15,y:15},box));
  assert(!segmentHitsBox({x:-5,y:0},{x:15,y:0},box));
  assert(!segmentHitsBox({x:11,y:-5},{x:11,y:15},box));
});
