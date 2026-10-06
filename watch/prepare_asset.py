"""Split the CC0 glTF's welded components into editable face and buttons.
Preserves the original geometry, UVs, materials, straps and clasp. No Blender runtime required.
"""
import json, struct, hashlib
from pathlib import Path
from collections import defaultdict
BASE=Path(__file__).parent/'assets'
j=json.loads((BASE/'watch.gltf').read_text()); b=(BASE/'digital_wrist_watch.bin').read_bytes()
def read(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];n={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];f={5126:'f',5123:'H'}[a['componentType']];s=v.get('byteOffset',0)+a.get('byteOffset',0)
 return list(struct.iter_unpack('<'+f*n,b[s:s+a['count']*n*struct.calcsize(f)]))
p=read(0);indices=[x[0] for x in read(3)];parent=list(range(len(p)));welded={}
def root(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
def join(a,c):parent[root(a)]=root(c)
for i,v in enumerate(p):
 key=tuple(round(c,6) for c in v)
 if key in welded:join(i,welded[key])
 else:welded[key]=i
for a,c,d in zip(indices[::3],indices[1::3],indices[2::3]):join(a,c);join(a,d)
groups=defaultdict(list)
for a,c,d in zip(indices[::3],indices[1::3],indices[2::3]):groups[root(a)].extend((a,c,d))
out=bytearray(b); nodes=[]
for ids in groups.values():
 verts=set(ids);mn=[min(p[i][k] for i in verts) for k in range(3)];mx=[max(p[i][k] for i in verts) for k in range(3)];name='case'
 if mx[1]-mn[1]<1e-6 and mn[1]>.005:name='custom_face'
 elif mn[0]<-.017 and mx[0]<-.017:name='button_light' if mn[2]<0 else 'button_mode'
 elif mn[0]>.017:name='button_adjust'
 # The original lower display plane is covered by our complete face.
 elif mx[1]-mn[1]<1e-6 and mn[1]>.004:continue
 while len(out)%4:out.append(0)
 offset=len(out);out.extend(struct.pack('<'+'H'*len(ids),*ids));vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(ids)*2,'target':34963});ai=len(j['accessors']);j['accessors'].append({'bufferView':vi,'componentType':5123,'count':len(ids),'type':'SCALAR'})
 mi=len(j['meshes']);j['meshes'].append({'name':name,'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'TEXCOORD_0':2},'indices':ai,'material':0}]});nodes.append({'mesh':mi,'name':name})
# Keep original bracelet/clasp; replace original case+glass with separated case components.
j['nodes']=nodes+j['nodes'][1:];j['scenes']=[{'name':'CUSTOM WATCH','nodes':list(range(len(j['nodes'])))}];j['scene']=0
j['buffers']=[{'uri':'watch-interactive.bin','byteLength':len(out)}]
j['asset']['extras']={'source':'https://polyhaven.com/a/digital_wrist_watch','author':'Adrian C','license':'CC0-1.0','modifications':'Case components separated; original glass omitted for custom live face.'}
(BASE/'watch-interactive.gltf').write_text(json.dumps(j,separators=(',',':')));(BASE/'watch-interactive.bin').write_bytes(out)
# Verify downloaded files against the published API checksums.
manifest=json.loads((BASE.parent/'source'/'files.json').read_text())['gltf']['1k']['gltf']
for path,entry in [('watch.gltf',manifest),*manifest['include'].items()]:
 assert hashlib.md5((BASE/path).read_bytes()).hexdigest()==entry['md5'],path
print('Prepared',len(nodes),'case components. Source file checksums verified.')
