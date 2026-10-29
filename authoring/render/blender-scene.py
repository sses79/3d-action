"""Render a scene GLB from scene-gltf.mjs in Blender: a plain clay video, a depth video and a tinted depth video (each person
one colour, exact from the renderer, no detection; props yellow; the room and floor grey depth). Run:
  blender -b -P authoring/render/blender-scene.py -- SCENE.glb OUTDIR [--passes clay,depth,tint] [--samples 16] [--frames A-B] [--grey] [--blend FILE.blend]
SCENE.json beside the GLB gives the lens per frame and the picture size. Depth is inverse distance like the clay view's: white at
a little nearer than the performers come, black from 40 m. Writes OUTDIR/<pass>.mp4 (ffmpeg) and OUTDIR/<pass>-first.png.
With --blend: no render, the scene is saved as a .blend with the clay look (lit, the pair's colours) to open and adjust by hand."""
import bpy,sys,os,json,math,subprocess,shutil
argv=sys.argv[sys.argv.index('--')+1:];glb,outdir=os.path.abspath(argv[0]),os.path.abspath(argv[1]);opt=lambda k,d:argv[argv.index(k)+1] if k in argv else d
passes=opt('--passes','clay,depth,tint').split(',');samples=int(opt('--samples','16'));meta=json.load(open(os.path.splitext(glb)[0]+'.json'));os.makedirs(outdir,exist_ok=True)
COLORS=[(0.12,0.35,1.0),(1.0,0.45,0.08),(0.15,0.8,0.25),(0.9,0.15,0.6),(0.95,0.85,0.1),(0.1,0.85,0.9)]  # blue, orange, green, pink, yellow, cyan: the depth library's order
lin=lambda h:tuple(((int(h[k:k+2],16)/255+.055)/1.055)**2.4 if int(h[k:k+2],16)/255>.04045 else int(h[k:k+2],16)/255/12.92 for k in (1,3,5))
FIG=[lin(c) if c else None for c in meta.get('colors',[])]  # the pair's own figure colours (sRGB hex from the clay view), else COLORS
col=lambda i:FIG[i] if i<len(FIG) and FIG[i] else COLORS[i%len(COLORS)];plain='--grey' in argv  # --grey: grey figures in the clay pass
bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene;sc.render.fps=meta['fps']  # before the import: glTF keys (seconds) are placed at the scene's rate
bpy.ops.import_scene.gltf(filepath=glb)
cam=next(o for o in sc.objects if o.type=='CAMERA');sc.camera=cam;cam.data.sensor_fit='VERTICAL';cam.data.clip_start=.1;cam.data.clip_end=200
n,fps=meta['frames'],meta['fps'];sc.render.fps=fps;sc.frame_start=1;sc.frame_end=n;sc.render.resolution_x,sc.render.resolution_y=meta['width'],meta['height'];sc.render.resolution_percentage=100
if '--frames' in argv:sc.frame_start,sc.frame_end=map(int,opt('--frames','').split('-'))  # a part only (1-based frames), for trying light on stills
for k,f in enumerate(meta['fovVertical']):cam.data.angle_y=math.radians(f);cam.data.keyframe_insert('lens',frame=k+1)
# glTF animations may land as separate actions per object: make each object's own one active
for o in sc.objects:
    ad=o.animation_data
    if ad and not ad.action and ad.nla_tracks:
        for t in ad.nla_tracks:
            if t.strips:ad.action=t.strips[0].action;break
people,props,room={},[],[]  # meshes by what they are: performer i (under a P<i>_ node), prop_<name>, the rest (room_<name>, floor)
for o in sc.objects:
    if o.type=='MESH':
        p=o;i=None
        while p is not None:
            if p.name[:1]=='P' and '_' in p.name and p.name[1:p.name.index('_')].isdigit():i=int(p.name[1:p.name.index('_')])
            p=p.parent
        if i is not None:people.setdefault(i,[]).append(o)
        elif o.name.startswith('prop_'):props.append(o)
        else:room.append(o)
