import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const stress = () => {
 const zones=['America/New_York','Europe/London','Asia/Manila','Asia/Kathmandu','Australia/Lord_Howe','Pacific/Chatham','Australia/Adelaide','America/Los_Angeles'];
 const people=Array.from({length:32},(_,i)=>({id:String(i),label:`Person ${i}`,zone:zones[i%8],work:{start:360+i,end:405+i,days:[0,1,2,3,4,5,6],intervals:Array.from({length:8},(_,j)=>({start:360+j*90+i,end:405+j*90+i}))},sleep:{start:1380,end:420}}));
 const from=Date.parse('2026-10-24T00:00Z');return{people,from,to:from+(47+4999*8)*60000,duration:47,near:from,count:3,step:8,options:{fairness:true}};
};
test('maximum workload runs in the production worker and matches the synchronous reference',async({page})=>{
 await page.goto('/tests/browser/fixture.html');let workers=0;page.on('worker',()=>workers++);
 const result=await page.evaluate(input=>window.longitudeTest.search(input),stress());
 const before=JSON.parse(await readFile('docs/evidence/milestone-4/scheduling-stress-before.json','utf8'));
 expect(result.map(r=>({start:r.start,score:r.score}))).toEqual(before.runs[0].results);expect(workers).toBe(1);
});
