import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityTracker,monthSummary} from '../static/study-activity.mjs';

test('foreground, idle and resumed periods exclude time spent away', async()=>{
  let stamp=1000;
  const sent=[];
  const tracker=createActivityTracker({now:()=>stamp,send:async(id,spans)=>sent.push([id,spans])});
  tracker.setOwner('a',true);
  stamp+=300;tracker.sample(true,true);
  stamp+=10;tracker.sample(false);
  stamp+=700;tracker.sample(true,true);
  stamp+=3;tracker.sample(true);
  await tracker.flush();
  assert.deepEqual(sent,[['a',[{start:1000,end:1120},{start:1300,end:1310},{start:2010,end:2013}]]]);
});
test('retry preserves activity, and a previous owner’s delayed request cannot enter a new queue',async()=>{
  let stamp=1000,fail=true,release;
  const records=[];
  const tracker=createActivityTracker({now:()=>stamp,send:async(owner,batch)=>{
    if(fail)throw Error('offline');
    records.push([owner,batch]);if(owner==='a')await new Promise(r=>{release=r;});
  }});
  tracker.setOwner('a',true);stamp+=10;tracker.sample(true);
  assert.equal(await tracker.flush(),false);
  fail=false;const first=tracker.flush();
  tracker.setOwner('b',true);stamp+=5;tracker.sample(true);
  await tracker.flush();release();await first;
  assert.deepEqual(records,[['a',[{start:1000,end:1010}]],['b',[{start:1010,end:1015}]]]);
});
test('a saved round counts as a study day before timing began; gaps break a streak',()=>{
  const day=(seconds=0,rounds=0,correct=0,questions=0)=>({seconds,rounds,correct,questions});
  assert.deepEqual(monthSummary([day(0,1,1,2),day(20),day(),day(0,1,7,10)]),
    {seconds:20,correct:8,questions:12,activeDays:3,longest:2});
});
test('hiding during a heartbeat sends the last seconds before the page is suspended',async()=>{
  let stamp=1000,done;
  const sent=[];
  const tracker=createActivityTracker({now:()=>stamp,send:async(id,batch)=>{
    sent.push(batch);
    if(sent.length===1)await new Promise(r=>{done=r;});
  }});
  tracker.setOwner('a',true);stamp+=30;tracker.sample(true);
  const first=tracker.flush();
  stamp+=4;tracker.sample(false);await tracker.flush(true);
  assert.deepEqual(sent[1],[{start:1030,end:1034}]);
  done();await first;
});
