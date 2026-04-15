import requests
s = requests.Session()
# Login with NEW credentials
base_url = "http://127.0.0.1:5000"
resp = s.post(f"{base_url}/login", data={"username": "new.admin", "password": "NewPass123!"})
print(f"Login status: {resp.status_code}")
# Check status
resp = s.get(f"{base_url}/api/auth/status")
print(f"Auth status: {resp.text}")
