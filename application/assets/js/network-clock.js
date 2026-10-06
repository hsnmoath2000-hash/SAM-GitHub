(() => {
    'use strict';
    let state=null, networkId=0, loadedAt=0, pending=false, retryAfter=0;
    async function refresh() {
        const id=Number(window.App?.activeNetworkId||0);
        if(!id||pending||Date.now()<retryAfter||(id===networkId&&Date.now()-loadedAt<60000))return;
        pending=true;
        try {
            const data=await App.api('get_network_clock');
            if(data?.success&&id===Number(App.activeNetworkId)){state=data;networkId=id;loadedAt=Date.now();}
        } finally {pending=false;retryAfter=Date.now()+10000;}
    }
    function tick() {
        const header=document.querySelector('.mt-header-right');
        if(!header||!Number(window.App?.activeNetworkId)||window.__SAM_IS_OWNER_PORTAL)return;
        let button=document.getElementById('sam-network-clock');
        if(!button){button=document.createElement('button');button.id='sam-network-clock';button.className='mt-btn sam-network-clock';button.type='button';button.onclick=()=>window.SAMNetworkClock.open();header.prepend(button);}
        button.textContent='🕒 توقيت الشبكة';
        if(state&&networkId===Number(App.activeNetworkId)){
            const date=new Date(Number(state.epoch_ms)+Date.now()-loadedAt);
            button.textContent='🕒 '+new Intl.DateTimeFormat('ar',{timeZone:state.timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
            button.title=new Intl.DateTimeFormat('ar',{timeZone:state.timezone,dateStyle:'full'}).format(date)+' — '+state.timezone;
        }
        refresh().catch(()=>{});
    }
    window.SAMNetworkClock={
        async open(){
            await refresh();if(!state||networkId!==Number(App.activeNetworkId))return;
            const esc=v=>App.escape(String(v));
            App.openModal(`<div class="mt-modal-header">🕒 توقيت الشبكة <button class="mt-btn" onclick="App.closeModal()" aria-label="إغلاق">✕</button></div>
            <div class="mt-modal-body"><p>توقيت مستقل للشبكة النشطة، يُستخدم في الساعة ومواعيد التقارير المجدولة.</p><label for="sam-clock-zone">المنطقة الزمنية</label>
            <select class="mt-input" id="sam-clock-zone" ${state.can_edit?'':'disabled'}>${(state.can_edit?state.timezones:[state.timezone]).map(z=>`<option value="${esc(z)}" ${z===state.timezone?'selected':''}>${esc(z)}</option>`).join('')}</select>
            <p class="sam-field-help">لا يغيّر هذا الإعداد ساعة السيرفر أو السجلات السابقة.</p></div><div class="mt-modal-footer">${state.can_edit?'<button class="mt-btn mt-btn-primary" id="sam-clock-save" onclick="SAMNetworkClock.save()">حفظ توقيت الشبكة</button>':''}<button class="mt-btn" onclick="App.closeModal()">إغلاق</button></div>`);
        },
        async save(){
            const button=document.getElementById('sam-clock-save'),id=networkId;if(!button||id!==Number(App.activeNetworkId))return;button.disabled=true;
            try{const result=await App.api('save_network_clock',{},'POST',{timezone:document.getElementById('sam-clock-zone').value});if(result?.success&&id===Number(App.activeNetworkId)){state=result;loadedAt=Date.now();App.closeModal();App.toast('تم حفظ توقيت الشبكة','success');tick();}}
            finally{if(button.isConnected)button.disabled=false;}
        }
    };
    setInterval(tick,1000);
})();
