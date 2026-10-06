/* Bottom navigation controller: show on small screens and emit events */
(function(){
  'use strict';
  function init(){
    var nav = document.getElementById('sam-bottom-nav');
    if(!nav) return;

    var mq = window.matchMedia('(max-width:768px)');
    function update(){
      if(mq.matches){ nav.style.display = 'flex'; }
      else { nav.style.display = 'none'; }
    }
    update();
    mq.addEventListener?.('change', update);
    window.addEventListener('resize', update);

    nav.querySelectorAll('.nav-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var action = btn.getAttribute('data-action') || '';
        document.dispatchEvent(new CustomEvent('sam-bottom-nav', { detail: { action: action } }));
        btn.classList.add('active');
        setTimeout(function(){ btn.classList.remove('active'); }, 180);
      });
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
