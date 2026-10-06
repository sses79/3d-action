"""Projected-rig agreement, not a physical or naturalness validator."""
import math


def agreement(points, predictions, confidence=0.5, minimum=6, tolerance=0.08):
    visible = [p for p in points if p['inFrame']]
    height = max((p['xy'][1] for p in visible), default=0) - min((p['xy'][1] for p in visible), default=0)
    measurements = []
    for p in visible:
        prediction = predictions.get(p['index'])
        if prediction is None or prediction[2] < confidence:
            continue
        error = math.dist(p['xy'], prediction[:2])
        measurements.append({'name': p['name'], 'index': p['index'], 'confidence': prediction[2],
                             'pixels': error, 'normalized': error / height if height > 0 else None})
    values = sorted(m['normalized'] for m in measurements if m['normalized'] is not None)
    median = (values[(len(values)-1)//2] + values[len(values)//2])/2 if values else None
    status = 'inconclusive' if len(values) < minimum or height < 1 else ('agreement' if median <= tolerance else 'disagreement')
    return {'status': status, 'eligible': len(visible), 'matched': len(values), 'bodyHeightPixels': height,
            'medianNormalizedError': median, 'measurements': measurements}


def select_person(boxes, points):
    """Choose detection by overlap with the projected body, never by score alone."""
    if not boxes:
        return None
    visible = [p['xy'] for p in points if p['inFrame']]
    if not visible:
        return None
    x1, y1 = min(p[0] for p in visible), min(p[1] for p in visible)
    x2, y2 = max(p[0] for p in visible), max(p[1] for p in visible)
    def overlap(box):
        a,b,c,d = box
        intersection = max(0, min(c,x2)-max(a,x1))*max(0,min(d,y2)-max(b,y1))
        union = max(0,c-a)*max(0,d-b)+(x2-x1)*(y2-y1)-intersection
        return intersection/union if union else 0
    scores = [overlap(box) for box in boxes]
    return max(range(len(scores)), key=scores.__getitem__) if max(scores) > 0 else None
