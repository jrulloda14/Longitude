import { describe, expect, it } from 'vitest';
import ICAL from 'ical.js';
import { buildIcs, createExportSession, foldIcsLine, safeCalendarName, summaryCompact, summaryParticipants, summaryText, summaryUtc, weeklyOccurrences, type SummaryInput } from './share';
import { meetingDstNotes, describeTransition, recurringShifts } from './meeting-dst';
import { MS, resolveWall } from './time';
import { DEFAULT_SLEEP, DEFAULT_WORK } from './schedule';
const places = [{label:'New York',zone:'America/New_York'}, {label:'London',zone:'Europe/London'}, {label:'Kathmandu',zone:'Asia/Kathmandu'}, {label:'Sydney',zone:'Australia/Sydney'}];
const input = (patch: Partial<SummaryInput> = {}): SummaryInput => ({title:'Project sync',start:Date.parse('2026-10-20T13:00:00Z'),durationMin:45,reference:places[0],places,format:{hour12:true},...patch});
const parse = (ics: string) => { const root = new ICAL.Component(ICAL.parse(ics)); return { root, component: root.getFirstSubcomponent('vevent')!, event: new ICAL.Event(root.getFirstSubcomponent('vevent')!) }; };
const options = {uid:'test-event@longitude.app',now:Date.parse('2026-10-01T00:00Z')};
describe('meeting summaries from one absolute instant', () => {
  it('includes explicit dates, zones, fractional offsets and participant-local midnight', () => {
    const s=input(), text=summaryText(s);
    expect(text).toContain('Tuesday, October 20, 2026'); expect(text).toContain('Sydney — 12:00 AM (next day)');
    expect(text).toContain('Wednesday, October 21, 2026'); expect(text).toContain('Asia/Kathmandu'); expect(text).toContain('UTC+5:45');
    expect(text).toContain('Duration: 45 min'); expect(text).toContain('Eastern Daylight Time'); expect(text).toContain('calendar availability is not checked');
  });
  it('prints both local calendar dates when a meeting itself crosses midnight', () => {
    const text=summaryText(input({start:Date.parse('2026-10-20T12:45Z'),durationMin:90}));
    expect(text).toContain('Tuesday, October 20, 2026 → Wednesday, October 21, 2026');
  });
  it('uses the entire interval for work compatibility, including overnight attribution', () => {
    const p={label:'Night shift',zone:'UTC',work:{...DEFAULT_WORK,days:[5],start:1320,end:120},sleep:{start:180,end:600}};
    expect(summaryParticipants(input({places:[p],reference:p,start:Date.parse('2026-10-24T01:30Z'),durationMin:45}))).toContain('Outside working hours (30/45 working minutes)');
    expect(summaryParticipants(input({places:[p],reference:p,start:Date.parse('2026-10-24T01:30Z'),durationMin:30}))).toContain('Within working hours');
  });
  it('does not fabricate work compatibility without a schedule', () => expect(summaryText(input())).toContain('Working hours not provided'));
  it('all copy modes keep the same selected instant and participant dates', () => {
    const s=input();expect(summaryCompact(s)).toContain('Sydney 12:00 AM (next day)');expect(summaryParticipants(s)).toContain('Kathmandu — 6:45 PM');
    expect(summaryUtc(s)).toContain('2026-10-20T13:00:00.000Z – 2026-10-20T13:45:00.000Z');
  });
  it('changes all derived content when the selected instant changes', () => {
    const a=input(), b=input({start:a.start+MS.DAY}); expect(summaryText(a)).not.toEqual(summaryText(b));expect(parse(buildIcs(b,options)).event.startDate.toJSDate().getTime()).toBe(b.start);
  });
  it('respects same-zone participants and unusual labels without implying confirmed availability', () => {
    const p={...places[0],label:'李, Priya; R&D 🙂',work:DEFAULT_WORK,sleep:DEFAULT_SLEEP};
    const text=summaryText(input({places:[p,{...p,label:'Second person'}]}));expect(text).toContain(p.label);expect(text).toContain('Second person');
  });
});
describe('RFC 5545 independent parser validation', () => {
  it('has the required calendar/event fields, UTC values and real timestamps', () => {
    const s=input(), ics=buildIcs(s,options), {root,event,component}=parse(ics);
    expect(root.getFirstPropertyValue('version')).toBe('2.0');expect(root.getFirstPropertyValue('prodid')).toContain('Longitude');
    expect(event.uid).toBe(options.uid);expect(event.summary).toBe(s.title);expect(event.description).toBe(summaryText(s));
    expect(event.startDate.zone.tzid).toBe('UTC');expect(event.endDate.zone.tzid).toBe('UTC');
    expect(event.startDate.toJSDate().getTime()).toBe(s.start);expect(event.endDate.toJSDate().getTime()).toBe(s.start+45*MS.MIN);
    expect((component.getFirstPropertyValue('dtstamp') as ICAL.Time).toJSDate().getTime()).toBe(options.now);
    expect(ics.endsWith('\r\n')).toBe(true);expect(ics.replace(/\r\n/g,'')).not.toMatch(/[\r\n]/);
  });
  it.each(['comma, semicolon; slash\\ newline\nnext', 'CR\rline\r\nnext', 'こんにちは 🌍 café é العربية', 'A'.repeat(500), '🙂'.repeat(200)])('round-trips unusual text: %s', title => {
    const ics=buildIcs(input({title}),options), normalized=title.replace(/\r\n|\r/g,'\n').trim();
    expect(parse(ics).event.summary).toBe(normalized);
    for(const line of ics.split('\r\n'))expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(ics))).toBe(ics);
  });
  it('does not permit text to inject properties or events', () => {
    const {root,event}=parse(buildIcs(input({title:'Review\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Evil'}),options));
    expect(root.getAllSubcomponents('vevent')).toHaveLength(1);expect(event.summary).toContain('SUMMARY:Evil');
  });
  it.each([74,75,76,149,150,151])('folds boundary length %i with continuation octet included', n => {
    const folded=foldIcsLine('X:'+ '🙂'.repeat(n));expect(folded.replace(/\r\n /g,'')).toBe('X:'+'🙂'.repeat(n));
    expect(folded.split('\r\n').every(l=>new TextEncoder().encode(l).length<=75)).toBe(true);
  });
  it.each(['2027-03-14T06:30Z','2026-11-01T05:30Z','2026-11-01T06:30Z','2026-10-03T15:15Z'])('retains elapsed duration across transition %s', start => {
    const s=input({start:Date.parse(start),durationMin:90}), {event}=parse(buildIcs(s,options));
    expect(event.endDate.subtractDate(event.startDate).toSeconds()).toBe(5400);expect(event.description).toBe(summaryText(s));
  });
  it('serializes early ISO years as four digits and truncates only sub-second precision', () => {
    const s=input({start:-62135596799999,places:[{label:'UTC',zone:'UTC'}],reference:{label:'UTC',zone:'UTC'}});
    expect(buildIcs(s,options)).toContain('DTSTART:00010101T000000Z');
  });
  it('keeps a cryptographic session UID/creation time across edits and gives explicit new events new IDs', () => {
    const session=createExportSession(options.now);const a=parse(buildIcs(input(),{...options,...session})).event;
    const b=parse(buildIcs(input({title:'Changed',start:input().start+MS.DAY}),{...options,...session})).event;
    expect(a.uid).toBe(b.uid);expect(createExportSession(options.now).uid).not.toBe(session.uid);
    expect(a.uid).toMatch(/^[a-f0-9-]{36}@longitude\.app$/);
  });
});
describe('bounded explicit weekly recurrence', () => {
  it('fixed UTC keeps absolute weekly instants and explains local shifts', () => {
    const s=input({recurrence:{basis:'utc',count:12}}),{event}=parse(buildIcs(s,options)),iterator=event.iterator();
    for(let i=0;i<12;i++)expect(iterator.next()!.toJSDate().getTime()).toBe(s.start+i*7*MS.DAY);
    expect(iterator.next()).toBeUndefined();expect(recurringShifts(s.places,s.start,12,s.format).some(r=>r.place==='New York'&&r.after==='8:00 AM')).toBe(true);
  });
  it('reference wall time exports bounded UTC RDATEs that an independent recurrence iterator agrees with', () => {
    const s=input({recurrence:{basis:'reference',count:12}}), ics=buildIcs(s,options), {event}=parse(ics), iterator=event.iterator();
    expect(ics).toContain('RDATE:');expect(ics).not.toMatch(/TZID|VTIMEZONE|RRULE/);
    for(const at of weeklyOccurrences(s))expect(iterator.next()!.toJSDate().getTime()).toBe(at);
    expect(iterator.next()).toBeUndefined();expect(recurringShifts(s.places,s.start,12,s.format,'reference',s.reference.zone).some(r=>r.place==='New York')).toBe(false);
  });
  it('reference recurrence gaps shift forward without shifting following weeks', () => {
    const s=input({start:Date.parse('2027-03-07T07:30Z'),recurrence:{basis:'reference',count:3}}),occ=weeklyOccurrences(s);
    expect(new Date(occ[1]).toISOString()).toBe('2027-03-14T07:30:00.000Z');expect(new Date(occ[2]).toISOString()).toBe('2027-03-21T06:30:00.000Z');
    expect(meetingDstNotes(s,s.start).join(' ')).toContain('nonexistent wall time');
  });
  it('explains a whole skipped civil date without assuming a one-hour gap', () => {
    const p={label:'Apia',zone:'Pacific/Apia'},s=input({start:Date.parse('2011-12-23T20:00Z'),reference:p,places:[p],recurrence:{basis:'reference',count:2}});
    expect(weeklyOccurrences(s)[1]).toBe(Date.parse('2011-12-30T20:00Z'));
    expect(meetingDstNotes(s,s.start).join(' ')).toContain('nonexistent wall time; shifted forward 1440 minutes');
  });
  it('reference recurrence folds choose earlier while preserving the explicit original instant', () => {
    const start=resolveWall('America/New_York',2026,10,25,1,30).instant,s=input({start,recurrence:{basis:'reference',count:2}});
    expect(weeklyOccurrences(s)[1]).toBe(Date.parse('2026-11-01T05:30Z'));expect(meetingDstNotes(s,start).join(' ')).toContain('ambiguous wall time; earlier');
  });
});
describe('contextual DST explanations', () => {
  it('does not warn for no-DST zones or no relevant transition', () => {
    const s=input({places:[{label:'Kathmandu',zone:'Asia/Kathmandu'}]});expect(meetingDstNotes(s,s.start)).toEqual([]);expect(describeTransition('Asia/Kathmandu','Kathmandu',s.start,s.format)).toBeNull();
  });
  it('distinguishes the two fall-back instants and explains the transition during a full meeting', () => {
    const s=input({start:Date.parse('2026-11-01T05:30Z'),durationMin:90});expect(summaryText(s)).toContain('UTC−4 → UTC−5');
    expect(meetingDstNotes(s,s.start).join(' ')).toContain('Duration remains 90 elapsed minutes');
    expect(summaryText(input({start:s.start+MS.HOUR}))).toContain('Eastern Standard Time');
  });
  it('describes Lord Howe half-hour transitions rather than assuming one hour', () => expect(describeTransition('Australia/Lord_Howe','Lord Howe',Date.parse('2026-10-01T00:00Z'),{hour12:false})).toContain('forward 30m'));
  it('compares the selected participant offset to today without calling selected-date offsets now', () => {
    const s=input({start:Date.parse('2026-12-01T13:00Z')});expect(meetingDstNotes(s,Date.parse('2026-10-01T00:00Z')).join(' ')).toContain('UTC−5 on this selected date (UTC−4 today)');
    expect(describeTransition('Europe/London','London',Date.parse('2026-10-20T00:00Z'),{hour12:true})).not.toContain('(now');
  });
});
describe('strict export validation and safe filenames', () => {
  it.each(['../../secret','CON','COM1','LPT9','a:b/c\\d\nfile','💡','  '])('produces safe destination suggestion for %s', title => {
    const name=safeCalendarName(title);expect(name).toMatch(/^[a-z0-9_-]{1,80}\.ics$/);expect(name).not.toMatch(/^(con|com1|lpt9)\.ics$/i);
  });
  it.each([0,-1,1441,1.5,NaN,Infinity])('rejects invalid duration %s', durationMin=>expect(()=>buildIcs(input({durationMin}),options)).toThrow());
  it.each(['\0','\u0001','\u007f','\ud800','x'.repeat(501)])('rejects malformed title %j',title=>expect(()=>buildIcs(input({title}),options)).toThrow());
  it.each(['\r\nINJECT:yes','x,y','x;y','x\\y','x y',''])('rejects unsafe UID %j',uid=>expect(()=>buildIcs(input(),{...options,uid})).toThrow());
  it('rejects invalid zones, instant, format, recurrence and too many participants',()=>{
    for(const patch of [{start:NaN},{places:[{label:'Bad',zone:'Invalid/Zone'}]},{format:{hour12:'yes'}},{places:Array(33).fill(places[0])},{recurrence:{basis:'local',count:12}},{recurrence:{basis:'utc',count:53}},{recurrence:{basis:'utc',count:1}}])expect(()=>buildIcs(input(patch as Partial<SummaryInput>),options)).toThrow();
  });
});
