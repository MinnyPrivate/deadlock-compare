import sys, numpy as np, potrace
from PIL import Image, ImageFilter
im=Image.open('haze_src.png').convert('RGBA')
S=4
big=im.resize((im.width*S,im.height*S),Image.LANCZOS)
a=big.split()[3].filter(ImageFilter.GaussianBlur(3))
mask=np.array(a)>128
r,g,b,_=[np.array(c).astype(int) for c in big.split()]
# eyes / glyph: bright yellow
eye=(r>170)&(g>130)&(b<140)&(r-b>80)
# restrict to face region (upper half)
H=eye.shape[0]; eye[int(H*0.62):,:]=False; eye[:int(H*0.475),:]=False
eyeim=Image.fromarray((eye*255).astype('uint8')).filter(ImageFilter.GaussianBlur(2))
eye=np.array(eyeim)>100
Image.fromarray((eye*255).astype('uint8')).save('eye_mask.png')
Image.fromarray((mask*255).astype('uint8')).save('sil_mask.png')
def tr(m,turd=40):
    bm=potrace.Bitmap(~m)
    p=bm.trace(turdsize=turd, alphamax=1.1, opticurve=True, opttolerance=0.3)
    out=[]
    for c in p:
        s=c.start_point; d=f"M{s.x/S:.1f} {s.y/S:.1f}"
        for seg in c.segments:
            if seg.is_corner: d+=f"L{seg.c.x/S:.1f} {seg.c.y/S:.1f}L{seg.end_point.x/S:.1f} {seg.end_point.y/S:.1f}"
            else: d+=f"C{seg.c1.x/S:.1f} {seg.c1.y/S:.1f} {seg.c2.x/S:.1f} {seg.c2.y/S:.1f} {seg.end_point.x/S:.1f} {seg.end_point.y/S:.1f}"
        out.append(d+"Z")
    return "".join(out)
sil=tr(mask,6000); eyes=tr(eye)
open('haze_sil.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {im.width} {im.height}"><path fill-rule="evenodd" d="{sil}"/><path fill="#e9dcc3" d="{eyes}"/></svg>')
print(len(sil),len(eyes))
