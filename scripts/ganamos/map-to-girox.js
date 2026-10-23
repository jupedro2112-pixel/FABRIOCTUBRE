const fs = require('fs');
const L = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`´]/g, '').replace(/™|®/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const PROV = { rubyplay: /ruby/, amusnet: /amusnet|egt/, amigogaming: /amigo/, xpg: /xpg/, pragmaticlive: /pragmatic.*live|live.*pragmatic/, pragmatic: /pragmatic/, 'pragmatic-rgs': /pragmatic/, mascot: /mascot/, endorphina: /endorphina/, evoplay: /evoplay/, kagaming2: /ka ?gaming/, kagaming: /ka ?gaming/, playson: /playson/, galaxsys: /galaxsys/, belatra: /belatra/, bgaming: /bgaming/, '100hp': /100 ?hp/, '123slots': /123/, jacktop: /jacktop/, winfinity: /winfinity/, outcome: /outcome/, aigenerated: /^$/ };
const cache = {};
async function search(q) {
  if (cache[q]) return cache[q];
  const r = await fetch('https://admin.1girox.com/api/games?sort=popular&page=1&search=' + encodeURIComponent(q.slice(0, 40)));
  const j = await r.json().catch(() => ({})); await new Promise((ok) => setTimeout(ok, 250));
  return (cache[q] = (j.games || []));
}
(async () => {
  const pick = { primicias: L.Gz, rubyplay: L.Oz, amusnet: L.Vz, pragmatic: L.Zz, amigo: L.Nz, xpg: L.jz, destacadas: L.Dz.pragmatic, joker: L.Yz.pragmatic, clasicas: L.Lz.pragmatic, pragmaticLive: L.Bz };
  const out = {}; const report = [];
  for (const [sec, list] of Object.entries(pick)) {
    out[sec] = [];
    for (const it of list) {
      const pr = String(it.provider || '').toLowerCase(); const re = PROV[pr] || new RegExp(pr.replace(/[^a-z]/g, '').slice(0, 5) || '^$');
      const games = await search(it.name);
      const base = (x) => norm(x).replace(/ (9[0-9]|8[0-9])$/, ''); // misma partida con otro RTP ("Volcano Rising SE 96")
      const hit = games.find((g) => base(g.name) === base(it.name) && re.test(String(g.provider_name || (g.provider && g.provider.name) || g.provider || '').toLowerCase()));
      if (hit) out[sec].push({ key: hit.aggregator_id + '/' + hit.game_id, name: hit.name, provider: hit.provider_name || hit.provider || '', img: hit.thumbnail || hit.image_url || '', gid: Number(hit.id), lk: hit.launcher_key || '' });
      report.push((hit ? 'OK  ' : 'NO  ') + sec + ' · ' + it.name + ' [' + it.provider + ']' + (hit ? ' → ' + hit.name + ' [' + (hit.provider_name || '') + ']' : ''));
    }
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
  fs.writeFileSync(process.argv[4], report.join('\n'));
  for (const [k, v] of Object.entries(out)) console.log(k, v.length + '/' + pick[k].length);
})();
