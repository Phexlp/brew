import urllib.request
import urllib.error
from jose import jwt
from datetime import datetime, timedelta

# Create token manually
SECRET_KEY = 'pwndora-super-secret-jwt-key-change-in-production'
ALGORITHM = 'HS256'

# User 1 token
payload1 = {'sub': 'test_user_123', 'exp': datetime.utcnow() + timedelta(minutes=60)}
token1 = jwt.encode(payload1, SECRET_KEY, algorithm=ALGORITHM)

# User 2 token
payload2 = {'sub': 'different_user', 'exp': datetime.utcnow() + timedelta(minutes=60)}
token2 = jwt.encode(payload2, SECRET_KEY, algorithm=ALGORITHM)

URL = 'http://127.0.0.1:8004/api/learner-path/test_user_123'

def make_request(token, desc):
    req = urllib.request.Request(URL)
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as response:
            print(f'[{desc}] SUCCESS! Status: {response.status}')
            print('Response snippet:', response.read().decode('utf-8')[:50], '...')
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8")
        print(f'[{desc}] BLOCKED! Status: {e.code} ({e.reason}) - {msg}')

print('--- JWT SECURITY TEST ---')
make_request(None, 'No Token Provided')
make_request('invalid.token.here', 'Invalid/Fake Token')
make_request(token2, 'Valid Token but WRONG User')
make_request(token1, 'Valid Token for Correct User')
