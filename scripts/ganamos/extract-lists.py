import re, json, sys
s=open(sys.argv[1],encoding='utf-8',errors='ignore').read()
def match_end(i, open_ch, close_ch):
    d=0; q=None; k=i
    while k < len(s):
        c=s[k]
        if q:
            if c=='\\': k+=2; continue
            if c==q: q=None
        elif c in '"\'`': q=c
        elif c==open_ch: d+=1
        elif c==close_ch:
            d-=1
            if d==0: return k
        k+=1
def top_objects(seg):
    out=[]; d=0; q=None; st=None; k=0
    while k < len(seg):
        c=seg[k]
        if q:
            if c=='\\': k+=2; continue
            if c==q: q=None
        elif c in '"\'`': q=c
        elif c=='{':
            if d==0: st=k
            d+=1
        elif c=='}':
            d-=1
            if d==0: out.append(seg[st:k+1])
        k+=1
    return out
def field(o, name):
    m=re.search(r'(?<![A-Za-z])'+name+r':"([^"]*)"', o); return m.group(1) if m else None
def items(seg, defprov=None):
    res=[]
    for o in top_objects(seg):
        res.append({'name': field(o,'gameName') or field(o,'description'), 'provider': field(o,'provider') or field(o,'routeProvider') or defprov, 'id': field(o,'gameId') or field(o,'id')})
    return res
out={}
for v in ['Sz','Iz','Gz','Oz','Bz','Zz','qz']:
    m=re.search(r'[,;\s]'+v+r'=\[', s)
    if not m: continue
    a=s.index('[', m.start()); b=match_end(a,'[',']'); out[v]=items(s[a+1:b])
for v in ['Vz','Nz','jz']:
    m=re.search(r'[,;\s]'+v+r'=L6\("([^"]+)",\[', s)
    a=s.index('[', m.start()); b=match_end(a,'[',']'); out[v]=items(s[a+1:b], m.group(1))
for v in ['Dz','Yz','Lz']:
    m=re.search(r'[,;\s]'+v+r'=\{', s); a=s.index('{', m.start()); b=match_end(a,'{','}'); seg=s[a+1:b]
    # keys at depth 0 -> arrays
    sub={}
    for km in re.finditer(r'(?:^|,)([A-Za-z_\-]+):\[', seg):
        if km.start()>0 and seg[:km.start()].count('[')!=seg[:km.start()].count(']'): continue
        aa=seg.index('[', km.start()); bb=aa; d=0; q=None
        # reuse match_end on substring
        d=0;q=None;k=aa
        while k<len(seg):
            c=seg[k]
            if q:
                if c=='\\': k+=2; continue
                if c==q: q=None
            elif c in '"\'`': q=c
            elif c=='[': d+=1
            elif c==']':
                d-=1
                if d==0: break
            k+=1
        sub[km.group(1)]=items(seg[aa+1:k])
    out[v]=sub
json.dump(out, open(sys.argv[2],'w'), ensure_ascii=False, indent=1)
for k,v in out.items():
    if isinstance(v,dict): print(k, {kk:len(vv) for kk,vv in v.items()})
    else: print(k, len(v), '·', ' | '.join((x['name'] or '?')+' ['+(x['provider'] or '?')+']' for x in v[:6]))
