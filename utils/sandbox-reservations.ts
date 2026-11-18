export const SANDBOX_RESTAURANT_NAME = 'OpenTable Sandbox — 264001';
export type SandboxGuest = {firstName:string;lastName:string;email:string;phoneNumber:string;phoneCountry:string};
export type SandboxSelection = {rid:264001;partySize:number;startDateTime:string};
export type SandboxCapabilities = {
  enabled:true;environment:'sandbox';venueName:string;rid:264001;minDate:string;maxDate:string;
  cancellationAvailable:false;timeZone:string|null;floatingRestaurantLocalTimes:boolean;
};
export type SandboxAvailability = {times:string[];partySize:number;expiresAt:number;timeZone:string|null};
export type SandboxReview = SandboxSelection & {reviewId:string;guest:SandboxGuest;expiresAt:number;confirmationRequired:true};
export type SandboxConfirmation = SandboxSelection & {id:string;status:'confirmed';environment:'sandbox';
  confirmationNumber:string;createdAt:number;emailStatus:string;venueName:string;timeZone:string|null};
export class SandboxBookingError extends Error {
  constructor(public code:string,public uncertain=false){super(sandboxBookingErrorText(code));}
}
export function sandboxBookingErrorText(code:string):string{
  const errors:Record<string,string>={
    sign_in_required:'Please sign in to Panda again before booking.',
    sandbox_tester_required:'This private sandbox test is not enabled for this account.',
    sandbox_not_ready:'The sandbox booking connection has not been enabled yet.',
    sandbox_not_released:'The native sandbox booking connection has not been published yet.',
    slot_no_longer_available:'That time has just gone. Choose another available time.',
    review_expired:'Your review expired. Check the time again before confirming.',
    invalid_guest_details:'Check your first name, last name and contact details.',
    invalid_booking_time:'Choose one of the available future test dates and times.',
    restaurant_timezone_not_verified:'The test restaurant’s local-time setup is not ready.',
    explicit_confirmation_required:'Review the booking details before confirming.',
    booking_already_submitted_do_not_retry:'This test was already submitted. Check your sandbox confirmations before doing anything else.',
    provider_details_require_review_do_not_retry:'OpenTable returned unexpected details. Do not book again; this test needs verification.',
    booking_status_requires_verification_do_not_retry:'The booking result could not be verified. Do not book again; check your sandbox confirmations.',
    connection_uncertain:'The connection ended after submission. Do not book again; check your sandbox confirmations.',
  };
  return errors[code]??'The sandbox could not complete that step. No booking is confirmed unless a confirmation number is shown.';
}
export function isSandboxBookingPrompt(text:string):boolean{
  return /\b(?:sandbox|test restaurant|test booking|264001)\b/i.test(text);
}
