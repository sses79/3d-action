"""Mixamo animations onto the Studio skeleton (docs/OWNED_SCENE_PLAN.md: moves the source footage lacks, such as walking to a chair
or opening a door). Both rest in a T-pose, so each mapped bone takes the Mixamo bone's turn away from its rest, in world space:
R_studio(t) = R_mixamo(t) R_mixamo(rest)^-1 R_studio(rest); the hips' travel is scaled by the ratio of the hip heights. Bones Mixamo
lacks (leaf joints, the root) stay at rest. Writes one GLB per clip (the Studio mannequin with that animation, sampled every frame),
which authoring/render/mixamo-register.py turns into library movements. The Mixamo files are not ours to publish: keep them in
.authoring/, never in the repo.
  blender -b -P authoring/render/mixamo-retarget.py -- editor/assets/character.glb OUTDIR CLIP.fbx [CLIP.fbx ...]"""
import bpy,sys,os,json
from mathutils import Matrix
argv=sys.argv[sys.argv.index('--')+1:];target,outdir,clips=os.path.abspath(argv[0]),os.path.abspath(argv[1]),[os.path.abspath(f) for f in argv[2:]];os.makedirs(outdir,exist_ok=True)
MAP={'Hips':'pelvis','Spine':'spine_01','Spine1':'spine_02','Spine2':'spine_03','Neck':'neck_01','Head':'Head'}
for side,s in (('Left','l'),('Right','r')):
    MAP.update({f'{side}Shoulder':f'clavicle_{s}',f'{side}Arm':f'upperarm_{s}',f'{side}ForeArm':f'lowerarm_{s}',f'{side}Hand':f'hand_{s}',f'{side}UpLeg':f'thigh_{s}',f'{side}Leg':f'calf_{s}',f'{side}Foot':f'foot_{s}',f'{side}ToeBase':f'ball_{s}'})
    for f in ('Thumb','Index','Middle','Ring','Pinky'):
        for k in (1,2,3):MAP[f'{side}Hand{f}{k}']=f'{f.lower()}_0{k}_{s}'
done=[]
for clip in clips:
    bpy.ops.wm.read_factory_settings(use_empty=True);sc=bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=target);A=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    bpy.ops.import_scene.fbx(filepath=clip);M=next(o for o in bpy.data.objects if o.type=='ARMATURE' and o!=A);act=M.animation_data.action;f0,f1=map(int,act.frame_range)
    sc.render.fps=30;pre=next((b.name.split(':')[0]+':' for b in M.data.bones if ':' in b.name),'')
    pairs=[(pre+m,a) for m,a in MAP.items() if pre+m in M.data.bones and a in A.data.bones]
    rest=lambda o,b:(o.matrix_world@o.data.bones[b].matrix_local).to_quaternion()
    off={a:rest(M,m).inverted() for m,a in pairs};arest={a:rest(A,a) for _,a in pairs}
    hm,ha=(M.matrix_world@M.data.bones[pre+'Hips'].head_local),(A.matrix_world@A.data.bones['pelvis'].head_local);k=ha.z/hm.z
    order=[b.name for b in A.data.bones];pairs.sort(key=lambda p:order.index(p[1]))
    A.animation_data_create();A.animation_data.action=bpy.data.actions.new(os.path.splitext(os.path.basename(clip))[0])
    for f in range(f0,f1+1):
        sc.frame_set(f)
        for m,a in pairs:
            pm=M.matrix_world@M.pose.bones[m].matrix;q=pm.to_quaternion()@off[a]@arest[a];pb=A.pose.bones[a]
            loc=(ha+(pm.translation-hm)*k) if a=='pelvis' else (A.matrix_world@pb.matrix).translation
            pb.matrix=A.matrix_world.inverted()@Matrix.LocRotScale(loc,q,None);bpy.context.view_layer.update()
            pb.keyframe_insert('rotation_quaternion',frame=f-f0+1)
            if a=='pelvis':pb.keyframe_insert('location',frame=f-f0+1)
    bpy.data.objects.remove(M,do_unlink=True);sc.frame_start,sc.frame_end=1,f1-f0+1
    out=os.path.join(outdir,os.path.splitext(os.path.basename(clip))[0].lower().replace('_','-')+'.glb')
    bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_step=1,export_force_sampling=True,export_yup=True)
    done.append(dict(clip=os.path.basename(clip),out=out,frames=f1-f0+1,bones=len(pairs),hipScale=round(k,3)))
print('MIXAMO-RETARGET',json.dumps(done))
