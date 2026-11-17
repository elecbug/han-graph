import io
import json
from pathlib import Path
import tempfile
import unittest

from russian_dataset import apply_batch


class BatchUpdates(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.path = self.root / "character.jsonl"
        self.rows = [dict(type="character", id=f"ga-{index:03}", hanja=chr(0x4e00 + index),
                          meaning_ko=["뜻"], meaning_en=["meaning"]) for index in range(12)]
        self.original = "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in self.rows)
        self.path.write_text(self.original)
        self.log = io.StringIO()

    def validator(self, source):
        path = self.root / "validator"
        path.write_text("#!/usr/bin/env python3\n" + source)
        path.chmod(0o700)
        return path

    def patches(self, start, end):
        return [dict(file="character.jsonl", key=self.rows[index]["id"],
                     updates={"meaning_ru": ["значение"]}) for index in range(start, end)]

    def test_validation_runs_between_ten_record_writes(self):
        validator = self.validator("""import json,sys
from pathlib import Path
root=Path(sys.argv[2]); state=root/'checks'
calls=int(state.read_text()) if state.exists() else 0
rows=[json.loads(line) for line in (root/'character.jsonl').read_text().splitlines()]
assert sum('meaning_ru' in row for row in rows)==[10,12][calls]
state.write_text(str(calls+1))
""")
        apply_batch(self.root, self.patches(0, 10), validator, self.log)
        self.assertEqual((self.root / "checks").read_text(), "1")
        apply_batch(self.root, self.patches(10, 12), validator, self.log)
        self.assertEqual((self.root / "checks").read_text(), "2")
        self.assertEqual([json.loads(line)["records"] for line in self.log.getvalue().splitlines()], [10, 2])
        for original, current in zip(self.rows, map(json.loads, self.path.read_text().splitlines())):
            self.assertEqual(original, {key: value for key, value in current.items() if key != "meaning_ru"})

    def test_a_failed_validator_restores_the_entire_batch(self):
        validator = self.validator("raise SystemExit('invalid reference')\n")
        with self.assertRaisesRegex(ValueError, "invalid reference"):
            apply_batch(self.root, self.patches(0, 10), validator, self.log)
        self.assertEqual(self.path.read_text(), self.original)
        self.assertEqual(self.log.getvalue(), "")

    def test_large_batches_and_changes_to_original_fields_never_write(self):
        validator = self.validator("raise AssertionError('must not be called')\n")
        for patches in [self.patches(0, 11), [dict(file="character.jsonl", key="ga-000", updates={"meaning_en": "changed"})]]:
            with self.assertRaises(ValueError):
                apply_batch(self.root, patches, validator, self.log)
            self.assertEqual(self.path.read_text(), self.original)


if __name__ == "__main__":
    unittest.main()
