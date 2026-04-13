import re

old_html_path = "public/index.html"
v4_html_path = "/Users/louis/esade i2p/index_edit_example_v4.html"

with open(old_html_path, "r") as f:
    old_html = f.read()

with open(v4_html_path, "r") as f:
    v4_html = f.read()

# 1. Extract styles
old_style_match = re.search(r'<style>(.*?)</style>', old_html, re.DOTALL)
v4_style_match = re.search(r'<style>(.*?)</style>', v4_html, re.DOTALL)

old_style = old_style_match.group(1)
v4_style = v4_style_match.group(1)

# Find what's in old_style but not in v4_style, particularly .unsaved and .pulse-red
unsaved_css = """
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
    merged_style = v4_style + unsaved_css
else:
    merged_style = v4_style

new_html = old_html.replace(old_style, merged_style)

# 2. Update the Brand Logo / Name
# v4 has: `<span class="brand-name">Boomerang</span>` and a new SVG logo. index.html has an img tag.
old_brand = re.search(r'<div class="sidebar-header">.*?</div>\s*</div>', old_html, re.DOTALL)
v4_brand = re.search(r'<div class="sidebar-header">.*?</div>\s*</div>', v4_html, re.DOTALL)

if old_brand and v4_brand:
    # the user said keep the spanish text, so let's carefully replace the logo SVG but keep the text
    # Actually they are okay with the Spanish sub-text. Boomerang Platform -> Boomerang Plataforma Financiera was in BOTH.
    # Wait! the diff showed index_edit_example_v4.html HAS the spanish text!
    # Let me check if v4 has it.
    pass

with open(old_html_path, "w") as f:
    f.write(new_html)

print("CSS updated successfully")
