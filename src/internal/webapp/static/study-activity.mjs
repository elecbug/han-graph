// Whole Unix seconds allow the server to union intervals from multiple clients.
export function createActivityTracker({now, send}) {
  let owner=null, anchor=null, activeUntil=0, pending=[], sending=null;
  function sample(foreground, interacted=false) {
    if(!owner)return;
    const stamp=now();
    const end=Math.min(stamp,activeUntil);
    if(anchor!==null && end>anchor) {
      const last=pending.at(-1);
      if(last && last.end===anchor && end-last.start<=180)last.end=end;
      else pending.push({start:anchor,end});
    }
    if(!foreground)activeUntil=0;
    else if(interacted)activeUntil=stamp+120;
    anchor=foreground?stamp:null;
  }
  function setOwner(id, foreground) {
    if(id===owner)return;
    owner=id;anchor=null;activeUntil=0;pending=[];sending=null;
    if(id)sample(foreground,foreground);
  }
  function flush(leaving=false) {
    if(sending) {
      // A suspended page may never run the continuation of an in-flight
      // fetch. Send the final tail now. The server unions any later retries.
      if(leaving && pending.length) {
        return send(owner,pending.slice(-64)).then(()=>true,()=>false);
      }
      return sending;
    }
    if(!owner || !pending.length)return Promise.resolve(true);
    const account=owner, queue=pending;
    async function drain() {
      while(queue===pending && queue.length) {
        const cutoff=now()-86300;
        const batch=queue.splice(0,64).filter(span=>span.end>cutoff)
          .map(span=>({start:Math.max(cutoff,span.start),end:span.end}));
        if(!batch.length)continue;
        try { await send(account,batch); }
        catch { queue.unshift(...batch);return false; }
      }
      return true;
    }
    sending=drain().finally(()=>{if(queue===pending)sending=null;});
    return sending;
  }
  return {sample,setOwner,flush};
}

export function monthSummary(days) {
  let seconds=0, correct=0, questions=0, activeDays=0, streak=0, longest=0;
  for(const day of days) {
    seconds+=day.seconds;correct+=day.correct;questions+=day.questions;
    if(day.seconds || day.rounds) {activeDays++;streak++;longest=Math.max(longest,streak);}
    else streak=0;
  }
  return {seconds,correct,questions,activeDays,longest};
}
