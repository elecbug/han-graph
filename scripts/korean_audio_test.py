import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import korean_audio as audio


class HeadwordRecordingTest(unittest.TestCase):
    def test_upgrade_reuses_examples_and_ignores_old_pending_word(self):
        word = audio.Clip("가의", True)
        example = audio.Clip("가의가 쓰였어요.", False)
        clips = {audio.clip_name(clip.text): clip for clip in (word, example)}
        word_name, example_name = clips
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "00000.zip"
            pending = root / "pending"
            pending.mkdir()
            (pending / word_name).write_bytes(b"previous pending word")
            with zipfile.ZipFile(archive, "w") as old:
                old.writestr(word_name, b"previous published word")
                old.writestr(example_name, b"published example")
            batch = (archive, clips)
            with (patch.object(audio, "verify_clip"), patch.object(audio.os, "sched_setaffinity"), patch.dict(audio.os.environ),
                  patch.object(audio, "models", object()),
                  patch.object(audio, "synthesize", return_value=b"revised word") as synth):
                self.assertFalse(audio.published(batch))
                audio.build(batch, root, pending, [0])
                synth.assert_called_once_with(word)
                self.assertTrue(audio.published(batch))
            with zipfile.ZipFile(archive) as updated:
                self.assertEqual(updated.read(word_name), b"revised word")
                self.assertEqual(updated.read(example_name), b"published example")
                self.assertEqual(updated.getinfo(example_name).comment, b"")


if __name__ == "__main__":
    unittest.main()
