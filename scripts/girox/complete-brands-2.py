# Segunda pasada (F977, owner: "seguí completando Ganamos y JUGAYGANA con todos los juegos que puedas"): después de complete-brands.py.
#  1) PROVEEDORES QUE FALTABAN: cada proveedor de Girox que la página no tenía se agrega al final de su lista, con todos sus juegos (más jugados primero).
#     Ganamos sólo suma tragamonedas (su casino en vivo sale de girox-live.json); JUGAYGANA suma todos.
#  2) Filas / categorías cortas llenadas con juegos del MISMO tipo o proveedor (nunca mezcla proveedores en una fila de proveedor).
# Uso: python3 -I scripts/girox/complete-brands-2.py <catalogo.json> <proveedores.json (respuesta de /api/games: lista "providers")>
import json, re, sys, importlib.util
spec = importlib.util.spec_from_file_location('cb', __file__.replace('complete-brands-2.py', 'complete-brands.py'))
cat = json.load(open(sys.argv[1])); provs = json.load(open(sys.argv[2])).get('providers', [])
KEY = re.compile(r'^\d{1,3}/[\w.\-@]{1,80}$')
norm = lambda s: re.sub(r'[^a-z0-9]', '', re.sub(r'[™®]', '', str(s).lower()))
def g5(g): return ['%s/%s' % (g['aggregator_id'], g['game_id']), re.sub(r'[™®]', '', str(g['name'])).strip()[:60], g.get('thumbnail') or g.get('image_url') or '', g.get('id'), str(g.get('launcher_key') or '')[:40]]
CAT = sorted([g for g in cat if g.get('aggregator_id') is not None and g.get('game_id') and g.get('name') and KEY.match('%s/%s' % (g['aggregator_id'], g['game_id']))], key=lambda g: -(g.get('play_count') or 0))
LIVE_CATS = {'Slot_live', 'Live Casino', 'Live', 'LiveGames', 'ElCasino'}
LIVE_PROV = {'Evolution', 'evolution', 'Ezugi', 'pragmatic-live-casino', 'sa-gaming', 'sagaming', 'iconic21-live', 'vivo-gaming', 'LiveVegas', 'tv-bet', 'el-casino'}
SLOT = lambda g: g['category'] not in LIVE_CATS and g['provider_name'] not in LIVE_PROV and not re.search(r'lobby', g['name'], re.I)
# nombre lindo de cada proveedor (alias de la lista pública de 1girox; si no está, el del catálogo)
alias = {norm(p.get('slug')): p.get('alias') or p.get('name') for p in provs}; alias.update({norm(p.get('alias') or p.get('name')): p.get('alias') or p.get('name') for p in provs})
NICE = {'kagaming': 'KA Gaming', 'hotdoggaming': 'Hotdog Gaming', 'mascotgaming': 'Mascot Gaming', 'iconic21rng': 'Iconic21', '77gaming': '77 Gaming', 'turbogames': 'Turbo Games', 'amarix': 'Amarix'}
def nice(pn): return NICE.get(norm(pn)) or alias.get(norm(pn)) or pn
GN_HAS = {'RubyPlay', 'Ruby-Play', 'Amusnet', 'Amigo Gaming', 'mascotgaming', 'NetEnt', 'Pragmatic Play', 'EGT', 'InOut', 'Booongo', 'booongo', 'Microgaming', 'Aristocrat', 'Wazdan', 'EvoPlay', 'IGT',
          'betcorejacktop', 'jacktop', 'BGaming', 'bgaming', 'Red Rake', 'Playson', 'playson', 'Amatic', 'Greentube', 'novomatic', 'Igrosoft', 'Gaminator', 'Quickspin', 'Apollo', 'Playtech', 'Merkur',
          'Kajot', 'Konami', 'WMG', 'Push Gaming', 'Betsoft', '1Spin4Win', '1spin4win', 'Blueprint', '100hp', 'Hacksaw Gaming', 'BullShark Games', 'BackSeat Gaming', 'Trusty Gaming', 'NowNow Gaming', 'Kitsune Games',
          'Paperclip Gaming', 'Sidequest Studios', 'Shift Gaming', '1 Ace Studios', 'Pocket Play', 'Rabbit Gaming', 'RainFall Gaming', 'Uppercut Gaming', 'Zeroedge Studios', 'Valkyrie', 'JinX Gaming', 'AceRoll',
          'Pineapple Play', 'Giga', 'Slotrix'}
