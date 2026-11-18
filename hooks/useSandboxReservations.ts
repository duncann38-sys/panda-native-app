import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {useCallback,useRef} from 'react';
import {useAuth} from '@/context/auth';
import {PANDA_RUNTIME_API} from '@/constants/services';
import {SandboxBookingError,type SandboxAvailability,type SandboxCapabilities,type SandboxConfirmation,
  type SandboxGuest,type SandboxReview,type SandboxSelection} from '@/utils/sandbox-reservations';

export function useSandboxReservations() {
  const {account,getIdToken}=useAuth();
  const queryClient=useQueryClient();
  const confirming=useRef(false);
  const request=useCallback(async<T,>(action:string,payload:object={}):Promise<T>=>{
    const token=await getIdToken();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25_000);
    const confirmingBooking=action==='confirm';
    try{
      const response=await fetch(`${PANDA_RUNTIME_API}/api/panda-ai${action==='capabilities'?'?sandboxReservations=capabilities':''}`,{
        method:action==='capabilities'?'GET':'POST',signal:controller.signal,
        headers:{Accept:'application/json',Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        ...(action==='capabilities'?{}:{body:JSON.stringify({...payload,sandboxReservationAction:action})}),
      });
      const data=await response.json().catch(()=>null);
      if(!data?.pandaSandboxReservations){
        throw new SandboxBookingError(confirmingBooking?'connection_uncertain':'sandbox_not_released',confirmingBooking);
      }
      if(!response.ok)throw new SandboxBookingError(data.code??'sandbox_not_ready',
        /do_not_retry|requires_verification/.test(data.code??''));
      return data.result as T;
    }catch(error){
      if(error instanceof SandboxBookingError)throw error;
      throw new SandboxBookingError(confirmingBooking?'connection_uncertain':'sandbox_not_ready',confirmingBooking);
    }finally{clearTimeout(timer);}
  },[getIdToken]);
  const capabilities=useQuery({queryKey:['panda-sandbox-capabilities',account?.uid],enabled:!!account,
    queryFn:()=>request<SandboxCapabilities>('capabilities'),retry:false,staleTime:60_000});
  const availability=useMutation({mutationFn:(selection:SandboxSelection)=>request<SandboxAvailability>('availability',selection),retry:false});
  const review=useMutation({mutationFn:(input:SandboxSelection&{guest:SandboxGuest})=>request<SandboxReview>('review',input),retry:false});
  const confirm=useMutation({mutationFn:async(reviewId:string)=>{
    if(confirming.current)throw new SandboxBookingError('booking_already_submitted_do_not_retry',true);
    confirming.current=true;
    try{return await request<SandboxConfirmation>('confirm',{reviewId,confirmed:true});}
    finally{confirming.current=false;}
  },retry:false,onSuccess:()=>queryClient.invalidateQueries({queryKey:['panda-sandbox-history',account?.uid]})});
  const history=useQuery({queryKey:['panda-sandbox-history',account?.uid],enabled:!!capabilities.data?.enabled,
    queryFn:()=>request<SandboxConfirmation[]>('history'),retry:false,staleTime:10_000});
  return {account,capabilities,availability,review,confirm,history};
}
