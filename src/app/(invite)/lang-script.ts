// The guest layout's one inline script: sets the document language from the
// URL before paint. A constant, so pages under the strict policy (/l, /k)
// allow it by hash.
export const LANG_SCRIPT =
  '(function(){try{var m=location.pathname.match(/\\/(ar|en)(\\/|$)/);var l=m?m[1]:"ar";var d=document.documentElement;d.lang=l;d.dir=l==="ar"?"rtl":"ltr"}catch(e){}})()';
