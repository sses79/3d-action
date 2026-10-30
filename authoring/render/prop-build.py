"""Set pieces for scenes from a Quaternius prop kit (docs/OWNED_SCENE_PLAN.md, part 5): each glTF written as one GLB with its trim
textures at 512 JPEG, into editor/assets/props/, and editor/assets/props/index.json: per prop its file, size [width, height, depth]
in metres (x, y, z of its own axes; it faces +z) and, for seats, the seat's height (a ray down at the middle).
  blender -b -P authoring/render/prop-build.py -- KIT/Exports/glTF OUTDIR NAME,NAME,... [--source URL] [--seats NAME,NAME]"""
import bpy,sys,os,json
from mathutils import Vector
argv=sys.argv[sys.argv.index('--')+1:];src,outdir,names=os.path.abspath(argv[0]),os.path.abspath(argv[1]),argv[2].split(',');opt=lambda k,d:argv[argv.index(k)+1] if k in argv else d
seats=set(opt('--seats','').split(','));os.makedirs(outdir,exist_ok=True);idx=os.path.join(outdir,'index.json');index=json.load(open(idx)) if os.path.exists(idx) else {'props':{}}
for n in names:
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=os.path.join(src,n+'.gltf'))
    for im in bpy.data.images:
        if im.size[0]>512:im.scale(512,512)
    ms=[o for o in bpy.data.objects if o.type=='MESH'];bpy.context.view_layer.update()
    pts=[o.matrix_world@Vector(c) for o in ms for c in o.bound_box];lo=Vector((min(p.x for p in pts),min(p.y for p in pts),min(p.z for p in pts)));hi=Vector((max(p.x for p in pts),max(p.y for p in pts),max(p.z for p in pts)))
    e={'file':n.lower().replace('_','-')+'.glb','size':[round(hi.x-lo.x,3),round(hi.z-lo.z,3),round(hi.y-lo.y,3)]}  # Blender z up: height is z; glTF depth is Blender -y
    if n in seats:
        dg=bpy.context.evaluated_depsgraph_get();hit=bpy.context.scene.ray_cast(dg,Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,hi.z+1)),Vector((0,0,-1)))
        if hit[0]:e['seat']=round(hit[1].z,3)
    f=os.path.join(outdir,e['file']);bpy.ops.export_scene.gltf(filepath=f,export_format='GLB',export_image_format='JPEG',export_animations=False,export_yup=True);e['bytes']=os.path.getsize(f)
    index['props'][n.lower().replace('_','-')]={**e,'from':n+'.gltf','source':opt('--source',''),'license':'CC0-1.0'}
json.dump(index,open(idx,'w'),indent=1);print('PROP-BUILD',json.dumps(dict(props=len(names),index=idx)))
