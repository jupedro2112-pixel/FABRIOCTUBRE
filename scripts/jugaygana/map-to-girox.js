const fs = require('fs');
const cols = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).data.sort((a, b) => (a.order || 0) - (b.order || 0));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`´]/g, '').replace(/™|®/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const base = (x) => norm(x).replace(/ (9[0-9]|8[0-9])$/, '');
const pkey = (p) => norm(p).replace(/ /g, '').replace(/gaming|games|play$|studios?$/g, '');
const cache = {};
async function search(q) {
  if (cache[q]) return cache[q];
  const r = await fetch('https://admin.1girox.com/api/games?sort=popular&page=1&search=' + encodeURIComponent(q.slice(0, 40)));
  const j = await r.json().catch(() => ({})); await new Promise((ok) => setTimeout(ok, 250));
  return (cache[q] = (j.games || []));
}
(async () => {
  const out = []; const rep = [];
  for (const c of cols) {
    const items = (c.items || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map((i) => i.game).filter(Boolean);
    const games = [];
    for (const g of items) {
      const q0 = String(g.name).trim().replace(/ (9[0-9]|8[0-9])$/, ''); const res = await search(q0);
      const pk = pkey(g.provider);
      const hit = res.find((x) => base(x.name) === base(g.name) && pk && (pkey(x.provider_name || x.provider).includes(pk) || pk.includes(pkey(x.provider_name || x.provider))));
      if (hit) games.push({ key: hit.aggregator_id + '/' + hit.game_id, name: hit.name, provider: hit.provider_name || hit.provider, img: hit.thumbnail || hit.image_url || '' });
      rep.push((hit ? 'OK ' : 'NO ') + c.name + ' · ' + g.name + ' [' + g.provider + ']' + (hit ? ' → ' + hit.name + ' [' + (hit.provider_name || hit.provider) + ']' : ''));
    }
    out.push({ title: c.name, rows: c.row_count || 1, total: items.length, games });
    console.log(c.name, games.length + '/' + items.length);
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1)); fs.writeFileSync(process.argv[4], rep.join('\n'));
})();
