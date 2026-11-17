const test = require('node:test');
const assert = require('node:assert/strict');
const Matcher = require('../src/matcher.js');

test('detects direct GTA 6 variations, spaced punctuation, emojis and zero-width obfuscation', () => {
  const m = Matcher.createMatcher({ strictMode: false, blockAnyGta: false });

  const positiveCases = [
    'GTA 6 gameplay vazada',
    'GTA6 trailer analise',
    'Tudo sobre GTA-6 hoje',
    'G.T.A. 6 sem filtro',
    'G T A VI vazou',
    'GTA ⑥ leaks',
    'GTA 6️⃣ confirmado',
    'Grand Theft Auto VI novo detalhe',
    'Grand Theft Auto 6: veja o mapa',
    'O novo GTA está incrível',
    '#GTAVI leaks',
    'Estado de Leônida confirmado',
    'G\u200BT\u200BA\u200B 6 sem spoiler',
    'GTA Six release date'
  ];

  for (const sample of positiveCases) {
    const res = m.matchText(sample);
    assert.ok(res && res.matched, `Expected match for: ${sample}`);
  }
});

test('strict defaults catch bare Rockstar, Take-Two, Vice City, and standalone GTA', () => {
  const m = Matcher.createMatcher(); // default: strictMode=true, blockAnyGta=true

  const strictPositives = [
    'A Rockstar acabou de postar isso!',
    'Take-Two divulgou relatório hoje',
    'Take 2 falou sobre o lançamento',
    'Olha esse visual de Vice City!',
    'Final do GTA me deixou sem palavras',
    'G.T.A. nunca mais será o mesmo',
    'GTAO teve novidade',
    'Grand Theft Auto continua no topo'
  ];

  for (const sample of strictPositives) {
    const res = m.matchText(sample);
    assert.ok(res && res.matched, `Expected strict match for: ${sample}`);
  }
});

test('does not false-positive on unrelated normal words even in strict mode', () => {
  const m = Matcher.createMatcher(); // strictMode=true, blockAnyGta=true

  const negativeCases = [
    'O vice-presidente anunciou novas medidas',
    'Comprei Rockstar Energy Drink no mercado',
    'Lucia ganhou o prêmio de melhor atriz',
    'Jason fez gol no último minuto',
    'Rei Leônidas de Esparta na história',
    'Comprei uma big table nova',
    'Soldado perdeu a dog tag',
    'Melhor notebook gamer RTX 5060'
  ];

  for (const sample of negativeCases) {
    const res = m.matchText(sample);
    assert.equal(res, null, `Unexpected match for: ${sample} (reason: ${res?.reason})`);
  }
});

test('when blockAnyGta is disabled, avoids blocking older GTA titles without spoiler context', () => {
  const m = Matcher.createMatcher({ strictMode: false, blockAnyGta: false });

  assert.equal(m.matchText('GTA V online dinheiro infinito'), null);
  assert.equal(m.matchText('GTA IV ainda vale a pena em 2026?'), null);
  assert.equal(m.matchText('GTA San Andreas remaster'), null);
  assert.ok(m.matchText('Vazamento gigante do GTA deixou fãs chocados'));
});

test('detects contextual clickbait combinations', () => {
  const m = Matcher.createMatcher({ strictMode: false, blockAnyGta: false });

  assert.ok(m.matchText('Vazou o final do novo jogo da Rockstar!'));
  assert.ok(m.matchText('Lucia e Jason aparecem juntos em nova cena'));
  assert.ok(m.matchText('Lucia no novo trailer de gameplay'));
  assert.equal(m.matchText('Red Dead Redemption da Rockstar em promoção'), null);
});

test('respects strictMode toggle for standalone Rockstar Games and Vice City', () => {
  const strict = Matcher.createMatcher({ strictMode: true, blockAnyGta: false });
  const relaxed = Matcher.createMatcher({ strictMode: false, blockAnyGta: false });

  assert.ok(strict.matchText('Novidades da Rockstar Games hoje'));
  assert.ok(strict.matchText('Olha esse visual de Vice City!'));

  assert.equal(relaxed.matchText('Novidades da Rockstar Games hoje'), null);
  assert.equal(relaxed.matchText('Jogando o clássico Vice City de 2002'), null);
  assert.ok(relaxed.matchText('Novo trailer de Vice City 2026'));
});

test('supports accent-insensitive custom keywords', () => {
  const m = Matcher.createMatcher({
    customKeywords: ['Canal Spoiler BR', 'missão secreta']
  });

  assert.ok(m.matchText('Video do canal spoiler br'));
  assert.ok(m.matchText('Sobre a missao secreta do final'));
  assert.equal(m.matchText('Canal de culinária normal'), null);
});

test('matches spoiler URLs safely while ignoring opaque video IDs', () => {
  const m = Matcher.createMatcher();

  assert.ok(m.matchUrl('https://www.ign.com/articles/gta-6-ending-explained'));
  assert.ok(m.matchUrl('https://www.reddit.com/r/GTA6/comments/123abc/leak/'));
  assert.ok(m.matchUrl('https://www.google.com/search?q=gta+6+spoilers'));
  assert.ok(m.matchUrl('https://www.youtube.com/@GTA6Noticias/videos'));
  assert.ok(m.matchUrl('https://cdn.site.com/img/gta-6-leak.jpg'));

  assert.equal(m.matchUrl('https://www.youtube.com/watch?v=Gta6AbCdEfG&si=gtavi123'), null);
  assert.equal(m.matchUrl('https://youtu.be/Gta6AbCdEfG'), null);
  assert.equal(m.matchUrl('https://www.google.com/search?q=receita+de+bolo'), null);
});

test('whitelists domains accurately including subdomains', () => {
  const list = ['example.com', 'meu-blog.com.br'];

  assert.equal(Matcher.isDomainWhitelisted('example.com', list), true);
  assert.equal(Matcher.isDomainWhitelisted('www.example.com', list), true);
  assert.equal(Matcher.isDomainWhitelisted('sub.example.com', list), true);
  assert.equal(Matcher.isDomainWhitelisted('notexample.com', list), false);
  assert.equal(Matcher.isDomainWhitelisted('google.com', list), false);
});
