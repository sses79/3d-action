"""One character file from a Quaternius outfit and a base body's head (both on the Studio's 65-joint skeleton; docs/OWNED_SCENE_PLAN.md,
part 4). The outfit packs come without heads (their readme: use the Universal Base Character's head), so the base body is cut to its
head and neck (vertices whose strongest weight is Head or neck_01), kept with its eyes and eyebrows, and bound to the outfit's
skeleton. Textures are scaled down (4096 in the pack) and written as JPEG inside one GLB.
  blender -b -P authoring/render/character-build.py -- OUTFIT.gltf BASE.gltf OUT.glb [--hair HAIR.gltf,HAIR.gltf] [--hair-color '#4a2e1f'] [--texture 1024] [--skin '#c9a184']
BASE is best the Universal Base Characters' textured body (Superhero_*_FullBody.gltf: skin and eye textures kept); an untextured one
gets a plain skin colour. --hair: hair, beard or eyebrow pieces from that kit's Hairstyles/Rigged to Head Bone (skinned to the same
skeleton), bound like the head; their texture is grey, so --hair-color tints it (the glTF base colour factor)."""
import bpy,bmesh,sys,os,json
argv=sys.argv[sys.argv.index('--')+1:];outfit,base,out=map(os.path.abspath,argv[:3]);opt=lambda k,d:argv[argv.index(k)+1] if k in argv else d
size=int(opt('--texture','1024'));skin=opt('--skin','#c9a184');hair=[os.path.abspath(h) for h in opt('--hair','').split(',') if h]
bpy.ops.wm.read_factory_settings(use_empty=True)
def imp(p):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=p);return [o for o in bpy.data.objects if o not in before]
A=imp(outfit);arm=next(o for o in A if o.type=='ARMATURE')
B=imp(base);barm=next(o for o in B if o.type=='ARMATURE');body=set(B)
for h in hair:B+=imp(h)
lin=lambda h:tuple(((int(h[k:k+2],16)/255+.055)/1.055)**2.4 for k in (1,3,5))
sk=bpy.data.materials.new('Skin');sk.use_nodes=True;p=sk.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*lin(skin),1);p.inputs['Roughness'].default_value=.55
eye=bpy.data.materials.new('Eyes');eye.use_nodes=True;eye.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.02,.02,.025,1)
head=[]
for o in B:
    if o.type!='MESH':continue
    if o in body and len(o.data.vertices)>3000:  # the body: the head and neck only, the outfit covers the rest
        keep={o.vertex_groups[n].index for n in ('Head','neck_01') if n in o.vertex_groups}
        bm=bmesh.new();bm.from_mesh(o.data);dl=bm.verts.layers.deform.active
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v[dl] or max(v[dl].items(),key=lambda x:x[1])[0] not in keep],context='VERTS');bm.to_mesh(o.data);bm.free()
        if not any(m and m.node_tree and any(n.type=='TEX_IMAGE' for n in m.node_tree.nodes) for m in o.data.materials):o.data.materials.clear();o.data.materials.append(sk)
        o.name='Head'
    elif not any(m and m.node_tree and any(n.type=='TEX_IMAGE' for n in m.node_tree.nodes) for m in o.data.materials) and not o.name.lower().startswith(('hair','plane')):o.data.materials.clear();o.data.materials.append(eye if 'eye' in o.name.lower() and 'brow' not in o.name.lower() else sk)  # untextured head parts: plain skin, dark eyes
    mw=o.matrix_world.copy();o.parent=arm;o.matrix_world=mw
    for m in o.modifiers:
        if m.type=='ARMATURE':m.object=arm
    head.append(o.name)
for o in B:
    if o.type!='MESH' and o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)  # the base's and the hair's own skeletons
hc=opt('--hair-color','')
if hc:  # texture -> multiply by the colour -> base colour: the shape glTF writes as baseColorFactor
    for m in {m for o in bpy.data.objects if o.type=='MESH' and o.name.lower().startswith(('hair','plane','eyebrow')) for m in o.data.materials if m and m.node_tree}:
        nt=m.node_tree;b=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');l=next((l for l in nt.links if l.to_socket==b.inputs['Base Color']),None)
        if not l:b.inputs['Base Color'].default_value=(*lin(hc),1);continue
        mx=nt.nodes.new('ShaderNodeMix');mx.data_type='RGBA';mx.blend_type='MULTIPLY';mx.inputs['Factor'].default_value=1.0;mx.inputs[7].default_value=(*lin(hc),1)
        src=l.from_socket;nt.links.remove(l);nt.links.new(src,mx.inputs[6]);nt.links.new(mx.outputs[2],b.inputs['Base Color'])
for im in bpy.data.images:
    if im.size[0]>size:im.scale(size,size)
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_image_format='JPEG',export_animations=False,export_skins=True,export_yup=True)
print('CHARACTER-BUILD',json.dumps(dict(out=out,bytes=os.path.getsize(out),meshes=[o.name for o in bpy.data.objects if o.type=='MESH'],head=head,bones=len(arm.data.bones))))
