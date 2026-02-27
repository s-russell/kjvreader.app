#!/usr/bin/env python3
"""Convert `data/kjv.json` into a normalized SQLite database."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

FULL_BOOK_NAME_BY_OSIS_ID = {
    "Gen": "Genesis",
    "Exod": "Exodus",
    "Lev": "Leviticus",
    "Num": "Numbers",
    "Deut": "Deuteronomy",
    "Josh": "Joshua",
    "Judg": "Judges",
    "Ruth": "Ruth",
    "1Sam": "1 Samuel",
    "2Sam": "2 Samuel",
    "1Kgs": "1 Kings",
    "2Kgs": "2 Kings",
    "1Chr": "1 Chronicles",
    "2Chr": "2 Chronicles",
    "Ezra": "Ezra",
    "Neh": "Nehemiah",
    "Esth": "Esther",
    "Job": "Job",
    "Ps": "Psalms",
    "Prov": "Proverbs",
    "Eccl": "Ecclesiastes",
    "Song": "Song of Solomon",
    "Isa": "Isaiah",
    "Jer": "Jeremiah",
    "Lam": "Lamentations",
    "Ezek": "Ezekiel",
    "Dan": "Daniel",
    "Hos": "Hosea",
    "Joel": "Joel",
    "Amos": "Amos",
    "Obad": "Obadiah",
    "Jonah": "Jonah",
    "Mic": "Micah",
    "Nah": "Nahum",
    "Hab": "Habakkuk",
    "Zeph": "Zephaniah",
    "Hag": "Haggai",
    "Zech": "Zechariah",
    "Mal": "Malachi",
    "Tob": "Tobit",
    "Jdt": "Judith",
    "EsthGr": "Greek Esther",
    "Wis": "Wisdom of Solomon",
    "Sir": "Sirach",
    "Bar": "Baruch",
    "EpJer": "Epistle of Jeremiah",
    "PrAzar": "Prayer of Azariah",
    "Sus": "Susanna",
    "Bel": "Bel and the Dragon",
    "1Macc": "1 Maccabees",
    "2Macc": "2 Maccabees",
    "1Esd": "1 Esdras",
    "PrMan": "Prayer of Manasseh",
    "2Esd": "2 Esdras",
    "Matt": "Matthew",
    "Mark": "Mark",
    "Luke": "Luke",
    "John": "John",
    "Acts": "Acts",
    "Rom": "Romans",
    "1Cor": "1 Corinthians",
    "2Cor": "2 Corinthians",
    "Gal": "Galatians",
    "Eph": "Ephesians",
    "Phil": "Philippians",
    "Col": "Colossians",
    "1Thess": "1 Thessalonians",
    "2Thess": "2 Thessalonians",
    "1Tim": "1 Timothy",
    "2Tim": "2 Timothy",
    "Titus": "Titus",
    "Phlm": "Philemon",
    "Heb": "Hebrews",
    "Jas": "James",
    "1Pet": "1 Peter",
    "2Pet": "2 Peter",
    "1John": "1 John",
    "2John": "2 John",
    "3John": "3 John",
    "Jude": "Jude",
    "Rev": "Revelation",
}


def split_book_name(full_book_name: str) -> tuple[int | None, str]:
    parts = full_book_name.split(" ", 1)
    if len(parts) == 2 and parts[0].isdigit():
        return int(parts[0]), parts[1]
    return None, full_book_name


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA foreign_keys = ON;

        CREATE TABLE books (
          id INTEGER PRIMARY KEY,
          book_index INTEGER NOT NULL UNIQUE,
          osis_id TEXT NOT NULL UNIQUE,
          ordinal INTEGER,
          book_name TEXT NOT NULL
        );

        CREATE TABLE book_titles (
          id INTEGER PRIMARY KEY,
          book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          title_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          type TEXT,
          short TEXT,
          UNIQUE (book_id, title_index)
        );

        CREATE TABLE chapters (
          id INTEGER PRIMARY KEY,
          book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          chapter_index INTEGER NOT NULL,
          osis_ref TEXT NOT NULL UNIQUE,
          n TEXT NOT NULL,
          sid TEXT NOT NULL UNIQUE,
          UNIQUE (book_id, chapter_index)
        );

        CREATE TABLE chapter_titles (
          id INTEGER PRIMARY KEY,
          chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
          title_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          type TEXT,
          short TEXT,
          UNIQUE (chapter_id, title_index)
        );

        CREATE TABLE paragraphs (
          id INTEGER PRIMARY KEY,
          chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
          paragraph_index INTEGER NOT NULL,
          UNIQUE (chapter_id, paragraph_index)
        );

        CREATE TABLE verses (
          id INTEGER PRIMARY KEY,
          paragraph_id INTEGER NOT NULL REFERENCES paragraphs(id) ON DELETE CASCADE,
          verse_index INTEGER NOT NULL,
          osis_id TEXT NOT NULL UNIQUE,
          n TEXT NOT NULL,
          sid TEXT NOT NULL UNIQUE,
          UNIQUE (paragraph_id, verse_index)
        );

        CREATE TABLE verse_titles (
          id INTEGER PRIMARY KEY,
          verse_id INTEGER NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
          title_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          type TEXT,
          short TEXT,
          UNIQUE (verse_id, title_index)
        );

        CREATE TABLE verse_nodes (
          id INTEGER PRIMARY KEY,
          verse_id INTEGER NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
          node_index INTEGER NOT NULL,
          text TEXT NOT NULL,
          change_type TEXT,
          UNIQUE (verse_id, node_index)
        );

        CREATE INDEX idx_chapters_book_id ON chapters(book_id);
        CREATE INDEX idx_paragraphs_chapter_id ON paragraphs(chapter_id);
        CREATE INDEX idx_verses_paragraph_id ON verses(paragraph_id);
        CREATE INDEX idx_verse_titles_verse_id ON verse_titles(verse_id);
        CREATE INDEX idx_verse_nodes_verse_id ON verse_nodes(verse_id);

        CREATE VIEW kjv_vw AS
        SELECT
          TRIM(COALESCE(CAST(b.ordinal AS TEXT) || ' ', '') || b.book_name) AS book,
          c.n AS chapter,
          v.paragraph_id AS paragraph_id,
          v.n AS verse_number,
          (
            SELECT GROUP_CONCAT(vn_text.text, ' ')
            FROM (
              SELECT vn.text
              FROM verse_nodes vn
              WHERE vn.verse_id = v.id
              ORDER BY vn.node_index
            ) AS vn_text
          ) AS verse_text,
          (
            SELECT vt.text
            FROM verse_titles vt
            WHERE vt.verse_id = v.id
            ORDER BY vt.title_index
            LIMIT 1
          ) AS title
        FROM verses v
        JOIN paragraphs p ON p.id = v.paragraph_id
        JOIN chapters c ON c.id = p.chapter_id
        JOIN books b ON b.id = c.book_id;
        """
    )


