#!/usr/bin/env python3
"""Compatibility entry point for Russian-only dataset maintenance."""
from localized_dataset import (BATCH_SIZE, CYRILLIC, FIELDS, read_rows, identity,
                               check_text, check_row, atomic_write, apply_batch,
                               check_all, main)

if __name__ == '__main__':
    main(default_languages=('ru',))
