# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None
project_dir = os.path.abspath(SPECPATH)

a = Analysis(
    ['entrypoint.py'],
    pathex=[project_dir],
    binaries=[],
    datas=[
        (os.path.join(project_dir, 'app', 'static'), 'static'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'simpy',
        'numpy',
        'orjson',
        'app.main',
        'app.api.routes.simulation',
        'app.api.routes.graph',
        'app.api.websockets.sim_socket',
        'app.api.websockets.manager',
        'app.simulation.engine',
        'app.simulation.graph_builder',
        'app.simulation.nodes.source_node',
        'app.simulation.nodes.process_node',
        'app.simulation.nodes.sink_node',
        'app.simulation.distributions',
        'app.simulation.collector',
        'app.models.graph_models',
        'app.models.resource_models',
        'app.models.sim_config_models',
        'app.models.ws_messages',
        'app.api.routes.system',
        'app.persistence.sim_file',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    name='MfgSim',
    debug=False,
    console=False,
    onefile=True,
    icon=os.path.join(project_dir, 'assets', 'mfgsim.ico'),
)
