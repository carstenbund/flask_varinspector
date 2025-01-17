# flask_varinspector/__init__.py

from flask import Blueprint

def create_varinspector_blueprint(app_globals, include_vars=None, exclude_vars=None):
    """
    Creates a Flask Blueprint for the Variable Inspector.

    :param app_globals: Reference to the Flask app's globals (app.globals or globals())
    :param include_vars: List of variable names to include. If None, includes all except excluded.
    :param exclude_vars: List of variable names to exclude.
    :return: Configured Blueprint
    """
    varinspector_bp = Blueprint(
        'varinspector',
        __name__,
        template_folder='templates',
        static_folder='static',
        static_url_path='/static/varinspector'
    )

    from . import routes
    routes.init_routes(varinspector_bp, app_globals, include_vars, exclude_vars)

    return varinspector_bp

