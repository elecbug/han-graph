import io
import json
from pathlib import Path
import tempfile
import unittest

from localized_dataset import apply_batch, check_row, check_text


class AdditionalLocales(unittest.TestCase):
    def test_scripts_and_empty_translations_are_checked(self):
        check_text('oʻquv daftari', 200, 'uz')
        check_text('окуу дептери', 200, 'ky')
        for value, language in [('китеп', 'uz'), ('kitob', 'ky'), (' ', 'uz'), ('баа\n', 'ky')]:
            with self.assertRaises(ValueError):
                check_text(value, 200, language)
        with self.assertRaises(ValueError):
            check_row('character.jsonl', {'meaning_uz': ['narx'], 'meaning_ky': []}, ('uz', 'ky'))

    def test_two_locales_are_saved_in_one_ten_record_batch_without_changing_russian(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            rows = [dict(id=f'ga-{index:03}', meaning_ko=['뜻'], meaning_en=['meaning'], meaning_ru=['значение']) for index in range(10)]
            path = root / 'character.jsonl'
            path.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows))
            validator = root / 'validator'
            validator.write_text('#!/usr/bin/env python3\nimport json,sys\nfrom pathlib import Path\nrows=[json.loads(line) for line in (Path(sys.argv[2])/"character.jsonl").read_text().splitlines()]\nassert len(rows)==10 and all(row["meaning_ru"]==["значение"] and row["meaning_uz"]==["maʼno"] and row["meaning_ky"]==["маани"] for row in rows)\n')
            validator.chmod(0o700)
            patches = [dict(file='character.jsonl', key=row['id'], updates={'meaning_uz': ['maʼno'], 'meaning_ky': ['маани']}) for row in rows]
            log = io.StringIO()
            apply_batch(root, patches, validator, log, ('uz', 'ky'))
            self.assertEqual(json.loads(log.getvalue())['records'], 10)
            self.assertEqual(json.loads(log.getvalue())['languages'], ['uz', 'ky'])
            before = path.read_text()
            patches[0]['updates']['meaning_ru'] = ['changed']
            with self.assertRaises(ValueError):
                apply_batch(root, patches[:1], validator, log, ('uz', 'ky'))
            self.assertEqual(path.read_text(), before)


if __name__ == '__main__':
    unittest.main()
