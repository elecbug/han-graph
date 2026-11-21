#!/usr/bin/env python3
"""Apply translation fields in batches of at most 10; validate and roll back failures.

Only public dataset files are read. The application validator checks the complete
dictionary and optional practice file after every batch. Logs contain public IDs.
"""
import argparse
import copy
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata

BATCH_SIZE = 10
LANGUAGES = ('ru', 'uz', 'ky', 'zh', 'ja', 'es', 'vi', 'ne', 'mn', 'th')
CYRILLIC = re.compile(r"[\u0400-\u052f]")
LATIN = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ɏḀ-ỿ]")
HAN = re.compile(r"[㐀-䶿一-鿿豈-﫿\U00020000-\U000323af]")
JAPANESE = re.compile(r"[ぁ-ゖァ-ヺー㐀-䶿一-鿿々]")
SCRIPTS = {'ru': CYRILLIC, 'ky': CYRILLIC, 'uz': LATIN, 'zh': HAN,
           'ja': JAPANESE, 'es': LATIN, 'vi': LATIN, 'mn': CYRILLIC,
           'ne': re.compile(r'[अ-ह]'), 'th': re.compile(r'[ก-ฮ]')}


def fields_for(languages):
    fields = {
        "character.jsonl": {f"meaning_{lang}" for lang in languages},
        "word.jsonl": {f"{kind}_{lang}" for lang in languages for kind in ('meaning', 'semantic_hint')},
        "example.jsonl": {f"example_{lang}" for lang in languages},
        "practice.json": {f"{kind}_{lang}" for lang in languages for kind in ('prompt', 'explanation')},
    }
    if 'ru' in languages:
        fields['word.jsonl'].add('semantic_hint_en')
    return fields
FIELDS = fields_for(('ru',))


def read_rows(path):
    if path.suffix == ".jsonl":
        return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    return json.loads(path.read_text())["questions"]


def identity(filename, row):
    return row["id"] if filename in {"character.jsonl", "practice.json"} else [row["word"], row["hanja"]]


def check_text(text, maximum, language="ru"):
    if not isinstance(text, str) or not text.strip() or text != text.strip():
        raise ValueError("Translation text must be a nonempty trimmed string")
    if len(text) > maximum or any(unicodedata.category(c) == "Cc" for c in text):
        raise ValueError("Translation text has a control character or exceeds the field limit")
    if language != 'ru' and any(token in text for token in ('⁇', '\ufffd')):
        raise ValueError(f'Unresolved {language} translation symbol: {text!r}')
    if not SCRIPTS[language].search(text) or (language in ('uz', 'es', 'vi') and CYRILLIC.search(text)) or "<unk>" in text or re.search(r"\b987\d{2}\b|&(?:amp;|#)", text):
        raise ValueError(f"Untranslated {language} text or unresolved placeholder: {text!r}")


def check_row(filename, row, languages=('ru',)):
    for language in languages:
        meaning_key = f'meaning_{language}'
        if filename == 'character.jsonl':
            meanings = row.get(meaning_key)
            if not isinstance(meanings, list) or not 1 <= len(meanings) <= 20 or not all(isinstance(value, str) for value in meanings) or len(set(meanings)) != len(meanings):
                raise ValueError(f'{meaning_key} must be a nonempty array of distinct meanings')
            for meaning in meanings:
                check_text(meaning, 200, language)
        elif filename == 'word.jsonl':
            check_text(row.get(meaning_key), 2000, language)
            if row.get('semantic_hint'):
                check_text(row.get(f'semantic_hint_{language}'), 2000, language)
                if not isinstance(row.get('semantic_hint_en'), str) or not row['semantic_hint_en'].strip():
                    raise ValueError('Missing English composition hint')
        elif filename == 'example.jsonl':
            check_text(row.get(f'example_{language}'), 500, language)
        elif filename == 'practice.json':
            check_text(row.get(f'prompt_{language}'), 10000, language)
            check_text(row.get(f'explanation_{language}'), 10000, language)
            required = set(re.findall(r'[가-힣]+', row['explanation_en']))
            if not required.issubset(set(re.findall(r'[가-힣]+', row[f'explanation_{language}']))):
                raise ValueError(f'{language} explanation lost a Korean word or reading')


