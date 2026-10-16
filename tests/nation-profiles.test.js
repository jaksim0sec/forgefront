import test from 'node:test';
import assert from 'node:assert/strict';
import {NATION_STORAGE_KEY,nationFlagSvg,nationColor,nationLabel,nationProfile,normalizeNationProfile,restoreNationProfiles,updateNationProfile} from '../src/nations.js';

function storage(){const values=new Map();
  return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
}
test('nation names and generated SVG flags persist locally',()=>{
  const local=storage(),profile={name:'푸른 기계 연방',layout:'vertical',
    stripes:['#112233','#445566','#778899'],emblem:'star',emblemColor:'#aabbcc'};
  assert.deepEqual(updateNationProfile('north',profile,local),{ok:true,persisted:true});
  assert.equal(nationLabel('north'),profile.name);
  assert.equal(nationColor('north'),'#445566');
  assert.match(nationFlagSvg('north'),/m48 10 7 15/);
  assert.equal(JSON.parse(local.getItem(NATION_STORAGE_KEY)).north.name,profile.name);
  updateNationProfile('north',{name:'임시'},null);
  assert.equal(restoreNationProfiles(local),true);
  assert.equal(nationProfile('north').name,profile.name);
});
test('SVG generator rejects raw or executable attributes',()=>{
  const malicious={name:'<script>alert(1)</script>',layout:'<svg onload=alert(1)>',
    stripes:['red" onload="alert(1)','garbage','<script>'],
    emblem:'image',emblemColor:'#aa" onclick="bad'};
  const safe=normalizeNationProfile('south',malicious);
  assert.equal(safe.emblem,'circle');assert.equal(safe.layout,'horizontal');
  assert.ok(safe.stripes.every(c=>/^#[a-f0-9]{6}$/.test(c)));
  const svg=nationFlagSvg('south',malicious);
  assert.doesNotMatch(svg,/script|onload|onclick|<image/);
  assert.match(svg,/^<svg/);
});
test('unsupported factions stay neutral and cannot overwrite saved data',()=>{
  const local=storage();
  assert.deepEqual(updateNationProfile('neutral',{name:'bad'},local),
    {ok:false,persisted:false});
  assert.equal(nationLabel(null),'중립');
  assert.equal(nationColor(null),'#9aa4ab');
  assert.match(nationFlagSvg(null),/svg/);
});
