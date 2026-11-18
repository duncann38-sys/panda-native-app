import type {SandboxConfirmation,SandboxGuest,SandboxReview} from './sandbox-reservations';
export type BookingDraft={date?:string;time?:string;partySize?:number};
export type BookingPhase='collecting'|'loading'|'slots'|'guest'|'reviewing'|'review'|'submitting'|'confirmed'|'unknown'|'error';
export type SandboxChatState={
  active:boolean;phase:BookingPhase;draft:BookingDraft;slots:string[];guest:SandboxGuest;
  selectedTime?:string;review?:SandboxReview;confirmation?:SandboxConfirmation;error?:string;
};
export type MissingBookingField='date'|'time'|'partySize'|null;
const WORDS=['zero','one','two','three','four','five','six','seven','eight','nine','ten',
  'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
const DAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export function londonDay(now=new Date()):string{
  const fields=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(key=>fields.find(f=>f.type===key)!.value).join('-');
}
function addDays(day:string,n:number){return new Date(Date.parse(`${day}T12:00:00Z`)+n*86_400_000).toISOString().slice(0,10);}
function validDay(day:string){const d=new Date(`${day}T12:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day;}
export function missingBookingField(draft:BookingDraft):MissingBookingField{
  return !draft.date?'date':!draft.time?'time':!draft.partySize?'partySize':null;
}
export function bookingQuestion(draft:BookingDraft):string{
  switch(missingBookingField(draft)){
    case 'date':return 'Of course—what day would you like a table at OpenTable Sandbox — 264001?';
    case 'time':return 'Around what time would you like to go? You can say “9pm” or “21:00”.';
    case 'partySize':return 'And how many people shall I check for?';
    default:return '';
  }
}
export function bookingDayLabel(date:string):string{
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
}
/** Restaurant-local calendar values, never invented UTC instants for a virtual RID. */
export function parseBookingTurn(text:string,previous:BookingDraft={},now=new Date(),expectedField?:MissingBookingField):{
  draft:BookingDraft;clarification?:string;timeProvided?:boolean;
}{
  const draft={...previous},normal=text.toLowerCase().trim(),today=londonDay(now);
  const expected=expectedField??missingBookingField(previous);
  const iso=normal.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const british=normal.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if(iso){if(!validDay(iso[1]))return {draft:{...draft,date:undefined},clarification:'That date doesn’t look right. Which day did you mean?'};draft.date=iso[1];}
  else if(british){
    const candidate=`${british[3]||today.slice(0,4)}-${british[2].padStart(2,'0')}-${british[1].padStart(2,'0')}`;
    if(!validDay(candidate))return {draft:{...draft,date:undefined},clarification:'That date doesn’t look right. Which day did you mean?'};
    draft.date=candidate;
  }else if(/\bday after tomorrow\b/.test(normal))draft.date=addDays(today,2);
  else if(/\btomorrow\b/.test(normal))draft.date=addDays(today,1);
  else if(/\btoday|tonight\b/.test(normal))draft.date=today;
  else{
    const weekday=DAYS.findIndex(day=>new RegExp(`\\b(?:next\\s+)?${day}\\b`).test(normal));
    if(weekday>=0){const current=new Date(`${today}T12:00:00Z`).getUTCDay();draft.date=addDays(today,(weekday-current+7)%7||7);}
  }
  const numberWord=`(?:\\d{1,2}|${WORDS.slice(1).join('|')})`;
  const party=normal.match(new RegExp(`\\b(?:for|party of|table for|make (?:it|that))\\s+(${numberWord})\\b`))
    ||normal.match(new RegExp(`\\b(${numberWord})\\s+(?:people|persons|guests|of us)\\b`))
    ||(expected==='partySize'?normal.match(/^(\d{1,2}|[a-z]+)[.!]?$/):null);
  if(party){
    const n=/^\d+$/.test(party[1])?Number(party[1]):WORDS.indexOf(party[1]);
    if(n>0){if(n>20)return {draft:{...draft,partySize:undefined},clarification:'This test restaurant supports 1–20 people. How many shall I check for?'};draft.partySize=n;}
  }
  const clock=normal.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/)
    ||normal.match(/\b(?:at|around|about)\s+(\d{1,2})(?::([0-5]\d))?\b/)
    ||normal.match(/\b(\d{1,2}):([0-5]\d)\b/)
    ||normal.match(/\b(?:tomorrow|tonight|today)\s+(\d{1,2})\b/)
    ||(expected==='time'?normal.match(/^(\d{1,2})[.!]?$/):null);
  if(clock){
    delete draft.time;
    let hour=Number(clock[1]);const minute=Number(clock[2]||0),period=clock[3];
    if(period){if(hour<1||hour>12)return {draft,clarification:'What time did you mean? For example, 9pm or 21:00.'};hour=hour%12+(period==='pm'?12:0);}
    else if(hour<12&&!clock[2]&&!/\b(?:dinner|evening|tonight)\b/.test(normal)){
      return {draft,clarification:`Did you mean ${hour}am or ${hour}pm?`};
    }else if(hour<12&&!clock[2])hour+=12;
    if(hour>23)return {draft,clarification:'What time did you mean? Please use a time between 00:00 and 23:59.'};
    draft.time=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  }
  return {draft,timeProvided:!!clock};
}
export function emptyBookingState(guest:SandboxGuest):SandboxChatState{
  return {active:false,phase:'collecting',draft:{},slots:[],guest};
}
export function nearestBookingTimes(times:string[],target:string):string[]{
  const minute=(v:string)=>Number(v.slice(11,13))*60+Number(v.slice(14,16));
  const wanted=Number(target.slice(0,2))*60+Number(target.slice(3,5));
  return [...new Set(times)].sort((a,b)=>Math.abs(minute(a)-wanted)-Math.abs(minute(b)-wanted)||a.localeCompare(b));
}
