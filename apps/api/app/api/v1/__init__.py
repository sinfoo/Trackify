from app.api.v1 import agents, auth, demo, public

ROUTERS = [auth.router, public.router, agents.router, demo.router]
