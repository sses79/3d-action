# Import the two free bodies of Quaternius' Universal Base Characters (Standard edition, CC0) as untextured GLB files.
# python3 authoring/source/import-base-characters.py "<unpacked pack>/Base Characters/Godot - UE" editor/assets/characters
# Geometry, skin and skeleton are kept; images, textures and materials are dropped (the figures are drawn as plain clay).
# The skeleton is the 65 joints of the Studio mannequin, name for name, so every movement plays on them unchanged.
import json,struct,sys,os,hashlib
src,out=sys.argv[1],sys.argv[2];os.makedirs(out,exist_ok=True);made={}
for name,target in (('Superhero_Female_FullBody','superhero-female'),('Superhero_Male_FullBody','superhero-male')):
    g=json.load(open(os.path.join(src,name+'.gltf')));blob=open(os.path.join(src,g['buffers'][0]['uri']),'rb').read()
    for key in ('images','textures','samplers','materials','animations'):g.pop(key,None)
    for mesh in g['meshes']:
        for prim in mesh['primitives']:prim.pop('material',None)
    g['buffers']=[{'byteLength':len(blob)}];g['asset']={**g.get('asset',{}),'copyright':'Quaternius, Universal Base Characters (Standard), CC0 1.0'}
    js=json.dumps(g,separators=(',',':')).encode();js+=b' '*((-len(js))%4);blob+=b'\0'*((-len(blob))%4)
    data=b'glTF'+struct.pack('<II',2,12+8+len(js)+8+len(blob))+struct.pack('<I',len(js))+b'JSON'+js+struct.pack('<I',len(blob))+b'BIN\0'+blob
    open(os.path.join(out,target+'.glb'),'wb').write(data);made[target+'.glb']={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'joints':len(g['skins'][0]['joints']),'from':name+'.gltf'}
json.dump({'source':'https://quaternius.com/packs/universalbasecharacters.html','edition':'Standard (free)','license':'CC0-1.0','files':made},open(os.path.join(out,'provenance.json'),'w'),indent=1);print(json.dumps(made,indent=1))
