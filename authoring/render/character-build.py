"""One character file from a Quaternius outfit and a base body's head (both on the Studio's 65-joint skeleton; docs/OWNED_SCENE_PLAN.md,
part 4). The outfit packs come without heads (their readme: use the Universal Base Character's head), so the base body is cut to its
head and neck (vertices whose strongest weight is Head or neck_01), kept with its eyes and eyebrows, and bound to the outfit's
skeleton. Textures are scaled down (4096 in the pack) and written as JPEG inside one GLB.
  blender -b -P authoring/render/character-build.py -- OUTFIT.gltf BASE.glb OUT.glb [--texture 1024] [--skin '#c9a184']"""
import bpy,bmesh,sys,os,json
argv=sys.argv[sys.argv.index('--')+1:];outfit,base,out=map(os.path.abspath,argv[:3]);opt=lambda k,d:argv[argv.index(k)+1] if k in argv else d
size=int(opt('--texture','1024'));skin=opt('--skin','#c9a184')
bpy.ops.wm.read_factory_settings(use_empty=True)
def imp(p):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=p);return [o for o in bpy.data.objects if o not in before]
A=imp(outfit);arm=next(o for o in A if o.type=='ARMATURE')
B=imp(base);barm=next(o for o in B if o.type=='ARMATURE')
lin=lambda h:tuple(((int(h[k:k+2],16)/255+.055)/1.055)**2.4 for k in (1,3,5))
sk=bpy.data.materials.new('Skin');sk.use_nodes=True;p=sk.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*lin(skin),1);p.inputs['Roughness'].default_value=.55
eye=bpy.data.materials.new('Eyes');eye.use_nodes=True;eye.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.02,.02,.025,1)
head=[]
for o in B:
    if o.type!='MESH':continue
    if len(o.data.vertices)>3000:  # the body: the head and neck only, the outfit covers the rest
        keep={o.vertex_groups[n].index for n in ('Head','neck_01') if n in o.vertex_groups}
        bm=bmesh.new();bm.from_mesh(o.data);dl=bm.verts.layers.deform.active
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v[dl] or max(v[dl].items(),key=lambda x:x[1])[0] not in keep],context='VERTS');bm.to_mesh(o.data);bm.free()
        o.data.materials.clear();o.data.materials.append(sk);o.name='Head'
    else:o.data.materials.clear();o.data.materials.append(eye if 'eye' in o.name.lower() and 'brow' not in o.name.lower() else sk)
    mw=o.matrix_world.copy();o.parent=arm;o.matrix_world=mw
    for m in o.modifiers:
        if m.type=='ARMATURE':m.object=arm
    head.append(o.name)
for o in B:
    if o.type!='MESH' and o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
for im in bpy.data.images:
    if im.size[0]>size:im.scale(size,size)
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_image_format='JPEG',export_animations=False,export_skins=True,export_yup=True)
print('CHARACTER-BUILD',json.dumps(dict(out=out,bytes=os.path.getsize(out),meshes=[o.name for o in bpy.data.objects if o.type=='MESH'],head=head,bones=len(arm.data.bones))))
