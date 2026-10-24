# Completa las páginas de Ganamos y JUGAYGANA con los juegos de Girox que les faltan, RESPETANDO EL PROVEEDOR: cada proveedor de la página
# suma los juegos de ese mismo proveedor en el catálogo de 1girox que todavía no tiene (más jugados primero, portada de Girox). También llena
# las filas del Inicio que quedaron casi vacías (Halloween, Pragmatic Live, Casino). No toca lo que ya estaba (orden y portadas propias).
# Uso: python3 -I scripts/girox/complete-brands.py <catalogo.json>   (catálogo = todas las páginas de admin.1girox.com/api/games juntas)
import json, re, sys
cat = json.load(open(sys.argv[1]))
KEY = re.compile(r'^\d{1,3}/[\w.\-@]{1,80}$')
norm = lambda s: re.sub(r'[^a-z0-9]', '', re.sub(r'[™®]', '', str(s).lower()))
def g5(g): return ['%s/%s' % (g['aggregator_id'], g['game_id']), re.sub(r'[™®]', '', str(g['name'])).strip()[:60], g.get('thumbnail') or g.get('image_url') or '', g.get('id'), str(g.get('launcher_key') or '')[:40]]
CAT = sorted([g for g in cat if g.get('aggregator_id') is not None and g.get('game_id') and g.get('name') and KEY.match('%s/%s' % (g['aggregator_id'], g['game_id']))], key=lambda g: -(g.get('play_count') or 0))
HW = re.compile(r'hallow|zombi|vampir|witch|pumpkin|spook|haunt|mumm|franken|dracula|muerto|ghost|skull|creep|\bgrave|cursed|scary|horror|undead|reaper|\bmonster|\bdevil|\bdemon|\bhell\b|\bbats?\b|boo!', re.I)  # F975: + monstruos, diablos, murciélagos
HACKSAW = ['Hacksaw Gaming', 'BullShark Games', 'BackSeat Gaming', 'Trusty Gaming', 'NowNow Gaming', 'Kitsune Games', 'Paperclip Gaming', 'Sidequest Studios', 'Shift Gaming', '1 Ace Studios', 'Pocket Play', 'Rabbit Gaming', 'RainFall Gaming', 'Uppercut Gaming', 'Zeroedge Studios', 'Valkyrie', 'JinX Gaming', 'AceRoll', 'Pineapple Play', 'Giga', 'Slotrix']
GN = {'Rubyplay': ['RubyPlay', 'Ruby-Play'], 'Amusnet': ['Amusnet'], 'Amigo Gaming': ['Amigo Gaming'], 'Mascot': ['mascotgaming'], 'NetEnt': ['NetEnt'], 'Pragmatic Play': ['Pragmatic Play'],
      'EGT Digital': ['EGT'], 'Inout': ['InOut'], 'Booongo': ['Booongo', 'booongo'], 'Microgaming': ['Microgaming'], 'Aristocrat': ['Aristocrat'], 'Wazdan': ['Wazdan'], 'EvoPlay': ['EvoPlay'],
      'IGT': ['IGT'], 'Bluejack': ['betcorejacktop', 'jacktop'], 'BGaming': ['BGaming', 'bgaming'], 'Red Rake': ['Red Rake'], 'Playson': ['Playson', 'playson'], 'Hacksaw': HACKSAW, 'Amatic': ['Amatic'],
      'Greentube': ['Greentube', 'novomatic'], 'Igrosoft': ['Igrosoft'], 'Gaminator': ['Gaminator'], 'Quickspin': ['Quickspin'], 'Apollo': ['Apollo'], 'Playtech': ['Playtech'], 'Merkur': ['Merkur'],
      'Kajot': ['Kajot'], 'Konami': ['Konami'], 'WMG': ['WMG'], 'Push Gaming': ['Push Gaming'], 'Betsoft': ['Betsoft'], '1spin4win': ['1Spin4Win', '1spin4win'], 'Blueprint': ['Blueprint'], '100HP': ['100hp']}