JG_HAS = {'Amigo Gaming', 'LiveVegas', 'RubyPlay', 'Ruby-Play', 'kagaming', '100hp', 'Pragmatic Play', 'Dreamplay', 'Mancala', 'BGaming', 'bgaming', '1Spin4Win', '1spin4win', 'Betsoft', 'Gamzix', 'vivo-gaming',
          'Playson', 'playson', 'Microgaming', 'Amatic', 'pragmatic-live-casino', 'NetEnt', 'Ezugi', 'Hacksaw Gaming', 'ElBet', 'Red Rake', 'tv-bet', '77gaming', 'KingMidas', 'Rival', 'Spinoro', 'Push Gaming',
          'iconic21-live', 'iconic21-rng', 'PlayNGo', 'Greentube', 'Aviatrix', 'aviatrix', 'EvoPlay', '3 Oaks', 'Evolution', 'evolution'}
def add_missing(path, has, only_slots, min_games=3):
    d = json.load(open(path)); groups = {}
    for g in CAT:
        if g['provider_name'] in has or (only_slots and not SLOT(g)): continue
        groups.setdefault(norm(nice(g['provider_name'])), (nice(g['provider_name']), []))[1].append(g)
    REN_BACK = {'Peter & Sons': 'Peterandsons', 'Bluejack': 'Betcorejacktop'}  # nombres prolijos de una corrida anterior
    present = {norm(REN_BACK.get(p['n'], p['n'])) for p in d['providers']} | {norm(p['n']) for p in d['providers']}; out = []
    for k, (name, gs) in sorted(groups.items(), key=lambda kv: -len(kv[1][1])):
        if k in present or len(gs) < min_games or name == '155': continue  # '155' = proveedor sin nombre en Girox
        seen = set(); games = []
        for g in gs:
            e = g5(g)
            if norm(e[1]) in seen: continue
            seen.add(norm(e[1])); games.append(e)
        d['providers'].append({'n': name, 'g': games}); out.append((name, len(games)))
    json.dump(d, open(path, 'w'), ensure_ascii=False, separators=(',', ':')); return out
def fill(lst, pick, n, as_dict, sort=None):
    keys = {(x['key'] if isinstance(x, dict) else x[0]) for x in lst}; nn = {norm(x['name'] if isinstance(x, dict) else x[1]) for x in lst}; c = 0
    for g in (sort or CAT):
        if len(lst) >= n: break
        if not pick(g): continue
        e = g5(g)
        if e[0] in keys or norm(e[1]) in nn: continue
        keys.add(e[0]); nn.add(norm(e[1])); c += 1
        lst.append({'key': e[0], 'name': e[1], 'provider': g['provider_name'], 'img': e[2], 'gid': e[3], 'lk': e[4]} if as_dict else e)
    return c
NEWEST = sorted(CAT, key=lambda g: str(g.get('created_at') or ''), reverse=True)
P = lambda *names: (lambda g: SLOT(g) and g['provider_name'] in names)
JOKER = lambda g: SLOT(g) and re.search(r'joker|jester|buf[oó]n', g['name'], re.I)
CLASSIC = lambda g: SLOT(g) and re.search(r'\b(7s?|sevens?|hot|fruits?|bars?|bells?|classic|cl[aá]sic|diamonds?|cherry|lucky|burning|shining|crown|stars?)\b', g['name'], re.I)
print('GANAMOS proveedores nuevos:', add_missing('public/data/ganamos-games.json', GN_HAS, True))
print('JUGAYGANA proveedores nuevos:', add_missing('public/data/jugaygana-games.json', JG_HAS, False))
h = json.load(open('public/data/ganamos-home.json'))
ROWS = {'Rubyplay': P('RubyPlay', 'Ruby-Play'), 'Amusnet': P('Amusnet'), 'Pragmatic Slots': P('Pragmatic Play'), 'Amigo Gaming': P('Amigo Gaming'),
        'Tragamonedas Destacadas': SLOT, 'Tragamonedas Del Joker': JOKER, 'Tragamonedas Clásicas': CLASSIC}
for r in h['rows']:
    if r['title'] in ROWS: print('gn fila', r['title'], '+', fill(r['games'], ROWS[r['title']], 24, True))
json.dump(h, open('public/data/ganamos-home.json', 'w'), ensure_ascii=False, separators=(',', ':'))
jh = json.load(open('public/data/jugaygana-home.json'))
COLS = {'Juegos más populares': (SLOT, None), 'Seleccionados': (SLOT, None), 'RubyPlay': (P('RubyPlay', 'Ruby-Play'), None), 'Nuevo': (SLOT, NEWEST),
        'Crash': (lambda g: g['category'] == 'Crash' or re.search(r'crash|aviator|plinko|mines', g['name'], re.I), None)}
