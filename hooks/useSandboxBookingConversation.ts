import {useCallback,useEffect,useRef,useState} from 'react';
import type {useSandboxReservations} from './useSandboxReservations';
import {SandboxBookingError,isSandboxBookingPrompt,type SandboxGuest} from '@/utils/sandbox-reservations';
import {bookingDayLabel,bookingQuestion,emptyBookingState,missingBookingField,nearestBookingTimes,
  parseBookingTurn,type SandboxChatState} from '@/utils/sandbox-chat';
type Services=ReturnType<typeof useSandboxReservations>;
function guestFor(account:Services['account']):SandboxGuest{
  const [firstName='',...rest]=(account?.name??'').trim().split(/\s+/);
  return {firstName,lastName:rest.join(' '),email:account?.email??'',phoneNumber:'7700900123',phoneCountry:'GB'};
}
const message=(e:unknown)=>e instanceof SandboxBookingError?e.message:'I couldn’t check that step just now. Please try checking the times again.';
/** Transient booking dialogue; only the existing server can verify/write a booking. */
export function useSandboxBookingConversation(services:Services){
  const [state,setState]=useState<SandboxChatState>(()=>emptyBookingState(guestFor(services.account)));
  const current=useRef(state),busy=useRef(false),version=useRef(0);
  const apply=useCallback((value:SandboxChatState)=>{current.current=value;setState(value);},[]);
  const reset=useCallback(()=>{
    if(current.current.phase==='submitting')return;
    version.current++;busy.current=false;apply(emptyBookingState(guestFor(services.account)));
  },[apply,services.account?.uid,services.account?.name,services.account?.email]);
  useEffect(()=>{
    version.current++;busy.current=false;apply(emptyBookingState(guestFor(services.account)));
    return()=>{version.current++;};
  },[services.account?.uid]);
  const canHandle=useCallback((text:string)=>{
    const s=current.current;
    return isSandboxBookingPrompt(text)||(s.active
      &&(!['confirmed','unknown'].includes(s.phase)||/\b(?:booking|reservation|confirmation|history|cancel|thanks|thank you)\b/i.test(text)));
  },[]);
  async function prepareReview(time:string,epoch:number){
    const s=current.current;
    if(!s.slots.includes(time))return 'Please choose one of the times OpenTable returned below.';
    const chosen={...s,selectedTime:time,review:undefined,error:undefined};
    if(!s.guest.firstName.trim()||!s.guest.lastName.trim()||s.guest.phoneNumber.replace(/\D/g,'').length<7){
      apply({...chosen,phase:'guest'});return 'I just need the guest details below, then we can review the test booking.';
    }
    apply({...chosen,phase:'reviewing'});
    const review=await services.review.mutateAsync({rid:264001,partySize:s.draft.partySize!,startDateTime:time,
      guest:{...s.guest,phoneNumber:s.guest.phoneNumber.replace(/\D/g,'')}});
    if(epoch===version.current)apply({...chosen,phase:'review',review});
    return 'Please check the details below. Nothing is booked until you tap Confirm test booking.';
  }
  async function lookup(epoch:number):Promise<string>{
    const s=current.current;
    if(missingBookingField(s.draft)){apply({...s,phase:'collecting'});return bookingQuestion(s.draft);}
    apply({...s,phase:'loading',slots:[],review:undefined,selectedTime:undefined,error:undefined});
    const response=await services.availability.mutateAsync({rid:264001,partySize:s.draft.partySize!,
      startDateTime:`${s.draft.date}T${s.draft.time}`});
    if(epoch!==version.current)return '';
    const slots=nearestBookingTimes(response.times,s.draft.time!);
    apply({...current.current,phase:'slots',slots});
    return slots.length
      ?`OpenTable returned ${slots.length} available ${slots.length===1?'time':'times'} for ${s.draft.partySize} on ${bookingDayLabel(s.draft.date!)} around ${s.draft.time}. Choose a time below and I’ll prepare the review. These are sandbox restaurant-local times, not a real restaurant booking.`
      :'OpenTable returned no times around then. Shall we try a different time or date?';
  }
  async function handleTurn(text:string):Promise<string>{
    if(busy.current)return 'I’m checking that step—please give me a moment.';
    busy.current=true;const epoch=version.current;
    try{
      const before=current.current;
      if(before.phase==='unknown')return 'That booking result still needs checking. Please use Check confirmation below, and don’t submit another booking.';
      if(before.phase==='confirmed'){
        if(/\bcancel\b/i.test(text))return 'I can’t cancel sandbox bookings through Panda yet. That message has not cancelled your test booking.';
        if(/\bthanks|thank you|confirmation|history\b/i.test(text))return `You’re welcome. Your verified sandbox confirmation is ${before.confirmation?.confirmationNumber}.`;
      }
      if(/\b(?:cancel|stop|never mind|forget it|don’t book|don't book|do not book)\b/i.test(text)){
        reset();return 'Of course—nothing has been booked from this conversation.';
      }
      if(before.phase==='review'&&/^(?:yes|confirm|book it|go ahead|yes please)[.!]?$/i.test(text.trim())){
        return 'Please check the review below and tap Confirm test booking. I won’t submit it from a chat reply alone.';
      }
      const caps=services.capabilities.data??(await services.capabilities.refetch()).data;
      if(epoch!==version.current)return '';
      if(!caps?.enabled)return 'The private OpenTable sandbox is not available for this signed-in account. I won’t substitute a real restaurant.';
      const base=before.active&&before.phase!=='confirmed'?before:emptyBookingState(guestFor(services.account));
      const parsed=parseBookingTurn(text,base.draft,new Date(),before.phase==='slots'?'time':undefined);
      let next={...base,active:true,draft:parsed.draft,error:undefined};
      if(parsed.clarification){apply({...next,phase:'collecting',review:undefined});return parsed.clarification;}
      if(next.draft.date&&(next.draft.date<caps.minDate||next.draft.date>caps.maxDate)){
        next={...next,draft:{...next.draft,date:undefined}};
        apply({...next,phase:'collecting'});
        return `For this sandbox I can check ${bookingDayLabel(caps.minDate)} through ${bookingDayLabel(caps.maxDate)}. Which day would you like?`;
      }
      apply(next);
      if(before.phase==='slots'&&parsed.timeProvided&&next.draft.date===before.draft.date&&next.draft.partySize===before.draft.partySize
        &&next.draft.time&&before.slots.includes(`${next.draft.date}T${next.draft.time}`)){
        return await prepareReview(`${next.draft.date}T${next.draft.time}`,epoch);
      }
      return await lookup(epoch);
    }catch(error){
      if(epoch===version.current)apply({...current.current,phase:'error',error:message(error)});
      return message(error);
    }finally{if(epoch===version.current)busy.current=false;}
  }
  async function chooseTime(time:string){
    if(busy.current||!['slots','guest'].includes(current.current.phase))return;
    busy.current=true;const epoch=version.current;
    try{await prepareReview(time,epoch);}
    catch(error){if(epoch===version.current)apply({...current.current,phase:'error',error:message(error)});}
    finally{if(epoch===version.current)busy.current=false;}
  }
  async function confirm(){
    const s=current.current;
    if(busy.current||s.phase!=='review'||!s.review)return;
    if(s.review.expiresAt<=Date.now()){apply({...s,phase:'error',error:'The review expired. Please check the times again.'});return;}
    busy.current=true;const epoch=version.current;apply({...s,phase:'submitting',error:undefined});
    try{
      const confirmation=await services.confirm.mutateAsync(s.review.reviewId);
      if(epoch!==version.current)return;
      if(confirmation?.status!=='confirmed'||!confirmation.confirmationNumber)throw new SandboxBookingError('connection_uncertain',true);
      apply({...s,phase:'confirmed',confirmation});
    }catch(error){
      if(epoch!==version.current)return;
      const uncertain=!(error instanceof SandboxBookingError)||error.uncertain;
      apply({...s,phase:uncertain?'unknown':'error',error:message(error)});
    }finally{if(epoch===version.current)busy.current=false;}
  }
  async function refresh(){
    if(busy.current||['unknown','confirmed'].includes(current.current.phase))return;
    busy.current=true;const epoch=version.current;
    try{await lookup(epoch);}catch(e){if(epoch===version.current)apply({...current.current,phase:'error',error:message(e)});}
    finally{if(epoch===version.current)busy.current=false;}
  }
  async function checkHistory(){
    if(busy.current)return;
    busy.current=true;const epoch=version.current,s=current.current;
    try{
      const result=await services.history.refetch();
      if(epoch!==version.current)return;
      const found=result.data?.find(row=>row.status==='confirmed'&&row.startDateTime===s.selectedTime&&row.partySize===s.draft.partySize);
      if(found)apply({...s,phase:'confirmed',confirmation:found,error:undefined});
      else apply({...s,error:'No confirmation has been verified in history yet. Do not book again; this test needs checking.'});
    }catch{if(epoch===version.current)apply({...s,error:'History could not be checked. Do not submit another booking.'});}
    finally{if(epoch===version.current)busy.current=false;}
  }
  return {state,canHandle,handleTurn,reset,chooseTime,confirm,refresh,checkHistory,
    isSubmitting:state.phase==='submitting',isBusy:['loading','reviewing','submitting'].includes(state.phase),
    setGuest:(guest:SandboxGuest)=>{
      if(current.current.phase==='guest'&&!busy.current)apply({...current.current,guest:{...guest,email:services.account?.email??''}});
    },
    editGuest:()=>{if(current.current.phase==='review'&&!busy.current)apply({...current.current,phase:'guest',review:undefined});},
    reviewGuest:()=>{if(current.current.selectedTime)void chooseTime(current.current.selectedTime);},
  };
}
