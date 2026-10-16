import {nationProfile,nationFlagSvg,nationLabel,updateNationProfile} from './nations.js';

/** Compact on-device flag designer: stripes, direction, emblem and name. */
export function installNationEditor({toolbox,storage,onSaved}){
  const button=document.createElement('button');
  button.type='button';button.className='nation-editor-launch';
  button.textContent='⚑ 국가 이름 · 국기 편집';
  toolbox.querySelector('.toolbox-actions').appendChild(button);
  const overlay=document.createElement('div');
  overlay.className='nation-editor-overlay';
  overlay.hidden=true;
  overlay.innerHTML=[
    '<section role="dialog" aria-modal="true" aria-labelledby="nation-editor-title" class="nation-editor-dialog">',
    '<header><h2 id="nation-editor-title">⚑ 국가 편집기</h2><button type="button" data-close aria-label="닫기">×</button></header>',
    '<p class="nation-editor-help">국가 이름과 국기를 직접 꾸미세요. 설정은 이 기기에만 저장됩니다.</p>',
    '<div class="nation-editor-preview" aria-label="국기 미리보기"></div>',
    '<label>국가<select data-id><option value="north">북부 국가</option><option value="south">남부 국가</option></select></label>',
    '<label>국가 이름<input data-name maxlength="20" placeholder="국가 이름" autocomplete="off"></label>',
    '<label>배치<select data-layout><option value="horizontal">가로 3줄</option><option value="vertical">세로 3줄</option></select></label>',
    '<fieldset><legend>국기 색상</legend><label>첫 번째<input data-stripe="0" type="color"></label><label>두 번째<input data-stripe="1" type="color"></label><label>세 번째<input data-stripe="2" type="color"></label></fieldset>',
    '<label>중앙 문양<select data-emblem><option value="none">없음</option><option value="circle">원형</option><option value="diamond">마름모</option><option value="star">별</option></select></label>',
    '<label>문양 색상<input data-emblem-color type="color"></label>',
    '<div class="nation-editor-actions"><button type="button" data-cancel>취소</button><button type="button" data-save>이 기기에 저장</button></div>',
    '<p class="nation-editor-status" role="status"></p></section>'
  ].join('');
  document.body.appendChild(overlay);
  const find=id=>overlay.querySelector(id);
  const ids=find('[data-id]'),name=find('[data-name]'),
    layout=find('[data-layout]'),emblem=find('[data-emblem]'),
    emblemColor=find('[data-emblem-color]');
  const stripeInputs=[...overlay.querySelectorAll('[data-stripe]')];
  const preview=find('.nation-editor-preview');
  const status=find('.nation-editor-status');
  const read=()=>({name:name.value,layout:layout.value,emblem:emblem.value,
    stripes:stripeInputs.map(input=>input.value),emblemColor:emblemColor.value});
  const repaint=()=>{
    preview.innerHTML=nationFlagSvg(ids.value,read());
    preview.setAttribute('aria-label',(name.value||nationLabel(ids.value))+' 국기 미리보기');
  };
  const load=()=>{
    const p=nationProfile(ids.value);
    name.value=p.name;layout.value=p.layout;emblem.value=p.emblem;
    emblemColor.value=p.emblemColor;
    stripeInputs.forEach((input,i)=>input.value=p.stripes[i]);
    status.textContent='';
    repaint();
  };
  const close=()=>{overlay.hidden=true;button.focus();};
  button.addEventListener('click',()=>{
    overlay.hidden=false;ids.value='north';load();name.focus();
  });
  find('[data-close]').addEventListener('click',close);
  find('[data-cancel]').addEventListener('click',close);
  overlay.addEventListener('pointerdown',event=>{
    if(event.target===overlay)close();
  });
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();}
  });
  ids.addEventListener('change',load);
  for(const input of [name,layout,emblem,emblemColor,...stripeInputs])
    input.addEventListener('input',repaint);
  find('[data-save]').addEventListener('click',()=>{
    const result=updateNationProfile(ids.value,read(),storage);
    if(!result.ok)return;
    status.textContent=result.persisted
      ? '저장 완료 · 이 기기에서 다시 열어도 유지됩니다.'
      : '현재 화면에 적용됐지만 브라우저 저장소에 접근할 수 없습니다.';
    onSaved?.();
    repaint();
  });
  return {button,overlay,close};
}
