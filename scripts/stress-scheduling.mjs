import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import os from 'node:os';
await mkdir('performance-results',{recursive:true});
await build({entryPoints:['src/lib/schedule.ts'],bundle:true,format:'esm',platform:'browser',outfile:'performance-results/stress-domain.mjs'});
const module = await readFile('performance-results/stress-domain.mjs');
const server=createServer((req,res)=>{res.setHeader('Content-Type', req.url==='/domain.mjs'?'text/javascript':'text/html');res.end(req.url==='/domain.mjs'?module:'<!doctype html><title>Scheduling stress</title>');});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const result=await page.evaluate(async()=>{
  const s=await import('/domain.mjs');
  const zones=['America/New_York','Europe/London','Asia/Manila','Asia/Kathmandu','Australia/Lord_Howe','Pacific/Chatham','Australia/Adelaide','America/Los_Angeles'];
  const people=Array.from({length:32},(_,i)=>({id:String(i),label:`Person ${i}`,zone:zones[i%8],work:{start:360+i,end:405+i,days:[0,1,2,3,4,5,6],intervals:Array.from({length:8},(_,j)=>({start:360+j*90+i,end:405+j*90+i}))},sleep:{start:1380,end:420}}));
  const from=Date.parse('2026-10-24T00:00Z'),to=from+(47+4999*8)*60000;
  const longTasks=[];const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask',buffered:true});
  const runs=[];
  for(let i=0;i<3;i++){
   await new Promise(r=>setTimeout(r,50));
   const heapBefore=performance.memory?.usedJSHeapSize??null;
   const start=performance.now();let delay;
   const timer=new Promise(done=>setTimeout(()=>{delay=performance.now()-start;done();},0));
   const results=s.suggestTimes(people,from,to,47,from,3,8,{fairness:true});const latency=performance.now()-start;
   await timer;await new Promise(r=>setTimeout(r,50));
   runs.push({latencyMs:latency,eventLoopDelayMs:delay,heapBefore,heapAfter:performance.memory?.usedJSHeapSize??null,results:results.map(r=>({start:r.start,score:r.score}))});
  }
  observer.disconnect();return{participants:32,intervals:8,candidateStarts:5000,stepMin:8,durationMin:47,elapsedSearchMinutes:47+4999*8,longTasksMs:longTasks,runs};
 });
 const report={measuredAt:new Date().toISOString(),browser:browser.version(),cpu:os.cpus()[0].model,logicalProcessors:os.cpus().length,ramBytes:os.totalmem(),os:`${os.type()} ${os.release()}`,method:'Headless Edge main thread; exact production domain; 32 distinct configurations, 8 intervals each, exactly 5000 starts; first + 2 cached runs; heap samples approximate and include GC; timer delay and Long Tasks observed',...result};
 await mkdir('docs/evidence/milestone-4',{recursive:true});await writeFile('docs/evidence/milestone-4/scheduling-stress-before.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(done=>server.close(done));}
