import unittest
from metrics import agreement, select_person

class MetricsTests(unittest.TestCase):
    def setUp(self):
        self.points = [{'name':str(i),'index':i,'xy':[i*10,i*20], 'inFrame':True} for i in range(5,17)]
    def test_exact_agreement(self):
        self.assertEqual(agreement(self.points,{p['index']:[*p['xy'],.9] for p in self.points})['status'],'agreement')
    def test_low_confidence_is_inconclusive(self):
        self.assertEqual(agreement(self.points,{p['index']:[*p['xy'],.1] for p in self.points})['status'],'inconclusive')
        self.assertEqual(agreement(self.points,{})['matched'],0)
    def test_errors_are_not_hidden(self):
        result = agreement(self.points,{p['index']:[p['xy'][0]+100,p['xy'][1],.9] for p in self.points})
        self.assertEqual(result['status'],'disagreement')
        self.assertAlmostEqual(result['medianNormalizedError'],100/220)
    def test_person_requires_overlap(self):
        self.assertIsNone(select_person([[500,500,600,600]],self.points))
        self.assertEqual(select_person([[500,500,600,600],[40,80,180,340]],self.points),1)

if __name__ == '__main__':
    unittest.main()
