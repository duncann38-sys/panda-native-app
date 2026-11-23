import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const built = await build({
  entryPoints: [new URL('../utils/venue-detail-hydration.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const {hydrateVenueDetails, fullCardOpenStatus} = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);
const venue = {id:'ChIJtest',name:'Restaurant',rating:'',price:'',openNow:false,detailsDeferred:true,
  photoName:'cover',photoCount:1,photoAttributions:['Owner'],premium:true,promoted:true,banging:true};
const profile = {id:venue.id,address:'Full address',rating:4.7,ratingCount:52,openNow:true,
  primaryType:'Italian restaurant',price:'££',todayHours:'Open until 23:00',phone:'0200000000',
  website:'https://example.com/menu',googleMapsUrl:'https://maps.google.com/',latitude:51.48,longitude:-0.13,
  photoNames:Array.from({length:10},(_,i)=>({name:`photo-${i}`,attribution:'Owner'}))};
test('opening the preview restores all full card data and ten photo references',()=>{
  const full = hydrateVenueDetails(venue,profile);
  assert.equal(full.fullAddress,'Full address');
  assert.equal(full.price,'££');
  assert.equal(full.phone,'0200000000');
  assert.equal(full.hours,'Open until 23:00');
  assert.equal(full.rating,'4.7');
  assert.equal(full.photoCount,10);
  assert.equal(full.photoNames[9].name,'photo-9');
  assert.equal(full.premium,true);
  assert.equal(full.promoted,true);
  assert.equal(full.banging,true);
});
test('full card distinguishes open, closed, unknown and an unrelated profile',()=>{
  assert.equal(fullCardOpenStatus(venue,profile),true);
  assert.equal(fullCardOpenStatus(venue,{...profile,openNow:false}),false);
  assert.equal(fullCardOpenStatus(venue,{...profile,openNow:null}),null);
  assert.equal(fullCardOpenStatus(venue,null),null);
  assert.equal(fullCardOpenStatus(venue,{...profile,id:'different'}),null);
  assert.equal(fullCardOpenStatus({...venue,detailsDeferred:false,openNow:true},null),true);
});
test('an old venue response never leaks into the next opened card',()=>{
  const hydrated=hydrateVenueDetails(venue,{...profile,id:'other'});
  assert.equal(hydrated.id,venue.id);
  assert.equal(hydrated.name,venue.name);
  assert.equal(hydrated.fullAddress,undefined);
});
test('simple list keeps its tap/save controls; full card keeps clock, gallery and all actions',async()=>{
  const row = await readFile(new URL('../components/SuggestionRow.tsx',import.meta.url),'utf8');
  assert.match(row,/<VenuePhoto/);
  assert.match(row,/onPress=\{onPress\}/);
  assert.match(row,/onPress=\{\(\) => \{ recordVenueActivity\('save_click', venue, activitySurface\); onToggleSaved\(\); \}\}/);
  assert.doesNotMatch(row,/venue\.fullAddress|venue\.openNow|venue\.price/);
  const card = await readFile(new URL('../app/venue/[id].tsx',import.meta.url),'utf8');
  for (const retained of ['PhotoGallery','View menu','Reserve','Directions','Call','Open now','Closed']) assert.ok(card.includes(retained),retained);
  assert.match(card,/icon="walk"\s+label=\{venue\.walkingTime\}/);
  assert.doesNotMatch(card,/\$\{venue\.distance\}\s*·\s*\$\{venue\.walkingTime\}/);
});
test('Planner uses nearby stored IDs and keeps the category 200-result rule out of its lookup',async()=>{
  const planner = await readFile(new URL('../components/PandaPlannerSheet.tsx',import.meta.url),'utf8');
  assert.match(planner,/liveVenues\.length === 0/);
  assert.match(planner,/discoveryMode: 'indexed-feed'/);
  assert.match(planner,/category: 'All'/);
  assert.match(planner,/pageSize: 60/);
  assert.match(planner,/radiusMeters: 4_800/);
  assert.match(planner,/area: locationQuery/);
  assert.match(planner,/location: \{ lat: coordinates\.latitude, lng: coordinates\.longitude \}/);
  assert.match(planner,/localPlan\.some\(\(venue\) => !venue\)/);
  assert.doesNotMatch(planner,/REMOTE_SEARCH_TERMS|pageSize: 200/);
  assert.doesNotMatch(planner,/discoveryMode: 'cover'/);
});
