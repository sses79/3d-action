"""The check sheet for a depth scene (build_depth_scene): at each keyframe the source, the tinted depth and the 3D scene side by side,
then per shot a strip of five moments with the source above the scene, since an action between keyframes (someone sitting down
in the first second of a wide shot) shows on no keyframe.
  .authoring/vision-venv/bin/python authoring/render/depth-scene-check.py LAYOUT.json SCENE.mp4 OUT.jpg"""
import sys,json,os,subprocess,numpy as np,cv2
L=json.load(open(sys.argv[1]));S=json.load(open(L['spec']));clay=sys.argv[2];out=sys.argv[3];root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
tint=S['depth'] if os.path.isabs(S['depth']) else os.path.join(root,S['depth'])
def grab(v,t,w=640,h=360):
 r=subprocess.run(['ffmpeg','-v','error','-ss',f'{max(0,t):.3f}','-i',v,'-frames:v','1','-f','rawvideo','-pix_fmt','bgr24','-s',f'{w}x{h}','-'],capture_output=True)
 return np.frombuffer(r.stdout,np.uint8).reshape(h,w,3).copy() if len(r.stdout)==w*h*3 else np.zeros((h,w,3),np.uint8)
def label(im,s,size=.7):cv2.putText(im,s,(8,24 if size>.6 else 16),0,size,(0,0,0),4);cv2.putText(im,s,(8,24 if size>.6 else 16),0,size,(255,255,255),2);return im
rows=[]
for kf in S['keyframes']:
 rows.append(np.hstack([label(grab(S['video'],S['start']+kf['time']),f'{kf["time"]:.2f}s shot {kf["shot"]}  source'),label(grab(tint,kf['time']),'tinted depth'),label(grab(clay,kf['time']),'3D scene')]))
for sh in S['shots']:  # five moments a shot, source over scene
 ts=np.linspace(sh['start']+.05,sh['end']-.08,5);top=[label(grab(S['video'],S['start']+t,384,216),f'shot {sh["index"]} {t:.1f}s',.5) for t in ts];bot=[grab(clay,t,384,216) for t in ts]
 rows.append(np.vstack([np.hstack(top),np.hstack(bot)]))
cv2.imwrite(out,np.vstack(rows),[cv2.IMWRITE_JPEG_QUALITY,82]);print(json.dumps(dict(sheet=out,keyframes=len(S['keyframes']),shots=len(S['shots']))))
