# #985 (owner: "las fotos de los lobbys, que no se repitan entre plataformas"): portadas PROPIAS de los lobbys para JUGAYGANA y PICA ROJA.
# Fondo = la foto de una mesa real del MISMO proveedor (CDN pública de portadas de SoftSwiss, distinta por marca) + banda con el título en los
# colores de la marca. Ganamos usa las portadas de lobby de esa CDN tal cual (public/images/ganamos/lobby). Uso: python3 -I lobby-covers.py <dir_fondos>
import sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
BG = sys.argv[1]; F = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
LOB = {  # key de Girox: (título, fondo JUGAYGANA, fondo PICA ROJA)
    '3/101': ('LIVE CASINO', 'pragmaticexternal_MegaWheel', 'pragmaticexternal_SweetBonanzaCandyland'),
    '3/103': ('BLACKJACK', 'pragmaticexternal_ONEBlackjack', 'pragmaticexternal_FreeBetBlackjack1'),
    '3/104': ('BACCARAT', 'pragmaticexternal_MegaBaccarat', 'pragmaticexternal_DragonTiger'),
    '7/10517_ifg': ('BLACKJACK', 'evolution_infinite_blackjack', 'evolution_casino_holdem'),
    '7/10511_ifg': ('GAME SHOWS', 'evolution_dream_catcher', 'evolution_lightning_roulette'),
    '7/10521_ifg': ('TOP GAMES', 'evolution_lightning_roulette', 'evolution_dream_catcher'),
    '7/10513_ifg': ('POKER', 'evolution_three_card_poker', 'evolution_casino_holdem'),
    '7/10519_ifg': ('ROULETTE', 'evolution_immersive_roulette', 'evolution_speed_roulette'),
    '7/10509_ifg': ('FIRST PERSON', 'evolution_auto_roulette', 'evolution_lightning_baccarat'),
}
PROV = {'3': 'PRAGMATIC LIVE', '7': 'EVOLUTION'}
STY = {'jugaygana': ((18, 18, 18), (242, 206, 0), (255, 255, 255)), 'picaroja': ((225, 29, 42), (255, 255, 255), (255, 225, 225))}
def cover(src, title, prov, brand):
    band, ink, sub = STY[brand]; S = 360
    im = Image.open(src).convert('RGB'); w, h = im.size
    im = im.crop((0, 0, w, int(h * .72)))                       # sin el título del proveedor (va abajo en la original)
    k = max(S / im.width, S / im.height); im = im.resize((int(im.width * k) + 1, int(im.height * k) + 1), Image.LANCZOS)
    x = (im.width - S) // 2; im = im.crop((x, 0, x + S, S))
    d = ImageDraw.Draw(im, 'RGBA')
    for i in range(120): d.line([(0, S - 120 + i), (S, S - 120 + i)], fill=(0, 0, 0, int(200 * i / 120)))
    d.rectangle([0, S - 78, S, S], fill=band + (235,))
    d.rectangle([0, S - 78, S, S - 74], fill=ink + (255,))
    f1 = ImageFont.truetype(F, 34); f2 = ImageFont.truetype(F, 15)
    t = title + ' LOBBY'
    while d.textlength(t, font=f1) > S - 24: f1 = ImageFont.truetype(F, f1.size - 2)
    d.text((S / 2, S - 48), t, font=f1, fill=ink, anchor='mm'); d.text((S / 2, S - 16), prov, font=f2, fill=sub, anchor='mm')
    return im
for brand, col in (('jugaygana', 1), ('picaroja', 2)):
    out = 'public/images/%s/lobby' % brand; os.makedirs(out, exist_ok=True)
    for key, v in LOB.items():
        im = cover(os.path.join(BG, v[col] + '.webp'), v[0], PROV[key.split('/')[0]], brand)
        im.save(os.path.join(out, key.replace('/', '_') + '.webp'), 'WEBP', quality=80)
