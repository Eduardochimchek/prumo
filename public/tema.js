// Executado antes do React: aplica o tema salvo (evita piscar) e impede que o Prumo
// seja aberto dentro de outro site (proteção contra clickjacking).
(function () {
  try {
    var t = localStorage.getItem('prumo:tema');
    if (t === 'escuro') document.documentElement.setAttribute('data-theme', 'dark');
    if (t === 'claro') document.documentElement.setAttribute('data-theme', 'light');
  } catch (e) {}
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location;
    } catch (e) {
      document.documentElement.style.display = 'none';
    }
  }
})();
