/* Auto-fill data-label attributes for table cells to support card-view on mobile */
(function(){
  'use strict';
  function checkMobileState(){
    if (window.innerWidth <= 768) {
      document.body.classList.add('sam-mobile-cards');
    } else {
      document.body.classList.remove('sam-mobile-cards');
    }
  }

  function enhanceTables(){
    checkMobileState();
    document.querySelectorAll('table.mt-table, table.sam-table, .mt-table-container table, .sam-table-container table, .table-responsive table').forEach(function(table){
      // Build header labels
      var headers = Array.from(table.querySelectorAll('thead th')).map(function(th){ return th.textContent.trim(); }).filter(Boolean);
      // Fallback: try first tbody row as header hints
      if(headers.length === 0){
        var firstRow = table.querySelector('tbody tr');
        if(firstRow){
          headers = Array.from(firstRow.querySelectorAll('td')).map(function(_,i){ return 'عمود ' + (i+1); });
        }
      }

      Array.from(table.querySelectorAll('tbody tr')).forEach(function(row){
        Array.from(row.querySelectorAll('td')).forEach(function(td, idx){
          if(!td.hasAttribute('data-label')){
            var label = headers[idx] || td.getAttribute('aria-label') || td.getAttribute('data-col') || '';
            td.setAttribute('data-label', label);
          }
        });
      });
    });
  }

  window.addEventListener('resize', checkMobileState);

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', enhanceTables);
  } else {
    enhanceTables();
  }

  // Observe DOM mutations to enhance dynamically inserted tables
  try {
    var _mt_debounce = null;
    var observer = new MutationObserver(function(mutations){
      if (_mt_debounce) clearTimeout(_mt_debounce);
      _mt_debounce = setTimeout(function(){
        enhanceTables();
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (e) {
    // ignore if MutationObserver not supported
  }
})();
