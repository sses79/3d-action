# The samba set as plain objects, in the room of the camera track (x right, y up, z toward the first camera, metres).
import json,sys
z0=-0.13  # the first camera stands here; distances below are from it
O=[]
def box(name,x,y0,y1,d0,d1,w):O.append(dict(name=name,shape='box',position=[x,(y0+y1)/2,z0-(d0+d1)/2],size=[w,y1-y0,d1-d0]))
for i in range(3):box('front step %d'%(i+1),0,0,.133*(i+1),8.8+.34*i,8.8+.34*(i+1),13)
box('stage platform',0,0,.4,9.82,16.5,13)
O.append(dict(name='bandstand',shape='cylinder',position=[0,.4+.625,z0-12.8],size=[7.7,1.25,5]))
for s,side in ((-1,'left'),(1,'right')):
    for i in range(4):box('%s stairs %d'%(side,i+1),s*(4.1+.45*i),.4,.65+.25*i,11.9,14.4,.45)
    box('%s seating'%side,s*9.5,0,1.1,6,15,3)
box('back wall',0,0,7,17.2,17.7,22)
json.dump(O,open(sys.argv[1],'w'),indent=1)