def atomic_write(path, text):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        output.write(text)
    temporary.chmod(path.stat().st_mode & 0o777)
    temporary.replace(path)


def apply_batch(dataset, patches, validator, log, languages=("ru",)):
    """Return only after this batch has passed the full application validator."""
    if not 1 <= len(patches) <= BATCH_SIZE:
        raise ValueError("Apply between 1 and 10 records at a time")
    fields = fields_for(languages)
    originals, documents, seen = {}, {}, set()
    for patch in patches:
        filename, key, updates = patch["file"], patch["key"], patch["updates"]
        if filename not in fields or not updates or not set(updates).issubset(fields[filename]):
            raise ValueError("Only declared translation fields may change")
        marker = (filename, json.dumps(key, ensure_ascii=False))
        if marker in seen:
            raise ValueError("Duplicate record in batch")
        seen.add(marker)
        if filename not in documents:
            originals[filename] = (dataset / filename).read_text()
            documents[filename] = (read_rows(dataset / filename) if filename.endswith("jsonl")
                                   else json.loads(originals[filename]))
        document = documents[filename]
        rows = document if isinstance(document, list) else document["questions"]
        matches = [row for row in rows if identity(filename, row) == key]
        if len(matches) != 1:
            raise ValueError(f"Expected one record: {filename} {key}")
        row = matches[0]
        before = copy.deepcopy(row)
        row.update(updates)
        check_row(filename, row, languages)
        assert {k: v for k, v in before.items() if k not in fields[filename]} == {
            k: v for k, v in row.items() if k not in fields[filename]}
    try:
        for filename, document in documents.items():
            text = ("".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in document)
                    if isinstance(document, list) else json.dumps(document, ensure_ascii=False, indent=2) + "\n")
            atomic_write(dataset / filename, text)
        check = subprocess.run([str(validator), "-data", str(dataset), "validate"], capture_output=True, text=True)
        if check.returncode:
            raise ValueError(check.stderr or check.stdout)
    except BaseException:
        for filename, text in originals.items():
            atomic_write(dataset / filename, text)
        raise
    log.write(json.dumps({"languages": list(languages), "records": len(patches), "keys": [
        {"file": p["file"], "key": p["key"]} for p in patches], "validation": "passed"}, ensure_ascii=False) + "\n")
    log.flush()


def check_all(dataset, languages=("ru",)):
    counts = {}
    for filename in FIELDS:
        rows = read_rows(dataset / filename)
        for index, row in enumerate(rows, 1):
            try:
                check_row(filename, row, languages)
            except ValueError as error:
                raise ValueError(f"{filename}:{index}: {error}") from error
        counts[filename] = len(rows)
    return counts


def main(default_languages=LANGUAGES):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "apply"])
    parser.add_argument("--dataset", type=Path, default=Path(__file__).resolve().parents[1] / "dataset")
    parser.add_argument("--patches", type=Path, help="JSONL with file, key and updates")
    parser.add_argument("--validator", type=Path, help="Built han-graph executable")
    parser.add_argument("--log", type=Path)
    parser.add_argument("--languages", nargs="+", choices=LANGUAGES, default=default_languages)
    args = parser.parse_args()
    if args.command == "check":
        print(json.dumps(check_all(args.dataset, args.languages), ensure_ascii=False))
        return
    if not all([args.patches, args.validator, args.log]):
        parser.error("apply requires --patches, --validator and --log")
    args.log.parent.mkdir(parents=True, exist_ok=True)
    with args.patches.open() as source, args.log.open("a") as log:
        batch = []
        for line in source:
            if not line.strip():
                continue
            batch.append(json.loads(line))
            if len(batch) == BATCH_SIZE:
                apply_batch(args.dataset, batch, args.validator.resolve(), log, args.languages)
                batch = []
        if batch:
            apply_batch(args.dataset, batch, args.validator.resolve(), log, args.languages)
    print(json.dumps(check_all(args.dataset, args.languages), ensure_ascii=False))


if __name__ == "__main__":
    main()
