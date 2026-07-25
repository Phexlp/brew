import os
import sys

# Get root directory
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(root_dir)
# Append backend directory so 'app' package is discoverable
sys.path.append(os.path.join(root_dir, "backend"))

# Vercel serverless functions look for the 'app' variable
from app.main import app

