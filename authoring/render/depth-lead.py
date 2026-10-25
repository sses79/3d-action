"""The depth of a lead image (docs/DEPTH_SERVICE_PLAN.md, step 2e): a take that continues a previous one opens on that take's last
frame, held a moment; this makes the frame's tinted depth so the guide can hold it too.
  .authoring/vision-venv/bin/python authoring/render/depth-lead.py IMAGE OUT.png --people PEOPLE.json
PEOPLE.json: [{name, color, boxes?: [[x0, y0, x1, y1], ...]}] with boxes as fractions of the picture (several for one person: an arm
reaching in, a body). Depth: Depth Anything 3 on the image (da3-depth.py through ComfyUI), as depth-tint.py makes it: white near,
the 0.5-99.5% range of inverse depth. People: in each box the nearer part (an Otsu split of the box's own grey), smaller boxes first
(what reaches into a bigger one is in front of it), each in its colour at saturation 0.6.
Without boxes the pose detector looks: when it finds exactly one person per name it takes them (in order of size); otherwise it
stops with exit code 3 and prints {"needBoxes": true, "detected": [...]} so the caller can draw them. Prints {out, people: {name: share}}."""
import sys,os,json,argparse,tempfile,subprocess,cv2,numpy as np
root=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
p=argparse.ArgumentParser();p.add_argument('image');p.add_argument('out');p.add_argument('--people',required=True);p.add_argument('--strength',type=float,default=.6);a=p.parse_args()
people=json.load(open(a.people));W,H=960,540
NAMED={'blue':'#4a86d8','orange':'#ee8a3a','green':'#4fae5a','pink':'#f07fb0','purple':'#8d6fd1','yellow':'#e8c53a','red':'#d9534a','crimson':'#a3232b','navy':'#2b3a66'}
hue=lambda c:int(cv2.cvtColor(np.uint8([[[int(NAMED[c][i:i+2],16) for i in (5,3,1)]]]),cv2.COLOR_BGR2HSV)[0,0,0])
img=cv2.imread(a.image);assert img is not None,'cannot read the image'
img=cv2.resize(img,(W,H),interpolation=cv2.INTER_AREA)
if not all(q.get('boxes') for q in people):  # the detector, when it leaves no doubt
    from ultralytics import YOLO
    r=YOLO(os.path.join(root,'.authoring/vision-models/yolo26s-pose.pt')).predict(img,device='cpu',verbose=False,conf=.3)[0]
    det=sorted([[round(x/W if i%2==0 else x/H,3) for i,x in enumerate(b)] for b in r.boxes.xyxy.cpu().tolist()],key=lambda b:-(b[2]-b[0])*(b[3]-b[1]))
    det=[b for b in det if (b[3]-b[1])>.2 or (b[2]-b[0])>.2]
    missing=[q for q in people if not q.get('boxes')]
    if len(det)!=len(people) or len(missing)>1:print(json.dumps({'needBoxes':True,'detected':det,'people':[q['name'] for q in people]}));sys.exit(3)
    for q,b in zip(missing,[b for b in det if not any(b in (x.get('boxes') or []) for x in people)]):q['boxes']=[b]
with tempfile.TemporaryDirectory() as td:  # Depth Anything 3 reads a video: three frames of the still
    v=os.path.join(td,'lead.mp4');w=cv2.VideoWriter(v,cv2.VideoWriter_fourcc(*'mp4v'),30,(W,H))
    for _ in range(3):w.write(img)
    w.release();z=os.path.join(td,'lead.npz')
    subprocess.run([os.path.join(root,'.authoring/comfyui/.venv/bin/python'),os.path.join(root,'authoring/render/da3-depth.py'),os.path.join(root,'.authoring/comfyui'),v,'0','0.1',z],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    d=np.load(z)['depth'][0]
inv=cv2.resize(1/np.maximum(d,1e-3),(W,H));lo,hi=np.percentile(inv,.5),np.percentile(inv,99.5);grey=(np.clip((inv-lo)/max(hi-lo,1e-9),0,1)*255).astype(np.uint8)
owner=np.full((H,W),-1,int);boxes=[(i,b) for i,q in enumerate(people) for b in q['boxes']]
for i,b in sorted(boxes,key=lambda e:(e[1][2]-e[1][0])*(e[1][3]-e[1][1])):  # smaller first: what reaches into a bigger box is in front
    x0,y0,x1,y1=int(b[0]*W),int(b[1]*H),int(np.ceil(b[2]*W)),int(np.ceil(b[3]*H));x0,y0=max(0,x0),max(0,y0);x1,y1=min(W,x1),min(H,y1)
    if x1-x0<4 or y1-y0<4:continue
    free=owner[y0:y1,x0:x1]<0;roi=grey[y0:y1,x0:x1]
    if not free.any():continue
    t,_=cv2.threshold(roi[free].reshape(-1,1),0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU);m=((roi>=t)&free).astype(np.uint8);m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    owner[y0:y1,x0:x1][m>0]=i
hsv=np.zeros((H,W,3),np.uint8);hsv[...,2]=grey
for i,q in enumerate(people):sel=owner==i;hsv[...,0][sel]=hue(q['color']);hsv[...,1][sel]=int(255*a.strength)
cv2.imwrite(a.out,cv2.cvtColor(hsv,cv2.COLOR_HSV2BGR))
print(json.dumps({'out':a.out,'people':{q['name']:round(float((owner==i).mean()),3) for i,q in enumerate(people)},'boxes':{q['name']:q['boxes'] for q in people}}))
