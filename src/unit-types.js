/** Tactical soldier archetypes, with backward compatible rifle defaults. */
export const UNIT_TYPES=Object.freeze({
 rifle:Object.freeze({id:'rifle',label:'보병',symbol:'⚔',cost:Object.freeze({lead:12,iron:4}),health:75,speed:2.35,range:4.2,damage:12,reload:.85,projectileSpeed:19,trainSeconds:4,captureStrength:1}),
 scout:Object.freeze({id:'scout',label:'정찰병',symbol:'➤',cost:Object.freeze({lead:9,iron:3}),health:52,speed:3.25,range:3.1,damage:8,reload:.63,projectileSpeed:21,trainSeconds:3.2,captureStrength:1.45}),
 heavy:Object.freeze({id:'heavy',label:'중장갑병',symbol:'▣',cost:Object.freeze({lead:20,iron:10,parts:2}),health:150,speed:1.55,range:5.1,damage:27,reload:1.55,projectileSpeed:16,trainSeconds:6,captureStrength:.8,splashRadius:1.05,splashDamage:7})
});
export const SOLDIER=UNIT_TYPES.rifle;
export const normalizeUnitType=id=>Object.prototype.hasOwnProperty.call(UNIT_TYPES,id)?id:'rifle';
export const unitDefinition=id=>UNIT_TYPES[normalizeUnitType(id)];
