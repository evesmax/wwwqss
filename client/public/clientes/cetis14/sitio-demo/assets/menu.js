(function(){
  var b=document.getElementById('menu-toggle'),n=document.getElementById('menu-principal');
  if(!b||!n)return;
  b.addEventListener('click',function(){
    var abierto=n.classList.toggle('abierto');
    b.setAttribute('aria-expanded',abierto?'true':'false');
    b.setAttribute('aria-label',abierto?'Cerrar menú':'Abrir menú');
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&n.classList.contains('abierto')){n.classList.remove('abierto');b.setAttribute('aria-expanded','false');b.setAttribute('aria-label','Abrir menú');b.focus();}
  });
})();
