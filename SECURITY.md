# Security

Aurex is intended for one user on a local machine. The launcher binds to `127.0.0.1`. The service has no authentication or per-user isolation and can start simulation processes and write local result files. Do not expose it publicly without adding the required access controls, resource limits, and deployment protections.

Never include credentials, personal account data, or private run files in an issue. Use the repository's private security reporting feature if enabled. Otherwise contact the owner privately through a contact method listed on their GitHub profile before sharing sensitive details.

Dependency versions are recorded in the Python and npm lockfiles. Third-party components keep their own security policies and licenses.
