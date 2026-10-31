"""Poses between the Studio skeleton and ARDY's SOMA skeleton (30 joints), in Blender. Both rest in a T-pose facing +Z (glTF axes,
y up, left +x), so a pose is each mapped bone's world turn away from its rest, G = R(t) R(rest)^-1, the same idea as
mixamo-retarget.py. authoring/render/ardy-join.py runs it.
  poses:    blender -b -P ardy-blender.py -- poses OUT.json CLIP.glb:FRAME [CLIP.glb:FRAME ...]   (FRAME from 0, 30 a second; -1 the last)
            writes per pose {G: {soma joint: 3x3}, hips: [x,y,z]} plus the Studio leg length
  retarget: blender -b -P ardy-blender.py -- retarget editor/assets/character.glb MOTION.json OUT.glb
            MOTION.json {fps, G: [frames][soma joints][3x3], hips: [frames][3], ankles?: [frames][2][3], scale}: the Studio mannequin playing it, every frame"""
import bpy,sys,json
from mathutils import Matrix
argv=sys.argv[sys.argv.index('--')+1:];mode=argv[0]
MAP={'Hips':'pelvis','Spine1':'spine_01','Spine2':'spine_02','Chest':'spine_03','Neck1':'neck_01','Head':'Head'}
for side,s in (('Left','l'),('Right','r')):MAP.update({f'{side}Shoulder':f'clavicle_{s}',f'{side}Arm':f'upperarm_{s}',f'{side}ForeArm':f'lowerarm_{s}',f'{side}Hand':f'hand_{s}',f'{side}Leg':f'thigh_{s}',f'{side}Shin':f'calf_{s}',f'{side}Foot':f'foot_{s}',f'{side}ToeBase':f'ball_{s}'})
C=Matrix(((1,0,0),(0,0,1),(0,-1,0)))  # Blender (z up) to glTF/ARDY (y up)
def load(p):
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=p);return next(o for o in bpy.data.objects if o.type=='ARMATURE')
rest=lambda A,b:(A.matrix_world@A.data.bones[b].matrix_local).to_3x3()
leg=lambda A:sum((A.matrix_world@A.data.bones[a].head_local-A.matrix_world@A.data.bones[b].head_local).length for a,b in (('thigh_l','calf_l'),('calf_l','foot_l')))
if mode=='poses':
    out=dict(leg=None,poses=[])
    for spec in argv[2:]:
        path,frame=spec.rsplit(':',1);A=load(path);out['leg']=leg(A);act=A.animation_data.action;f0,f1=map(int,act.frame_range);bpy.context.scene.frame_set(f0+int(frame) if int(frame)>=0 else f1+1+int(frame))
        G={s:[list(r) for r in C@((A.matrix_world@A.pose.bones[a].matrix).to_3x3()@rest(A,a).inverted())@C.transposed()] for s,a in MAP.items()}
        out['poses'].append(dict(clip=path,frame=int(frame),G=G,hips=list(C@(A.matrix_world@A.pose.bones['pelvis'].matrix).translation)))
    json.dump(out,open(argv[1],'w'))
else:
    target,motion,outp=argv[1:4];M=json.load(open(motion));A=load(target)
    for a in list(bpy.data.actions):bpy.data.actions.remove(a)
    sc=bpy.context.scene;order=[b.name for b in A.data.bones];pairs=sorted(MAP.items(),key=lambda p:order.index(p[1]));R={a:rest(A,a) for _,a in pairs}
    A.animation_data_create();A.animation_data.action=bpy.data.actions.new('ardy');Ci=C.transposed();names=M['joints']
    for f,(Gs,h) in enumerate(zip(M['G'],M['hips'])):
        sc.frame_set(f+1)
        for s,a in pairs:
            G=Ci@Matrix(Gs[names.index(s)])@C;pb=A.pose.bones[a];loc=Ci@Matrix.Translation([x*M['scale'] for x in h]).translation if a=='pelvis' else (A.matrix_world@pb.matrix).translation
            pb.matrix=A.matrix_world.inverted()@Matrix.LocRotScale(loc,(G@R[a]).to_quaternion(),None);bpy.context.view_layer.update()
        if M.get('ankles'):  # rotations alone put a planted foot elsewhere on a body of other proportions (hip width, leg and foot length): each leg is solved hip-knee-ankle to ARDY's ankle along the floor (scaled; the height stays the Studio body's own), in the plane of its own knee, and the foot turned back to ARDY's turn
            for i,s in enumerate('lr'):
                W=lambda b:A.matrix_world@A.pose.bones[b].head;H,K0,A0=W('thigh_'+s),W('calf_'+s),W('foot_'+s);t=Ci@Matrix.Translation([x*M['scale'] for x in M['ankles'][f][i]]).translation;t.z=A0.z;a_,b_=(K0-H).length,(A0-K0).length;d=max(abs(a_-b_)+1e-4,min((t-H).length,a_+b_-1e-4));t=H+(t-H).normalized()*d
                n=(K0-H)-(K0-H).project(A0-H);n=n.normalized() if n.length>1e-6 else (A0-H).orthogonal().normalized();u=(t-H).normalized();n=(n-n.project(u)).normalized();c=(a_*a_+d*d-b_*b_)/(2*a_*d);K=H+u*(a_*c)+n*(a_*max(0,1-c*c)**.5)
                for bone,fr,to in (('thigh_'+s,K0-H,K-H),('calf_'+s,None,None)):
                    pb=A.pose.bones[bone];w=A.matrix_world@pb.matrix
                    if bone.startswith('calf'):fr,to=W('foot_'+s)-W('calf_'+s),t-W('calf_'+s)
                    q=fr.rotation_difference(to).to_matrix();pb.matrix=A.matrix_world.inverted()@Matrix.LocRotScale(w.translation,q@w.to_3x3(),None);bpy.context.view_layer.update()
                for bone in ('foot_'+s,'ball_'+s):
                    pb=A.pose.bones[bone];G=Ci@Matrix(Gs[names.index(('Left' if s=='l' else 'Right')+('Foot' if bone[0]=='f' else 'ToeBase'))])@C;pb.matrix=A.matrix_world.inverted()@Matrix.LocRotScale((A.matrix_world@pb.matrix).translation,(G@R[bone]).to_quaternion(),None);bpy.context.view_layer.update()
        for s,a in pairs:
            pb=A.pose.bones[a];pb.keyframe_insert('rotation_quaternion',frame=f+1)
            if a=='pelvis':pb.keyframe_insert('location',frame=f+1)
    sc.frame_start,sc.frame_end=1,len(M['G'])
    bpy.ops.export_scene.gltf(filepath=outp,export_format='GLB',export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_step=1,export_force_sampling=True,export_yup=True)
    print('ARDY-RETARGET',json.dumps(dict(out=outp,frames=len(M['G']),leg=leg(A))))