for c in jh['collections']:
    if c['title'] in COLS: print('jg colección', c['title'], '+', fill(c['games'], COLS[c['title']][0], 24, True, COLS[c['title']][1]))
open('public/data/jugaygana-home.json', 'w').write(json.dumps(jh, ensure_ascii=False, indent=1) + '\n')
j = json.load(open('public/data/jugaygana-games.json'))
CATS = {'destacados': (SLOT, None, 24), 'nuevo': (SLOT, NEWEST, 60), 'megaways': (lambda g: SLOT(g) and re.search(r'megaways', g['name'], re.I), None, 120),
        'ruletas': (lambda g: re.search(r'roulette|ruleta', g['name'], re.I) and not re.search(r'lobby', g['name'], re.I), None, 120),
        'mesa': (lambda g: g['category'] in ('Blackjack', 'Baccarat', 'Roulette', 'Poker', "Hold'em", 'Video Poker', 'Table Games', 'Card'), None, 120)}
for k, (pk, srt, n) in CATS.items(): print('jg categoría', k, '+', fill(j['cats'][k], pk, n, False, srt))
json.dump(j, open('public/data/jugaygana-games.json', 'w'), ensure_ascii=False, separators=(',', ':'))
# nombres prolijos (los de la lista pública vienen en minúscula o pegados)
REN = {'Egt': 'EGT', 'Igt': 'IGT', 'Mga': 'MGA', 'Wmg': 'WMG', 'Inout': 'InOut', 'Playngo': "Play'n GO", '3Oaks': '3 Oaks', 'Sagaming': 'SA Gaming', 'el-casino': 'ElCasino',
       'Barbarabang': 'BarbaraBang', 'Peterandsons': 'Peter & Sons', 'Olympicstudio': 'Olympic Studio', 'Ensuregames': 'Ensure Games', 'Betcorejacktop': 'Bluejack',
       'Backseat Gaming': 'BackSeat Gaming', 'Bullshark Games': 'BullShark Games', 'Nownow Gaming': 'NowNow Gaming', 'Rainfall Gaming': 'RainFall Gaming', 'Spinoro': 'SpinOro', 'King Midas': 'KingMidas'}
for f in ('public/data/ganamos-games.json', 'public/data/jugaygana-games.json'):
    d = json.load(open(f))
    for p in d['providers']: p['n'] = REN.get(p['n'], p['n'])
    json.dump(d, open(f, 'w'), ensure_ascii=False, separators=(',', ':'))
# F978: categorías de JUGAYGANA que quedaban cortas (mismo tipo de juego) y "Juegos nuevos" = los 120 ÚLTIMOS que agregó Girox (antes: todo lo de Girox
# que la página no tenía — casi todo eso ya entra por los proveedores; así el archivo pasa de ~700 KB a ~25 KB y el Inicio abre más rápido).
j = json.load(open('public/data/jugaygana-games.json'))
MORE = {'bonos': (lambda g: SLOT(g) and re.search(r'\bbuy\b|bonus buy|feature', g['name'], re.I), 120),
        'bingo': (lambda g: re.search(r'bingo|keno|lott?o|loter|scratch|raspa', g['name'], re.I) and g['category'] not in LIVE_CATS, 60),
        'habilidad': (lambda g: g['category'] in ('Crash', 'Instant Win') or re.search(r'crash|mines|plinko|aviat|hilo|hi-lo|dice|tower|limbo|chicken', g['name'], re.I), 120)}
for k, (pk, n) in MORE.items(): print('jg categoría', k, '+', fill(j['cats'][k], pk, n, False))
json.dump(j, open('public/data/jugaygana-games.json', 'w'), ensure_ascii=False, separators=(',', ':'))
for b in ('jugaygana', 'ganamos', 'buffaloplay'):
    f = 'public/data/%s-extra.json' % b; x = json.load(open(f)); new = []
    seen = set()
    for g in NEWEST:
        if not SLOT(g): continue
        e = g5(g); e.append(nice(g['provider_name']))
        if norm(e[1]) in seen: continue
        seen.add(norm(e[1])); new.append(e)
        if len(new) >= 120: break
    x['games'] = new; x['_nota'] = 'F978: Juegos nuevos = los 120 últimos que agregó Girox (más nuevo primero): [key, nombre, portada, gid, lk, proveedor].'
    json.dump(x, open(f, 'w'), ensure_ascii=False, separators=(',', ':')); print(b, 'extra', len(new))
