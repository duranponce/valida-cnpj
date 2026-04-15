import requests
s = requests.Session()
# Login
base_url = "http://127.0.0.1:5000"
resp = s.post(f"{base_url}/login", data={"username": "valida.admin", "password": "CNPJ-2026-Seguro!"})
print(f"Login status: {resp.status_code}")
# Update
resp = s.post(f"{base_url}/api/auth/update", json={"username": "test.user", "password": "TestPassword123!"})
print(f"Update status: {resp.status_code}")
print(f"Update response: {resp.text}")