if not any(o.name.startswith('floor') for o in room):bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));bpy.context.object.name='floor';room.append(bpy.context.object)
for o in room:o.visible_shadow=False  # walls cast no shadow (a side wall darkened half of a shot); people and props still do
# where the performers come nearest the camera (pelvis), for the depth range: white at 0.6 of it, as in the clay view
from mathutils import Vector
arms=[o for o in sc.objects if o.type=='ARMATURE'];near=1e9
for k in range(1,n+1,max(1,n//40)):
    sc.frame_set(k);cp=cam.matrix_world.translation
    for a in arms:
        b=next((b for b in a.pose.bones if b.name.endswith('pelvis')),None)
        if b:near=min(near,(a.matrix_world@b.head-cp).length)
    if not arms:  # plain-shape figures have no skeleton: the nearest of their parts (each a capsule or sphere) instead
        for objs in people.values():
            for o in objs:near=min(near,(o.matrix_world@(sum((Vector(c) for c in o.bound_box),Vector())/8)-cp).length)
near=max(.5,round(near*.6,1));far=40.0
def mat(name,build):
    m=bpy.data.materials.new(name);m.use_nodes=True;nt=m.node_tree;[nt.nodes.remove(x) for x in list(nt.nodes)];out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(build(nt),out.inputs['Surface']);return m
def depth_value(nt):  # inverse distance mapped: 1 at near, 0 at far
    cd=nt.nodes.new('ShaderNodeCameraData');inv=nt.nodes.new('ShaderNodeMath');inv.operation='DIVIDE';inv.inputs[0].default_value=1.0;nt.links.new(cd.outputs['View Distance'],inv.inputs[1])
    mr=nt.nodes.new('ShaderNodeMapRange');mr.clamp=True;mr.inputs['From Min'].default_value=1/far;mr.inputs['From Max'].default_value=1/near;nt.links.new(inv.outputs[0],mr.inputs['Value']);return mr.outputs['Result']
def emit(nt,color_socket=None,color=None,strength=None):
    e=nt.nodes.new('ShaderNodeEmission')
    if color_socket is not None:nt.links.new(color_socket,e.inputs['Color'])
    else:e.inputs['Color'].default_value=(*color,1)
    return e.outputs['Emission']
def clay(nt,color=(.8,.8,.8)):b=nt.nodes.new('ShaderNodeBsdfPrincipled');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Roughness'].default_value=.8;return b.outputs['BSDF']
def grey_depth(nt):d=depth_value(nt);c=nt.nodes.new('ShaderNodeCombineColor');[nt.links.new(d,c.inputs[k]) for k in range(3)];return emit(nt,c.outputs['Color'])
def tinted(color):
    def b(nt):
        d=depth_value(nt);m=nt.nodes.new('ShaderNodeMix');m.data_type='RGBA';m.blend_type='MULTIPLY';m.inputs['Factor'].default_value=1.0
        c=nt.nodes.new('ShaderNodeCombineColor');[nt.links.new(d,c.inputs[k]) for k in range(3)]
        # brighter near, never below 35% so the colour stays readable
        mr=nt.nodes.new('ShaderNodeMapRange');mr.inputs['To Min'].default_value=.35;nt.links.new(d,mr.inputs['Value']);c2=nt.nodes.new('ShaderNodeCombineColor');[nt.links.new(mr.outputs['Result'],c2.inputs[k]) for k in range(3)]
        nt.links.new(c2.outputs['Color'],m.inputs[6]);m.inputs[7].default_value=(*color,1);return emit(nt,m.outputs[2])
    return b
def assign(o,m):o.data.materials.clear();o.data.materials.append(m)
world=bpy.data.worlds.new('w');sc.world=world;world.use_nodes=True;bg=world.node_tree.nodes['Background']
def render(name,mats,engine,bgcol,standard):
    for i,objs in people.items():
        for o in objs:assign(o,mats[i])
    for o in room:assign(o,mats['room'])
    for o in props:assign(o,mats['prop'])
    sc.render.engine=engine;bg.inputs['Color'].default_value=(*bgcol,1);bg.inputs['Strength'].default_value=1.0
    sc.view_settings.view_transform='Standard' if standard else 'AgX'
    if engine=='BLENDER_EEVEE':sc.eevee.taa_render_samples=samples
    frames=os.path.join(outdir,name+'-frames');shutil.rmtree(frames,ignore_errors=True);os.makedirs(frames);sc.render.filepath=os.path.join(frames,'f');sc.render.image_settings.file_format='PNG'
    bpy.ops.render.render(animation=True)
    first=sorted(os.listdir(frames))[0];shutil.copy(os.path.join(frames,first),os.path.join(outdir,name+'-first.png'))
    subprocess.run(['ffmpeg','-v','error','-y','-framerate',str(fps),'-start_number',str(sc.frame_start),'-i',os.path.join(frames,'f%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','16',os.path.join(outdir,name+'.mp4')],check=True);shutil.rmtree(frames)
if '--blend' in argv:  # set up for opening in Blender: clay materials, the sun, the camera looking through; saved, not rendered
    sun=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN'));sun.data.energy=4.5;sun.data.angle=math.radians(20);sun.rotation_euler=(math.radians(35),0,math.radians(-25));sc.collection.objects.link(sun)
    for i,objs in people.items():
        m=mat(f'clay{i}',lambda nt,i=i:clay(nt,col(i)))
        for o in objs:assign(o,m)
    m=mat('roomclay',lambda nt:clay(nt,(.35,.35,.35)));[assign(o,m) for o in room];m=mat('propclay',lambda nt:clay(nt,COLORS[4]));[assign(o,m) for o in props]
    sc.render.engine='BLENDER_EEVEE';bg.inputs['Color'].default_value=(.3,.3,.3,1);sc.frame_set(sc.frame_start);f=os.path.abspath(opt('--blend',''));bpy.ops.wm.save_as_mainfile(filepath=f)
    print('BLENDER-SCENE',json.dumps(dict(blend=f,frames=n,fps=fps,people=len(people),props=len(props),room=len(room))));sys.exit(0)
import time;t0=time.time();took={}
if 'clay' in passes:
    sun=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN'));sun.data.energy=4.5;sun.data.angle=math.radians(20);sun.rotation_euler=(math.radians(35),0,math.radians(-25));sc.collection.objects.link(sun)  # soft and from the camera's side: a low one from the side threw a wall's hard shadow across the daggers scene
    render('clay',{**{i:mat(f'clay{i}',lambda nt,i=i:clay(nt,(.6,.6,.6) if plain else col(i))) for i in people},'room':mat('roomclay',lambda nt:clay(nt,(.35,.35,.35))),'prop':mat('propclay',lambda nt:clay(nt,COLORS[4]))},'BLENDER_EEVEE',(.3,.3,.3),False);took['clay']=round(time.time()-t0,1)
    sun.hide_render=True
if 'depth' in passes:
    t=time.time();g=mat('depth',grey_depth);render('depth',{**{i:g for i in people},'room':g,'prop':g},'BLENDER_EEVEE',(0,0,0),True);took['depth']=round(time.time()-t,1)
if 'tint' in passes:
    t=time.time();render('tint',{**{i:mat(f'tint{i}',tinted(col(i))) for i in people},'room':mat('depthf',grey_depth),'prop':mat('tintprop',tinted(COLORS[4]))},'BLENDER_EEVEE',(0,0,0),True);took['tint']=round(time.time()-t,1)
print('BLENDER-SCENE',json.dumps(dict(outdir=outdir,frames=n,fps=fps,people=len(people),props=len(props),room=len(room),depth=dict(nearMeters=near,farMeters=far),seconds=took)))
