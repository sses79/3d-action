import json,struct,math,bisect
b=open('editor/source/ual2/UAL2_Standard.glb','rb').read();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=b[28+n:]
def accessor(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];count={'SCALAR':1,'VEC3':3,'VEC4':4}[a['type']];assert a['componentType']==5126
 off=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',count*4)
 return [struct.unpack_from('<'+'f'*count,binary,off+j*stride) for j in range(a['count'])]
bones=['pelvis','spine_01','spine_02','spine_03','Head','upperarm_l','lowerarm_l','upperarm_r','lowerarm_r','thigh_l','calf_l','thigh_r','calf_r']
clips={}
for a in g['animations']:
 if not a['name'].startswith('Sword_'):continue
 tracks={}
 for c in a['channels']:
  node=g['nodes'][c['target']['node']]['name']
  if c['target']['path']!='rotation' or node not in bones:continue
  s=a['samplers'][c['sampler']];tracks[node]=([v[0] for v in accessor(s['input'])],accessor(s['output']))
 clips[a['name']]=tracks

def sample(track,t):
 times,values=track;i=max(0,min(len(times)-2,bisect.bisect_right(times,t)-1));u=max(0,min(1,(t-times[i])/(times[i+1]-times[i]))) if len(times)>1 else 0
 p=values[i];q=values[min(i+1,len(values)-1)];dot=sum(x*y for x,y in zip(p,q));q=tuple(-v for v in q) if dot<0 else q;dot=abs(dot)
 if dot>.9995:r=[x*(1-u)+y*u for x,y in zip(p,q)]
 else:
  angle=math.acos(min(1,dot));r=[(x*math.sin((1-u)*angle)+y*math.sin(u*angle))/math.sin(angle) for x,y in zip(p,q)]
 norm=math.sqrt(sum(v*v for v in r));return [v/norm for v in r]
combo=clips['Sword_Regular_Combo'];duration=max(t[0][-1] for t in combo.values());out=[]
for name in ['Sword_Regular_A','Sword_Regular_B','Sword_Regular_C']:
 source=clips[name];length=max(t[0][-1] for t in source.values());best=(999,None)
 for k in range(round((duration-length)*60)+1):
  offset=k/60;ss=0;cnt=0
  for j in range(round(length*30)+1):
   t=min(j/30,length)
   for bone in bones:
    p=sample(source[bone],t);q=sample(combo[bone],t+offset);angle=2*math.acos(min(1,abs(sum(x*y for x,y in zip(p,q)))));ss+=angle*angle;cnt+=1
  rms=math.degrees(math.sqrt(ss/cnt))
  if rms<best[0]:best=(rms,offset)
 out.append({'source':name,'duration':length,'bestComboOffsetSeconds':best[1],'localRotationRmsDegrees':best[0]})
result={'comparison':'13 local joint rotations; uniformly sampled source at 30 Hz; search combo start offsets at 60 Hz; fixed duration/no retiming. Similarity is not source-authoring provenance.','regularComboMatches':out}
print(json.dumps(result,indent=2));json.dump(result,open('/private/tmp/ual2-combo-analysis.json','w'),indent=2)
