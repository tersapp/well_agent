import sys
import os

# Ensure project root is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from backend.skills.registry import get_skill_registry

def test_registry():
    print("Initializing Registry...")
    registry = get_skill_registry()
    registry.reload()
    
    tools = registry.list_tools()
    print(f"Found {len(tools)} tools.")
    
    lith_tools = [t['name'] for t in tools if 'lithology' in t.get('skill_pack', '') or 'lithology' in t.get('directory', '')]
    print(f"Lithology tools: {lith_tools}")
    
    if 'analyze_crossplot' in lith_tools:
        print("PASS: analyze_crossplot found.")
        
        # Try execution (dry run / check import)
        try:
            # We just check if we can Resolve the function, not necessarily run it (it requires data)
            tool = registry.get_tool('analyze_crossplot')
            entry_point = tool['entry_point']
            print(f"Entry point: {entry_point}")
            
            # Manually try the logic from registry.execute_tool to verify import
            module_name = entry_point.split(':')[0]
            skill_dir = tool['directory']
            script_path = os.path.join(skill_dir, 'scripts', f"{module_name}.py")
            print(f"Script path: {script_path}")
            
            if os.path.exists(script_path):
                print("PASS: Script file exists.")
            else:
                print("FAIL: Script file missing.")
                
            # Attempt execution with dummy data to see if it imports
            try:
                registry.execute_tool('analyze_crossplot', type='ND', dummy_check=True)
            except TypeError:
                # Expected, function sig mismatch means it imported!
                print("PASS: Function imported (got TypeError on execution).")
            except Exception as e:
                print(f"Execution Error (might be expected): {e}")
                
        except Exception as e:
            print(f"FAIL: Logic verification failed: {e}")
    else:
        print("FAIL: analyze_crossplot NOT found.")

if __name__ == "__main__":
    test_registry()
