"""Build data/tn_gv_history.js from the collected Tamil Nadu guideline values (data/tn_gv/).
1) per village and revision: median street rate in Rs/sq ft (and median farm rate Rs/acre)
2) place villages on Census 2011 village points: Tamil name transliterated, phonetic key, fuzzy match within district (rapidfuzz ratio >= 86; near-ties dropped)
3) write window.BL_TN_GV.  Needs: pip install pandas pyarrow rapidfuzz ; Census parquet path in CENSUS_PARQUET (ramSeraph indian_admin_boundaries census-2011 villages)."""
import os,json
HERE=os.path.dirname(os.path.abspath(__file__)); TMP=os.environ.get('TMPDIR','/tmp')
def load_census():
  import pandas as pd
  t=pd.read_parquet(os.environ.get('CENSUS_PARQUET','cv.parquet'),columns=['stname','dtname','sdtname','vilname','Lat','Long','t_pop2011'])
  return t[t.stname.str.upper().str.contains('TAMIL')]

import json,glob,os,statistics as st,re
B=os.path.join(HERE,'..','data','tn_gv')
CONV={'ft2':1,'m2':1/10.7639,'ac':1/43560,'ha':1/107639}
REVS=['2024','2023','2017','2012','2007','2003','2002']
def norm(n): return re.sub(r'[\s\.\-\(\)]+','',n or '')
out={}  # key (dist,sroid,normname) -> {name, sro, rev: [median, n, agri_median]}
for rev in REVS:
  files=glob.glob(f'{B}/*.json') if rev=='2024' else glob.glob(f'{B}/{rev}/*.json')
  for f in files:
    if os.path.basename(f).startswith('_') or 'progress' in f: continue
    d=json.load(open(f)); dist=d['district']
    for sid,s in d['sros'].items():
      r=s['revs'].get(rev)
      if not r: continue
      for vid,e in r['d'].items():
        rows=e.get('rows') or []
        if not rows: continue
        ft=[x[1]*CONV[x[2]] for x in rows if x[2] in ('ft2','m2') and x[1]]
        ag=[x[1]*CONV[x[2]] for x in rows if x[2] in ('ac','ha') and x[1]]
        k=f"{dist}|{sid}|{norm(e['n'])}"
        o=out.setdefault(k,{'n':e['n'],'sro':s['name'],'d':dist,'r':{}})
        o['r'][rev]=[round(st.median(ft),1) if ft else None,len(rows),round(st.median(ag),2) if ag else None]
json.dump(out,open(os.path.join(TMP,'vill.json'),'w'),ensure_ascii=False)
from collections import Counter
c=Counter(len(o['r']) for o in out.values()); print(len(out),sorted(c.items()))
c2=Counter(r for o in out.values() for r in o['r']); print(c2)

import json,re,pandas as pd
from rapidfuzz import process,fuzz
C={'க':'k','ங':'n','ச':'s','ஞ':'n','ட':'t','ண':'n','த':'t','ந':'n','ப':'p','ம':'m','ய':'y','ர':'r','ல':'l','வ':'v','ழ':'l','ள':'l','ற':'r','ன':'n','ஜ':'j','ஷ':'s','ஸ':'s','ஹ':'h'}
V={'அ':'a','ஆ':'a','இ':'i','ஈ':'i','உ':'u','ஊ':'u','எ':'e','ஏ':'e','ஐ':'ai','ஒ':'o','ஓ':'o','ஔ':'au'}
S={'ா':'a','ி':'i','ீ':'i','ு':'u','ூ':'u','ெ':'e','ே':'e','ை':'ai','ொ':'o','ோ':'o','ௌ':'au','்':''}
def tr(t):
  t=re.sub(r'\(.*?\)|[0-9\-_.,/]',' ',t); o=[];i=0
  while i<len(t):
    ch=t[i]
    if ch in C:
      nx=t[i+1] if i+1<len(t) else ''
      if nx in S: o.append(C[ch]+S[nx]); i+=2; continue
      o.append(C[ch]+'a')
    elif ch in V: o.append(V[ch])
    elif ch.isascii(): o.append(ch.lower())
    i+=1
  return ''.join(o)
def en(t):
  t=t.lower(); t=re.sub(r'\(.*?\)|[0-9\-_.,/]',' ',t)
  for a,b in [('th','t'),('dh','t'),('sh','s'),('ch','s'),('zh','l'),('ph','p'),('kh','k'),('gh','k'),('bh','p'),('d','t'),('g','k'),('b','p'),('c','s'),('w','v'),('f','p'),('z','s'),('x','ks'),('q','k'),('ee','i'),('oo','u'),('aa','a'),('ou','u')]: t=t.replace(a,b)
  return t
def key(x):
  x=re.sub(r'[^a-z]','',x); x=re.sub(r'(.)\1+',r'\1',x)
  x=re.sub(r'[aeiou]+$','',x)  # drop final vowel
  return x
DM={'Kancheepuram':'KAnchipuram','Kallakurichi':'Kallakurichchi','Nilgiris':'The Nilgiris','Sivagangai':'Sivaganga','Tirupathur':'Tiruppattur','Tiruvallur':'Thiruvallur','Tiruvarur':'Thiruvarur'}
cv=load_census()
cv['k']=cv.vilname.map(lambda x:key(en(x)))
v=json.load(open(os.path.join(TMP,'vill.json')))
res={};stat={'ok':0,'amb':0,'none':0}
by={d:g for d,g in cv.groupby('dtname')}
for k,o in v.items():
  g=by.get(DM.get(o['d'],o['d']))
  if g is None: stat['none']+=1; continue
  q=key(tr(o['n']))
  if len(q)<3: stat['none']+=1; continue
  m=process.extract(q,g.k.tolist(),scorer=fuzz.ratio,limit=2)
  if not m or m[0][1]<86: stat['none']+=1; continue
  if len(m)>1 and m[1][1]>=m[0][1]-2 and g.k.iloc[m[1][2]]!=g.k.iloc[m[0][2]]: stat['amb']+=1; continue
  r=g.iloc[m[0][2]]
  res[k]=[r.vilname,round(float(r.Lat),5),round(float(r.Long),5),int(r.t_pop2011),r.sdtname,round(m[0][1])]
  stat['ok']+=1
json.dump(res,open(os.path.join(TMP,'placed.json'),'w'),ensure_ascii=False)
print(stat)

v=json.load(open(os.path.join(TMP,'vill.json'))); pl=json.load(open(os.path.join(TMP,'placed.json')))
R=['2024','2023','2017','2012','2007','2003','2002']; rows=[]; seen=set()
for k,(nm,lat,lon,pop,sdt,sc) in pl.items():
  o=v[k]; r=o['r']; vals=[(r.get(y) or [None])[0] for y in R]
  if (lat,lon) in seen or not any(vals): continue
  seen.add((lat,lon)); ag=(r.get('2024') or [None,0,None])[2]
  rows.append([nm,o['n'],o['sro'],o['d'],lat,lon]+[(round(x) if x and x>=10 else (round(x,1) if x else None)) for x in vals]+[round(ag) if ag else None])
hdr=open(os.path.join(HERE,'..','data','tn_gv_history.js')).read().split('window.BL_TN_GV')[0] if os.path.exists(os.path.join(HERE,'..','data','tn_gv_history.js')) else ''
open(os.path.join(HERE,'..','data','tn_gv_history.js'),'w').write(hdr+"window.BL_TN_GV="+json.dumps({'rev':R,'rows':rows},ensure_ascii=False,separators=(',',':'))+";\n")
print(len(rows),'villages written')
