"""SAM 3D Body keypoints (MHR70, camera axes x right / y down / z away, metres) -> H36M17 root-relative joints in the lift's units."""
import sys,json,numpy as np
src,lift_ir,out=sys.argv[1:4];d=np.load(src);K=d['pred_keypoints_3d'].astype(np.float64);ir=json.load(open(lift_ir));L=np.array(ir['rootRelativePositions'])
nose,neck,rsho,relb,rwri,lsho,lelb,lwri,rhip,rkne,rank,lhip,lkne,lank=0,69,6,8,41,5,7,62,10,12,14,9,11,13
pelvis=(K[:,rhip]+K[:,lhip])/2;H=np.zeros((len(K),17,3))
H[:,0]=pelvis;H[:,1]=K[:,rhip];H[:,2]=K[:,rkne];H[:,3]=K[:,rank];H[:,4]=K[:,lhip];H[:,5]=K[:,lkne];H[:,6]=K[:,lank];H[:,8]=K[:,neck];H[:,7]=(pelvis+K[:,neck])/2;H[:,9]=(K[:,neck]+K[:,nose])/2;H[:,10]=K[:,nose]+(K[:,nose]-K[:,neck])*.4
H[:,11]=K[:,lsho];H[:,12]=K[:,lelb];H[:,13]=K[:,lwri];H[:,14]=K[:,rsho];H[:,15]=K[:,relb];H[:,16]=K[:,rwri];H-=H[:,0:1]
leg=lambda P:np.median(np.linalg.norm(P[:,2]-P[:,1],axis=1)+np.linalg.norm(P[:,3]-P[:,2],axis=1)+np.linalg.norm(P[:,5]-P[:,4],axis=1)+np.linalg.norm(P[:,6]-P[:,5],axis=1))
scale=leg(L)/leg(H);H*=scale
# Where the body is in the picture, from the same model that poses it: the lowest of all 70 keypoints (toes, heels, hands, head
# included) and the middle of the hips. The detector's ankles are no longer needed for height or travel.
k2=d['pred_keypoints_2d'].astype(np.float64);lowest=k2[:,:,1].max(1);hips=(k2[:,rhip]+k2[:,lhip])/2
json.dump({'backend':'SAM 3D Body (ComfyUI repack, dinov3 bf16), per frame, no smoothing','times':d['times'].tolist(),'positions':H.tolist(),'lowestBodyImageY':lowest.tolist(),'imagePelvis':hips.tolist(),'scale':float(scale)},open(out,'w'));print('frames',len(H),'scale',round(float(scale),3))
