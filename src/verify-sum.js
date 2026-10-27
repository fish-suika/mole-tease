const sumEl = document.getElementById('sum');
sumEl.textContent = nNg === 0 ? ('全 ' + nOk + ' 件 PASS') : (nNg + ' 件 FAIL / ' + (nOk + nNg) + ' 件');
sumEl.style.color = nNg === 0 ? '#6bd07a' : '#ff6b6b';
