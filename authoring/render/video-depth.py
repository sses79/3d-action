# Depth video straight from a video window with Video Depth Anything (no 3D reconstruction).
# .authoring/vision-venv/bin/python authoring/render/video-depth.py VIDEO START END OUT.mp4 [--encoder vits] [--size 518] [--device mps|cpu]
# Needs the code in .authoring/video-depth-anything (github.com/DepthAnything/Video-Depth-Anything) and its checkpoint in
# checkpoints/. Small (vits) is Apache-2.0; Base and Large are CC-BY-NC-4.0. Output: white near, black far, one scale for the
# whole clip (the model gives relative inverse depth, so there are no metres). Runs in the vision venv, borrowing einops and
# tqdm from ComfyUI's venv; easydict is stood in for here, xformers is optional in the model code.
import sys,os,types,glob,subprocess,time,argparse
import numpy as np,cv2,torch
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'));code=os.path.join(root,'.authoring/video-depth-anything')
sys.path.insert(0,code);sys.path+=glob.glob(os.path.join(root,'.authoring/comfyui/.venv/lib/python*/site-packages'))
class EasyDict(dict):
    __getattr__=dict.__getitem__;__setattr__=dict.__setitem__
sys.modules.setdefault('easydict',types.SimpleNamespace(EasyDict=EasyDict))
from video_depth_anything.video_depth import VideoDepthAnything
p=argparse.ArgumentParser();p.add_argument('video');p.add_argument('start',type=float);p.add_argument('end',type=float);p.add_argument('out');p.add_argument('--encoder',default='vits');p.add_argument('--size',type=int,default=518);p.add_argument('--device',default='mps' if torch.backends.mps.is_available() else 'cpu');a=p.parse_args()
cap=cv2.VideoCapture(a.video);fps=cap.get(cv2.CAP_PROP_FPS);cap.set(cv2.CAP_PROP_POS_FRAMES,round(a.start*fps));frames=[]
for _ in range(round((a.end-a.start)*fps)+1):
    ok,im=cap.read()
    if not ok:break
    frames.append(cv2.cvtColor(im,cv2.COLOR_BGR2RGB))
frames=np.stack(frames);cfg={'vits':dict(encoder='vits',features=64,out_channels=[48,96,192,384]),'vitb':dict(encoder='vitb',features=128,out_channels=[96,192,384,768]),'vitl':dict(encoder='vitl',features=256,out_channels=[256,512,1024,1024])}[a.encoder]
model=VideoDepthAnything(**cfg,metric=False);model.load_state_dict(torch.load(os.path.join(code,'checkpoints/video_depth_anything_%s.pth'%a.encoder),map_location='cpu'),strict=True);model=model.to(a.device).eval();began=time.perf_counter()
depths,_=model.infer_video_depth(frames,fps,input_size=a.size,device=a.device,fp32=True);took=time.perf_counter()-began;depths=np.asarray(depths,np.float32)
lo,hi=np.percentile(depths,.5),np.percentile(depths,99.5);grey=(np.clip((depths-lo)/max(hi-lo,1e-9),0,1)*255).astype(np.uint8);h,w=grey.shape[1:]
ff=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','gray','-s','%dx%d'%(w,h),'-r',str(fps),'-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','16','-movflags','+faststart',a.out],stdin=subprocess.PIPE);ff.stdin.write(grey.tobytes());ff.stdin.close();ff.wait()
# steadiness: how much the depth of a still-looking pixel changes from frame to frame (picture change under 2 grey levels)
g=np.array([cv2.cvtColor(f,cv2.COLOR_RGB2GRAY) for f in frames],np.int16);still=np.abs(np.diff(g,axis=0))<2;flick=np.abs(np.diff(grey.astype(np.int16),axis=0))[still]
print({'file':a.out,'frames':len(frames),'fps':round(fps,3),'size':[w,h],'device':a.device,'encoder':a.encoder,'seconds':round(took,1),'nan':bool(np.isnan(depths).any()),'flickerOnStillPixels':round(float(flick.mean())/255,4)})
