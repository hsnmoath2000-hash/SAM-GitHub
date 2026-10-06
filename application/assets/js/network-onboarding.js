/* Network setup: scoped requests, no polling, no synthetic completion. */
(() => {
 'use strict';
 const A=window.App;if(!A)return;
 const quick={
  generate:{label:'إنشاء كروت',icon:'🎫',tab:'batch_gen',needs:'packages'},
  sell:{label:'بيع كروت',icon:'🛒',tab:'sales',method:'showSaleModal',needs:'finance'},
  print:{label:'طباعة كروت',icon:'🖨️',tab:'card_warehouses',needs:'cards'},
  subscriber:{label:'إضافة مشترك',icon:'👤',tab:'users',method:'showUserModal',needs:'packages'},
  renew:{label:'تجديد اشتراك',icon:'🔄',tab:'users',needs:'packages'},
  receipt:{label:'سند قبض',icon:'💵',tab:'vouchers_fin',method:'showVoucherModal',argument:'receipt',needs:'finance'},
  payment:{label:'سند صرف',icon:'💸',tab:'vouchers_fin',method:'showVoucherModal',argument:'payment',needs:'finance'},
  sessions:{label:'المتصلون',icon:'⚡',tab:'active_sessions'},
  router:{label:'إضافة راوتر',icon:'📡',tab:'routers',method:'showRouterModal'},
  message:{label:'إرسال رسالة',icon:'💬',tab:'whatsapp_manager',needs:'messaging'}
 };
 const names={required:'ضرورية للتشغيل',before_sale:'قبل العمليات المالية',optional:'اختيارية'};
 const cache=new Map(),pending=new Map();let busy=false,observer=null,hintTimer=null;
 const esc=v=>A.escape(String(v??''));
 const ownerPortal=()=>Boolean(window.__SAM_IS_OWNER_PORTAL||location.pathname.endsWith('owner.php'));
 const key=()=>`${A.activeNetworkId}:${A.user}:${A.userRole}`;
 Object.assign(A,{
  async loadNetworkSetup(force=false){
   if(!this.user||!this.activeNetworkId||ownerPortal())return null;
   const k=key(),hit=cache.get(k);if(!force&&hit&&Date.now()-hit.at<15000){this.networkSetupState=hit.value;return hit.value;}
   if(pending.has(k))return pending.get(k);
   const network=Number(this.activeNetworkId);
   const task=this.api('network_setup_status').then(r=>{
    if(!r?.success)throw new Error(r?.error||'تعذر تحميل إعداد الشبكة');
    if(Number(this.activeNetworkId)!==network||key()!==k)return null;
    document.querySelectorAll('.ns-form').forEach(f=>{delete f.dataset.dirty;});this.networkSetupState=r;cache.set(k,{value:r,at:Date.now()});if(cache.size>10)cache.delete(cache.keys().next().value);return r;
   }).finally(()=>pending.delete(k));pending.set(k,task);return task;
  },
  networkSetupDashboardHTML(s){
   if(!s||Number(s.network_id)!==Number(this.activeNetworkId))return '';
   const next=s.steps.find(x=>x.id===s.next),percentage=Math.round((s.complete+s.skipped)/s.total*100);
   const banner=s.eligible?`<section class="ns-banner" aria-label="متابعة إعداد الشبكة"><div><span class="ns-eyebrow">مركز إعداد الشبكة · ${esc(s.network.name)}</span><h2>${s.next?'أكمل إعداد شبكتك تدريجيًا':'اكتملت قائمة الإعداد'}</h2><p>${s.complete} من ${s.total} مراحل مكتملة${s.skipped?` · ${s.skipped} مؤجلة حسب اختيارك`:''}. ${next?`التالي: ${esc(next.title)}`:'راجع نتائج الاختبارات قبل التشغيل الفعلي.'}</p><progress value="${s.complete+s.skipped}" max="${s.total}" aria-label="تقدم إعداد الشبكة">${percentage}%</progress></div><button class="mt-btn mt-btn-primary" onclick="App.openNetworkSetup()">${s.next?'متابعة الإعداد':'مراجعة الإعداد'} ←</button></section>`:'';
   const resume=this.networkSetupResume;const resumeHTML=resume&&resume.network===Number(this.activeNetworkId)&&quick[resume.key]?`<button class="mt-btn" onclick="App.runNetworkQuick('${resume.key}')">متابعة العملية السابقة: ${quick[resume.key].label}</button>`:'';
   return `<div class="ns-home"><button class="mt-btn" onclick="installSamPWA()">تثبيت SAM على الجهاز</button>${resumeHTML}${banner}${this.networkSetupQuickHTML(s)}</div>`;
  },
  networkSetupQuickHTML(s){
   const defaults=s.mode==='distribution'?['sell','generate','print','receipt','sessions','router']:['generate','subscriber','print','sessions','router','sell'];
   const chosen=Array.isArray(s.preferences.shortcuts)?s.preferences.shortcuts:defaults;
   const allowed=chosen.filter(k=>quick[k]&&this.hasAccess(quick[k].tab));
   const buttons=allowed.slice(0,6).map(k=>this.networkQuickButton(k,s)).join('');
   return `<section class="ns-quick"><div class="ns-title-row"><h3>⚡ العمليات السريعة</h3><div>${s.eligible?'<button class="mt-btn" onclick="App.customizeNetworkQuick()">تخصيص الاختصارات</button>':''}<button class="mt-btn" onclick="App.showNetworkMoreQuick()">المزيد</button></div></div><div class="ns-quick-grid">${buttons||'<p>لا توجد عمليات متاحة ضمن صلاحيات هذا الحساب.</p>'}</div></section>`;
  },
  networkQuickButton(k,s){
   const q=quick[k],missing=this.networkQuickMissing(q,s);
   return `<button class="ns-operation" onclick="App.runNetworkQuick('${k}')"><span class="ns-operation-icon">${q.icon}</span><strong>${q.label}</strong>${missing?`<small>${esc(missing.title)}: إعداد ناقص</small>`:'<small>فتح العملية</small>'}</button>`;
  },
  networkQuickMissing(q,s){
   // A card login test is not a prerequisite for printing; a template is.
   if(q.needs==='cards')return s.default_template_id?null:s.steps.find(x=>x.id==='cards');
   if(!q.needs)return null;return s.steps.find(x=>x.id===q.needs&&x.state!=='complete');
  },
  async runNetworkQuick(k){
   const q=quick[k];if(!q||!this.hasAccess(q.tab))return this.toast('ليس لديك صلاحية لهذه العملية','warning');
   let s;try{s=await this.loadNetworkSetup(true);}catch(e){return this.toast(e.message,'danger');}if(!s)return;
   const missing=this.networkQuickMissing(q,s);this.closeModal();
   if(missing&&s.eligible){this.networkSetupResume={key:k,network:Number(this.activeNetworkId)};return this.openNetworkSetup(missing.id);}
   if(missing)return this.toast('اطلب من مالك الشبكة إكمال: '+missing.title,'warning');
   if(q.method&&typeof this[q.method]==='function')return this[q.method](...(q.argument?[q.argument]:[]));
   this.switchTab(q.tab);
  },
  showNetworkMoreQuick(){
   const s=this.networkSetupState;if(!s)return;
   this.showModal('العمليات السريعة',`<div class="ns-quick-grid">${Object.keys(quick).filter(k=>this.hasAccess(quick[k].tab)).map(k=>this.networkQuickButton(k,s)).join('')}</div>`,'740px');
  },
  customizeNetworkQuick(){
   const s=this.networkSetupState;if(!s?.eligible)return;
   const selected=s.preferences.shortcuts||['generate','subscriber','print','sessions','router','sell'];
   const rows=selected.concat(Object.keys(quick).filter(k=>!selected.includes(k))).filter(k=>this.hasAccess(quick[k].tab));
   this.showModal('تخصيص العمليات السريعة',`<form onsubmit="App.saveNetworkQuick(event)"><p>اختر الاختصارات ورتبها بالأرقام. تظهر أول ستة في الصفحة الرئيسية.</p><div class="ns-options">${rows.map((k,i)=>`<label><input type="checkbox" name="quick" value="${k}" ${selected.includes(k)?'checked':''}> ${quick[k].icon} ${quick[k].label}<input type="number" name="order_${k}" value="${i+1}" min="1" max="10" aria-label="ترتيب ${quick[k].label}"></label>`).join('')}</div><button class="mt-btn mt-btn-primary" type="submit">حفظ للشبكة الحالية</button></form>`,'650px');
  },
  async saveNetworkQuick(e){
   e.preventDefault();const f=e.target,list=[...f.querySelectorAll('[name=quick]:checked')].map(x=>x.value).sort((a,b)=>Number(f.elements['order_'+a].value)-Number(f.elements['order_'+b].value));
   if(await this.saveNetworkSetup({operation:'preferences',shortcuts:list})){this.closeModal();this.switchTab('dashboard');}
  },
  async openNetworkSetup(step){
   this.networkSetupSelected=step||null;this.switchTab('network_setup');
  },
  async openNetworkUserManagerImport(){
   if(!this.can('users_import'))return this.toast('ليس لديك صلاحية استيراد الكروت','warning');
   this.networkSetupUserManagerOnly=true;
   this.currentTab='users';this.closeMobileSidebar();
   await this.showRouterOSImportPage();
   document.getElementById('main-view')?.insertAdjacentHTML('afterbegin',`<div class="ns-context"><button class="mt-btn" onclick="App.openNetworkSetup('cards')">← العودة إلى الإعداد</button><span>استيراد User Manager v6 وv7 أو الملف حسب نمط دخول الشبكة. تُزال المسافات من الرقم وكلمة المرور، وتظهر كلمة المرور الناتجة في تفاصيل المعاينة. تغيير النمط يحتاج معاينة جديدة. لا تُعدّل الكروت الموجودة أو الراوتر المصدر.</span></div>`);
  },
  async renderNetworkSetup(){
   const view=document.getElementById('main-view');if(!view)return;
   const network=Number(this.activeNetworkId);view.innerHTML='<div class="ns-loading" role="status">جارٍ تحميل حالة إعداد الشبكة…</div>';
   try{
    const s=await this.loadNetworkSetup(true);if(!s||network!==Number(this.activeNetworkId)||this.currentTab!=='network_setup')return;
    if(!s.eligible){view.innerHTML='<div class="ns-error">هذه الواجهة مخصصة لمالك الشبكة ومديرها.</div>';return;}
    if(!s.preferences.seen)await this.saveNetworkSetup({operation:'preferences',seen:true},false);
    const id=this.networkSetupSelected||s.preferences.step||s.next||'identity',selected=s.steps.find(x=>x.id===id)||s.steps[0];this.networkSetupSelected=selected.id;
    view.innerHTML=`<div class="ns-center"><header class="ns-header"><div><span class="ns-eyebrow">${esc(s.network.code)} · ${esc(s.network.name)}</span><h1>جهّز شبكتك، خطوة بخطوة</h1><p>احفظ إعداداتك الآن وأكمل ما تبقى لاحقًا. اكتمال الإعداد مختلف عن نجاح الاختبار.</p></div><button class="mt-btn" onclick="App.leaveNetworkSetup()">إكمال لاحقًا</button></header><div class="ns-progress-row"><progress value="${s.complete+s.skipped}" max="8"></progress><span>${s.complete} مكتملة · ${s.skipped} مؤجلة · 8 مراحل</span></div><div class="ns-layout"><nav class="ns-steps" aria-label="مراحل الإعداد">${s.steps.map((x,i)=>`<button class="ns-step ${x.id===selected.id?'selected':''}" onclick="App.selectNetworkSetupStep('${x.id}')" ${x.id===selected.id?'aria-current="step"':''}><span class="ns-number">${x.state==='complete'?'✓':i+1}</span><span><strong>${esc(x.title)}</strong><small>${x.state==='complete'?'تم الإعداد':x.state==='skipped'?'مؤجلة':'تحتاج متابعة'} · ${names[x.requirement]}</small></span></button>`).join('')}</nav><section class="ns-panel"><div class="ns-title-row"><h2>${esc(selected.title)}</h2><span class="ns-badge">${names[selected.requirement]}</span></div><p class="ns-hint">${esc(selected.hint)}</p>${!s.active?'<div class="ns-error">الشبكة لم تُفعّل بعد. الحفظ غير متاح.</div>':''}${this.networkSetupStepHTML(selected,s)}<footer class="ns-footer">${selected.requirement!=='required'?`<button class="mt-btn" onclick="App.skipNetworkSetupStep('${selected.id}',${selected.state!=='skipped'})">${selected.state==='skipped'?'إعادة تفعيل المرحلة':'لا أحتاجها حاليًا'}</button>`:''}<button class="mt-btn" onclick="App.moveNetworkSetupStep(-1)">السابق</button><button class="mt-btn mt-btn-primary" onclick="App.moveNetworkSetupStep(1)">التالي</button><button class="mt-btn" onclick="App.renderNetworkSetup()">تحديث التحقق</button></footer></section></div><p class="ns-footnote">تُحسب الحالة من بيانات هذه الشبكة فقط. لا ننفذ أوامر على الراوترات عند فتح هذه الصفحة.</p></div>`;
    document.querySelectorAll('.ns-form').forEach(f=>{f.addEventListener('input',()=>{f.dataset.dirty='1';});f.addEventListener('change',()=>{f.dataset.dirty='1';});});
   }catch(e){if(network===Number(this.activeNetworkId))view.innerHTML=`<div class="ns-error" role="alert">${esc(e.message)} <button class="mt-btn" onclick="App.renderNetworkSetup()">إعادة المحاولة</button></div>`;}
  },
  networkSetupLink(tab,label){return this.hasAccess(tab)?`<button class="mt-btn" onclick="App.openNetworkSetupTarget('${tab}')">${label} ←</button>`:`<span class="ns-unavailable">${label}: لا تتوفر صلاحية</span>`;},
  networkSetupStepHTML(step,s){
   const e=s.evidence,button=(method,label,tab)=>this.hasAccess(tab)?`<button class="mt-btn mt-btn-primary" onclick="App.networkSetupExistingAction('${method}','${tab}')">${label}</button>`:'';
   switch(step.id){
    case 'identity':return `<form class="ns-form" onsubmit="App.saveNetworkIdentity(event)"><label>اسم الشبكة<input name="name" value="${esc(s.network.name)}" maxlength="128" required></label><label>كيف تعمل شبكتك؟<select name="mode"><option value="cards" ${s.mode==='cards'?'selected':''}>بيع كروت مباشرة</option><option value="distribution" ${s.mode==='distribution'?'selected':''}>توزيع كروت عبر نقاط البيع والوكلاء</option><option value="mixed" ${s.mode==='mixed'?'selected':''}>بيع مباشر وتوزيع</option></select></label><label>نمط دخول الكروت الجديدة<select name="auth_mode"><option value="same" ${s.network.auth_mode==='same'?'selected':''}>اسم المستخدم وكلمة المرور متطابقان</option><option value="username_only" ${s.network.auth_mode==='username_only'?'selected':''}>كلمة مرور فارغة</option><option value="different" ${s.network.auth_mode==='different'?'selected':''}>اسم المستخدم وكلمة المرور مختلفان</option></select></label><label>المنطقة الزمنية<input name="timezone" value="${esc(s.timezone)}" required></label><p>طريقة العمل ترتب الاختصارات. نمط الدخول يُطبق على الكروت الجديدة فقط؛ تبقى كلمات مرور الكروت الموجودة كما هي. الاشتراكات الدورية تحتاج مسار إعداد مستقلًا عند دعمه.</p><button class="mt-btn mt-btn-primary" type="submit">حفظ ومتابعة</button></form>${this.networkSetupLink('networks_partnerships','الهوية والشعار وبيانات الشبكة')}${this.networkSetupLink('exchange_rates','العملة وأسعار الصرف')}`;
    case 'connection':return `<div class="ns-evidence"><div>الراوترات المفعلة <strong>${e.routers}</strong></div><div>آخر فحص اتصال ناجح <strong>${esc(e.router_seen||'لم يظهر فحص حديث')}</strong></div><div>آخر قبول RADIUS <strong>${esc(e.radius_seen||'لم يظهر قبول حديث')}</strong></div></div>${button('showRouterModal','إضافة راوتر','routers')}${this.networkSetupLink('routers','الراوترات والسكربت الخاص بالشبكة')}<ol class="ns-instructions"><li>أضف الراوتر واحفظ بياناته.</li><li>افتح سكربت الربط الخاص به، ثم نفذه على الراوتر الجديد.</li><li>ارجع واضغط «تحديث التحقق». لا نعد نسخ السكربت اتصالًا ناجحًا.</li></ol>`;
    case 'packages':return `${button('showProfileModal','إنشاء باقة','profiles')}${this.networkSetupLink('profiles','إدارة الباقات')}<div class="ns-evidence"><div>باقات صالحة محفوظة <strong>${e.packages}</strong></div></div><ul class="ns-instructions"><li>سعر البيع للعميل: سعر البيع النهائي للمشترك.</li><li>سعر التوزيع: السعر لنقطة البيع، ويُحسب الخصم منه.</li><li>تكلفة الشراء الفعلية: تستخدم في حساب الربح عند وجود شراء فعلي.</li></ul>`;
    case 'hotspot':return `${this.networkSetupLink('hotspot_designer','تصميم ومعاينة وتجهيز صفحة الهوتسبوت')}<div class="ns-evidence"><div>التصميم <strong>${e.hotspot_saved?'محفوظ':'لم يُحفظ بعد'}</strong></div><div>النشر على الراوتر <strong>يحتاج تحققًا فعليًا على الراوتر</strong></div></div><form class="ns-form" onsubmit="App.saveNetworkPolicy(event)"><label>شروط استخدام الشبكة<textarea name="text" maxlength="5000" rows="7" placeholder="اكتب الشروط، أو اتركها فارغة إذا لم تعتمد شروطًا">${esc(s.policy.text)}</textarea></label><label class="ns-check"><input type="checkbox" name="required" ${s.policy.required?'checked':''}> اشتراط الموافقة على الشروط قبل الدخول</label><p>تظهر الشروط في ملفات الهوتسبوت الجديدة. بعد تغييرها أعد تجهيز الصفحة ونشرها على الراوتر. لا نغيّر الصفحة المنشورة تلقائيًا.</p><button class="mt-btn mt-btn-primary" type="submit">حفظ الشروط</button></form>`;
    case 'cards':return `${this.can('users_import')?'<button class="mt-btn mt-btn-primary" onclick="App.openNetworkUserManagerImport()">استيراد كروت User Manager من الراوتر</button>':''}<p>يمكنك استيراد الكروت القائمة، أو إنشاء كروت جديدة. الاستيراد يبدأ بمعاينة وربط الباقات، ثم اعتماد اختيارك؛ لا يحذف الكروت من الراوتر ولا يفصل المتصلين.</p>${button('openVisualDesigner','إنشاء قالب','templates')}${this.networkSetupLink('templates','معاينة قوالب الكروت')}<form class="ns-form" onsubmit="App.saveNetworkDefaultTemplate(event)"><label>القالب الافتراضي<select name="template_id" required><option value="">اختر قالبًا</option>${s.templates.map(t=>`<option value="${Number(t.id)}" ${Number(t.id)===s.default_template_id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><button class="mt-btn mt-btn-primary" type="submit">اعتماد القالب</button></form>${this.networkSetupLink('batch_gen','إنشاء كرت تجريبي ضمن دفعة')}${this.networkSetupLink('active_sessions','التحقق من جلسة الكرت')}<div class="ns-evidence"><div>آخر جلسة كرت حديثة <strong>${esc(e.card_seen||'لم تظهر جلسة كرت حديثة')}</strong></div></div><p>حدد كرتًا واحدًا عند التجربة. لا يولّد المعالج كروتًا أو يسجل بيعًا تلقائيًا.</p>`;
    case 'finance':return `${this.networkSetupLink('admins_agents','نقاط البيع والوكلاء')}${this.networkSetupLink('cashbox_accounts','الصناديق والحسابات')}${this.networkSetupLink('chart_of_accounts','دليل الحسابات')}${this.networkSetupLink('exchange_rates','العملات')}<div class="ns-evidence"><div>صناديق فعالة مرتبطة بحسابات الشبكة <strong>${e.cashboxes}</strong></div></div><p>تأجيل هذه المرحلة لا يعني جاهزية القبض أو الصرف. اختصارات العمليات المالية ستطلب إكمالها أولًا.</p>`;
    case 'messaging':return `${this.networkSetupLink('whatsapp_manager','ربط واتساب وقوالب الرسائل')}${this.networkSetupLink('notifications','التنبيهات وسجل الرسائل')}<div class="ns-evidence"><div>قنوات واتساب متصلة <strong>${e.channels}</strong></div><div>قوالب فعالة <strong>${e.message_templates}</strong></div></div><div class="ns-unavailable">الرسائل النصية SMS: لا توجد قناة مهيأة في هذه النسخة.</div><p>يحتاج تسليم الرسائل إرسالًا تجريبيًا ومراجعة نتيجته. فتح هذه الصفحة لا يرسل أي رسالة.</p>`;
    default:return `${this.networkSetupLink('ui_customizer','تخصيص الواجهة')}${this.networkSetupLink('reports_center','التقارير والطباعة')}${this.networkSetupLink('admins','المستخدمون والصلاحيات')}${this.networkSetupLink('backups','النسخ الاحتياطية')}<p>راجع هذه الإعدادات حسب حاجة الشبكة. اختبار استعادة نسخة احتياطية خطوة مستقلة.</p><button class="mt-btn mt-btn-primary" onclick="App.reviewNetworkCustomization()">سجل أنني راجعت التخصيص</button>`;
   }
  },
  async saveNetworkSetup(data,notify=true){
   if(busy){if(notify)this.toast('انتظر اكتمال الحفظ الحالي','warning');return false;}
   const s=this.networkSetupState;if(!s?.eligible)return false;
   const network=Number(this.activeNetworkId);busy=true;document.querySelectorAll('.ns-form button[type=submit]').forEach(b=>b.disabled=true);
   try{
    const r=await this.api('network_setup_save',{},'POST',{...data,network_id:network,revision:s.revision});
    if(network!==Number(this.activeNetworkId))return false;
    if(!r?.success){if(r?.error==='SETUP_CONFLICT'){await this.loadNetworkSetup(true);throw new Error('تغيرت الإعدادات في نافذة أخرى. احتفظنا بالحقول؛ راجعها ثم احفظ مجددًا.');}throw new Error(r?.error||'تعذر الحفظ');}
    document.querySelectorAll('.ns-form').forEach(f=>{delete f.dataset.dirty;});this.networkSetupState=r;cache.set(key(),{value:r,at:Date.now()});if(notify)this.toast('تم حفظ إعدادات الشبكة','success');return true;
   }catch(e){if(notify)this.toast(e.message,'danger');return false;}
   finally{busy=false;document.querySelectorAll('.ns-form button[type=submit]').forEach(b=>b.disabled=false);}
  },
  async saveNetworkIdentity(e){e.preventDefault();const f=e.target;if(await this.saveNetworkSetup({operation:'identity',name:f.elements.namedItem('name').value,mode:f.elements.namedItem('mode').value,timezone:f.elements.namedItem('timezone').value,auth_mode:f.elements.namedItem('auth_mode').value}))this.selectNetworkSetupStep('connection');},
  async saveNetworkPolicy(e){e.preventDefault();const f=e.target;if(await this.saveNetworkSetup({operation:'policy',text:f.elements.namedItem('text').value,required:f.elements.namedItem('required').checked}))this.renderNetworkSetup();},
  async saveNetworkDefaultTemplate(e){e.preventDefault();if(await this.saveNetworkSetup({operation:'template',template_id:Number(e.target.elements.namedItem('template_id').value)}))this.renderNetworkSetup();},
  async selectNetworkSetupStep(id){if(document.querySelector('.ns-form[data-dirty]')&&!confirm('هناك تعديلات لم تُحفظ. هل تريد مغادرة المرحلة؟'))return;if(await this.saveNetworkSetup({operation:'preferences',step:id,seen:true},false)){this.networkSetupSelected=id;this.renderNetworkSetup();}},
  moveNetworkSetupStep(delta){if(delta>0&&document.querySelector('.ns-form[data-dirty]')){document.querySelector('.ns-form[data-dirty]').requestSubmit();return;}const s=this.networkSetupState,i=s?.steps.findIndex(x=>x.id===this.networkSetupSelected);const next=s?.steps[i+delta];if(next)this.selectNetworkSetupStep(next.id);},
  async leaveNetworkSetup(){if(document.querySelector('.ns-form[data-dirty]')&&!confirm('هناك تعديلات لم تُحفظ. هل تريد المغادرة؟'))return;if(await this.saveNetworkSetup({operation:'preferences',dismissed:true,seen:true},false))this.switchTab('dashboard');},
  async skipNetworkSetupStep(id,skip){if(await this.saveNetworkSetup({operation:'skip',step:id,skip}))this.renderNetworkSetup();},
  async reviewNetworkCustomization(){if(await this.saveNetworkSetup({operation:'review'}))this.renderNetworkSetup();},
  async openNetworkSetupTarget(tab){if(document.querySelector('.ns-form[data-dirty]')&&!confirm('هناك تعديلات لم تُحفظ. هل تريد المغادرة؟'))return;await this.saveNetworkSetup({operation:'preferences',step:this.networkSetupSelected,seen:true},false);this.switchTab(tab);},
  async networkSetupExistingAction(method,tab){if(!this.hasAccess(tab)||typeof this[method]!=='function')return;await this.saveNetworkSetup({operation:'preferences',step:this.networkSetupSelected,seen:true},false);this[method]();},
  installNetworkSetupHints(){
   const view=document.getElementById('main-view');if(!view)return;
   if(observer)observer.disconnect();
   observer=new MutationObserver(()=>{clearTimeout(hintTimer);hintTimer=setTimeout(()=>this.renderNetworkSetupHint(),100);});observer.observe(view,{childList:true});this.renderNetworkSetupHint();
  },
  renderNetworkSetupHint(){
   const s=this.networkSetupState,view=document.getElementById('main-view');if(!s?.eligible||Number(s.network_id)!==Number(this.activeNetworkId)||!view||ownerPortal())return;
   if(view.querySelector('#ns-context-hint'))return;
   const step=s.steps.find(x=>x.tab===this.currentTab);if(!step)return;
   const bar=document.createElement('div');bar.id='ns-context-hint';bar.className='ns-context';
   bar.innerHTML=`<button class="mt-btn" onclick="App.openNetworkSetup('${step.id}')">← العودة إلى مركز الإعداد</button>${!s.preferences.hide_hints&&step.state!=='complete'?`<span>${esc(step.hint)}</span><button class="mt-btn" aria-label="إخفاء التلميحات" onclick="App.hideNetworkSetupHints()">إخفاء التلميحات</button>`:''}`;view.prepend(bar);
  },
  async hideNetworkSetupHints(){if(await this.saveNetworkSetup({operation:'preferences',hide_hints:true},false)){document.getElementById('ns-context-hint')?.remove();this.renderNetworkSetupHint();}}
 });
 const hasAccess=A.hasAccess.bind(A);A.hasAccess=function(tab){if(tab==='network_setup')return !ownerPortal()&&['system_owner','superadmin','network_manager','admin'].includes(this.userRole);return hasAccess(tab);};
 const dashboard=A.renderDashboard;
 const showMain=A.showMainApp;
 A.showMainApp=function(){
  const home=this.departments?.find(d=>d.items?.some(i=>i.id==='dashboard'));
  if(home&&!home.items.some(i=>i.id==='network_setup'))home.items.push({id:'network_setup',name:'مركز إعداد الشبكة',icon:'⚙️'});
  return showMain.call(this);
 };
 A.renderDashboard=async function(){
  const network=Number(this.activeNetworkId);
  const [,s]=await Promise.all([dashboard.call(this),this.loadNetworkSetup().catch(()=>null)]);
  if(this.currentTab!=='dashboard'||network!==Number(this.activeNetworkId))return;
  const view=document.getElementById('main-view');
  if(s&&view&&!view.querySelector('.ns-home'))view.insertAdjacentHTML('afterbegin',this.networkSetupDashboardHTML(s));
  this.installNetworkSetupHints();
  if(s?.auto_open&&this.currentTab==='dashboard')this.openNetworkSetup();
 };
})();
