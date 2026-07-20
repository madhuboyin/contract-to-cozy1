from pathlib import Path
import re

from docx import Document
from docx.document import Document as DocumentType
from docx.table import Table
from docx.text.paragraph import Paragraph


SOURCE = Path("docs/product/ContractToCozy_Product_Framework.docx")
OUTPUT = Path("docs/product/ContractToCozy_Product_Framework.md")


def iter_blocks(parent):
    body = parent.element.body
    for child in body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, parent)
        elif child.tag.endswith("}tbl"):
            yield Table(child, parent)


def inline_text(paragraph):
    pieces = []
    for run in paragraph.runs:
        text = run.text
        if not text:
            continue
        text = text.replace("\n", " ")
        if run.bold and run.italic:
            pieces.append(f"***{text}***")
        elif run.bold:
            pieces.append(f"**{text}**")
        elif run.italic:
            pieces.append(f"*{text}*")
        else:
            pieces.append(text)
    value = "".join(pieces).strip()
    return re.sub(r"\*\*([^*]*?)\s{2,}\*\*", r"**\1** — ", value)


def cell_text(cell):
    values = [inline_text(p) for p in cell.paragraphs if inline_text(p)]
    return "<br>".join(values).replace("|", "\\|")


def table_to_markdown(table):
    rows = [[cell_text(cell) for cell in row.cells] for row in table.rows]
    if not rows:
        return []
    if len(rows[0]) == 1:
        content = rows[0][0]
        return [f"> {line}" if line else ">" for line in content.split("<br>")]
    width = len(rows[0])
    output = [
        "| " + " | ".join(rows[0]) + " |",
        "| " + " | ".join(["---"] * width) + " |",
    ]
    output.extend("| " + " | ".join(row) + " |" for row in rows[1:])
    return output


def convert():
    doc = Document(SOURCE)
    lines = [
        "---",
        'title: "ContractToCozy Product Framework"',
        'subtitle: "From Home Records to Home Intelligence"',
        'version: "1.0"',
        'date: "July 2026"',
        'status: "Product strategy and operating model"',
        "---",
        "",
        "# ContractToCozy Product Framework",
        "",
        "*From Home Records to Home Intelligence*",
        "",
        "> **Product promise** — ContractToCozy turns the history and condition of a home into timely actions, confident decisions, and guided plans.",
        "",
        "**Stay ahead. Decide with confidence. Navigate major home moments.**",
        "",
        "Comprehensive product strategy and operating framework — Version 1.0, July 2026",
        "",
    ]
    seen_title = True
    started = False

    for block in iter_blocks(doc):
        if not started:
            if isinstance(block, Paragraph) and inline_text(block) == "How to use this framework":
                started = True
            else:
                continue
        if isinstance(block, Table):
            rendered = table_to_markdown(block)
            if rendered:
                lines.extend(rendered)
                lines.append("")
            continue

        text = inline_text(block)
        if not text:
            continue
        style = block.style.name if block.style else ""

        if style == "Title":
            if not seen_title:
                lines.append(f"# {text}")
                seen_title = True
            else:
                lines.append(f"## {text}")
        elif style == "Subtitle":
            lines.append(f"*{text}*")
        elif style == "Heading 1":
            lines.append(f"## {text}")
        elif style == "Heading 2":
            lines.append(f"### {text}")
        elif style == "Heading 3":
            lines.append(f"#### {text}")
        elif style in ("C2C Bullet", "C2C Bullet 2"):
            indent = "  " if style == "C2C Bullet 2" else ""
            if text.startswith("☐ "):
                lines.append(f"{indent}- [ ] {text[2:]}")
            else:
                lines.append(f"{indent}- {text}")
        elif style == "C2C Number":
            lines.append(f"1. {text}")
        else:
            lines.append(text)
        lines.append("")

    # Collapse excessive blank lines while preserving one blank line between blocks.
    cleaned = []
    for idx, line in enumerate(lines):
        if line == "" and cleaned and cleaned[-1] == "":
            continue
        if line == "" and cleaned and idx + 1 < len(lines):
            previous = cleaned[-1]
            following = lines[idx + 1]
            list_prefixes = ("- ", "1. ", "  - ")
            if previous.startswith(list_prefixes) and following.startswith(list_prefixes):
                continue
        cleaned.append(line)

    OUTPUT.write_text("\n".join(cleaned).rstrip() + "\n", encoding="utf-8")
    print(OUTPUT.resolve())


if __name__ == "__main__":
    convert()
