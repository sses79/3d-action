"""Offline YOLO26-pose experiment. No Studio mutations or automatic approvals."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import time
process_start = time.perf_counter()
from collections import Counter
from importlib.metadata import version
from metrics import agreement, select_person

parser = argparse.ArgumentParser()
parser.add_argument('--frames', default='authoring/vision/results')
parser.add_argument('--model', default='.authoring/vision-models/yolo26n-pose.pt')
parser.add_argument('--threads', type=int, default=2)
args = parser.parse_args()
os.environ.setdefault('YOLO_CONFIG_DIR', str(Path('.authoring/vision-config').resolve()))
os.environ.setdefault('MPLCONFIGDIR', str(Path('.authoring/vision-config/matplotlib').resolve()))
Path(os.environ['YOLO_CONFIG_DIR']).mkdir(parents=True, exist_ok=True)
Path(os.environ['MPLCONFIGDIR']).mkdir(parents=True, exist_ok=True)
from PIL import Image, ImageDraw
import torch
from ultralytics import YOLO

import_ms = (time.perf_counter()-process_start)*1000
torch.set_num_threads(args.threads)
torch.set_num_interop_threads(1)
directory = Path(args.frames)
manifest = json.loads((directory/'frames.json').read_text())
model_path = Path(args.model)
model_path.parent.mkdir(parents=True, exist_ok=True)
start = time.perf_counter()
model = YOLO(str(model_path))
load_ms = (time.perf_counter()-start)*1000
start = time.perf_counter()
model.predict(str(directory/manifest['frames'][0]['file']), device='cpu', imgsz=640, verbose=False)
warmup_ms = (time.perf_counter()-start)*1000
edges = [(5,7),(7,9),(6,8),(8,10),(5,6),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)]
results = []
inference_start = time.perf_counter()
write_ms = 0
for frame in manifest['frames']:
    begin = time.perf_counter()
    detection = model.predict(str(directory/frame['file']), device='cpu', imgsz=640, verbose=False)[0]
    predict_ms = (time.perf_counter()-begin)*1000
    boxes = detection.boxes.xyxy.cpu().tolist()
    chosen = select_person(boxes, frame['points'])
    predictions = {} if chosen is None else {i:p for i,p in enumerate(detection.keypoints.data[chosen].cpu().tolist())}
    metrics = agreement(frame['points'], predictions)
    results.append({'file': frame['file'], 'id':frame['id'], 'time':frame['time'], 'view':frame['view'],
                    'control':frame['control'], 'detections': len(boxes), 'chosen':chosen,
                    'predictions':predictions, 'agreement': metrics, 'predictWallMs':predict_ms,
                    'stagesMs':detection.speed})
    begin = time.perf_counter()
    pic = Image.open(directory/frame['file']).convert('RGB')
    draw = ImageDraw.Draw(pic)
    ground = {p['index']:p['xy'] for p in frame['points']}
    for a,b in edges:
        draw.line([tuple(ground[a]),tuple(ground[b])], fill='#0080c0', width=2)
        if a in predictions and b in predictions and min(predictions[a][2],predictions[b][2]) >= .5:
            draw.line([tuple(predictions[a][:2]),tuple(predictions[b][:2])], fill='#00a040', width=3)
    for m in metrics['measurements']:
        draw.line([tuple(ground[m['index']]),tuple(predictions[m['index']][:2])],fill='#e04444',width=1)
    draw.rectangle((0,0,640,42),fill='#18212b')
    label = 'SHIN +80%' if frame['control']['flawed'] else 'Original'
    draw.text((10,8),f"{label} {frame['view']} {frame['time']:.3f}s | {metrics['status']} | {metrics['matched']}/12",fill='white')
    draw.text((10,25),'Blue: rig pivots   Green: confident YOLO   Red: difference',fill='white')
    pic.save(directory/('annotated-'+frame['file']))
    write_ms += (time.perf_counter()-begin)*1000
report = {'version':1, 'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
          'environment':{'platform':platform.platform(),'device':'cpu','threads':args.threads,
                         'versions':{p:version(p) for p in ['ultralytics','torch','torchvision','numpy','pillow']},
                         'model':str(model_path),'modelOrigin':'https://github.com/ultralytics/assets/releases/download/v8.4.0/yolo26n-pose.pt','modelSHA256':hashlib.sha256(model_path.read_bytes()).hexdigest()},
          'config':{'landmarkConfidence':.5,'minimumLandmarks':6,'medianErrorThresholdBodyHeight':.08,
                    'thresholdStatus':'exploratory; not calibrated for this rig','imgsz':640},
          'capture':{'sourceActions':manifest['sourceActions'],'timings':manifest['timings']},
          'timings':{'pythonImportsMs':import_ms,'loadOrDownloadMs':load_ms,'warmupMs':warmup_ms,
                     'predictWallMs':sum(r['predictWallMs'] for r in results),
                     'annotationWriteMs':write_ms,'evaluationWallMs':(time.perf_counter()-inference_start)*1000},
          'processWallMs':(time.perf_counter()-process_start)*1000,
          'summary':dict(Counter(r['agreement']['status'] for r in results)), 'frames':results,
          'limits':['2D agreement does not certify anatomy, balance, foot contact, naturalness or temporal continuity.',
                    'Rig pivots approximate COCO joints. Side-view occlusion has no visibility ground truth.',
                    'No facial landmarks. Low coverage is inconclusive. Left/right labels are never silently swapped.']}
(directory/'pose-report.json').write_text(json.dumps(report,indent=2))
files = ['kick-study-0.780-front.png','flawed-kick-front.png','kick-study-0.780-side.png','flawed-kick-side.png']
sheet = Image.new('RGB',(1280,1280))
for i,f in enumerate(files):
    sheet.paste(Image.open(directory/('annotated-'+f)), ((i%2)*640,(i//2)*640))
sheet.save(directory/'kick-control-comparison.png')
print(json.dumps({'summary':report['summary'],'timings':report['timings'],
                  'control':[{'file':r['file'],'lengthRatio':r['control']['lengthRatio'],'status':r['agreement']['status'],'medianNormalizedError':r['agreement']['medianNormalizedError']} for r in results if r['control']['flawed']]}))