JG = {'Amigo Gaming': ['Amigo Gaming'], 'Live Vegas': ['LiveVegas'], 'RubyPlay': ['RubyPlay', 'Ruby-Play'], 'KA Gaming': ['kagaming'], '100HP': ['100hp'], 'Pragmatic': ['Pragmatic Play'], 'DreamPlay': ['Dreamplay'],
      'Mancala': ['Mancala'], 'BGaming': ['BGaming', 'bgaming'], '1Spin4Win': ['1Spin4Win', '1spin4win'], 'BetSoft': ['Betsoft'], 'GamZix': ['Gamzix'], 'Vivo Gaming': ['vivo-gaming'], 'Playson': ['Playson', 'playson'],
      'Microgaming': ['Microgaming'], 'Amatic': ['Amatic'], 'Pragmatic Live': ['pragmatic-live-casino'], 'Netent': ['NetEnt'], 'Ezugi': ['Ezugi'], 'Hacksaw': ['Hacksaw Gaming'], 'Elbet': ['ElBet'],
      'Red Rake': ['Red Rake'], 'TV Bet': ['tv-bet'], '77 Gaming': ['77gaming'], 'KingMidas': ['KingMidas'], 'Rival': ['Rival'], 'SpinOro': ['Spinoro'], 'Push Gaming': ['Push Gaming'], 'ICONIC21': ['iconic21-live', 'iconic21-rng'],
      "Play'n GO": ['PlayNGo'], 'Greentube': ['Greentube'], 'Aviatrix': ['Aviatrix', 'aviatrix'], 'Evoplay': ['EvoPlay'], '3 Oaks': ['3 Oaks'], 'Evolution': ['Evolution', 'evolution']}
def fill_providers(path, MAP):
    d = json.load(open(path)); rep = []
    for p in d['providers']:
        names = MAP.get(p['n'])
        if not names: rep.append((p['n'], len(p['g']), 0)); continue
        keys = {a[0] for a in p['g']}; nn = {norm(a[1]) for a in p['g']}; add = []
        for g in CAT:
            if g['provider_name'] not in names: continue
            e = g5(g)
            if e[0] in keys or norm(e[1]) in nn: continue
            keys.add(e[0]); nn.add(norm(e[1])); add.append(e)
        rep.append((p['n'], len(p['g']), len(add))); p['g'] += add
    json.dump(d, open(path, 'w'), ensure_ascii=False, separators=(',', ':')); return rep
def fill_row(games, pick, n, prov_of=lambda g: g['provider_name']):
    keys = {x['key'] for x in games}; nn = {norm(x['name']) for x in games}; added = 0
    for g in CAT:
        if len(games) >= n: break
        if not pick(g): continue
        e = g5(g)
        if e[0] in keys or norm(e[1]) in nn: continue
        keys.add(e[0]); nn.add(norm(e[1])); games.append({'key': e[0], 'name': e[1], 'provider': prov_of(g), 'img': e[2], 'gid': e[3], 'lk': e[4]}); added += 1
    return added
SLOTS = lambda g: not re.search(r'live|lobby', g['provider_name'] + ' ' + g['name'], re.I) and g['category'] not in ('Slot_live', 'Live Casino', 'Live', 'LiveGames')
for name, rep in (('GANAMOS', fill_providers('public/data/ganamos-games.json', GN)), ('JUGAYGANA', fill_providers('public/data/jugaygana-games.json', JG))):
    print(name + ':', ', '.join('%s %d+%d' % r for r in rep if r[2]))
h = json.load(open('public/data/ganamos-home.json'))
for r in h['rows']:
    if r['title'] == 'Especial de Halloween': print('gn halloween +', fill_row(r['games'], lambda g: SLOTS(g) and HW.search(g['name']), 48))  # F975: todo el recuadro
    if r['title'] == 'Pragmatic Live': print('gn pragmatic live +', fill_row(r['games'], lambda g: g['provider_name'] == 'pragmatic-live-casino', 24))
json.dump(h, open('public/data/ganamos-home.json', 'w'), ensure_ascii=False, separators=(',', ':'))
jh = json.load(open('public/data/jugaygana-home.json'))
for c in jh['collections']:
    if c['title'] == 'Juegos De Halloween': print('jg halloween +', fill_row(c['games'], lambda g: SLOTS(g) and HW.search(g['name']), 48))
    if c['title'] == 'Casino': print('jg casino +', fill_row(c['games'], SLOTS, 24))
open('public/data/jugaygana-home.json', 'w').write(json.dumps(jh, ensure_ascii=False, indent=1) + '\n')
