from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

import pypandoc
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches
from docx.text.paragraph import Paragraph


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "WBTE-System-Flowcharts.md"
OUTPUT = ROOT / "docs" / "WBTE-System-Flowcharts.docx"
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
MERMAID_BLOCK = re.compile(r"```mermaid\s*\n(.*?)```", re.DOTALL)


def fit_charts_to_pages(path: Path) -> None:
    document = Document(path)

    # Use an explicit Letter layout so chart bounds are stable across Word,
    # LibreOffice, and browser-based DOCX viewers.
    for section in document.sections:
        section.page_width = Inches(8.5)
        section.page_height = Inches(11)
        section.left_margin = Inches(0.7)
        section.right_margin = Inches(0.7)
        section.top_margin = Inches(0.7)
        section.bottom_margin = Inches(0.7)

    max_width = Inches(7.0)
    max_height = Inches(8.15)
    for shape in document.inline_shapes:
        ratio = min(max_width / shape.width, max_height / shape.height)
        shape.width = int(shape.width * ratio)
        shape.height = int(shape.height * ratio)

        drawing = shape._inline
        paragraph_element = drawing.getparent().getparent().getparent()
        paragraph = Paragraph(paragraph_element, paragraph_element.getparent())
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.keep_together = True

    document.save(path)


def render_mermaid(diagram: str, destination: Path) -> None:
    source = destination.with_suffix(".mmd")
    source.write_text(diagram.strip() + "\n", encoding="utf-8")
    command = [
        "npx.cmd" if sys.platform == "win32" else "npx",
        "--yes",
        "@mermaid-js/mermaid-cli",
        "-i",
        str(source),
        "-o",
        str(destination),
        "-b",
        "white",
        "-w",
        "1800",
        "-H",
        "1200",
        "-s",
        "2",
    ]
    environment = dict(__import__("os").environ)
    if CHROME.exists():
        environment["PUPPETEER_EXECUTABLE_PATH"] = str(CHROME)
        environment["PUPPETEER_SKIP_DOWNLOAD"] = "true"
    subprocess.run(command, check=True, env=environment)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source document: {SOURCE}")

    text = SOURCE.read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="wbte-flowcharts-") as temporary:
        temp = Path(temporary)
        rendered = temp / "WBTE-System-Flowcharts.rendered.md"
        diagrams = list(MERMAID_BLOCK.finditer(text))
        if not diagrams:
            raise SystemExit("No Mermaid diagrams were found.")

        pieces: list[str] = []
        cursor = 0
        for index, match in enumerate(diagrams, start=1):
            pieces.append(text[cursor:match.start()])
            image = temp / f"flowchart-{index:02d}.png"
            render_mermaid(match.group(1), image)
            pieces.append(f"![Flowchart {index}]({image.as_posix()})\n")
            cursor = match.end()
        pieces.append(text[cursor:])
        rendered.write_text("".join(pieces), encoding="utf-8")

        pypandoc.convert_file(
            str(rendered),
            "docx",
            outputfile=str(OUTPUT),
            extra_args=[
                "--standalone",
                "--toc",
                "--toc-depth=2",
                "--resource-path=" + str(temp),
            ],
        )

    fit_charts_to_pages(OUTPUT)

    if not OUTPUT.exists() or OUTPUT.stat().st_size < 10_000:
        raise SystemExit("DOCX generation did not produce a valid output file.")
    print(f"Created {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
