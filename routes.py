# flask_varinspector/routes.py

from flask import Blueprint, jsonify, request, render_template, abort, current_app
import re
from functools import wraps
from flask import Response

def init_routes(bp, app_globals, include_vars=None, exclude_vars=None):
    bp.app_globals = app_globals
    bp.include_vars = include_vars
    bp.exclude_vars = exclude_vars

    # Helper function to safely get selected globals
    def get_selected_globals():
        system_vars = {
            '__name__', '__doc__', '__package__', '__loader__', '__spec__',
            '__annotations__', '__builtins__', 'bp', 'app_globals'
        }
        selected = {k: v for k, v in bp.app_globals.items()
                    if k not in system_vars and not k.startswith('_')}
        
        if bp.include_vars:
            selected = {k: v for k, v in selected.items() if k in bp.include_vars}
        if bp.exclude_vars:
            for var in bp.exclude_vars:
                selected.pop(var, None)
        
        return selected

    def traverse_path(path_str):
        if not path_str:
            return None, "No path provided."
        tokens = re.findall(r'\w+|\[\d+\]', path_str)
        tokens = [token if not token.startswith('[') else token[1:-1] for token in tokens]
        if not tokens:
            return None, "Invalid path."

        globals_dict = get_selected_globals()
        current = globals_dict.get(tokens[0], None)
        if current is None:
            return None, f"Variable '{tokens[0]}' not found."

        for key in tokens[1:]:
            try:
                if key.isdigit():
                    index = int(key)
                    if isinstance(current, (list, tuple, set)):
                        current = list(current)[index]
                    else:
                        return None, f"Cannot index non-list type with '{key}'."
                else:
                    if isinstance(current, dict):
                        current = current[key]
                    elif isinstance(current, (list, tuple, set)):
                        # Possibly treat key as index if numeric
                        if key.isdigit():
                            index = int(key)
                            current = list(current)[index]
                        else:
                            return None, f"Cannot access key '{key}' in list type."
                    else:
                        current = getattr(current, key)
            except (KeyError, IndexError, AttributeError, ValueError, TypeError) as e:
                return None, f"Cannot traverse '{key}': {str(e)}"

        return current, None

    # Optional authentication
    def check_auth(username, password):
        import os
        return username == os.getenv('VARINSPECTOR_USERNAME') and password == os.getenv('VARINSPECTOR_PASSWORD')
    
    def authenticate():
        return Response(
            'Could not verify your access level.\n'
            'You have to login with proper credentials.', 401,
            {'WWW-Authenticate': 'Basic realm="Login Required"'}
        )
    
    def requires_auth(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            auth = request.authorization
            if not auth or not check_auth(auth.username, auth.password):
                return authenticate()
            return f(*args, **kwargs)
        return decorated
    
    def is_enabled():
        return current_app.config.get('VARINSPECTOR_ENABLED', False) \
               and current_app.config.get('ENV') == 'development'

    @bp.route('/varinspector', methods=['GET'])
    @requires_auth
    def varinspector_index():
        if not is_enabled():
            abort(403)
        return render_template('varinspector/index.html')

    @bp.route('/varinspector/globals', methods=['GET'])
    @requires_auth
    def list_globals():
        if not is_enabled():
            abort(403)
        globals_dict = get_selected_globals()
        globals_list = list(globals_dict.keys())
        return jsonify({"globals": globals_list})

    @bp.route('/varinspector/inspect', methods=['GET'])
    @requires_auth
    def inspect_variable():
        if not is_enabled():
            abort(403)
        path = request.args.get('path')
        if not path:
            return jsonify({"error": "No variable path provided."}), 400

        var, error = traverse_path(path)
        if error:
            return jsonify({"error": error}), 404

        # Adjust as needed to limit recursion depth or handle advanced logic
        def serialize_var(obj, depth=1, max_depth=3):
            if depth > max_depth:
                return {"type": type(obj).__name__, "value": "Max depth reached"}
            
            # Primitives
            if isinstance(obj, (int, float, str, bool, type(None))):
                return {"type": type(obj).__name__, "value": obj}

            # Collections: list, tuple, set
            elif isinstance(obj, (list, tuple, set)):
                return {
                    "type": "list" if isinstance(obj, list) else
                             "tuple" if isinstance(obj, tuple) else "set",
                    "length": len(obj),
                    # If you want full recursion, do:
                    # "items": [serialize_var(item, depth+1, max_depth) for item in obj]
                }

            # Dictionary
            elif isinstance(obj, dict):
                return {
                    "type": "dict",
                    "keys": list(obj.keys()),
                    # If you want deeper info, do e.g.:
                    # "items": {k: serialize_var(v, depth+1, max_depth) for k,v in obj.items()}
                }

            # Objects (classes, instances)
            else:
                # Distinguish 'object' vs 'class' if you want
                obj_type_str = 'class' if isinstance(obj, type) else 'object'
                # Gather non-private, non-callable attributes
                attrs = {}
                for attr in dir(obj):
                    if not attr.startswith('_'):
                        val = getattr(obj, attr, None)
                        # Skip callables
                        if not callable(val):
                            # Recurse if you want full attribute introspection
                            attrs[attr] = serialize_var(val, depth+1, max_depth)

                return {
                    "type": obj_type_str,
                    "attributes": attrs
                }

        serialized = serialize_var(var)
        return jsonify({
            "variable": path,
            "details": serialized
        })
