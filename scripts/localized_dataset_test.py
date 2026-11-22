import io
import json
from pathlib import Path
import tempfile
import unittest

from localized_dataset import ALL_LANGUAGES, apply_batch, check_row, check_text


class AdditionalLocales(unittest.TestCase):
    def test_calendar_examples_identify_the_year_in_translation(self):
        dataset = Path(__file__).resolve().parents[1] / 'dataset'
        seen = {language: {} for language in ALL_LANGUAGES}
        with (dataset / 'example.jsonl').open() as file:
            for row in map(json.loads, file):
                word = row['word']
                if row['example_ko'] != f'옛 기록에 적힌 {word}년이 어느 해인지 연표와 대조했어요.':
                    continue
                for language, examples in seen.items():
                    with self.subTest(word=word, language=language):
                        text = row[f'example_{language}']
                        self.assertNotIn(text, examples, f'{word} shares its translation with {examples.get(text)}')
                        examples[text] = word

    def test_public_translations_keep_learning_contrasts_distinct(self):
        dataset = Path(__file__).resolve().parents[1] / 'dataset'
        with (dataset / 'word.jsonl').open() as file:
            words = {(row['word'], row['hanja']): row for row in map(json.loads, file)}
        pairs = [
            (('금메달', '金메달'), ('동메달', '銅메달')),
            (('장편소설', '長篇小說'), ('중편소설', '中篇小說')),
            (('소화전', '消火栓'), ('화재경보기', '火災警報器')),
        ]
        for language in ('ne', 'mn', 'th'):
            for first, second in pairs:
                with self.subTest(language=language, first=first, second=second):
                    key = f'meaning_{language}'
                    self.assertNotEqual(words[first][key], words[second][key])

    def test_scripts_and_empty_translations_are_checked(self):
        check_text('oʻquv daftari', 200, 'uz')
        check_text('окуу дептери', 200, 'ky')
        for language, text in [('zh', '词典'), ('ja', '辞書'), ('ja', 'まなぶ'), ('es', 'año'), ('vi', 'độ ẩm'), ('ne', 'अर्थ'), ('ne', 'आऊ'), ('mn', 'утга'), ('th', 'ความหมาย')]:
            check_text(text, 200, language)
        for language, text in [('zh', 'price'), ('ja', '뜻'), ('es', 'precio ⁇'), ('vi', 'giá 98700'), ('ne', 'price'), ('mn', '98700'), ('th', 'ราคา ⁇')]:
            with self.assertRaises(ValueError):
                check_text(text, 200, language)
        for value, language in [('китеп', 'uz'), ('kitob', 'ky'), (' ', 'uz'), ('баа\n', 'ky'), ('soʻz Қ', 'uz'), ('&amp; soʻz', 'uz'), ('soʻz ⁇', 'uz'), ('маани \ufffd', 'ky')]:
            with self.assertRaises(ValueError):
                check_text(value, 200, language)
        for value, language in [('с пяти ⁇ семи утра', 'ru'), ('远远远远远远', 'zh'),
                                ('oʻz navbatida, ' * 6 + 'hujjat', 'uz')]:
            with self.subTest(language=language), self.assertRaises(ValueError):
                check_text(value, 500, language)
        check_text('It takes time…', 200, 'en')
        with self.assertRaisesRegex(ValueError, 'semantic_hint_en'):
            check_row('word.jsonl', {'meaning_ko': '귀 안의 얇은 막', 'semantic_hint': '鼓[고]는 북이에요. / 鼓[고] means drum.'}, ('ko',))
        for row, language in [({'meaning_zh': '家庭，家庭'}, 'zh'), ({'meaning_vi': 'hóa đơn;'}, 'vi')]:
            with self.subTest(language=language), self.assertRaises(ValueError):
                check_row('word.jsonl', row, (language,))
        check_row('word.jsonl', {'meaning_en': 'parentheses; brackets'}, ('en',))
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
