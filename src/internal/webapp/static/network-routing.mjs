// Keep connections outside unrelated character circles and word labels.
// A small visibility graph around nearby boxes avoids a canvas-sized routing grid.
// Layout guarantees 12px between boxes. Keep their routing margins disjoint
// so dense rings of labels cannot seal off a character's outgoing paths.
const padding=5;
const point=(x,y)=>({x,y});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const box=p=>({left:p.x-p.width/2-padding,right:p.x+p.width/2+padding,top:p.y-p.height/2-padding,bottom:p.y+p.height/2+padding});
const inside=(p,r)=>p.x>r.left+0.01&&p.x<r.right-0.01&&p.y>r.top+0.01&&p.y<r.bottom-0.01;

export function segmentHitsBox(a,b,r) {
  let low=0,high=1;
  for(const [axis,min,max] of [['x',r.left+0.01,r.right-0.01],['y',r.top+0.01,r.bottom-0.01]]) {
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-9) {if(a[axis]<=min||a[axis]>=max)return false;}
    else {
      let enter=(min-a[axis])/delta,leave=(max-a[axis])/delta;
      if(enter>leave)[enter,leave]=[leave,enter];
      low=Math.max(low,enter);high=Math.min(high,leave);
      if(low>=high)return false;
    }
  }
  return high>0&&low<1;
}

function crosses(a,b,c,d) {
  const side=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return side(a,b,c)*side(a,b,d)<-0.01&&side(c,d,a)*side(c,d,b)<-0.01;
}

function route(start,end,obstacles,used) {
  const clear=(a,b)=>!obstacles.some(r=>segmentHitsBox(a,b,r));
  const crossingCost=(a,b)=>used.reduce((sum,[c,d])=>sum+(crosses(a,b,c,d)?45:0),0);
  if(clear(start,end)&&!crossingCost(start,end))return [start,end];
  // Expand only when the nearer corners do not provide a clear route.
  for(const margin of [48,160,Infinity]) {
    const region={left:Math.min(start.x,end.x)-margin,right:Math.max(start.x,end.x)+margin,top:Math.min(start.y,end.y)-margin,bottom:Math.max(start.y,end.y)+margin};
    const near=obstacles.filter(r=>r.right>=region.left&&r.left<=region.right&&r.bottom>=region.top&&r.top<=region.bottom);
    const corners=near.flatMap(r=>[point(r.left,r.top),point(r.right,r.top),point(r.right,r.bottom),point(r.left,r.bottom)]);
    const options=[point(start.x,end.y),point(end.x,start.y),...corners].filter(p=>!obstacles.some(r=>inside(p,r)));
    const points=[start,end,...options],cost=points.map(()=>Infinity),previous=points.map(()=>-1),closed=new Set();
    cost[0]=0;
    while(closed.size<points.length) {
      let current=-1,best=Infinity;
      for(let i=0;i<points.length;i++)if(!closed.has(i)) {
        const score=cost[i]+distance(points[i],end);
        if(score<best){best=score;current=i;}
      }
      if(current<0)break;
      if(current===1) {
        const result=[];
        for(let i=1;i>=0;i=previous[i])result.push(points[i]);
        return result.reverse();
      }
      closed.add(current);
      for(let next=0;next<points.length;next++) {
        if(closed.has(next))continue;
        const length=distance(points[current],points[next]);
        if(cost[current]+length+6>=cost[next]||!clear(points[current],points[next]))continue;
        const candidate=cost[current]+length+6+crossingCost(points[current],points[next]);
        if(candidate<cost[next]){cost[next]=candidate;previous[next]=current;}
      }
    }
  }
  // Layout keeps the padded boxes separate, so their corners form a route.
  // Surface a malformed layout instead of drawing a connection through a label.
  throw new Error('No clear connection between graph items');
}

function boundary(item,toward,circle) {
  const dx=toward.x-item.x,dy=toward.y-item.y;
  const scale=circle?38/Math.max(1,distance(item,toward)):Math.min(item.width/2/Math.max(0.001,Math.abs(dx)),item.height/2/Math.max(0.001,Math.abs(dy)));
  return point(item.x+dx*scale,item.y+dy*scale);
}

export function routeNetwork(nodes,edges) {
  const particles=[...nodes,...edges],boxes=new Map(particles.map(p=>[p,box(p)])),byGlyph=new Map(nodes.map(n=>[n.hanja,n])),used=[];
  // The selected word keeps the simplest route; later connections avoid it.
  for(const edge of [...edges].sort((a,b)=>Number(b.current)-Number(a.current))) {
    edge.routes=[];
    for(const glyph of edge.glyphs) {
      const node=byGlyph.get(glyph),obstacles=particles.filter(p=>p!==node&&p!==edge).map(p=>boxes.get(p));
      const repeated=edge.word.components.filter(g=>g===glyph).length>1;
      for(const lane of repeated?[-1,1]:[0]) {
        let points;
        if(lane) {
          const dx=edge.x-node.x,dy=edge.y-node.y,length=Math.max(1,distance(node,edge));
          let via;
          for(let offset=60;offset<=600;offset+=18) {
            const candidate=point((node.x+edge.x)/2-dy/length*offset*lane,(node.y+edge.y)/2+dx/length*offset*lane);
            if(![...boxes.values()].some(r=>inside(candidate,r))){via=candidate;break;}
          }
          if(via)points=[...route(point(node.x,node.y),via,obstacles,used).slice(0,-1),...route(via,point(edge.x,edge.y),obstacles,used)];
        }
        points??=route(point(node.x,node.y),point(edge.x,edge.y),obstacles,used);
        points[0]=boundary(node,points[1],true);
        points[points.length-1]=boundary(edge,points.at(-2),false);
        edge.routes.push({glyph,points});
        for(let i=1;i<points.length;i++)used.push([points[i-1],points[i]]);
      }
    }
  }
}

export function roundedPath(points) {
  let path=`M ${points[0].x} ${points[0].y}`;
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1],b=points[i],c=points[i+1],radius=Math.min(2.5,distance(a,b)/3,distance(b,c)/3);
    const before=point(b.x+(a.x-b.x)*radius/distance(a,b),b.y+(a.y-b.y)*radius/distance(a,b));
    const after=point(b.x+(c.x-b.x)*radius/distance(b,c),b.y+(c.y-b.y)*radius/distance(b,c));
    path+=` L ${before.x} ${before.y} Q ${b.x} ${b.y} ${after.x} ${after.y}`;
  }
  return path+` L ${points.at(-1).x} ${points.at(-1).y}`;
}
