import json
T=json.load(open('/home/claude/ds/project/tokens.json'))
def themed(theme):
  out=[]
  for fam in ['color','shadow']:
    for t in T[fam]['tokens']:
      v=t['value']; v=v if isinstance(v,str) else v.get(theme, v['dark'])
      out.append(f"  --{t['name']}: {v};")
  return "\n".join(out)
other="\n".join(f"  --{t['name']}: {t['value']};" for fam in ["spacing","radius","duration","easing"] for t in T[fam]["tokens"])
fam="\n".join(f"  --font-{k}: {v};" for k,v in T["type"]["families"].items())
css=f"""/* Token fallbacks generated from tokens.json (gen_fallback.py). Zero specificity
   via :where(), so a generated tokens.css or the design-system page always wins. */
:where(:root), :where([data-theme="dark"]) {{
  color-scheme: dark;
{themed('dark')}
}}
:where([data-theme="light"]) {{
  color-scheme: light;
{themed('light')}
}}
:where(:root) {{
{other}
{fam}
}}
"""
open('src/tokens.fallback.css','w').write(css)
