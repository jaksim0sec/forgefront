/** Locally customized faction identity, never uploaded. The SVG uses only
 * validated color tokens and fixed shapes; no user-authored HTML is inserted. */
export const NATIONS=Object.freeze({
  north:Object.freeze({id:'north',label:'북부',color:'#77a9e4',sigil:'M2 13L7 2L12 13M4 10H10'}),
  south:Object.freeze({id:'south',label:'남부',color:'#e18a86',sigil:'M2 3H12L7 9V14M3 12H11'})
});
export const NEUTRAL_COLOR='#9aa4ab';
export const NATION_STORAGE_KEY='forgefront:nation-profiles:v1';
const LAYOUTS=new Set(['horizontal','vertical']);
const EMBLEMS=new Set(['none','circle','diamond','star']);
const DEFAULTS={
  north:{name:'북부',stripes:['#284b69','#77a9e4','#e4e9ec'],
    layout:'horizontal',emblem:'diamond',emblemColor:'#f0d7a6'},
  south:{name:'남부',stripes:['#522f44','#e18a86','#e7c7b0'],
    layout:'horizontal',emblem:'circle',emblemColor:'#f6e4be'}
};
const profiles=Object.fromEntries(Object.entries(DEFAULTS).map(([id,p])=>[id,{...p,stripes:[...p.stripes]}]));
const color=(value,fallback)=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value)?value.toLowerCase():fallback;
export function normalizeNationProfile(id,value){
  const fallback=DEFAULTS[id];
  if(!fallback)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  const name=typeof value.name==='string'?value.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20):'';
  return {
    name:name||fallback.name,
    stripes:fallback.stripes.map((base,i)=>color(value.stripes?.[i],base)),
    layout:LAYOUTS.has(value.layout)?value.layout:fallback.layout,
    emblem:EMBLEMS.has(value.emblem)?value.emblem:fallback.emblem,
    emblemColor:color(value.emblemColor,fallback.emblemColor)
  };
}
export function nationProfile(id){
  if(!profiles[id])return null;
  return {...profiles[id],stripes:[...profiles[id].stripes]};
}
export function restoreNationProfiles(storage){
  if(!storage)return false;
  let data;
  try{
    const raw=storage.getItem(NATION_STORAGE_KEY);
    if(!raw)return false;
    data=JSON.parse(raw);
    if(!data||typeof data!=='object'||Array.isArray(data))return false;
  }catch{return false;}
  for(const id of Object.keys(DEFAULTS))profiles[id]=normalizeNationProfile(id,data[id]);
  return true;
}
export function updateNationProfile(id,value,storage){
  if(!DEFAULTS[id])return {ok:false,persisted:false};
  profiles[id]=normalizeNationProfile(id,value);
  let persisted=false;
  try{
    storage?.setItem(NATION_STORAGE_KEY,JSON.stringify(profiles));
    persisted=!!storage;
  }catch{}
  return {ok:true,persisted};
}
export function nationColor(ownerId){
  return profiles[ownerId]?.stripes[1]??NEUTRAL_COLOR;
}
export function nationLabel(ownerId){return profiles[ownerId]?.name??'중립';}
export function nationSigil(ownerId){return NATIONS[ownerId]?.sigil??'';}
export function nationFlagSvg(ownerId,override=null){
  const value=ownerId&&DEFAULTS[ownerId]?
    normalizeNationProfile(ownerId,override??profiles[ownerId]):
    {stripes:['#56636d','#89959c','#56636d'],layout:'horizontal',
      emblem:'none',emblemColor:'#e8eced'};
  let stripes='';
  for(let i=0;i<3;i++){
    stripes+=value.layout==='vertical'
      ? '<rect x="'+(i*32)+'" width="32" height="64" fill="'+value.stripes[i]+'"/>'
      : '<rect y="'+(i*64/3)+'" width="96" height="'+(64/3+0.01)+'" fill="'+value.stripes[i]+'"/>';
  }
  const symbols={
    none:'',
    circle:'<circle cx="48" cy="32" r="14"/>',
    diamond:'<path d="M48 14 67 32 48 50 29 32Z"/>',
    star:'<path d="m48 10 7 15 16 2-12 11 3 16-14-8-14 8 3-16-12-11 16-2Z"/>'
  };
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width="192" height="128">'+
    stripes+'<g fill="'+value.emblemColor+'" stroke="#1a2735" stroke-width="1.25">'+symbols[value.emblem]+'</g>'+
    '<rect x=".75" y=".75" width="94.5" height="62.5" rx="1" fill="none" stroke="#d4e0df" stroke-opacity=".4" stroke-width="1.5"/></svg>';
}
