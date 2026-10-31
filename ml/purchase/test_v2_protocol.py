import unittest,json
from common import ROOT,rows,sha
from v2_protocol import assemble,gold_decisions,normalize

class ProtocolTests(unittest.TestCase):
    def example(self):return rows('train')[0]
    def test_all_frozen_labels_roundtrip_without_losing_garments(self):
        count=0
        for split in ['train','validation','test']:
            path=ROOT/f'data/evaluation/purchase-v2/{split}.jsonl'
            manifest=json.loads((path.parent/'manifest.json').read_text())
            self.assertEqual(sha(path),manifest['files'][split]['sha256'])
            for row in map(json.loads,path.read_text(encoding='utf8').splitlines()):
                result=assemble(row['source'],[v for _,v in gold_decisions(row)])
                self.assertEqual(len(result['items']),len(row['target']['items']))
                for actual,gold in zip(result['items'],row['target']['items']):
                    for field in ['description','category','color','size','brand','quantity','source_line_ids','review_reasons']:self.assertEqual(actual[field],gold[field])
                count+=1
        self.assertEqual(count,800)
    def test_missing_decision_is_error_not_empty_success(self):
        row=self.example()
        with self.assertRaisesRegex(ValueError,'every source line'):assemble(row['source'],[])
    def test_unsupported_color_rejected(self):
        row=self.example();decisions=[v for _,v in gold_decisions(row)];decisions[1]['color']='InventedPurple'
        with self.assertRaisesRegex(ValueError,'unsupported color'):assemble(row['source'],decisions)
    def test_category_invented_rejected(self):
        row=self.example();decisions=[v for _,v in gold_decisions(row)];decisions[1]['category']='Secret'
        with self.assertRaises(ValueError):assemble(row['source'],decisions)
    def test_excluded_line_cannot_smuggle_item(self):
        row=self.example();decisions=[v for _,v in gold_decisions(row)];decisions[0]['description']='tee'
        with self.assertRaises(ValueError):assemble(row['source'],decisions)
    def test_bool_is_not_quantity(self):
        row=self.example();decisions=[v for _,v in gold_decisions(row)];decisions[1]['quantity']=True
        with self.assertRaisesRegex(ValueError,'quantity'):assemble(row['source'],decisions)
    def test_untrusted_extra_key_rejected(self):
        row=self.example();decisions=[v for _,v in gold_decisions(row)];decisions[0]['tool']='fetch'
        with self.assertRaisesRegex(ValueError,'shape'):assemble(row['source'],decisions)
    def test_input_limits_and_normalization(self):
        self.assertEqual(normalize('tee\r\ncoat'),'tee\ncoat')
        for text in ['', '\0tee','x'*12001,'a\n'*200]:
            with self.assertRaises(ValueError):normalize(text)
    def test_split_families_disjoint(self):
        manifest=json.loads((ROOT/'data/evaluation/purchase-v2/manifest.json').read_text())
        train=set(manifest['files']['train']['families']);dev=set(manifest['files']['validation']['families']);test=set(manifest['files']['test']['families'])
        self.assertFalse(train&dev or train&test or dev&test)

if __name__=='__main__':unittest.main()
