# Casino en vivo de las páginas de marca: TODOS los proveedores en vivo de Girox, sacados del catálogo completo de 1girox
# (la lista pública de proveedores sólo trae a Evolution; Ezugi, Pragmatic Live, SA Gaming, etc. no figuran pero sus mesas sí están).
# Uso: python3 -I scripts/girox/build-live.py <catalogo.json> > public/data/girox-live.json
# El catálogo = todas las páginas de https://admin.1girox.com/api/games?sort=popular&page=N juntas en una lista.
import json, re, sys
cat = json.load(open(sys.argv[1]))
# proveedor que se muestra ← nombres de proveedor en el catálogo (en orden de cómo se muestran)
PROVS = [('Evolution', ['Evolution', 'evolution']), ('Pragmatic Play Live', ['pragmatic-live-casino']), ('Ezugi', ['Ezugi']),
         ('SA Gaming', ['sa-gaming', 'sagaming']), ('Iconic21 Live', ['iconic21-live']), ('Vivo Gaming', ['vivo-gaming']),
         ('LiveVegas', ['LiveVegas']), ('TVBet', ['tv-bet']), ('ElCasino', ['el-casino'])]
KEY = re.compile(r'^\d{1,3}/[\w.\-@]{1,80}$')
norm = lambda s: re.sub(r'[^a-z0-9]', '', str(s).lower())
out = []
for show, names in PROVS:
    best = {}
    for g in cat:
        if g.get('provider_name') not in names or g.get('aggregator_id') is None or not g.get('game_id'): continue
        key = '%s/%s' % (g['aggregator_id'], g['game_id']); name = re.sub(r'[™®]', '', str(g.get('name') or '')).strip()[:60]
        if not KEY.match(key) or not name: continue
        n = norm(name); pc = g.get('play_count') or 0
        if n not in best or pc > best[n][0]:
            best[n] = (pc, [key, name, g.get('thumbnail') or g.get('image_url') or '', g.get('id'), str(g.get('launcher_key') or '')[:40]])
    games = [v[1] for v in sorted(best.values(), key=lambda v: (0 if re.search(r'lobby', v[1][1], re.I) else 1, -v[0]))]
    if games: out.append({'name': show, 'games': games})
print(json.dumps({'providers': out}, ensure_ascii=False, separators=(',', ':')))
