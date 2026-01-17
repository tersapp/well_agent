
import json

path = r"d:\Project\well_agent\session_NB19-6-1.json"
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)

print("Top keys:", data.keys())
if 'logData' in data:
    print("logData keys:", data['logData'].keys())
    if 'curves' in data['logData']:
        print("Curve names:", list(data['logData']['curves'].keys()))
