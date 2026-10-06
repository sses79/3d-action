"""Run with Blender --background --python watch/prepare_blender.py.
Creates a packed, editable Blender scene and the GLB used by the browser.
"""
import bpy
from pathlib import Path
from mathutils import Vector
BASE=Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(BASE/'assets/watch-interactive.gltf'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
face=bpy.data.objects.get('custom_face')
assert face is not None
used={i for p in face.data.polygons for i in p.vertices}
points=sorted(set((face.data.vertices[i].co.x,face.data.vertices[i].co.y) for i in used))
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
lower=[];upper=[]
for p in points:
 while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
 lower.append(p)
for p in reversed(points):
 while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
 upper.append(p)
hull=lower[:-1]+upper[:-1]
mesh=bpy.data.meshes.new('Face / live display surface');mesh.from_pydata([(x,y,.00604) for x,y in hull],[],[list(range(len(hull)))]);mesh.update();face.data=mesh
uv=mesh.uv_layers.new(name='Face UV')
for loop in mesh.loops:
 v=mesh.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((v.x+.014586148)/.029172296,(v.y+.013611153)/.027222306)
mat=bpy.data.materials.new('Live face / replaced by browser canvas');mat.diffuse_color=(.015,.025,.02,1);mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.015,.025,.02,1);face.data.materials.clear();face.data.materials.append(mat)
for o in objects:
 o['source']='Adrian C / Poly Haven / CC0';o['asset_url']='https://polyhaven.com/a/digital_wrist_watch'
 if o.name.startswith('button_'):
  o['action']=o.name[7:]
# Export just the interactive model, before adding the optional Blender studio.
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=face
bpy.ops.export_scene.gltf(filepath=str(BASE/'assets/watch.glb'),export_format='GLB',use_selection=True,export_extras=True)
# Studio is useful when opening the source; it is excluded from the GLB.
for loc,power,size in [((-.08,-.05,.18),6,.12),((.08,.02,.12),4,.08)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(Vector((0,0,0))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.025,-.03,.36));camera=bpy.context.object;camera.rotation_euler=(Vector((0,-.02,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=45;bpy.context.scene.camera=camera
bpy.context.scene.render.engine='CYCLES';bpy.context.scene.cycles.samples=32
bpy.context.scene.render.resolution_x=800;bpy.context.scene.render.resolution_y=1000;bpy.context.scene.render.resolution_percentage=100
bpy.context.scene.world=bpy.data.worlds.new('Studio');bpy.context.scene.world.use_nodes=True;bpy.context.scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.16,.18,.15,1)
notes=bpy.data.texts.new('START HERE');notes.write('SECOND watch lab\nSource: Adrian C / Poly Haven, CC0.\nButtons are separate objects; their action property matches the browser.\nThe custom_face UV is a complete face atlas. Three.js supplies the live canvas texture.\nEdit geometry here, select the model meshes, export GLB to assets/watch.glb.\nStudio lights and camera are for Blender only.\n')
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/second-watch.blend'))
print('WATCH_EXPORT_OK',len(objects),'mesh objects', (BASE/'assets/watch.glb').stat().st_size,'bytes')
