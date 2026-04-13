import re
import os

# Paths
current_path = "public/index.html"
v4_path = "/Users/louis/esade i2p/index_edit_example_v4.html"

# Read files
with open(current_path, "r") as f:
    current_html = f.read()
with open(v4_path, "r") as f:
    v4_html = f.read()

# 1. Extract the <script> block from CURRENT (it has all the logic)
script_match = re.search(r'<script>(.*?)</script>', current_html, re.DOTALL)
current_script = script_match.group(1) if script_match else ""

# 2. Extract the <style> block from v4 (it has the new UI)
style_match = re.search(r'<style>(.*?)</style>', v4_html, re.DOTALL)
v4_style = style_match.group(1) if style_match else ""

# 3. Add the amber highlight styles back to v4_style if missing
amber_css = """
        /* ── Unsaved rows — amber highlight ────────── */
        tr.unsaved td {
            background-color: rgba(234, 179, 8, 0.04) !important;
            border-bottom-color: rgba(234, 179, 8, 0.1);
        }
        tr.unsaved td:first-child {
            box-shadow: inset 3px 0 0 var(--yellow);
        }

        .pulse-red {
            background: linear-gradient(180deg, var(--accent-bright) 0%, var(--accent) 100%) !important;
            color: var(--bg-base) !important;
            border-color: transparent !important;
            font-weight: 600 !important;
            animation: pulse-glow 2.5s ease-in-out infinite;
        }
        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 0 0 rgba(212, 168, 75, 0.4); }
            50%      { box-shadow: 0 0 0 4px rgba(212, 168, 75, 0); }
        }
"""
if "tr.unsaved td" not in v4_style:
    v4_style += amber_css

# 4. Extract the <body> and <head> metadata (tags/title) from v4
# We want the structure of V4, but our own JavaScript logic.
v4_body_match = re.search(r'<body.*?>(.*?)</body>', v4_html, re.DOTALL)
v4_body_content = v4_body_match.group(1) if v4_body_match else ""

# Build the final document
# We'll take the v4 head metadata (except style) too
v4_head_meat = re.search(r'<head>(.*?)</head>', v4_html, re.DOTALL).group(1)
v4_head_meat_no_style = re.sub(r'<style>.*?</style>', '', v4_head_meat, flags=re.DOTALL)

final_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    {v4_head_meat_no_style}
    <style>
        {v4_style}
    </style>
</head>
<body>
    {v4_body_content}
    <script>
        {current_script}
    </script>
</body>
</html>"""

with open(current_path, "w") as f:
    f.write(final_html)

print("Final merge complete: Body replaced with V4, Logic preserved from Current.")
