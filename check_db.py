import sqlite3
conn = sqlite3.connect("data/valida_cnpj.db")
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT * FROM usuarios").fetchall()
for r in rows:
    print(dict(r))
conn.close()