def convert_json_to_sqlite(input_path: Path, output_path: Path) -> None:
    with input_path.open(encoding="utf-8") as input_file:
        books = json.load(input_file)

    if not isinstance(books, list):
        raise ValueError("Expected top-level JSON array.")

    missing_book_names = [
        book["osis_id"] for book in books if book["osis_id"] not in FULL_BOOK_NAME_BY_OSIS_ID
    ]
    if missing_book_names:
        raise ValueError(f"Missing book name mapping for osis_id values: {missing_book_names}")

    if output_path.exists():
        output_path.unlink()

    connection = sqlite3.connect(output_path)
    connection.row_factory = sqlite3.Row

    try:
        create_schema(connection)

        with connection:
            for book_index, book in enumerate(books, start=1):
                ordinal, book_name = split_book_name(FULL_BOOK_NAME_BY_OSIS_ID[book["osis_id"]])
                cursor = connection.execute(
                    """
                    INSERT INTO books (book_index, osis_id, ordinal, book_name)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        book_index,
                        book["osis_id"],
                        ordinal,
                        book_name,
                    ),
                )
                book_id = cursor.lastrowid

                for title_index, title in enumerate(book.get("titles", []), start=1):
                    connection.execute(
                        """
                        INSERT INTO book_titles (book_id, title_index, text, type, short)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            book_id,
                            title_index,
                            title["text"],
                            title.get("type"),
                            title.get("short"),
                        ),
                    )

                for chapter_index, chapter in enumerate(book.get("chapters", []), start=1):
                    cursor = connection.execute(
                        """
                        INSERT INTO chapters (book_id, chapter_index, osis_ref, n, sid)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            book_id,
                            chapter_index,
                            chapter["osis_ref"],
                            chapter["n"],
                            chapter["sid"],
                        ),
                    )
                    chapter_id = cursor.lastrowid

                    for title_index, title in enumerate(chapter.get("titles", []), start=1):
                        connection.execute(
                            """
                            INSERT INTO chapter_titles (chapter_id, title_index, text, type, short)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (
                                chapter_id,
                                title_index,
                                title["text"],
                                title.get("type"),
                                title.get("short"),
                            ),
                        )

                    for paragraph_index, paragraph in enumerate(
                        chapter.get("paragraphs", []), start=1
                    ):
                        cursor = connection.execute(
                            """
                            INSERT INTO paragraphs (chapter_id, paragraph_index)
                            VALUES (?, ?)
                            """,
                            (chapter_id, paragraph_index),
                        )
                        paragraph_id = cursor.lastrowid

                        for verse_index, verse in enumerate(paragraph.get("verses", []), start=1):
                            cursor = connection.execute(
                                """
                                INSERT INTO verses (paragraph_id, verse_index, osis_id, n, sid)
                                VALUES (?, ?, ?, ?, ?)
                                """,
                                (
                                    paragraph_id,
                                    verse_index,
                                    verse["osis_id"],
                                    verse["n"],
                                    verse["sid"],
                                ),
                            )
                            verse_id = cursor.lastrowid

                            for title_index, title in enumerate(verse.get("titles", []), start=1):
                                connection.execute(
                                    """
                                    INSERT INTO verse_titles
                                      (verse_id, title_index, text, type, short)
                                    VALUES (?, ?, ?, ?, ?)
                                    """,
                                    (
                                        verse_id,
                                        title_index,
                                        title["text"],
                                        title.get("type"),
                                        title.get("short"),
                                    ),
                                )

                            for node_index, node in enumerate(verse.get("nodes", []), start=1):
                                connection.execute(
                                    """
                                    INSERT INTO verse_nodes
                                      (verse_id, node_index, text, change_type)
                                    VALUES (?, ?, ?, ?)
                                    """,
                                    (
                                        verse_id,
                                        node_index,
                                        node["text"],
                                        node.get("change_type"),
                                    ),
                                )
    finally:
        connection.close()


def row_count(connection: sqlite3.Connection, table_name: str) -> int:
    return connection.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("data/kjv.json"),
        help="Input KJV JSON path (default: data/kjv.json).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/kjv.sqlite"),
        help="Output SQLite database path (default: data/kjv.sqlite).",
    )
    args = parser.parse_args()

    convert_json_to_sqlite(args.input, args.output)

    with sqlite3.connect(args.output) as connection:
        print(f"Created {args.output}")
        for table_name in (
            "books",
            "book_titles",
            "chapters",
            "chapter_titles",
            "paragraphs",
            "verses",
            "verse_titles",
            "verse_nodes",
        ):
            print(f"{table_name}: {row_count(connection, table_name)}")


if __name__ == "__main__":
    main()
