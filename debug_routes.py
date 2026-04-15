import os, sys
sys.path.insert(0, os.path.join(os.getcwd(), "backend", "src"))
from valida_cnpj import create_app
app = create_app()
for rule in app.url_map.iter_rules():
    print(f"{rule.endpoint}: {rule.rule}")
