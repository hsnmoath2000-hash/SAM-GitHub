(() => {
 'use strict';let promptEvent=null,registration=null,updateRequested=false;
 const banner=document.createElement('div');banner.id='sam-pwa-status';banner.setAttribute('role','status');
 Object.assign(banner.style,{position:'fixed',bottom:'18px',left:'18px',zIndex:'10020',maxWidth:'310px',padding:'12px',borderRadius:'12px',background:'#173149',color:'#fff',fontSize:'12px',direction:'rtl',boxShadow:'0 5px 20px #0003',display:'none'});
 const show=html=>{banner.innerHTML=html;banner.style.display='block';if(!banner.isConnected)document.body.append(banner);};
 const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 window.installSamPWA=async()=>{
  if(installed())return;
  if(promptEvent){await promptEvent.prompt();await promptEvent.userChoice;promptEvent=null;banner.style.display='none';}
  else show('لتثبيت SAM: افتح قائمة المتصفح واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». تحتاج شهادة HTTPS موثوقة. <button onclick="this.parentElement.style.display=\'none\'">إغلاق</button>');
 };
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;if(!installed())show('<strong>ثبّت SAM على جهازك</strong> <button onclick="installSamPWA()">تثبيت</button> <button onclick="this.parentElement.style.display=\'none\'">لاحقًا</button>');});
 window.addEventListener('appinstalled',()=>{promptEvent=null;banner.style.display='none';});
 window.addEventListener('offline',()=>show('انقطع الاتصال. العمليات تحتاج اتصالًا بالسيرفر. <button onclick="this.parentElement.style.display=\'none\'">إغلاق</button>'));
 window.addEventListener('online',()=>{banner.style.display='none';});
 window.activateSamUpdate=()=>{updateRequested=true;registration?.waiting?.postMessage({type:'SKIP_WAITING'});};
 if('serviceWorker' in navigator&&window.isSecureContext){
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
   registration=reg;
   const update=()=>{if(reg.waiting&&navigator.serviceWorker.controller)show('نسخة جديدة من SAM متاحة. احفظ عملك قبل التحديث. <button onclick="activateSamUpdate()">تحديث الآن</button> <button onclick="this.parentElement.style.display=\'none\'">لاحقًا</button>');};
   update();reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',update);});
   let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing||!updateRequested)return;refreshing=true;location.reload();});
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)reg.update().catch(()=>{});});
  }).catch(error=>{console.warn('SAM PWA registration:',error.message);});
 }
})();
