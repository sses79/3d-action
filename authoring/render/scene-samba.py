# The samba set as plain objects, in the room of the camera track: x right, y up, z toward the first camera (which stands at
# x=0, z=0, about 1 m over the floor), metres. Shapes read from three wide views of the same set elsewhere in the video
# (3.30 s, 28.43 s, 69.30 s); sizes scaled from the dancers' height and checked against stills of the 70.7-80.7 s clip.
import json,sys
O=[]
def box(name,x,y0,y1,d0,d1,w):O.append(dict(name=name,shape='box',position=[x,(y0+y1)/2,-(d0+d1)/2],size=[w,y1-y0,d1-d0]))
def cyl(name,x,y0,y1,d,w,dep):O.append(dict(name=name,shape='cylinder',position=[x,(y0+y1)/2,-d],size=[w,y1-y0,dep]))
def arch(name,d,w,h,rim,dep=.6):O.append(dict(name=name,shape='arch',position=[0,h/2,-d],size=[w,h,dep],rim=rim))
P=.5  # the raised platform the bandstand stands on
for i in range(3):box('front step %d'%(i+1),0,0,P/3*(i+1),10.4+.4*i,10.4+.4*(i+1),22)
box('platform',0,0,P,11.6,22,22)
cyl('bandstand wall',0,P,P+1.0,15.5,9.3,6)
cyl('bandstand roof',0,2.25,2.45,15.5,9.7,6.4)
for k,(x,d) in enumerate(((-3.6,13.6),(3.6,13.6),(-3.6,17.4),(3.6,17.4))):cyl('bandstand post %d'%(k+1),x,P+1.0,2.25,d,.18,.18)
for s,side in ((-1,'left'),(1,'right')):
    for i in range(5):box('%s stairs %d'%(side,i+1),s*5.9,P,P+.38*(i+1),12.6+1.1*i,12.6+1.1*(i+1),1.8)
    box('%s seating'%side,s*10.5,0,1.2,1,10.2,3)
    box('%s balcony'%side,s*12.5,3.2,4.4,1,12,3)
box('rear gallery',0,P,2.4,18.6,21.5,16)
arch('outer arch',14.2,19,9.5,1.0)
arch('middle arch',17.6,14,7.6,.9)
arch('inner arch',20.6,8,5.6,.7)
box('back screen',0,0,8,21.6,21.9,20)
json.dump(O,open(sys.argv[1],'w'),indent=1)
