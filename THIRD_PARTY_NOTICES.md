# Third-Party Notices

This repository is licensed under Apache-2.0. Third-party software used by
MfgSim remains under the copyright and license terms of its respective authors.

This notice file is a practical summary of the direct third-party dependencies
used in the current repository and packaging flow. It is not a substitute for
the original upstream license texts. Review and update this file when
dependencies or build outputs change.

## Runtime Dependencies

### Backend
| Component | Version | License | Purpose |
|---|---|---|---|
| FastAPI | 0.115.6 | MIT | Backend web API framework |
| Uvicorn | 0.32.1 | BSD-3-Clause | ASGI server used to host the local app |
| SimPy | 4.1.1 | MIT | Discrete-event simulation engine |
| NumPy | 1.26.4 | BSD-3-Clause | Numerical support for calculations |
| Pydantic | 2.10.3 | MIT | Request and model validation |
| orjson | 3.10.12 | Apache-2.0 | Fast JSON serialization |
| websockets | 13.1 | BSD-3-Clause | WebSocket transport support |

### Frontend
| Component | Version | License | Purpose |
|---|---|---|---|
| React | 18.3.1 | MIT | Frontend UI library |
| React DOM | 18.3.1 | MIT | Browser rendering for React |
| @xyflow/react | 12.10.1 | MIT | Node editor / graph canvas |
| axios | 1.13.5 | MIT | HTTP client |
| lucide-react | 0.474.0 | ISC | UI icons |
| react-hook-form | 7.71.2 | MIT | Form state management |
| recharts | 2.15.4 | MIT | Dashboard charts |
| zustand | 5.0.11 | MIT | Frontend state store |

## Build and Packaging Tools
| Component | Version | License | Purpose |
|---|---|---|---|
| PyInstaller | 6.11.1 | GPL-2.0 | Windows executable packaging |
| Vite | 6.4.1 | MIT | Frontend build/dev tooling |
| TypeScript | 5.9.3 | Apache-2.0 | Frontend type-checking and compilation |
| Tailwind CSS | 3.4.19 | MIT | UI styling |
| @vitejs/plugin-react | 4.7.0 | MIT | React integration for Vite |

## Important Packaging Notes

- Packaged desktop builds may include additional transitive dependencies beyond
  the direct dependencies listed above.
- NumPy distributions can include additional bundled binary components depending
  on the platform and wheel used. Review the NumPy license text for the exact
  binary distribution you ship.
- If you distribute binaries, keep the applicable upstream license and notice
  requirements with the shipped product.

## Upstream Project References

- FastAPI: https://github.com/fastapi/fastapi
- Uvicorn: https://github.com/encode/uvicorn
- SimPy: https://simpy.readthedocs.io/
- NumPy: https://numpy.org/
- Pydantic: https://github.com/pydantic/pydantic
- orjson: https://github.com/ijl/orjson
- websockets: https://github.com/python-websockets/websockets
- React: https://react.dev/
- React Flow / XYFlow: https://xyflow.com/
- axios: https://github.com/axios/axios
- lucide-react: https://github.com/lucide-icons/lucide
- react-hook-form: https://react-hook-form.com/
- recharts: https://recharts.org/
- zustand: https://github.com/pmndrs/zustand
- PyInstaller: https://pyinstaller.org/
- Vite: https://vite.dev/
- TypeScript: https://www.typescriptlang.org/
- Tailwind CSS: https://tailwindcss.com/
